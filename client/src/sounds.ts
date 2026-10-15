// The game's existing sound effects, served by the game server from public/.
function load(file: string, volume: number, loop = false) {
    const audio = new Audio(`/${encodeURI(file)}`);
    audio.volume = volume;
    audio.loop = loop;
    audio.preload = 'auto';
    return audio;
}

const sfx = {
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

// ---- Dice impacts, synthesized ----
// Every knock in a roll comes from the physics (see physics.ts Impact), so the sound lines
// up with what you see and every player hears the same throw. Each impact is a short burst
// of filtered noise plus a tone: a bright clack for die on die, a soft thud on the felt,
// a hollow knock on the wooden rail. Louder impacts are louder and a little brighter.

let audioContext: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio() {
    try {
        if (!audioContext) audioContext = new AudioContext();
        if (audioContext.state === 'suspended') void audioContext.resume();
        if (!noise) {
            noise = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
            const data = noise.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        return audioContext;
    } catch {
        return null;
    }
}

const VOICES = {
    die: { filter: 'bandpass' as BiquadFilterType, freq: 3300, q: 2.2, decay: 0.045, level: 0.55, tone: 2100, toneLevel: 0.12, toneDecay: 0.03 },
    felt: { filter: 'lowpass' as BiquadFilterType, freq: 520, q: 0.8, decay: 0.07, level: 0.75, tone: 150, toneLevel: 0.35, toneDecay: 0.06 },
    wall: { filter: 'bandpass' as BiquadFilterType, freq: 950, q: 3.5, decay: 0.07, level: 0.7, tone: 430, toneLevel: 0.3, toneDecay: 0.06 }
};

function knock(ctx: AudioContext, when: number, kind: keyof typeof VOICES, loudness: number) {
    const v = VOICES[kind];
    const vary = 0.85 + Math.random() * 0.3;
    const out = ctx.createGain();
    out.connect(ctx.destination);

    const burst = ctx.createBufferSource();
    burst.buffer = noise;
    burst.playbackRate.value = vary;
    const filter = ctx.createBiquadFilter();
    filter.type = v.filter;
    filter.frequency.value = v.freq * vary * (0.85 + loudness * 0.3);
    filter.Q.value = v.q;
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(v.level * loudness, when);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, when + v.decay);
    burst.connect(filter).connect(burstGain).connect(out);
    burst.start(when, Math.random() * 0.2, v.decay + 0.02);

    const tone = ctx.createOscillator();
    tone.frequency.value = v.tone * vary;
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(v.toneLevel * loudness, when);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, when + v.toneDecay);
    tone.connect(toneGain).connect(out);
    tone.start(when);
    tone.stop(when + v.toneDecay + 0.02);
}

// Schedules a whole throw's impacts. speed < 1 for slow-motion suspense rolls.
export function playDiceImpacts(impacts: { frame: number; strength: number; kind: keyof typeof VOICES }[], speed = 1) {
    if (muted) return;
    const ctx = audio();
    if (!ctx) return;
    const start = ctx.currentTime + 0.02;
    const lastByKind: Record<string, number> = {};
    for (const impact of impacts) {
        const loudness = Math.min(1, impact.strength / 9);
        if (loudness < 0.06) continue;
        const when = start + impact.frame / 60 / speed;
        // Many dice landing in the same instant blur into one knock rather than a buzz.
        if (when - (lastByKind[impact.kind] ?? -1) < 0.012) continue;
        lastByKind[impact.kind] = when;
        knock(ctx, when, impact.kind, loudness);
    }
}

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
    audio(); // the impact sounds need the audio context unlocked by a tap, like the music
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
