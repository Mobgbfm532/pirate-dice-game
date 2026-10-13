import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { DIE_HALF, TRAY, faceNormal, valueFacingUp } from './layout';

// Rolls are simulated ahead of time, then played back. The server has already decided
// each die's value, so once a simulated die comes to rest we work out which face landed
// on top and relabel the die's faces (a fixed rotation, `offset`) so the server's value
// is the one showing. The motion is real physics; only the printed numbers move.

const STEP = 1 / 120;
const RECORD_EVERY = 2; // frames are recorded at 60 per second
const MAX_SECONDS = 3;
const FLOATS_PER_DIE = 7; // x, y, z, qx, qy, qz, qw

export interface RollTrack {
    dieIds: number[];
    frames: number;
    data: Float32Array; // frame-major: [frame][die][7]
    offsets: THREE.Quaternion[]; // per die, applied after the body rotation
}

export function trackDuration(track: RollTrack) {
    return track.frames / 60;
}

export function readFrame(track: RollTrack, frame: number, dieIndex: number, pos: THREE.Vector3, quat: THREE.Quaternion) {
    const f = Math.min(track.frames - 1, Math.max(0, frame));
    const o = (f * track.dieIds.length + dieIndex) * FLOATS_PER_DIE;
    const d = track.data;
    pos.set(d[o], d[o + 1], d[o + 2]);
    quat.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]).multiply(track.offsets[dieIndex]);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function buildWorld() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -42, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.NaiveBroadphase();

    const diceMaterial = new CANNON.Material('dice');
    const tableMaterial = new CANNON.Material('table');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, tableMaterial, { friction: 0.32, restitution: 0.32 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.18, restitution: 0.4 }));

    const floor = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);

    // Walls are tall so nothing escapes; only the low visible rim is drawn.
    const h = 6, t = 0.5;
    const cx = (TRAY.minX + TRAY.maxX) / 2, cz = (TRAY.minZ + TRAY.maxZ) / 2;
    const w = TRAY.maxX - TRAY.minX, dpt = TRAY.maxZ - TRAY.minZ;
    const walls: [number, number, number, number][] = [
        [cx, TRAY.minZ - t / 2, w / 2 + t, t / 2],
        [cx, TRAY.maxZ + t / 2, w / 2 + t, t / 2],
        [TRAY.minX - t / 2, cz, t / 2, dpt / 2 + t],
        [TRAY.maxX + t / 2, cz, t / 2, dpt / 2 + t]
    ];
    walls.forEach(([x, z, hx, hz]) => {
        const wall = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Box(new CANNON.Vec3(hx, h, hz)) });
        wall.position.set(x, h, z);
        world.addBody(wall);
    });

    return { world, diceMaterial };
}

function simulateOnce(count: number) {
    const { world, diceMaterial } = buildWorld();
    const bodies: CANNON.Body[] = [];

    for (let i = 0; i < count; i++) {
        const body = new CANNON.Body({
            mass: 1,
            material: diceMaterial,
            shape: new CANNON.Box(new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)),
            linearDamping: 0.08,
            angularDamping: 0.12,
            sleepSpeedLimit: 0.25,
            sleepTimeLimit: 0.25
        });
        // Thrown from the player's side of the tray, away from the camera.
        const spread = Math.min(1.0, 5.4 / Math.max(1, count));
        body.position.set((i - (count - 1) / 2) * spread + rand(-0.15, 0.15), rand(1.6, 2.6), TRAY.maxZ - 0.7 + rand(-0.2, 0.2));
        body.quaternion.setFromEuler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
        body.velocity.set(rand(-2.5, 2.5), rand(0, 2), rand(-11, -7));
        body.angularVelocity.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
        world.addBody(body);
        bodies.push(body);
    }

    // Stop once every die has been almost still for a quarter of a second.
    const recorded: number[] = [];
    const maxSteps = Math.round(MAX_SECONDS / STEP);
    let stillSteps = 0;
    for (let step = 0; step <= maxSteps; step++) {
        if (step % RECORD_EVERY === 0) {
            bodies.forEach(b => recorded.push(b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
        }
        const still = bodies.every(b => b.velocity.lengthSquared() < 0.04 && b.angularVelocity.lengthSquared() < 0.09);
        stillSteps = still ? stillSteps + 1 : 0;
        if (step > 30 && stillSteps * STEP >= 0.25) break;
        world.step(STEP);
    }

    // A good roll ends with every die flat on the felt (not leaning on a wall or another die).
    const flat = bodies.every(b => {
        const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const topNormal = faceNormal(valueFacingUp(q)).clone().applyQuaternion(q);
        return topNormal.y > 0.97 && b.position.y < DIE_HALF + 0.05;
    });

    return { recorded, bodies, flat, frames: recorded.length / (count * FLOATS_PER_DIE) };
}

// Simulates a throw of the given dice that ends on `targetValues` (0 = keep whatever lands).
export function simulateRoll(dieIds: number[], targetValues: number[]): RollTrack {
    let result = simulateOnce(dieIds.length);
    for (let attempt = 0; attempt < 8 && !result.flat; attempt++) result = simulateOnce(dieIds.length);

    const offsets = result.bodies.map((b, i) => {
        const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const landed = valueFacingUp(q);
        const target = targetValues[i];
        if (!target || target === landed) return new THREE.Quaternion();
        // Rotate the die's own frame so the target face sits where the landed face is.
        return new THREE.Quaternion().setFromUnitVectors(faceNormal(target), faceNormal(landed));
    });

    return { dieIds, frames: result.frames, data: Float32Array.from(result.recorded), offsets };
}
