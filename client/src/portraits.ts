// Character art. Busts are the painted cut-outs from client/public/art (made by
// scripts/process-art.mjs); older avatars still use the classic game's portraits.
// `face` is where the face sits in the image (percent), used to centre round avatars,
// and `zoom` is how much to enlarge the image so the face fills the circle.

const BASE = import.meta.env.BASE_URL;

export interface Portrait {
    src: string;
    face: [number, number];
    zoom: number;
    bust: boolean; // a painted cut-out that can sit behind the table
    // Behind the table: how much larger than the others to draw it, for a cut-out that shows
    // more of the body (the head stays at the same height; less of the body shows).
    seat?: number;
}

const bust = (file: string, face: [number, number], zoom: number): Portrait => ({ src: `${BASE}art/${file}`, face, zoom, bust: true });
const classic = (file: string): Portrait => ({ src: `/${encodeURI(file)}`, face: [50, 50], zoom: 1, bust: false });

// Keyed by player avatar id and by opponent name (the bot's name in each encounter).
export const PORTRAITS: Record<string, Portrait> = {
    'The Molar': bust('molar.webp', [53, 34], 2.3),
    'Sperm McGrath': { ...bust('mcgrath.webp', [66, 6], 3.0), seat: 2 },
    Frak: { ...bust('frak.webp', [52, 16], 2.3), seat: 1.4 },
    Danhausen: { ...bust('danhausen.webp', [50, 15], 3.2), seat: 1.6 },
    'Duke Morrigan': bust('duke.webp', [67, 34], 2.6),
    'Martha Mystery': { ...bust('martha.webp', [57, 25], 3.0), seat: 1.15 },
    // Her Disguises: the same pose holding up each face as a mask. Behind the table they sit like her own bust (seat); a round avatar shows her face and the mask.
    'Martha as Frak': { ...bust('martha-frak.webp', [70, 30], 2.0), seat: 1.15 },
    'Martha as Danhausen': { ...bust('martha-danhausen.webp', [70, 30], 2.0), seat: 1.15 },
    'Martha as Duke Morrigan': { ...bust('martha-duke.webp', [70, 30], 2.0), seat: 1.15 },
    Klarg: bust('klarg.webp', [58, 30], 3.0),
    Rokr: bust('rokr.webp', [48, 30], 3.0),
    'The Hangman': bust('hangman.webp', [51, 38], 2.8),
    'Jaguar Cantona': bust('jaguar.webp', [46, 27], 3.0),
    // The Yawning Portal's five (painted 20 Oct, in the game since 21 Oct).
    'Sylvester Stonefist': bust('sylvester.webp', [50, 30], 2.6),
    'Vaelin Inkhand': bust('vaelin-inkhand.webp', [48, 28], 2.6),
    'Stason Jatham': bust('stason.webp', [55, 22], 2.8),
    'The Ridgeler': bust('ridgeler.webp', [45, 25], 2.6),
    Brodor: { ...bust('brodor.webp', [52, 10], 2.3), seat: 1.3 },
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

// Inline style for a round avatar showing the face.
export function avatarStyle(p: Portrait) {
    return {
        backgroundImage: `url("${p.src}")`,
        backgroundSize: p.bust ? `${p.zoom * 100}% auto` : 'cover',
        backgroundPosition: `${p.face[0]}% ${p.face[1]}%`
    };
}
