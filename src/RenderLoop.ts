import * as THREE from 'three/webgpu';

export class RenderLoop {
    private rafId = 0;
    private clock = new THREE.Clock();
    private running = false;

    constructor(private renderPipeline: THREE.RenderPipeline) {}

    start(onTick: (deltaSeconds: number) => void): void {
        if (this.running) return;
        this.running = true;
        this.clock.start();

        const tick = () => {
            if (!this.running) return;
            this.rafId = requestAnimationFrame(tick);
            const dt = this.clock.getDelta();
            onTick(dt);
            this.renderPipeline.render();
        };

        this.rafId = requestAnimationFrame(tick);
    }

    stop(): void {
        this.running = false;
        cancelAnimationFrame(this.rafId);
        this.clock.stop();
    }
}
