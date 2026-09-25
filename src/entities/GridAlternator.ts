import { SceneEntity } from '../SceneEntity';
import type { Grid } from './Grid';

// Swaps between two pre-built Grid instances once the visible one has fully
// flown in and held for `holdDuration`. The outgoing grid stays visible while
// the incoming one flies in, and is only hidden once the incoming grid has
// fully settled, so the two overlap instead of instantly swapping.
export class GridAlternator extends SceneEntity {
    alwaysUpdate = true;
    private holdElapsed = 0;
    private active: 0 | 1 = 0;
    private transitioning = false;

    constructor(
        private grids: [Grid, Grid],
        private holdDuration: number = 0.5,
    ) {
        super();
    }

    init(): void {
        this.grids[0].mesh.visible = true;
        this.grids[1].mesh.visible = false;
    }

    update(deltaSeconds: number): void {
        const next = this.active === 0 ? 1 : 0;

        if (this.transitioning) {
            // Keep the old grid visible until the incoming one has arrived.
            if (this.grids[next].isSettled()) {
                this.grids[this.active].mesh.visible = false;
                this.active = next;
                this.transitioning = false;
            }
            return;
        }

        if (!this.grids[this.active].isSettled()) {
            return;
        }

        this.holdElapsed += deltaSeconds;
        if (this.holdElapsed < this.holdDuration) {
            return;
        }
        this.holdElapsed = 0;

        // Start the incoming grid's fly-in without hiding the current one yet.
        this.grids[next].reset();
        this.grids[next].mesh.visible = true;
        this.transitioning = true;
    }
}
