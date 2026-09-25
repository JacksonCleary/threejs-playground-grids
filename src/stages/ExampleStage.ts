import * as THREE from 'three';
import { Stage } from '../Stage';
import { AmbientLight } from '../entities/AmbientLight';
import { ExampleCube } from '../entities/ExampleCube';
import { Grid } from '../entities/Grid';
import { GridAlternator } from '../entities/GridAlternator';
export class ExampleStage extends Stage {
    setup(): void {
        // Compose the scene using entities
        const gridA = new Grid(8, 8, 8);
        const gridB = new Grid(8, 8, 8);
        this.entities.push(new AmbientLight(), gridA, gridB, new GridAlternator([gridA, gridB]));
        // this.entities.push(new AmbientLight(), new ExampleCube(new THREE.Vector3(30, 30, 30)));

        // You could also hook up stage-level logic or UI here
        console.log('[ExampleStage] Setting up scene...');
    }
}
