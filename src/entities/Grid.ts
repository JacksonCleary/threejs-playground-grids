import * as THREE from 'three/webgpu';
import { SceneEntity } from '../SceneEntity';
import type { AppContext } from '../types/AppContext';

interface FlyingPlate {
    mesh: THREE.Mesh;
    startPosition: THREE.Vector3;
    targetPosition: THREE.Vector3;
    delay: number;
    elapsed: number;
    duration: number;
    stretchAxis: 'x' | 'y' | 'z';
}

export class Grid extends SceneEntity {
    declare mesh: THREE.Group;
    alwaysUpdate = true;
    private grid: Map<string, boolean> = new Map();
    private readonly cellSize = 1;
    private readonly flyInDistance = 108;
    // private readonly flyInDuration = 1;
    private readonly flyInDuration = 1;
    // How far a plate stretches into a rectangular cuboid along its travel axis at top speed.
    private readonly maxStretch = 20;
    // Independent-of-position jitter so cubes with near-identical spreadDistance
    // (e.g. bunched near the grid center) don't land in perfect unison.
    private readonly baseDelayJitter = 0.15;
    private readonly durationJitter = 0.3;
    private flyingPlates: FlyingPlate[] = [];

    constructor(
        private rows: number = 10,
        private cols: number = 10,
        private depth: number = 10,
    ) {
        super();
    }

    setGrid(rows: number, cols: number, depth: number): void {
        this.rows = rows;
        this.cols = cols;
        this.depth = depth;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                for (let d = 0; d < depth; d++) {
                    this.setCell(row, col, d, false);
                }
            }
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

    isCellAvailable(row: number, col: number, depth: number): boolean {
        return this.isInBounds(row, col, depth) && !this.getCell(row, col, depth);
    }

    reserveCell(row: number, col: number, depth: number): boolean {
        if (!this.isCellAvailable(row, col, depth)) {
            return false;
        }

        this.setCell(row, col, depth, true);
        return true;
    }

    freeCell(row: number, col: number, depth: number): void {
        this.setCell(row, col, depth, false);
    }

    setCell(row: number, col: number, depth: number, value: boolean): void {
        const key = `${row},${col},${depth}`;
        this.grid.set(key, value);
    }

    getCell(row: number, col: number, depth: number): boolean {
        const key = `${row},${col},${depth}`;
        return this.grid.get(key) ?? false;
    }

    private isInBounds(row: number, col: number, depth: number): boolean {
        return (
            row >= 0 &&
            row < this.rows &&
            col >= 0 &&
            col < this.cols &&
            depth >= 0 &&
            depth < this.depth
        );
    }

    init(app: AppContext): void {
        this.setGrid(this.rows, this.cols, this.depth);
        this.mesh = new THREE.Group();
        this.mesh.position.set(
            -(this.cols * this.cellSize) / 2 + this.cellSize / 2,
            0,
            -(this.rows * this.cellSize) / 2 + this.cellSize / 2,
        );

        const geometry = new THREE.BoxGeometry(this.cellSize, this.cellSize, this.cellSize);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            roughness: 0.1,
            wireframe: false,
        });

        const rowCenter = (this.rows - 1) / 2;
        const colCenter = (this.cols - 1) / 2;
        const depthCenter = (this.depth - 1) / 2;
        const maxDistanceFromCenter = new THREE.Vector3(colCenter, depthCenter, rowCenter).length();

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                for (let d = 0; d < this.depth; d++) {
                    const targetPosition = new THREE.Vector3(
                        col * this.cellSize,
                        d * this.cellSize,
                        row * this.cellSize,
                    );

                    // Every cell flies straight in from whichever of the 6 grid
                    // faces (row/col/depth, min or max side) is nearest, instead of
                    // diagonally through edges/corners. Ties are broken randomly.
                    const candidates: Array<{ distance: number; vector: THREE.Vector3 }> = [
                        // Distance to the nearest boundary along the row axis.
                        { distance: row, vector: new THREE.Vector3(0, 0, -1) },
                        // Distance to the far boundary along the row axis.
                        { distance: this.rows - 1 - row, vector: new THREE.Vector3(0, 0, 1) },
                        // Distance to the nearest boundary along the column axis.
                        { distance: col, vector: new THREE.Vector3(-1, 0, 0) },
                        // Distance to the far boundary along the column axis.
                        { distance: this.cols - 1 - col, vector: new THREE.Vector3(1, 0, 0) },
                        // Distance to the nearest boundary along the depth axis.
                        { distance: d, vector: new THREE.Vector3(0, 1, 0) },
                        // Distance to the far boundary along the depth axis.
                        { distance: this.depth - 1 - d, vector: new THREE.Vector3(0, -1, 0) },
                    ];
                    const minDistance = Math.min(...candidates.map((c) => c.distance));
                    const tied = candidates.filter((c) => c.distance === minDistance);
                    const direction = tied[Math.floor(Math.random() * tied.length)].vector.clone();

                    const plateMaterial = material.clone();
                    const plate = new THREE.Mesh(geometry, plateMaterial);

                    // direction is always a single-axis unit vector, so it doubles
                    // directly as the stretch axis.
                    const stretchAxis: 'x' | 'y' | 'z' =
                        direction.x !== 0 ? 'x' : direction.y !== 0 ? 'y' : 'z';

                    const startPosition = targetPosition
                        .clone()
                        .addScaledVector(direction, this.flyInDistance);
                    plate.position.copy(startPosition);

                    const distanceFromCenter = new THREE.Vector3(
                        col - colCenter,
                        d - depthCenter,
                        row - rowCenter,
                    ).length();

                    const max = 0.35;
                    const min = 0.01;

                    // Non-linear (squared) redistribution: in a solid grid, the
                    // majority of cubes sit at moderate-to-high distances from
                    // center (only a handful of cells are actually near it), so
                    // that's the band that needs spreading out to avoid many
                    // cubes landing together. Squaring the normalized fraction
                    // steepens the curve precisely in that high range while
                    // compressing the few already-close-to-center cells further.
                    const normalizedDistance =
                        maxDistanceFromCenter > 0 ? distanceFromCenter / maxDistanceFromCenter : 0;
                    const spreadDistance =
                        normalizedDistance * normalizedDistance * maxDistanceFromCenter;

                    this.mesh.add(plate);
                    this.flyingPlates.push({
                        mesh: plate,
                        startPosition,
                        targetPosition,
                        delay:
                            spreadDistance * (Math.random() * (max - min) + min) +
                            Math.random() * this.baseDelayJitter,
                        elapsed: 0,
                        duration:
                            this.flyInDuration *
                            (1 + (Math.random() * 2 - 1) * this.durationJitter),
                        stretchAxis,
                    });
                }
            }
        }

        app.scene.add(this.mesh);
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
                // a plain cube in lockstep with the same ease-out arrival curve so
                // it's always exactly a cube the instant it reaches its target.
                const stretch = 1 + this.maxStretch * (1 - eased);
                plate.mesh.scale.set(
                    plate.stretchAxis === 'x' ? stretch : 1,
                    plate.stretchAxis === 'y' ? stretch : 1,
                    plate.stretchAxis === 'z' ? stretch : 1,
                );
            }
        }
    }

    dispose(): void {
        this.mesh.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
                (object.material as THREE.Material).dispose();
            }
        });
        this.mesh.removeFromParent();
    }
}
