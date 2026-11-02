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

// How a throw leaves the hand (2 Nov: every die should be seen to roll over several times, the
// user's call; before, a die often turned only once or twice, worst on the last few dice).
// height: where they start above the felt; lift: their upward speed; spin: the forward roll as
// a share of the rate that matches rolling on the felt; wobble: spin about the other axes.
export const THROW = { height: [1.1, 1.4], lift: [0.4, 1.2], spin: [0.8, 1.15], wobble: 9 };
// Every die turns over at least this many times (whole turns, 360 degrees) before it stops. A die
// still short of it (knocked still by the others) gets whole extra turns while it's in the air
// (addTurns): whole turns end where they began, so how it lands is untouched.
export const MIN_TURNS = 2.5;

// Something a die hit during the throw, for the sound: when (frame, 60 per second),
// how hard (impact speed) and what (another die, the felt, or the wooden rail).
// For a felt hit, also where on the felt (x, z), for the puff of dust.
export interface Impact { frame: number; strength: number; kind: 'die' | 'felt' | 'wall'; x?: number; z?: number }

export interface RollTrack {
    dieIds: number[];
    frames: number;
    data: Float32Array; // frame-major: [frame][die][7]
    offsets: THREE.Quaternion[]; // per die, applied after the body rotation
    impacts: Impact[];
    lastBounce: number; // the frame of the last real knock, slowed down on a suspense roll
}

// How a roll is played back: its speed (below 1 on a suspense roll), and optionally a stretch
// of frames around the last bounce played slower still.
export interface Pace { speed: number; slow?: { from: number; to: number; factor: number } }

// (11 frames around the last bounce at 0.4: about 0.5 s longer; it was 22 frames, ~1 s, until the
// user asked for half a second less, 26 Oct.)
export function suspensePace(track: RollTrack, speed: number): Pace {
    return { speed, slow: { from: Math.max(0, track.lastBounce - 7), to: track.lastBounce + 4, factor: 0.4 } };
}

// Seconds into the playback at which a frame shows, and the frame showing at a time.
export function paceSeconds(pace: Pace, frame: number) {
    const s = pace.slow;
    if (!s || frame <= s.from) return frame / 60 / pace.speed;
    const inSlow = Math.min(frame, s.to) - s.from, after = Math.max(0, frame - s.to);
    return (s.from + after) / 60 / pace.speed + inSlow / 60 / (pace.speed * s.factor);
}
export function paceFrame(pace: Pace, seconds: number) {
    const s = pace.slow;
    const plain = seconds * 60 * pace.speed;
    if (!s || plain <= s.from) return plain;
    const slowSeconds = (s.to - s.from) / 60 / (pace.speed * s.factor);
    const intoSlow = seconds - s.from / 60 / pace.speed;
    if (intoSlow <= slowSeconds) return s.from + intoSlow * 60 * pace.speed * s.factor;
    return s.to + (intoSlow - slowSeconds) * 60 * pace.speed;
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
    const wallBoxes: [number, number, number, number][] = [
        [cx, TRAY.minZ - t / 2, w / 2 + t, t / 2],
        [cx, TRAY.maxZ + t / 2, w / 2 + t, t / 2],
        [TRAY.minX - t / 2, cz, t / 2, dpt / 2 + t],
        [TRAY.maxX + t / 2, cz, t / 2, dpt / 2 + t]
    ];
    const walls: CANNON.Body[] = [];
    wallBoxes.forEach(([x, z, hx, hz]) => {
        const wall = new CANNON.Body({ mass: 0, material: tableMaterial, shape: new CANNON.Box(new CANNON.Vec3(hx, h, hz)) });
        wall.position.set(x, h, z);
        world.addBody(wall);
        walls.push(wall);
    });

    return { world, diceMaterial, floor, walls };
}

// direction: 1 throws left to right across the tray's long side, -1 right to left.
function simulateOnce(count: number, direction: 1 | -1) {
    const { world, diceMaterial, floor, walls } = buildWorld();
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
            startX + direction * col * 1.3 + rand(-0.1, 0.1),
            rand(THROW.height[0], THROW.height[1]),
            cz + (row - (rows - 1) / 2) * 1.3 + rand(-0.1, 0.1)
        );
        body.quaternion.setFromEuler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
        const speed = rand(10, 13);
        body.velocity.set(direction * speed, rand(THROW.lift[0], THROW.lift[1]), rand(-1.6, 1.6));
        // Forward roll: spinning about z at about the rate that matches rolling on the felt
        // (speed / half-size), plus some wobble so it isn't a perfect wheel.
        body.angularVelocity.set(rand(-THROW.wobble, THROW.wobble), rand(-THROW.wobble, THROW.wobble), -direction * (speed / DIE_HALF) * rand(THROW.spin[0], THROW.spin[1]));
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
    // Each new contact is an impact (cannon-es reports a collision once, when it starts).
    // A die-on-die hit is reported to both dice; keep one.
    const impacts: Impact[] = [];
    let step = 0;
    bodies.forEach(body => body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        const other = e.body;
        const kind: Impact['kind'] = other === floor ? 'felt' : walls.includes(other) ? 'wall' : 'die';
        if (kind === 'die' && body.id > other.id) return;
        const strength = Math.abs(e.contact.getImpactVelocityAlongNormal());
        // Skip touches in the first few frames: that is the dice leaving the hand together.
        const frame = Math.floor(step / RECORD_EVERY);
        if (strength > 1.2 && frame >= 4) impacts.push(kind === 'felt' ? { frame, strength, kind, x: body.position.x, z: body.position.z } : { frame, strength, kind });
    }));

    for (step = 0; step <= maxSteps; step++) {
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

    const frames = recorded.length / (count * FLOATS_PER_DIE);
    return { recorded, bodies, impacts, flat: bodies.every(isFlat), frames };
}

