import { tuning } from './tuning';

// The look preview (22 Oct): a rough first pass at richer light, materials and glow
// (docs: "2, 4, 24: the next level visually", option 1, steps B to D), behind a switch so it
// can be compared with today's look. On with ?look=next, off with ?look=classic; remembered on
// this device (localStorage.tavernLook).
function readLook() {
    try {
        const asked = new URLSearchParams(location.search).get('look');
        if (asked) localStorage.setItem('tavernLook', asked);
        return (asked ?? localStorage.getItem('tavernLook')) === 'next';
    } catch {
        return false;
    }
}

export const lookNext = readLook();
if (lookNext) document.documentElement.classList.add('look-next');

// One flame: a single flicker that every light follows (the candle on the table, the warm wash
// on the opponent, the fire and lanterns in the paintings), so the room breathes as one. Around
// 1, roughly 0.92-1.08. Real fire mostly holds steady and drifts, now and then gutters a little:
// so a slow, irregular drift (smoothed random values, not sine waves; the user's call, 23 Oct:
// the old 7 and 13 times a second read as pulsing).
export function flame(seconds: number) {
    return 1 + (drift(seconds * 0.7) * 0.05 + drift(seconds * 1.9 + 31.7) * 0.025) * tuning.flicker;
}

// Smooth random values between -1 and 1: a new random height each whole step, eased between.
function drift(x: number) {
    const i = Math.floor(x), f = x - i;
    const hash = (n: number) => {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return (s - Math.floor(s)) * 2 - 1;
    };
    const t = f * f * (3 - 2 * f);
    return hash(i) * (1 - t) + hash(i + 1) * t;
}

// The page can follow the same flame through a CSS variable (the tavern and the bust read
// flame() directly since they moved into the 3D scene, step A).
let lastCss = 0;
export function shareFlame(value: number, now: number) {
    if (now - lastCss < 50) return; // about 20 times a second is plenty for CSS
    lastCss = now;
    document.documentElement.style.setProperty('--flame', value.toFixed(3));
}
