import * as THREE from 'three';

// World units: one die is 0.9 wide. The player looks at the table from the +z side.
export const DIE_SIZE = 0.9;
export const DIE_HALF = DIE_SIZE / 2;

// The felt tray the dice are thrown into.
export const TRAY = { minX: -3.6, maxX: 3.6, minZ: -2.7, maxZ: 1.5, wallHeight: 0.8 };

// The tabletop stops just behind the tray; the tavern backdrop shows beyond it.
export const TABLE_FAR_EDGE_Z = TRAY.minZ - 1.0;

// The rail in front of the tray where locked dice are set down.
export const SLOT_ROW_Z = 2.55;
export const REQUIRED_SLOT_X = [-3.0, -2.0];

export function slotPosition(slot: number, scoringCount: number): THREE.Vector3 {
    if (slot < 2) return new THREE.Vector3(REQUIRED_SLOT_X[slot], DIE_HALF, SLOT_ROW_Z);
    const first = -0.85, last = 3.05;
    const step = scoringCount > 1 ? Math.min(1.0, (last - first) / (scoringCount - 1)) : 0;
    return new THREE.Vector3(first + (slot - 2) * step, DIE_HALF, SLOT_ROW_Z);
}

// Screen space the on-screen controls take up (px), measured by the HUD. On phones the
// camera keeps the table above the controls at the bottom.
export const screenInsets = { bottom: 0 };

// Where unrolled dice wait at the start of a turn.
export function waitingPosition(id: number): THREE.Vector3 {
    return new THREE.Vector3(-2.75 + id * 1.1, DIE_HALF, -0.6);
}

// Box faces in three.js material order (+x, -x, +y, -y, +z, -z) and the value printed on each.
// Opposite faces add up to 7, like a real die.
export const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
];

export function faceNormal(value: number): THREE.Vector3 {
    return FACE_NORMALS[FACE_VALUES.indexOf(value)];
}

// Which value is facing up for a die with this orientation.
export function valueFacingUp(q: THREE.Quaternion): number {
    let best = 1, bestY = -Infinity;
    const v = new THREE.Vector3();
    FACE_NORMALS.forEach((n, i) => {
        v.copy(n).applyQuaternion(q);
        if (v.y > bestY) { bestY = v.y; best = FACE_VALUES[i]; }
    });
    return best;
}

// Orientation that shows `value` on top, turned by `yaw` radians.
export function faceUpQuaternion(value: number, yaw = 0): THREE.Quaternion {
    const up = new THREE.Quaternion().setFromUnitVectors(faceNormal(value), new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(up);
}
