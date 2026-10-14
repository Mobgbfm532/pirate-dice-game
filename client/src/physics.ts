import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { DIE_HALF, TRAY, faceNormal, valueFacingUp } from './layout';

// Rolls are simulated ahead of time, then played back. The server has already decided
// each die's value, so once a simulated die comes to rest we work out which face landed
// on top and relabel the die's faces (a fixed rotation, `offset`) so the server's value
// is the one showing. The motion is real physics; only the printed numbers move.

const STEP = 1 / 120;
const RECORD_EVERY = 2; // frames are recorded at 60 per second
const MAX_SECONDS = 4.5;
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

// All randomness in a throw comes from this generator. Seeded from the server's throwSeed,
// every screen at the table simulates exactly the same tumble.
let random: () => number = Math.random;
const rand = (min: number, max: number) => min + random() * (max - min);

// mulberry32: a small, fast seeded generator; plenty for dice throws.
function seededRandom(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A cube with its corners clipped off, matching the rounded dice drawn on screen. A sharp
// physics cube loses most of its energy every time it tips over an edge and stops dead;
// clipped corners let it keep tumbling, like a real die. It still rests flat on a face.
function clippedCube(half: number, clip: number) {
    const inner = half - clip;
    const vertices: CANNON.Vec3[] = [];
    const signs = [-1, 1];
    for (const sx of signs) for (const sy of signs) for (const sz of signs) {
        vertices.push(new CANNON.Vec3(sx * half, sy * half, sz * inner));
        vertices.push(new CANNON.Vec3(sx * half, sy * inner, sz * half));
        vertices.push(new CANNON.Vec3(sx * inner, sy * half, sz * half));
    }
    // Faces: six octagons (one per side) and eight corner triangles. Each face's vertices are
    // ordered counter-clockwise seen from outside, as cannon-es requires.
    const faceOf = (normal: CANNON.Vec3, test: (v: CANNON.Vec3) => boolean) => {
        const ids = vertices.map((v, i) => (test(v) ? i : -1)).filter(i => i >= 0);
        const centre = ids.reduce((c, i) => c.vadd(vertices[i]), new CANNON.Vec3()).scale(1 / ids.length);
        const u = Math.abs(normal.x) < 0.9 ? new CANNON.Vec3(1, 0, 0).cross(normal) : new CANNON.Vec3(0, 1, 0).cross(normal);
        u.normalize();
        const v = normal.cross(u);
        const angle = (i: number) => { const d = vertices[i].vsub(centre); return Math.atan2(d.dot(v), d.dot(u)); };
        return ids.sort((a, b) => angle(a) - angle(b));
    };
    const faces: number[][] = [];
    const eps = 1e-6;
    for (const axis of ['x', 'y', 'z'] as const) for (const s of signs) {
        const n = new CANNON.Vec3(axis === 'x' ? s : 0, axis === 'y' ? s : 0, axis === 'z' ? s : 0);
        faces.push(faceOf(n, p => Math.abs(p[axis] - s * half) < eps));
    }
    for (const sx of signs) for (const sy of signs) for (const sz of signs) {
        const n = new CANNON.Vec3(sx, sy, sz);
        n.normalize();
        faces.push(faceOf(n, p => Math.sign(p.x) === sx && Math.sign(p.y) === sy && Math.sign(p.z) === sz));
    }
    return new CANNON.ConvexPolyhedron({ vertices, faces });
}

const DIE_SHAPE = clippedCube(DIE_HALF, 0.14); // matches the drawn dice's corner radius (0.13)

function buildWorld() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.NaiveBroadphase();

    const diceMaterial = new CANNON.Material('dice');
    const tableMaterial = new CANNON.Material('table');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, tableMaterial, { friction: 0.3, restitution: 0.3 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.2, restitution: 0.4 }));

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

