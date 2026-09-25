import { SceneEntity } from '../SceneEntity';
import type { Grid } from './Grid';

// Every `interval` seconds, restarts whichever grid has been running the
// longest. Both grids stay visible permanently, so the restarted grid's
// fly-in plays out while the other one is still mid-animation/scaling down.
export class GridAlternator extends SceneEntity {
    alwaysUpdate = true;
    private elapsed = 0;
    // Which grid restarts on the next tick; starts at 1 so grid 0 (already
    // flying from its own init()) gets a full interval before being disturbed.
    private active: 0 | 1 = 1;

    constructor(
        private grids: [Grid, Grid],
        private interval: number = 3,
    ) {
        super();
    }

    init(): void {
        this.grids[0].mesh.visible = true;
        this.grids[1].mesh.visible = false;
    }

    update(deltaSeconds: number): void {
        this.elapsed += deltaSeconds;
        if (this.elapsed < this.interval) {
            return;
        }
        this.elapsed = 0;

        this.grids[this.active].mesh.visible = true;
        this.grids[this.active].reset();
        this.active = this.active === 0 ? 1 : 0;
    }
}
