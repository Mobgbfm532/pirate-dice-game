import { CELEBRATION_MS, store, table } from './game';

// The camera on big moments (the user's call, 3 Nov, new look only): a perfect hand draws the
// camera slowly in over the felt and back; three 6s landing make the table rumble; the Hangman's
// shots (his Ace of Spades, Dead Eye) kick it like a recoil; Jaguar's All In lands with a heavy
// thud. Abilities with a painting play on a stage of their own over the table, so they move nothing.
// The push-in keeps the slot rail where it is (CameraRig leans as for a suspense roll); a shake is
// a small turn of the camera, gone in under a second, and the tavern and the opponent go with it
// (Room adds `shake.x/y` in screen px). Off for people whose device asks for reduced motion.

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// How far the camera leans in on a perfect hand (a share of its distance; a suspense roll is 0.12).
const PERFECT_PUSH = 0.09;

// This frame's shake: the camera's turn in radians, and the same in screen px for the pictures.
export const shake = { pitch: 0, yaw: 0, x: 0, y: 0 };

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Eases in over the celebration's first half, holds, and eases back out as it leaves.
function perfectPush(now: number) {
    const at = store.get().celebration?.at ?? 0;
    if (!at) return 0;
    const t = now - at;
    if (t < 0 || t > CELEBRATION_MS + 600) return 0;
    return PERFECT_PUSH * smooth(t / 1400) * (1 - smooth((t - (CELEBRATION_MS - 700)) / 1300));
}

// A rumble: a few incommensurate wobbles under an envelope that rises fast and dies away.
function rumble(t: number, ms: number, amp: number, hz: number) {
    if (t < 0 || t > ms) return [0, 0];
    const env = Math.min(1, t / 40) * Math.pow(1 - t / ms, 2) * amp;
    const s = t / 1000;
    return [
        env * (Math.sin(s * hz * 6.28) * 0.6 + Math.sin(s * hz * 1.73 * 6.28 + 1.1) * 0.4),
        env * (Math.sin(s * hz * 1.31 * 6.28 + 2.3) * 0.6 + Math.sin(s * hz * 2.11 * 6.28 + 0.4) * 0.4)
    ];
}

// A single jolt (up for a recoil, down for a thud) that springs back.
function jolt(t: number, ms: number, amp: number) {
    if (t < 0 || t > ms) return 0;
    const rise = Math.min(1, t / 35);
    return amp * rise * Math.exp(-t / (ms * 0.3)) * Math.cos((t / ms) * 6.28 * 0.8);
}

// The moves this frame. `focal` is the camera's focal length in screen px (turns into px).
export function cameraMoves(now: number, focal: number) {
    shake.pitch = shake.yaw = shake.x = shake.y = 0;
    if (still) return { push: 0 };

    // Three 6s land: the table rumbles.
    const [dp, dy] = rumble(now - table.devilAt, 750, 0.0045, 17);
    let pitch = dp, yaw = dy;

    const m = store.get().ability;
    if (m && !m.cancelled) {
        const t = now - m.at;
        if (m.ability === 'The Ace of Spades') {
            // The muzzle flash is at once.
            pitch += jolt(t, 420, 0.016);
            const [a, b] = rumble(t, 380, 0.003, 23);
            pitch += a; yaw += b;
        } else if (m.ability === 'Dead Eye') {
            // As the banner lands (its shockwave starts 0.2 s in).
            pitch += jolt(t - 200, 420, 0.015);
            const [a, b] = rumble(t - 200, 380, 0.003, 23);
            pitch += a; yaw += b;
        } else if (m.ability === 'All In') {
            pitch += jolt(t - 200, 650, -0.012);
            const [a, b] = rumble(t - 200, 600, 0.0035, 11);
            pitch += a; yaw += b;
        }
    }

    shake.pitch = pitch;
    shake.yaw = yaw;
    // Turning the camera up moves the world down the screen; turning it left moves it right.
    shake.x = yaw * focal;
    shake.y = pitch * focal;
    return { push: perfectPush(now) };
}
