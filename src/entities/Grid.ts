import * as THREE from 'three/webgpu';
import { SceneEntity } from '../SceneEntity';
import type { AppContext } from '../types/AppContext';
import type { ResourceManager } from '../ResourceManager';

// An axis-aligned box, used both for the recursive partition and its leaves.
interface PartitionBox {
    min: THREE.Vector3;
    max: THREE.Vector3;
}

interface FlyingPlate {
    mesh: THREE.Mesh;
    startPosition: THREE.Vector3;
    targetPosition: THREE.Vector3;
    targetScale: THREE.Vector3;
    delay: number;
    elapsed: number;
    duration: number;
    stretchAxis: 'x' | 'y' | 'z';
}

export class Grid extends SceneEntity {
    declare mesh: THREE.Group;
    private texture: THREE.Texture | undefined;
    alwaysUpdate = true;
    private occupied: boolean[] = [];
    private readonly cellSize = 1;
    // Distance plates travel in from outside the grid before arriving.
    private readonly flyInDistance = 300;
    private readonly flyInDuration = 3;
    // How far a plate stretches along its travel axis at top speed (relative to its own size).
    private readonly maxStretch = 10;
    // Independent-of-position jitter so cubes with near-identical spreadDistance
    // (e.g. bunched near the grid center) don't land in perfect unison.
    private readonly baseDelayJitter = 0.15;
    private readonly durationJitter = 0.3;
    // How unevenly a partition splits between its two halves (0 = always even, 1 = fully random).
    private readonly splitJitter = 1;
    private flyingPlates: FlyingPlate[] = [];
    // Built once in init() and reused by every reset() cycle.
    private geometry!: THREE.BoxGeometry;
    private edgesGeometry!: THREE.EdgesGeometry;
    private edgeMaterial!: THREE.LineBasicMaterial;
    private materials: THREE.MeshToonMaterial[] = [];
    private totalBox!: PartitionBox;
    private totalCenter = new THREE.Vector3();
    private maxDistanceFromCenter = 0;

    constructor(
        private rows: number = 10,
        private cols: number = 10,
        private depth: number = 10,
    ) {
        super();
    }

    async load(resources: ResourceManager): Promise<void> {
        const texture = await resources.loadTexture('textures/linen.png');
        texture.colorSpace = THREE.SRGBColorSpace;
        this.texture = texture;

        // The 6 materials persist across resets, so applying the map once here
        // covers every plate for the lifetime of this Grid instance.
        for (const mat of this.materials) {
            mat.map = texture;
            mat.needsUpdate = true;
        }
    }

    getRows(): number {
        return this.rows;
    }

    getCols(): number {
        return this.cols;
    }

    getDepth(): number {
        return this.depth;
    }

    getCellCount(): number {
        return this.rows * this.cols * this.depth;
    }

    // True once every plate has cleared its stagger delay and finished flying in.
    isSettled(): boolean {
        return this.flyingPlates.every(
            (plate) => plate.delay <= 0 && plate.elapsed >= plate.duration,
        );
    }

    // Fraction (0-1) of plates that have cleared their delay and finished
    // flying in; lets callers start the next cycle before this one fully ends.
    getSettledFraction(): number {
        if (this.flyingPlates.length === 0) {
            return 1;
        }
        const settledCount = this.flyingPlates.filter(
            (plate) => plate.delay <= 0 && plate.elapsed >= plate.duration,
        ).length;
        return settledCount / this.flyingPlates.length;
    }

    isCellAvailable(index: number): boolean {
        return index >= 0 && index < this.occupied.length && !this.occupied[index];
    }

    reserveCell(index: number): boolean {
        if (!this.isCellAvailable(index)) {
            return false;
        }

        this.occupied[index] = true;
        return true;
    }

    freeCell(index: number): void {
        if (index >= 0 && index < this.occupied.length) {
            this.occupied[index] = false;
        }
    }