// direction: 1 throws left to right across the tray's long side, -1 right to left.
function simulateOnce(count: number, direction: 1 | -1) {
    const { world, diceMaterial } = buildWorld();
    const bodies: CANNON.Body[] = [];

    for (let i = 0; i < count; i++) {
        const body = new CANNON.Body({
            mass: 1,
            material: diceMaterial,
            shape: DIE_SHAPE,
            linearDamping: 0.04,
            angularDamping: 0.02,
            sleepSpeedLimit: 0.25,
            sleepTimeLimit: 0.25
        });
        // A low, fast toss in from one end of the tray, along its long side, so the dice
        // land early and tumble across the felt. They start in a loose two-column cluster.
        const rows = Math.ceil(count / 2);
        const col = i % 2, row = Math.floor(i / 2);
        const startX = direction > 0 ? TRAY.minX + 0.7 : TRAY.maxX - 0.7;
        const cz = (TRAY.minZ + TRAY.maxZ) / 2;
        body.position.set(
            startX + direction * col * 1.0 + rand(-0.1, 0.1),
            rand(0.85, 1.1),
            cz + (row - (rows - 1) / 2) * 1.05 + rand(-0.15, 0.15)
        );
        body.quaternion.setFromEuler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
        const speed = rand(10, 13);
        body.velocity.set(direction * speed, rand(-1, 0.3), rand(-1.6, 1.6));
        // Forward roll: spinning about z at about the rate that matches rolling on the felt
        // (speed / half-size), plus some wobble so it isn't a perfect wheel.
        body.angularVelocity.set(rand(-7, 7), rand(-7, 7), -direction * (speed / DIE_HALF) * rand(0.5, 0.95));
        world.addBody(body);
        bodies.push(body);
    }

    // Run until every die has been almost still for a quarter of a second. A die that
    // comes to rest cocked (leaning on another die or a wall) gets a small tap, like a
    // player nudging it, and the simulation carries on until it falls flat.
    const recorded: number[] = [];
    const maxSteps = Math.round(MAX_SECONDS / STEP);
    let stillSteps = 0;
    let nudges = 0;
    for (let step = 0; step <= maxSteps; step++) {
        if (step % RECORD_EVERY === 0) {
            bodies.forEach(b => recorded.push(b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
        }
        const still = bodies.every(b => b.velocity.lengthSquared() < 0.04 && b.angularVelocity.lengthSquared() < 0.09);
        stillSteps = still ? stillSteps + 1 : 0;
        if (step > 30 && stillSteps * STEP >= 0.25) {
            const cocked = bodies.filter(b => !isFlat(b));
            if (cocked.length === 0 || nudges >= 3) break;
            nudges++;
            stillSteps = 0;
            cocked.forEach(b => {
                b.wakeUp();
                b.velocity.set(rand(-1.5, 1.5) - b.position.x * 0.3, rand(3, 4.5), rand(-1.5, 1.5) - b.position.z * 0.3);
                b.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
            });
        }
        world.step(STEP);
    }

    return { recorded, bodies, flat: bodies.every(isFlat), frames: recorded.length / (count * FLOATS_PER_DIE) };
}

// Flat on the felt: one face pointing straight up and not resting on another die.
function isFlat(b: CANNON.Body) {
    const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const topNormal = faceNormal(valueFacingUp(q)).clone().applyQuaternion(q);
    return topNormal.y > 0.97 && b.position.y < DIE_HALF + 0.05;
}

// Simulates a throw of the given dice that ends on `targetValues` (0 = keep whatever lands).
export function simulateRoll(dieIds: number[], targetValues: number[], seed?: number): RollTrack {
    random = seed === undefined ? Math.random : seededRandom(seed);
    // Prefer a throw that ends flat within ~3.2s; otherwise keep the best one seen
    // (flat beats cocked, then shorter beats longer).
    const QUICK_FRAMES = 3.2 * 60;
    const better = (a: ReturnType<typeof simulateOnce>, b: ReturnType<typeof simulateOnce>) =>
        a.flat !== b.flat ? a.flat : a.frames < b.frames;
    const direction = random() < 0.5 ? 1 : -1;
    let result = simulateOnce(dieIds.length, direction);
    for (let attempt = 0; attempt < 6 && !(result.flat && result.frames <= QUICK_FRAMES); attempt++) {
        const next = simulateOnce(dieIds.length, direction);
        if (better(next, result)) result = next;
    }

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
