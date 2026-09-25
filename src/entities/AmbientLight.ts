import * as THREE from 'three/webgpu';
import { SceneEntity } from '../SceneEntity';
import type { AppContext } from '../types/AppContext';

export class AmbientLight extends SceneEntity {
    alwaysUpdate = true;

    private light!: THREE.AmbientLight;
    private sunlight!: THREE.DirectionalLight;

    init(app: AppContext): void {
        this.light = new THREE.AmbientLight(0xffffff, 0.5);
        this.sunlight = new THREE.DirectionalLight(0xffffff, 10.2);
        this.sunlight.position.set(50, 80, 30);
        this.sunlight.castShadow = false;
        this.sunlight.shadow.mapSize.width = 2048;
        this.sunlight.shadow.mapSize.height = 2048;
        this.sunlight.shadow.camera.near = 0.1;
        this.sunlight.shadow.camera.far = 200;
        this.sunlight.shadow.camera.left = -70;
        this.sunlight.shadow.camera.right = 70;
        this.sunlight.shadow.camera.top = 70;
        this.sunlight.shadow.camera.bottom = -70;
        app.scene.add(this.light, this.sunlight);
    }

    dispose(): void {
        this.light.removeFromParent();
        this.sunlight.removeFromParent();
    }
}
