import * as THREE from 'three/webgpu';
import { SceneEntity } from '../SceneEntity';
import type { AppContext } from '../types/AppContext';
import { COLORS } from '../constants/color';

export class ExampleCube extends SceneEntity {
    mesh!: THREE.Mesh;
    private unsub: Array<() => void> = [];

    constructor(
        private position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        private color: number = COLORS.ex_fill,
    ) {
        super();
    }

    init(app: AppContext): void {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            roughness: 0.85,
            wireframe: true,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);

        app.scene.add(this.mesh);

        // Example: react to resize events via EventBus
        this.unsub.push(
            app.events.on('app:resize', ({ width, height }) => {
                console.log(`Canvas resized to ${width}x${height}`);
            }),
        );
    }

    update(dt: number): void {
        // this.mesh.rotation.x += dt * 0.5;
        // this.mesh.rotation.y += dt * 0.8;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.mesh.removeFromParent();
        this.unsub.forEach((fn) => fn());
    }
}
