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
const seated = (file: string, center: [number, number], zoom: number, width: number, height: number): Portrait =>
    ({ ...bust(file, center, zoom), center, aspect: width / height });
const classic = (file: string): Portrait => ({ src: `/${encodeURI(file)}`, face: [50, 50], zoom: 1, bust: false });

// Keyed by player avatar id and by opponent name (the bot's name in each encounter).
export const PORTRAITS: Record<string, Portrait> = {
    'The Molar': seated('molar.webp', [50, 30], 1.8, 536, 720),
    'Sperm McGrath': { ...seated('mcgrath.webp', [57, 14], 2.8, 641, 720), seat: 2 },
    Frak: {
        ...seated('frak.webp', [51, 24], 2.0, 584, 720), seat: 1.4,
        // His cigar: smoke curling up from the tip, and the tip glowing.
        air: { smoke: { at: [0.31, 0.545], color: [0.8, 0.78, 0.74], alpha: 0.26, rate: 3 }, glow: { at: [0.31, 0.545], color: [0.95, 0.38, 0.1], radius: 0.028, strength: 0.32, pulse: 0.35 } }
    },
    Danhausen: { ...seated('danhausen.webp', [54, 15], 2.6, 549, 720), seat: 1.6 },
    'Duke Morrigan': seated('duke.webp', [72, 37], 2.0, 582, 720),
    // (Her vape's clouds are painted in already: no smoke of our own, it couldn't be told apart.)
    'Martha Mystery': { ...seated('martha.webp', [44, 27], 2.2, 694, 720), seat: 1.15 },
    // Her Disguises: the same pose holding up each face as a mask. Behind the table they sit like her own bust (seat); a round avatar shows her face and the mask.
    'Martha as Frak': { ...seated('martha-frak.webp', [55, 32], 1.7, 703, 720), seat: 1.15 },
    'Martha as Danhausen': { ...seated('martha-danhausen.webp', [58, 33], 1.7, 729, 720), seat: 1.15 },
    'Martha as Duke Morrigan': { ...seated('martha-duke.webp', [57, 33], 1.7, 718, 720), seat: 1.15 },
    Klarg: seated('klarg.webp', [62, 26], 2.6, 907, 720),
    Rokr: seated('rokr.webp', [46, 28], 2.7, 952, 720),
    'The Hangman': seated('hangman.webp', [45, 36], 2.3, 793, 720),
    'Jaguar Cantona': seated('jaguar.webp', [47, 36], 2.6, 886, 720),
    // The Yawning Portal's five (painted 20 Oct, in the game since 21 Oct).
    'Sylvester Stonefist': seated('sylvester.webp', [48, 40], 2.0, 722, 720),
    // His black flame: dark tongues rising from between his hands, with a violet glow in it.
    'Vaelin Inkhand': {
        ...seated('vaelin-inkhand.webp', [39, 31], 2.1, 759, 720),
        air: { smoke: { at: [0.71, 0.4], color: [0.07, 0.04, 0.11], alpha: 0.45, rate: 7, spread: 0.12, rise: 48 }, glow: { at: [0.62, 0.47], color: [0.55, 0.3, 0.9], radius: 0.12, strength: 0.22, pulse: 0.4 } }
    },
    'Stason Jatham': seated('stason.webp', [47, 37], 2.0, 991, 720),
    // His hammer's holy light, pulsing.
    'The Ridgeler': {
        ...seated('ridgeler.webp', [40, 30], 2.2, 748, 720),
        air: { glow: { at: [0.87, 0.67], color: [1, 0.93, 0.75], radius: 0.17, strength: 0.45, pulse: 0.3 } }
    },
    Brodor: { ...seated('brodor.webp', [50, 30], 2.1, 702, 702), seat: 1.3 },
    Devil: classic('Devil.png'),
    Vaelin: classic('vaelin.png')
};

// The spots between fights (and the pickpocket), shown in a round frame. The Shrine is a
// painted scene rather than a cut-out; it's framed on the statue and candles. Each is
// framed to show the whole head and what they hold.
export const SPOT_PORTRAITS: Record<'thom' | 'shrine' | 'diceDen' | 'stranger' | 'pickpocket' | 'hotTub' | 'darren', Portrait> = {
    thom: bust('thom.webp', [52, 6], 1.15),
    shrine: bust('shrine.webp', [50, 38], 1.2),
    diceDen: bust('dicer.webp', [52, 8], 1.75),
    stranger: bust('stranger.webp', [56, 10], 2.0),
    pickpocket: bust('pickpocket.webp', [55, 12], 1.2),
    hotTub: bust('hot-tub.webp', [52, 45], 1.25),
    darren: bust('darren.webp', [55, 12], 1.6)
};

export const AVATAR_IDS = ['Devil', 'Vaelin', 'Rokr', 'The Hangman', 'Klarg', 'Jaguar Cantona'];

export function portraitFor(key: string): Portrait {
    return PORTRAITS[key] ?? PORTRAITS['The Molar'];
}

// Inline style for a round avatar showing the face. With a measured `center`, the face's middle
// lands in the middle of the (square) frame: a background-position of X% lines up X% of the image
// with X% of the frame, so X is solved for (the image is zoom x the frame's width).
export function avatarStyle(p: Portrait) {
    const size = p.bust ? `${p.zoom * 100}% auto` : 'cover';
    let position = `${p.face[0]}% ${p.face[1]}%`;
    if (p.center && p.aspect) {
        const solve = (c: number, k: number) => (Math.abs(1 - k) < 1e-3 ? 50 : (100 * (0.5 - c / 100 * k)) / (1 - k));
        position = `${solve(p.center[0], p.zoom).toFixed(2)}% ${solve(p.center[1], p.zoom / p.aspect).toFixed(2)}%`;
    }
    return { backgroundImage: `url("${p.src}")`, backgroundSize: size, backgroundPosition: position };
}
