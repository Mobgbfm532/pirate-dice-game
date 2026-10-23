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
// on the opponent, the tavern behind), so the room breathes as one. Around 1, roughly 0.8-1.2.
export function flame(seconds: number) {
    return 1
        + Math.sin(seconds * 7.3) * 0.08
        + Math.sin(seconds * 13.1 + 1.3) * 0.05
        + Math.sin(seconds * 2.1 + 0.4) * 0.06;
}

// The web-page layers (the tavern picture and the opponent's bust) follow the same flame
// through a CSS variable, until they move into the 3D scene (step A).
let lastCss = 0;
export function shareFlame(value: number, now: number) {
    if (now - lastCss < 50) return; // about 20 times a second is plenty for CSS
    lastCss = now;
    document.documentElement.style.setProperty('--flame', value.toFixed(3));
}
