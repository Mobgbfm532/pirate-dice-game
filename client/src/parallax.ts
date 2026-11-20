// Depth behind the table (the user's call, 1 Nov): the tavern, the opponent and the table move a
// little against each other, as if you were sitting there and shifting in your seat. The table
// never moves (nothing may disturb the dice); the opponent drifts a little, the tavern more, and
// inside the painting its sides and floor more than its far wall (Room.tsx).
//
// What moves it: the mouse on a computer; otherwise a slow drift like breathing. (Tilting a phone
// moved it too until 3 Nov; the user wanted no motion from moving the phone.) `look()` gives where
// you are leaning, each axis -1..1, eased so nothing jumps.
// Off for people whose device asks for reduced motion.

// (A computer with a mouse: the backdrop holds still, the user's call, 3 Nov: no mouse following,
// no drift.)
const still = typeof matchMedia !== 'undefined' && (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: fine)').matches);

const target = { x: 0, y: 0, at: 0 }; // from the mouse; at: when last heard from
const eased = { x: 0, y: 0 };

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

if (typeof window !== 'undefined' && !still) {
    // A computer: the mouse across the window.
    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        target.x = clamp((e.clientX / window.innerWidth) * 2 - 1);
        target.y = clamp((e.clientY / window.innerHeight) * 2 - 1);
        target.at = performance.now();
    });
}

// Where you're leaning now (-1..1 each way). dt in seconds.
export function look(now: number, dt: number) {
    if (still) return eased;
    // Nothing heard for a few seconds: a slow drift, like breathing.
    const idle = now - target.at > 4000;
    const t = now / 1000;
    const x = idle ? Math.sin(t * 0.21) * 0.55 + Math.sin(t * 0.13 + 1.7) * 0.25 : target.x;
    const y = idle ? Math.sin(t * 0.17 + 0.6) * 0.35 : target.y;
    const k = 1 - Math.exp(-dt * (idle ? 1.2 : 4));
    eased.x += (x - eased.x) * k;
    eased.y += (y - eased.y) * k;
    return eased;
}

// How far each layer shifts at full lean (screen px): the tavern, its sides and floor (on top of
// that, inside the painting), and the opponent.
export const PARALLAX = { room: 14, roomNear: 8, bust: 6 };
