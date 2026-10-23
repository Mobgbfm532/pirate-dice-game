// The look preview's tuning (option 1, step G, 23 Oct): the feel set by eye on the phone, and
// how much the device can draw. Each tuning value is a multiplier on the game's own number (1 =
// as built); a value the user settles on is copied out of the panel and becomes the default here.
// Saved on the device (localStorage.tavernTune, tavernQuality). The panel (Hud's TuningPanel)
// shows with ?tune=1 in the address (remembered; ?tune=0 hides it): it's for the test site, not
// something players come across.

export interface Tuning {
    warmth: number;   // the grade's warmth
    glow: number;     // the bloom on what's bright
    grain: number;    // film grain
    vignette: number; // the darkening at the edges
    shadows: number;  // how deep shadows go (the fill light, inversely)
    dust: number;     // dust over the table
    air: number;      // embers and smoke on the paintings
    flicker: number;  // how far the flame wavers
    moments: number;  // the big moments' light
}
export const TUNE_DEFAULTS: Tuning = { warmth: 1, glow: 1, grain: 1, vignette: 1, shadows: 1, dust: 1, air: 1, flicker: 1, moments: 1 };
export const TUNE_LABELS: Record<keyof Tuning, string> = {
    warmth: 'Warmth', glow: 'Glow', grain: 'Grain', vignette: 'Vignette', shadows: 'Shadow depth',
    dust: 'Dust', air: 'Embers, smoke', flicker: 'Flame flicker', moments: 'Moment lights'
};

// Quality: what the device draws. Auto starts high and steps down if frames come too slowly.
export type Quality = 'high' | 'medium' | 'low';
export interface QualitySettings { dpr: number; bloom: boolean; grain: boolean; multisampling: number; shadowMap: number; particles: number }
export const QUALITY: Record<Quality, QualitySettings> = {
    high: { dpr: 2, bloom: true, grain: true, multisampling: 4, shadowMap: 2048, particles: 1 },
    medium: { dpr: 1.5, bloom: true, grain: false, multisampling: 2, shadowMap: 2048, particles: 0.5 },
    low: { dpr: 1, bloom: false, grain: false, multisampling: 0, shadowMap: 1024, particles: 0.25 }
};

const read = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not saved */ } };

// Read every frame by the scene, so it's a plain object; changes notify the panel and the finish.
export const tuning: Tuning = read('tavernTune', { ...TUNE_DEFAULTS });
export const quality = read<{ level: Quality; auto: boolean }>('tavernQuality', { level: 'high', auto: true });

const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach(l => l()); };
export const tuneStore = {
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    version: () => version
};
export function setTune(key: keyof Tuning, value: number) { tuning[key] = value; write('tavernTune', tuning); changed(); }
export function resetTune() { Object.assign(tuning, TUNE_DEFAULTS); write('tavernTune', tuning); changed(); }
export function setQuality(level: Quality, auto = quality.auto) { quality.level = level; quality.auto = auto; write('tavernQuality', quality); changed(); }
export const settings = () => QUALITY[quality.level];

// Frames: the panel's frame rate, and Auto's step down (after a settling time, when frames have
// stayed slower than ~45 a second for a few seconds; it never steps back up by itself).
let average = 1 / 60, slowFor = 0, running = 0;
export function noteFrame(delta: number) {
    if (!(delta > 0) || delta > 0.25) return; // a hidden tab or a hitch: not the device's pace
    average += (delta - average) * 0.05;
    running += delta;
    if (!quality.auto || running < 6) return;
    slowFor = average > 1 / 45 ? slowFor + delta : 0;
    if (slowFor > 4 && quality.level !== 'low') {
        setQuality(quality.level === 'high' ? 'medium' : 'low', true);
        slowFor = 0;
        running = 3; // a moment to settle at the new level before judging again
    }
}
export const framesPerSecond = () => Math.round(1 / average);

// The panel: on with ?tune=1, off with ?tune=0, remembered.
export const tunePanel = (() => {
    try {
        const asked = new URLSearchParams(location.search).get('tune');
        if (asked) localStorage.setItem('tavernTunePanel', asked);
        return localStorage.getItem('tavernTunePanel') === '1';
    } catch { return false; }
})();
