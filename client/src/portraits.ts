import type { PaintedAir } from './Air';

// Character art. Busts are the painted cut-outs from client/public/art (made by
// scripts/process-art.mjs); older avatars still use the classic game's portraits.
// `zoom` is how much to enlarge the image so the face fills a round avatar. For the opponents,
// `center` is the true middle of the face in the image (percent, measured on the paintings,
// 23 Oct): round avatars put it in the middle of the circle, and behind the table it sits on the
// table's centre line (the user's call: everyone centred). The spots between fights keep their
// hand-tuned `face` (a CSS background-position, which puts that point only roughly in the middle).

const BASE = import.meta.env.BASE_URL;

export interface Portrait {
    src: string;
    face: [number, number];
    zoom: number;
    center?: [number, number]; // the face's middle (percent), when measured
    // A round avatar's picture moved by eye (percent of the frame; + is right / down), and its
    // zoom: set by the user in the portrait editor (23 Oct). Behind the table the face stays on
    // the centre line regardless.
    nudge?: [number, number];
    aspect?: number;           // the image's width / height (to centre exactly)
    bust: boolean; // a painted cut-out that can sit behind the table
    // Behind the table: how much larger than the others to draw it, for a cut-out that shows
    // more of the body (the head stays at the same height; less of the body shows).
    seat?: number;
    // The look preview's living air on this painting (Air.tsx): smoke from a point, a glow.
    air?: PaintedAir;
}

const bust = (file: string, face: [number, number], zoom: number): Portrait => ({ src: `${BASE}art/${file}`, face, zoom, bust: true });
// An opponent's painting: its face's middle (percent), zoom, and the image's size in pixels.
const seated = (file: string, center: [number, number], zoom: number, width: number, height: number, nudge?: [number, number]): Portrait =>
    ({ ...bust(file, center, zoom), center, aspect: width / height, ...(nudge ? { nudge } : {}) });
const classic = (file: string, zoom = 1, nudge?: [number, number]): Portrait =>
    ({ src: `/${encodeURI(file)}`, face: [50, 50], zoom, bust: false, center: [50, 50], aspect: 1, ...(nudge ? { nudge } : {}) });

