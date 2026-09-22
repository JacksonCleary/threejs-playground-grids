import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { pixelationPass } from 'three/addons/tsl/display/PixelationPassNode.js';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';

export class PostProcessing {
    readonly scene: THREE.Scene;
    readonly camera: THREE.PerspectiveCamera;
    renderPipeline: THREE.RenderPipeline;

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        rendererPipeline: THREE.RenderPipeline,
    ) {
        this.scene = scene;
        this.camera = camera;
        this.renderPipeline = rendererPipeline;
    }

    buildOutput(): void {
        const regularPass = pass(this.scene, this.camera);
        // const pixelatedScene = pixelationPass(this.scene, this.camera, 3, 0.3, 0.4);

        const output = afterImage(regularPass, 0);
        // const output = afterImage(pixelatedScene, 0.8);

        this.renderPipeline.outputNode = output;
    }
}
