import * as THREE from 'three/webgpu';
import { dot, float, min, positionLocal, uniform } from 'three/tsl';

/**
 * Builds a positionNode that stretches a mesh backward along
 * `travelDirection`, anchoring the leading face so it looks like the mesh is
 * rocketing in with a trailing tail rather than bloating from its center.
 * Returns the stretch uniform (1 = original shape, >1 = elongated) to
 * animate via `.value` each frame.
 */
export function createElongateNode(travelDirection: THREE.Vector3) {
    const directionNode = uniform(travelDirection.clone().normalize());
    const stretchNode = uniform(1);
    const projection = dot(positionLocal, directionNode);
    // Only vertices on the trailing side (behind travel direction) get
    // pushed further back; the leading face stays put as the anchor point.
    const trailingOffset = min(projection, float(0));
    const positionNode = positionLocal.add(
        directionNode.mul(trailingOffset).mul(stretchNode.sub(1)),
    );
    return { positionNode, stretchNode };
}