// Keyed by player avatar id and by opponent name (the bot's name in each encounter).
export const PORTRAITS: Record<string, Portrait> = {
    'The Molar': seated('molar.webp', [50, 30], 1.05, 536, 720, [-1.2, -3.5]),
    'Sperm McGrath': { ...seated('mcgrath.webp', [57, 14], 2.2, 641, 720, [-9, -4.4]), seat: 2 },
    Frak: {
        ...seated('frak.webp', [51, 24], 1.6, 584, 720, [-11.3, 2.1]), seat: 1.4,
        // His cigar: smoke curling up from the tip, and the tip glowing.
        air: { smoke: { at: [0.31, 0.545], color: [0.8, 0.78, 0.74], alpha: 0.26, rate: 3 }, glow: { at: [0.31, 0.545], color: [0.95, 0.38, 0.1], radius: 0.028, strength: 0.32, pulse: 0.35 } }
    },
    Danhausen: { ...seated('danhausen.webp', [54, 15], 1.65, 549, 720, [7.1, -8.2]), seat: 1.6 },
    'Duke Morrigan': seated('duke.webp', [72, 37], 1.2, 582, 720, [16.5, 9.9]),
    // (Her vape's clouds are painted in already: no smoke of our own, it couldn't be told apart.)
    'Martha Mystery': { ...seated('martha.webp', [44, 27], 1.2, 694, 720, [-5.8, -12]), seat: 1.15 },
    // Her Disguises: the same pose holding up each face as a mask. Behind the table they sit like her own bust (seat); a round avatar shows her face and the mask.
    'Martha as Frak': { ...seated('martha-frak.webp', [55, 32], 0.95, 703, 720, [1.2, -12.9]), seat: 1.15 },
    'Martha as Danhausen': { ...seated('martha-danhausen.webp', [58, 33], 1, 729, 720, [-19.1, -9.5]), seat: 1.15 },
    'Martha as Duke Morrigan': { ...seated('martha-duke.webp', [57, 33], 0.9, 718, 720, [4.5, -11.3]), seat: 1.15 },
    Klarg: seated('klarg.webp', [62, 26], 1.3, 907, 720, [10.2, -11.9]),
    Rokr: seated('rokr.webp', [46, 28], 1.75, 952, 720, [-1.3, -7.7]),
    'The Hangman': seated('hangman.webp', [45, 36], 1.25, 793, 720, [-10.1, -4]),
    // His second painting (27 Oct): the same pose with his cloak flowing out to the right (faded at the painting's edge); the head as in the first, so no seat.
    'Jaguar Cantona': seated('jaguar.webp', [45.7, 35.5], 2, 969, 720, [-3, 4]),
    // The Yawning Portal's five (painted 20 Oct, in the game since 21 Oct).
    'Sylvester Stonefist': seated('sylvester.webp', [48, 40], 1.2, 722, 720, [-1.5, 1.2]),
    // His black flame: dark tongues rising from between his hands, with a violet glow in it.
    'Vaelin Inkhand': {
        ...seated('vaelin-inkhand.webp', [39, 31], 1.1, 759, 720, [-16.6, -11.1]),
        air: { smoke: { at: [0.71, 0.4], color: [0.07, 0.04, 0.11], alpha: 0.45, rate: 7, spread: 0.12, rise: 48 }, glow: { at: [0.62, 0.47], color: [0.03, 0.01, 0.05], radius: 0.12, strength: 0.4, pulse: 0.4, dark: true } }
    },
    'Stason Jatham': seated('stason.webp', [47, 37], 1.45, 991, 720, [-6.2, -3.4]),
    // His hammer's holy light, pulsing.
    'The Ridgeler': {
        ...seated('ridgeler.webp', [40, 30], 1.45, 748, 720, [-12.4, -6]),
        air: { glow: { at: [0.87, 0.67], color: [1, 0.93, 0.75], radius: 0.17, strength: 0.45, pulse: 0.3 } }
    },
    // His second painting (26 Oct): fists and ribbons; the head sits as in the first, so the same seat.
    Brodor: { ...seated('brodor.webp', [52, 31], 1.7, 696, 720), seat: 1.3 },
    Devil: classic('Devil.png'),
    Vaelin: classic('vaelin.png')
};

// The spots between fights (and the pickpocket), shown in a round frame (as the user set them in
// the portrait editor, 23 Oct). The Shrine is a
// painted scene rather than a cut-out; it's framed on the statue and candles. Each is
// framed to show the whole head and what they hold.
export const SPOT_PORTRAITS: Record<'thom' | 'shrine' | 'diceDen' | 'stranger' | 'pickpocket' | 'hotTub' | 'darren', Portrait> = {
    thom: seated('thom.webp', [50.3, 32.9], 0.95, 506, 720, [-3.2, -3.2]),
    shrine: seated('shrine.webp', [50, 48], 1.35, 1024, 1024, [0, 0]),
    diceDen: seated('dicer.webp', [50.9, 42.5], 1.35, 1036, 720, [-2.2, -4.6]),
    stranger: seated('stranger.webp', [53, 39.1], 1.75, 1048, 720, [6.3, 2]),
    pickpocket: seated('pickpocket.webp', [50.8, 35.8], 0.9, 540, 720, [5.1, -2.7]),
    hotTub: seated('hot-tub.webp', [50.4, 52.2], 1.3, 1287, 720, [0, 0]),
    darren: seated('darren.webp', [51.9, 35.6], 0.9, 716, 720, [2.7, -9.5])
};

export const AVATAR_IDS = ['Devil', 'Vaelin', 'Rokr', 'The Hangman', 'Klarg', 'Jaguar Cantona'];

export function portraitFor(key: string): Portrait {
    return PORTRAITS[key] ?? PORTRAITS['The Molar'];
}

