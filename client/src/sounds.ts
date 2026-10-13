// The game's existing sound effects, served by the game server from public/.
function load(file: string, volume: number, loop = false) {
    const audio = new Audio(`/${encodeURI(file)}`);
    audio.volume = volume;
    audio.loop = loop;
    audio.preload = 'auto';
    return audio;
}

const sfx = {
    roll: load('roll.mp3', 0.6),
    click: load('click.mp3', 0.6),
    bust: load('bust.mp3', 0.6),
    aww: load('Aww.mp3', 0.6),
    yay: load('yay.mp3', 0.6),
    ohwell: load('ohwell.mp3', 0.6),
    swoosh: load('Swoosh.mp3', 0.6),
    devil: load('DevilsTeets.wav', 0.6),
    winner: load('Winner.mp3', 0.75),
    reachAround: load('Reach Around.mp3', 0.75),
    constellation: load('Constellation.mp3', 0.75),
    gunshot: load('Gunshot.mp3', 0.85)
};

const music = load('BackgroundMusic.mp3', 0.4, true);
const ambience = load('Ambience.mp3', 0.5, true);

export type SoundName = keyof typeof sfx;

let muted = false;

export function playSound(name: SoundName, playbackRate = 1) {
    if (muted) return;
    const audio = sfx[name];
    audio.currentTime = 0;
    audio.playbackRate = playbackRate;
    audio.play().catch(() => {});
}

export const ABILITY_SOUNDS: Record<string, SoundName> = {
    'Reach Around': 'reachAround',
    'Constellation Blur': 'constellation',
    'The Ace of Spades': 'gunshot'
};

// Browsers only allow audio after the player has interacted with the page.
export function startMusic() {
    if (muted || !music.paused) return;
    music.play().catch(() => {});
    ambience.play().catch(() => {});
}

export function setMuted(value: boolean) {
    muted = value;
    music.muted = value;
    ambience.muted = value;
    if (!value) startMusic();
}

export function isMuted() {
    return muted;
}
