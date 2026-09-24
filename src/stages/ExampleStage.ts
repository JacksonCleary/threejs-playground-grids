import * as THREE from 'three';
import { Stage } from '../Stage';
import { AmbientLight } from '../entities/AmbientLight';
import { ExampleCube } from '../entities/ExampleCube';
import { Grid } from '../entities/Grid';
export class ExampleStage extends Stage {
    setup(): void {
        // Compose the scene using entities
        this.entities.push(new AmbientLight(), new Grid(10, 10, 10));
        // this.entities.push(new AmbientLight(), new ExampleCube(new THREE.Vector3(30, 30, 30)));

        // You could also hook up stage-level logic or UI here
        console.log('[ExampleStage] Setting up scene...');
    }
}