    init(app: AppContext): void {
        const cellCount = this.getCellCount();
        this.occupied = new Array(cellCount).fill(false);

        const totalWidth = this.cols * this.cellSize;
        const totalHeight = this.depth * this.cellSize;
        const totalLength = this.rows * this.cellSize;

        this.mesh = new THREE.Group();
        this.mesh.position.set(-totalWidth / 2, 0, -totalLength / 2);

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        // Per-cube outline geometry, so every block is outlined individually.
        this.edgesGeometry = new THREE.EdgesGeometry(this.geometry);
        this.edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });

        this.materials = [
            new THREE.MeshToonMaterial({ color: 0x2f4c73 }), // Right side (+X)
            new THREE.MeshToonMaterial({ color: 0x303740 }), // Left side (-X)
            new THREE.MeshToonMaterial({ color: 0x4f6273 }), // Top side (+Y)
            new THREE.MeshToonMaterial({ color: 0xd9c6bf }), // Bottom side (-Y)
            new THREE.MeshToonMaterial({ color: 0xd98b79 }), // Front side (+Z)
            new THREE.MeshToonMaterial({ color: 0x544b66 }), // Back side (-Z)
        ];

        this.totalBox = {
            min: new THREE.Vector3(0, 0, 0),
            max: new THREE.Vector3(totalWidth, totalHeight, totalLength),
        };
        this.totalCenter = this.totalBox.min.clone().add(this.totalBox.max).multiplyScalar(0.5);
        this.maxDistanceFromCenter = this.totalCenter.length();

        // Build the plate pool once; reset() only repositions/rescales these.
        for (let i = 0; i < cellCount; i++) {
            const plate = new THREE.Mesh(this.geometry, this.shuffleMaterials());
            plate.add(new THREE.LineSegments(this.edgesGeometry, this.edgeMaterial));
            this.mesh.add(plate);
            this.flyingPlates.push({
                mesh: plate,
                startPosition: new THREE.Vector3(),
                targetPosition: new THREE.Vector3(),
                targetScale: new THREE.Vector3(1, 1, 1),
                delay: 0,
                elapsed: 0,
                duration: this.flyInDuration,
                stretchAxis: 'x',
            });
        }

        app.scene.add(this.mesh);

        this.reset();
    }

    // Re-runs the partition and restarts every plate's fly-in.
    reset(): void {
        // Undoes the passive per-frame shrink in update() so cycles don't compound.
        this.mesh.scale.set(1, 1, 1);

        const leaves: PartitionBox[] = [];
        this.subdivide(this.totalBox, this.flyingPlates.length, leaves);

        const totalMin = this.totalBox.min;
        const totalMax = this.totalBox.max;
        const totalCenter = this.totalCenter;

        leaves.forEach((box, i) => {
            const plate = this.flyingPlates[i];

            const sizeX = box.max.x - box.min.x;
            const sizeY = box.max.y - box.min.y;
            const sizeZ = box.max.z - box.min.z;
            const centerX = (box.min.x + box.max.x) * 0.5;
            const centerY = (box.min.y + box.max.y) * 0.5;
            const centerZ = (box.min.z + box.max.z) * 0.5;

            // Distance from each of this leaf's faces to the matching face of
            // the overall volume; the smallest picks which of the 6 sides it
            // flies in from. Ties are broken via reservoir sampling so no
            // candidate array needs to be allocated per leaf.
            const distNegX = box.min.x - totalMin.x;
            const distPosX = totalMax.x - box.max.x;
            const distNegY = box.min.y - totalMin.y;
            const distPosY = totalMax.y - box.max.y;
            const distNegZ = box.min.z - totalMin.z;
            const distPosZ = totalMax.z - box.max.z;
            const minDistance = Math.min(
                distNegX,
                distPosX,
                distNegY,
                distPosY,
                distNegZ,
                distPosZ,
            );

            let axis: 'x' | 'y' | 'z' = 'x';
            let sign = -1;
            let matches = 0;
            if (distNegX - minDistance < 1e-6) {
                matches++;
                if (Math.random() < 1 / matches) {
                    axis = 'x';
                    sign = -1;
                }
            }
            if (distPosX - minDistance < 1e-6) {
                matches++;
                if (Math.random() < 1 / matches) {
                    axis = 'x';
                    sign = 1;
                }
            }
            if (distNegY - minDistance < 1e-6) {
                matches++;
                if (Math.random() < 1 / matches) {
                    axis = 'y';
                    sign = -1;
                }
            }
            if (distPosY - minDistance < 1e-6) {
                matches++;
                if (Math.random() < 1 / matches) {
                    axis = 'y';
                    sign = 1;
                }
            }
            if (distNegZ - minDistance < 1e-6) {
                matches++;
                if (Math.random() < 1 / matches) {
                    axis = 'z';
                    sign = -1;
                }
            }
            if (distPosZ - minDistance < 1e-6) {
                matches++;
                if (Math.random() < 1 / matches) {
                    axis = 'z';
                    sign = 1;
                }
            }

            plate.targetScale.set(sizeX, sizeY, sizeZ);
            plate.targetPosition.set(centerX, centerY, centerZ);
            plate.mesh.scale.set(sizeX, sizeY, sizeZ);
            plate.mesh.material = this.shuffleMaterials();

            plate.startPosition.set(
                centerX + (axis === 'x' ? sign * this.flyInDistance : 0),
                centerY + (axis === 'y' ? sign * this.flyInDistance : 0),
                centerZ + (axis === 'z' ? sign * this.flyInDistance : 0),
            );
            plate.mesh.position.copy(plate.startPosition);
            plate.stretchAxis = axis;

            const max = 0.35;
            const min = 0.01;

            // Non-linear (squared) redistribution: pushes most cubes' stagger
            // delay toward the high end so they don't all land at once.
            const dx = centerX - totalCenter.x;
            const dy = centerY - totalCenter.y;
            const dz = centerZ - totalCenter.z;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const normalizedDistance =
                this.maxDistanceFromCenter > 0
                    ? distanceFromCenter / this.maxDistanceFromCenter
                    : 0;
            const spreadDistance =
                normalizedDistance * normalizedDistance * this.maxDistanceFromCenter;

            plate.delay =
                spreadDistance * (Math.random() * (max - min) + min) +
                Math.random() * this.baseDelayJitter;
            plate.elapsed = 0;
            plate.duration =
                this.flyInDuration * (1 + (Math.random() * 2 - 1) * this.durationJitter);
        });
    }

    // Fisher-Yates shuffle of the 6 materials, used to randomize per-plate face order.
    private shuffleMaterials(): THREE.MeshToonMaterial[] {
        const shuffled = this.materials.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Recursively guillotine-cuts `box` into exactly `capacity` leaf boxes that
    // together tile it exactly, giving irregularly sized cubes with no gaps.
    private subdivide(box: PartitionBox, capacity: number, out: PartitionBox[]): void {
        if (capacity <= 1) {
            out.push(box);
            return;
        }

        const sizeX = box.max.x - box.min.x;
        const sizeY = box.max.y - box.min.y;
        const sizeZ = box.max.z - box.min.z;
        const axis: 'x' | 'y' | 'z' =
            sizeX >= sizeY && sizeX >= sizeZ ? 'x' : sizeY >= sizeZ ? 'y' : 'z';
        const size = axis === 'x' ? sizeX : axis === 'y' ? sizeY : sizeZ;

        const ratio = 0.5 + (Math.random() - 0.5) * this.splitJitter;
        const leftCapacity = Math.min(capacity - 1, Math.max(1, Math.round(capacity * ratio)));
        const rightCapacity = capacity - leftCapacity;

        const splitValue = box.min[axis] + size * (leftCapacity / capacity);

        const leftMax = box.max.clone();
        leftMax[axis] = splitValue;
        const rightMin = box.min.clone();
        rightMin[axis] = splitValue;

        this.subdivide({ min: box.min, max: leftMax }, leftCapacity, out);
        this.subdivide({ min: rightMin, max: box.max }, rightCapacity, out);
    }

    update(deltaSeconds: number): void {
        for (const plate of this.flyingPlates) {
            // Flight is gated behind this plate's stagger delay; the cube just
            // sits at its start position until the delay runs out.
            if (plate.delay > 0) {
                plate.delay -= deltaSeconds;
            } else if (plate.elapsed < plate.duration) {
                plate.elapsed = Math.min(plate.elapsed + deltaSeconds, plate.duration);
                const t = plate.elapsed / plate.duration;
                const eased = 1 - (1 - t) * (1 - t);
                plate.mesh.position.lerpVectors(plate.startPosition, plate.targetPosition, eased);

                // Stretches into a cuboid along the travel axis, shrinking back to
                // this plate's own resting size in lockstep with the same ease-out
                // arrival curve so it's always exactly its final shape on arrival.
                const stretch = 1 + this.maxStretch * (1 - eased);
                plate.mesh.scale.set(
                    plate.targetScale.x * (plate.stretchAxis === 'x' ? stretch : 1),
                    plate.targetScale.y * (plate.stretchAxis === 'y' ? stretch : 1),
                    plate.targetScale.z * (plate.stretchAxis === 'z' ? stretch : 1),
                );
            }
        }

        // Only shrinks while plates are still mid-flight, so this stops (and
        // stops costing anything) once everything has settled instead of
        // shrinking forever across repeated reset() cycles.
        if (!this.isSettled()) {
            this.mesh.scale.multiplyScalar(0.998);
        }
    }

    dispose(): void {
        this.mesh.traverse((object) => {
            if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
                object.geometry.dispose();
                (object.material as THREE.Material).dispose();
            }
        });
        this.mesh.removeFromParent();
    }
}
