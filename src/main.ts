import './style.css';
import { App } from './App';
import { ExampleStage } from './stages/ExampleStage';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('No #canvas element found');

const postProcessing = true;
const debug = true;

const app = new App({ canvas, postProcessing, debug });

// Load the stage
const stage = new ExampleStage();
stage.init(app);

app.start();

// Example of event delegation triggering a system-level reset
window.addEventListener('keydown', (e) => {
    if (e.key === 'r') {
        app.events.emit('particles:reset', { position: { x: 0, y: 0, z: 0 } });
    }
});

// Optional: clean up on HMR / page unload
if (import.meta.hot) {
    import.meta.hot.dispose(() => app.dispose());
}
