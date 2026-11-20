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

// The Salty Swallow listing (9 Nov): gravity leans toward the low side (+x, the right, to starboard),
// so the dice drift that way as they land. Only the look: the faces are still the server's.
const LEAN_PULL = 6.5;
// The throw's feel (18 Nov): how hard the dice are thrown, and the rails: a die that reaches the far rail stays near
// it instead of bouncing back across (the user: "sometimes they barely roll across the dice tray"). Mutable for the dev
// hook's measurements (window.__game.throwFeel).
// Measured 18 Nov over 30 six-dice throws each: every short die was in the back row, run into by the front one; starting
// it 1.5 higher (it arcs over) and the front row a little faster (out of its way) halves the short dice; a deader rail,
// a harder back row or a harder throw overall didn't help as much. The rest is the choice of throw below.
export const throwFeel = { speedMin: 10, speedMax: 13, wallRestitution: 0.3, wallFriction: 0.3, rearBoost: 0, rearLift: 1.5, frontBoost: 3, nudgeUp: [1.5, 2.2], nudgeSide: 1.2, nudgeSpin: 4 };
// (The nudge, 20 Nov, the user's "can take a little while to settle ... it can look like the face is being changed": a die
// that came to rest cocked used to hop 3-4.5 high with a hard spin, and land on another face; now it slides off what it
// leans on with a small hop. And the throw chosen below is one that needed no nudge at all whenever one of the tries did:
// measured over 40 six-dice throws, 21 needed a nudge before, 5 after, and a throw ended about 0.4 s sooner on average.)

function buildWorld(lean = 0) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(lean * LEAN_PULL, -24, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.NaiveBroadphase();

    const diceMaterial = new CANNON.Material('dice');
    const tableMaterial = new CANNON.Material('table');
    const wallMaterial = new CANNON.Material('wall');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, wallMaterial, { friction: throwFeel.wallFriction, restitution: throwFeel.wallRestitution }));
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
        const wall = new CANNON.Body({ mass: 0, material: wallMaterial, shape: new CANNON.Box(new CANNON.Vec3(hx, h, hz)) });
        wall.position.set(x, h, z);
        world.addBody(wall);
        walls.push(wall);
    });

    return { world, diceMaterial, floor, walls };
}

// direction: 1 throws left to right across the tray's long side, -1 right to left.
function simulateOnce(count: number, direction: 1 | -1, lean = 0, giveUpIfCocked = false) {
    const { world, diceMaterial, floor, walls } = buildWorld(lean);
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
            rand(0.85, 1.1) + (col === 0 ? throwFeel.rearLift : 0), // (the back row higher, to arc over the front one)
            cz + (row - (rows - 1) / 2) * 1.3 + rand(-0.1, 0.1)
        );
        body.quaternion.setFromEuler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
        // (A little harder since 18 Nov, the user's: "sometimes they barely roll across the dice tray"; it was 10-13.)
        // (the back row, which starts behind the front one, a little harder, so it doesn't run into it and stall)
        const speed = rand(throwFeel.speedMin, throwFeel.speedMax) + (col === 0 ? throwFeel.rearBoost : throwFeel.frontBoost);
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
            // (a better throw is already in hand: this one would need a nudge, so stop here)
            if (giveUpIfCocked) { nudges++; break; }
            nudges++;
            stillSteps = 0;
            cocked.forEach(b => {
                b.wakeUp();
                const side = throwFeel.nudgeSide, spin = throwFeel.nudgeSpin;
                // Slid off whatever it leans on (the nearest die, else back toward the middle), with a small hop.
                const other = nearestDie(b, bodies);
                let ax = -b.position.x, az = -b.position.z;
                if (other) { ax = b.position.x - other.position.x; az = b.position.z - other.position.z; }
                const len = Math.hypot(ax, az) || 1;
                b.velocity.set(ax / len * side + rand(-0.3, 0.3), rand(throwFeel.nudgeUp[0], throwFeel.nudgeUp[1]), az / len * side + rand(-0.3, 0.3));
                b.angularVelocity.set(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin));
            });
        }
        world.step(STEP);
    }

    // Across: every die ends past the tray's middle, on the far side from where it was thrown (18 Nov, the user's).
    const across = bodies.every(b => b.position.x * direction > (TRAY.minX + TRAY.maxX) / 2 * direction + 0.2);
    return { recorded, bodies, impacts, nudges, flat: bodies.every(isFlat), across, frames: recorded.length / (count * FLOATS_PER_DIE) };
}

// For the dev hook: one throw as simulated, before a throw is chosen (to measure the physics).
export const throwOnce = (count: number, direction: 1 | -1, lean = 0, seed?: number) => { random = seed === undefined ? Math.random : seededRandom(seed); return simulateOnce(count, direction, lean); };

function nearestDie(b: CANNON.Body, bodies: CANNON.Body[]) {
    let best: CANNON.Body | null = null, d = DIE_HALF * 3;
    bodies.forEach(o => { if (o !== b && o.position.distanceTo(b.position) < d) { d = o.position.distanceTo(b.position); best = o; } });
    return best as CANNON.Body | null;
}

// Flat on the felt: one face pointing straight up and not resting on another die.
function isFlat(b: CANNON.Body) {
    const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const topNormal = faceNormal(valueFacingUp(q)).clone().applyQuaternion(q);
    return topNormal.y > 0.97 && b.position.y < DIE_HALF + 0.05;
}

// The throw simulateRoll chose last (for the dev hook's measurements).
export let lastThrow: ReturnType<typeof simulateOnce> | null = null;

// Simulates a throw of the given dice that ends on `targetValues` (0 = keep whatever lands).
export function simulateRoll(dieIds: number[], targetValues: number[], seed?: number, lean = 0): RollTrack {
    random = seed === undefined ? Math.random : seededRandom(seed);
    // Prefer a throw that ends flat, with every die across the tray's middle; otherwise keep the
    // best one seen (flat beats cocked, then across beats short, then shorter beats longer). Since 18 Nov (the
    // user's: dice that "barely roll across the dice tray") a throw must be across too: preferring the shortest
    // had favoured throws whose dice hardly moved. Since 20 Nov, among those, one with no nudge (see throwFeel).
    const better = (a: ReturnType<typeof simulateOnce>, b: ReturnType<typeof simulateOnce>) =>
        a.flat !== b.flat ? a.flat : a.across !== b.across ? a.across : a.nudges !== b.nudges ? a.nudges < b.nudges : a.frames < b.frames;
    // (Aboard a listing ship the dice are thrown toward the low side, so they end up there.)
    const toss = random() < 0.5 ? 1 : -1;
    const direction = lean > 0 ? 1 : lean < 0 ? -1 : toss;
    let result = simulateOnce(dieIds.length, direction, lean);
    // (the first that lands flat and across with no nudge will do: holding out for a quick one too made a throw cost a
    // second or more; once a flat throw is in hand, a try that would need a nudge stops there, which keeps the cost down)
    for (let attempt = 0; attempt < 8 && !(result.flat && result.across && result.nudges === 0); attempt++) {
        const next = simulateOnce(dieIds.length, direction, lean, result.flat && result.across);
        if (better(next, result)) result = next;
    }

    lastThrow = result;
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