// How many whole turns each die made over a recorded throw (the angle between each frame's
// rotation and the next, added up).
export function turnsOf(data: ArrayLike<number>, count: number, frames: number) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        let total = 0;
        for (let f = 1; f < frames; f++) {
            const a = ((f - 1) * count + i) * FLOATS_PER_DIE + 3, b = (f * count + i) * FLOATS_PER_DIE + 3;
            const dot = Math.abs(data[a] * data[b] + data[a + 1] * data[b + 1] + data[a + 2] * data[b + 2] + data[a + 3] * data[b + 3]);
            total += 2 * Math.acos(Math.min(1, dot));
        }
        out.push(total / (Math.PI * 2));
    }
    return out;
}

// Whole extra turns for any die that turned over fewer than MIN_TURNS times: spun the way it is
// already tumbling (else forward, as thrown) over its longest time in the air (out of the hand,
// or a later bounce), easing in and out so its spin meets the real tumble smoothly. One axis per
// die, fixed from its real tumble (turns about different axes partly undo each other), and as few
// whole turns as reach the minimum.
const extra = new THREE.Quaternion(), body = new THREE.Quaternion(), before = new THREE.Quaternion();
function addTurns(data: number[], count: number, frames: number, direction: 1 | -1) {
    const turns = turnsOf(data, count, frames);
    for (let i = 0; i < count; i++) {
        if (turns[i] >= MIN_TURNS) continue;
        // Its longest time in the air: frames where no corner could reach the felt (or, for a die
        // that barely leaves it, its longest small hop).
        const stretch = (lift: number) => {
            const high = (f: number) => data[(f * count + i) * FLOATS_PER_DIE + 1] > DIE_HALF * lift;
            let a = 0, b = 0;
            for (let f = 0; f < frames; ) {
                if (!high(f)) { f++; continue; }
                let g = f;
                while (g < frames - 1 && high(g + 1)) g++;
                if (g - f > b - a) { a = f; b = g; }
                f = g + 1;
            }
            return [a, b];
        };
        let [from, land] = stretch(1.45);
        if (land - from < 6) [from, land] = stretch(1.15);
        if (land - from < 4) continue; // (never off the felt at all)
        const fromHand = from === 0; // out of the hand it may start fast; after a bounce it eases in
        // Its tumble over the stretch's first frames, in world terms: q1 = d * q0, so d = q1 * q0^-1.
        const at = (f: number, q: THREE.Quaternion) => { const o = (f * count + i) * FLOATS_PER_DIE + 3; return q.set(data[o], data[o + 1], data[o + 2], data[o + 3]); };
        const d = at(Math.min(from + 4, land), body).multiply(at(from, before).invert());
        const axis = new THREE.Vector3(d.x, d.y, d.z);
        if (d.w < 0) axis.negate();
        if (axis.lengthSq() < 1e-6) axis.set(0, 0, -direction);
        axis.normalize();
        // Its rotations over the stretch as they were, to try 1, 2, 3 or 4 extra turns on.
        const original: number[] = [];
        for (let f = from; f <= land; f++) { const o = (f * count + i) * FLOATS_PER_DIE + 3; original.push(data[o], data[o + 1], data[o + 2], data[o + 3]); }
        for (let add = Math.max(1, Math.ceil(MIN_TURNS - turns[i])); add <= 4; add++) {
            for (let f = from; f <= land; f++) {
                const t = (f - from) / (land - from);
                const eased = fromHand ? 1 - (1 - t) * (1 - t) : t * t * (3 - 2 * t);
                extra.setFromAxisAngle(axis, eased * add * Math.PI * 2);
                const k = (f - from) * 4, o = (f * count + i) * FLOATS_PER_DIE + 3;
                body.set(original[k], original[k + 1], original[k + 2], original[k + 3]).premultiply(extra);
                data[o] = body.x; data[o + 1] = body.y; data[o + 2] = body.z; data[o + 3] = body.w;
            }
            if (turnsOf(data, count, frames)[i] >= MIN_TURNS) break;
        }
    }
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
    // Prefer a throw that ends flat within ~3.2s; otherwise keep the best one seen (flat beats
    // cocked, then shorter beats longer). A die that turns too little is fixed after (addTurns).
    const QUICK_FRAMES = 3.2 * 60;
    const better = (a: ReturnType<typeof simulateOnce>, b: ReturnType<typeof simulateOnce>) =>
        a.flat !== b.flat ? a.flat : a.frames < b.frames;
    const direction = random() < 0.5 ? 1 : -1;
    let result = simulateOnce(dieIds.length, direction);
    for (let attempt = 0; attempt < 6 && !(result.flat && result.frames <= QUICK_FRAMES); attempt++) {
        const next = simulateOnce(dieIds.length, direction);
        if (better(next, result)) result = next;
    }

    addTurns(result.recorded, dieIds.length, result.frames, direction);

    const offsets = result.bodies.map((b, i) => {
        const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const landed = valueFacingUp(q);
        const target = targetValues[i];
        if (!target || target === landed) return new THREE.Quaternion();
        // Rotate the die's own frame so the target face sits where the landed face is.
        return new THREE.Quaternion().setFromUnitVectors(faceNormal(target), faceNormal(landed));
    });

    const knocks = result.impacts.filter(i => i.strength > 1.6);
    const lastBounce = knocks.length ? knocks[knocks.length - 1].frame : Math.round(result.frames * 0.7);
    return { dieIds, frames: result.frames, data: Float32Array.from(result.recorded), offsets, impacts: result.impacts, lastBounce };
}