// Inline style for a round avatar showing the face. With a measured `center`, the face's middle
// lands in the middle of the (square) frame: a background-position of X% lines up X% of the image
// with X% of the frame, so X is solved for (the image is zoom x the frame's width).
export function avatarStyle(p: Portrait) {
    const size = p.bust || p.center ? `${p.zoom * 100}% auto` : 'cover';
    let position = `${p.face[0]}% ${p.face[1]}%`;
    if (p.center && p.aspect) {
        // (where the face lands in the frame: its middle, moved by the nudge)
        const solve = (c: number, k: number, at: number) => (Math.abs(1 - k) < 1e-3 ? 50 : (100 * (at - c / 100 * k)) / (1 - k));
        const [dx, dy] = p.nudge ?? [0, 0];
        position = `${solve(p.center[0], p.zoom, 0.5 + dx / 100).toFixed(2)}% ${solve(p.center[1], p.zoom / p.aspect, 0.5 + dy / 100).toFixed(2)}%`;
    }
    return { backgroundImage: `url("${p.src}")`, backgroundSize: size, backgroundPosition: position };
}

// ---- The portrait editor (the tuning panel's Portraits tab, 23 Oct) ----
// The user drags a picture in its frame and sets its zoom; the edit shows at once everywhere on
// this device (saved in localStorage.tavernPortraits) and is copied out as numbers to make it
// the game's (into the `seated(...)` and `classic(...)` lines above). Only the
// round avatars change. Every round portrait is here: the opponents, the spots between fights
// (named as people know them) and the classic avatars.
export interface PortraitEdit { zoom: number; nudge: [number, number] }
const SPOT_NAMES: Record<keyof typeof SPOT_PORTRAITS, string> = {
    thom: 'Thom', shrine: "The Lady's Shrine", diceDen: 'The Dice Den gambler', stranger: 'The Hooded Stranger',
    pickpocket: 'The thief', hotTub: 'Wild Magic Hot Tub', darren: 'Darren Snakehands'
};
const REGISTRY: Record<string, Portrait> = {
    ...Object.fromEntries(Object.keys(PORTRAITS).filter(k => PORTRAITS[k].center && PORTRAITS[k].bust).map(k => [k, PORTRAITS[k]])),
    ...Object.fromEntries((Object.keys(SPOT_PORTRAITS) as (keyof typeof SPOT_PORTRAITS)[]).map(k => [SPOT_NAMES[k], SPOT_PORTRAITS[k]])),
    'Devil (avatar)': PORTRAITS.Devil,
    'Vaelin (avatar)': PORTRAITS.Vaelin
};
export const EDITABLE = Object.keys(REGISTRY);
export const editablePortrait = (name: string) => REGISTRY[name];
const BUILT: Record<string, PortraitEdit> = Object.fromEntries(EDITABLE.map(k => [k, { zoom: REGISTRY[k].zoom, nudge: REGISTRY[k].nudge ?? [0, 0] }]));

function readEdits(): Record<string, PortraitEdit> {
    try { return JSON.parse(localStorage.getItem('tavernPortraits') ?? '{}'); } catch { return {}; }
}
const edits = readEdits();
const applyEdit = (key: string) => {
    const e = edits[key] ?? BUILT[key];
    if (e && REGISTRY[key]) { REGISTRY[key].zoom = e.zoom; REGISTRY[key].nudge = [...e.nudge]; }
};
Object.keys(edits).forEach(k => { if (BUILT[k]) applyEdit(k); });

export function editPortrait(key: string, edit: PortraitEdit | null) {
    if (edit) edits[key] = { zoom: Math.round(edit.zoom * 100) / 100, nudge: [Math.round(edit.nudge[0] * 10) / 10, Math.round(edit.nudge[1] * 10) / 10] };
    else delete edits[key];
    try { localStorage.setItem('tavernPortraits', JSON.stringify(edits)); } catch { /* not saved */ }
    applyEdit(key);
}
export const portraitEdits = () => edits;
