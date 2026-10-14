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
}

const bust = (file: string, face: [number, number], zoom: number): Portrait => ({ src: `${BASE}art/${file}`, face, zoom, bust: true });
const classic = (file: string): Portrait => ({ src: `/${encodeURI(file)}`, face: [50, 50], zoom: 1, bust: false });

// Keyed by player avatar id and by opponent name (the bot's name in each encounter).
export const PORTRAITS: Record<string, Portrait> = {
    'The Molar': bust('molar.webp', [53, 34], 2.3),
    Klarg: bust('klarg.webp', [58, 30], 3.0),
    Rokr: bust('rokr.webp', [48, 30], 3.0),
    'The Hangman': bust('hangman.webp', [51, 38], 2.8),
    'Jaguar Cantona': bust('jaguar.webp', [46, 27], 3.0),
    Devil: classic('Devil.png'),
    Vaelin: classic('vaelin.png')
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
