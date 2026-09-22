import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PostProcessing } from './PostProcessing';
import { EventBus } from './EventBus';
import { RenderLoop } from './RenderLoop';
import { ResourceManager } from './ResourceManager';
import { Camera } from './Camera';
import type { SceneEntity } from './SceneEntity';
import type { AppContext, AppConfig, AppState } from './types/AppContext';
import Stats from 'three/addons/libs/stats.module.js';
import { COLORS } from './constants/color';

export class App implements AppContext {
    readonly renderer: THREE.WebGPURenderer;
    readonly renderPipeline: THREE.RenderPipeline;
    readonly scene: THREE.Scene;
    readonly cameraController: Camera;
    readonly camera: THREE.PerspectiveCamera;
    readonly events: EventBus;
    readonly resources: ResourceManager;

    private loop: RenderLoop;
    private entities: SceneEntity[] = [];
    private state: AppState = 'idle';

    private frustum = new THREE.Frustum();
    private projScreenMatrix = new THREE.Matrix4();

    private debug: boolean = false;
    private stats?: Stats;

    private controls?: OrbitControls;
    private postProcessing?: PostProcessing;

    constructor({ canvas, postProcessing, debug }: AppConfig) {
        // Renderer
        this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
        this.renderPipeline = new THREE.RenderPipeline(this.renderer);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(COLORS.bg);

        // Atmosphere
        // Reverted fog to previous atmospheric levels
        // Starts closer (40) and fades out sooner (95) for that depth/haze effect
        // this.scene.fog = new THREE.Fog(0x87ceeb, 50, 95);

        // Camera
        this.cameraController = new Camera(20, 20, 20);
        this.camera = this.cameraController.getInstance();
        this.cameraController.attachControls(this.renderer);

        // Events
        this.events = new EventBus();

        // Resources
        this.resources = new ResourceManager();

        // Engine
        this.loop = new RenderLoop(this.renderPipeline);

        // Optional Post Processing
        if (postProcessing) {
            this.postProcessing = new PostProcessing(this.scene, this.camera, this.renderPipeline);
            this.postProcessing.buildOutput();
        }

        window.addEventListener('resize', this.onResize);
        this.onResize();

        if (debug) {
            this.debug = true;
            this.stats = new Stats();
            document.body.appendChild(this.stats.dom);
        }
    }

    /** Add an entity before calling start(). */
    add(entity: SceneEntity): this {
        if (this.state !== 'idle') {
            console.warn('[App] Entities should be added before App.start()');
            return this;
        }
        this.entities.push(entity);
        entity.init(this);
        return this; // fluent: app.add(new Cube()).add(new Lights())
    }

    /** Awaits all entity.load() calls, then begins the render loop. */
    async start(): Promise<void> {
        if (this.state !== 'idle') return;
        this.state = 'loading';

        await this.renderer.init();
        await Promise.all(this.entities.map((e) => e.load?.(this.resources)));

        this.state = 'running';
        this.loop.start((dt) => {
            this.cameraController.update(dt);

            this.camera.updateMatrixWorld();
            this.projScreenMatrix.multiplyMatrices(
                this.camera.projectionMatrix,
                this.camera.matrixWorldInverse,
            );
            this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

            for (let i = 0; i < this.entities.length; i++) {
                const e = this.entities[i];
                if (!e.update) continue;

                if (e.alwaysUpdate || !e.mesh) {
                    e.update(dt);
                } else {
                    if (this.frustum.intersectsObject(e.mesh)) {
                        e.update(dt);
                    }
                }
            }

            if (this.stats && this.debug) {
                this.stats.update();
            }
            if (this.controls && this.controls.autoRotate) {
                this.controls.update();
            }
        });
    }

    dispose(): void {
        if (this.state === 'disposed') return;
        this.state = 'disposed';

        this.loop.stop();
        this.entities.forEach((e) => e.dispose?.());
        this.entities = [];
        this.resources.dispose();
        this.events.clear();
        this.renderPipeline.dispose();
        this.renderer.dispose();
        window.removeEventListener('resize', this.onResize);

        this.events.emit('app:disposed', {});
    }

    private onResize = (): void => {
        // Use window inner dimensions to cleanly resize the canvas
        // without getting caught in a cyclic inline-style loop with the parent container.
        const w = window.innerWidth;
        const h = window.innerHeight;

        // This implicitly sets the inline style width/height on the <canvas>
        this.renderer.setSize(w, h);

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.events.emit('app:resize', { width: w, height: h });
    };
}
