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
// up with what you see and every player hears the same throw. Each impact has two layers:
// a short burst of filtered noise (the surface texture) and a "body" tone that drops in
// pitch, which is what gives a hit its thunk and weight. A die-on-die clack, a heavy thud
// on the felt, a hollow knock on the wooden rail. Harder impacts are louder and brighter.

let audioContext: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let impactBus: AudioNode | null = null;

function audio() {
    try {
        if (!audioContext) audioContext = new AudioContext();
        if (audioContext.state === 'suspended') void audioContext.resume();
        if (!noise) {
            noise = audioContext.createBuffer(1, audioContext.sampleRate * 0.4, audioContext.sampleRate);
            const data = noise.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        if (!impactBus) {
            // A gentle compressor glues many simultaneous knocks together instead of clipping.
            const glue = audioContext.createDynamicsCompressor();
            glue.threshold.value = -18;
            glue.ratio.value = 4;
            glue.attack.value = 0.003;
            glue.release.value = 0.12;
            const level = audioContext.createGain();
            level.gain.value = 0.85;
            glue.connect(level).connect(audioContext.destination);
            impactBus = glue;
        }
        return audioContext;
    } catch {
        return null;
    }
}

interface Voice {
    filter: BiquadFilterType; freq: number; q: number; noiseDecay: number; noiseLevel: number;
    bodyFrom: number; bodyTo: number; bodyDecay: number; bodyLevel: number;
}

const VOICES: Record<'die' | 'felt' | 'wall', Voice> = {
    // Bone on bone: a woody clack, warmer and lower than a plastic click.
    die: { filter: 'bandpass', freq: 1700, q: 1.3, noiseDecay: 0.035, noiseLevel: 0.5, bodyFrom: 620, bodyTo: 330, bodyDecay: 0.06, bodyLevel: 0.3 },
    // Landing on felt over a heavy table: mostly low thump.
    felt: { filter: 'lowpass', freq: 420, q: 0.7, noiseDecay: 0.09, noiseLevel: 0.6, bodyFrom: 150, bodyTo: 62, bodyDecay: 0.16, bodyLevel: 0.85 },
    // Hitting the walnut rail: a hollow wooden knock.
    wall: { filter: 'bandpass', freq: 700, q: 2, noiseDecay: 0.07, noiseLevel: 0.55, bodyFrom: 280, bodyTo: 140, bodyDecay: 0.13, bodyLevel: 0.6 }
};

function knock(ctx: BaseAudioContext, bus: AudioNode, when: number, kind: keyof typeof VOICES, loudness: number) {
    const v = VOICES[kind];
    const vary = 0.88 + Math.random() * 0.24;
    const out = ctx.createGain();
    out.connect(bus);

    // Surface texture.
    const burst = ctx.createBufferSource();
    burst.buffer = noise;
    burst.playbackRate.value = vary;
    const filter = ctx.createBiquadFilter();
    filter.type = v.filter;
    filter.frequency.value = v.freq * vary * (0.8 + loudness * 0.4);
    filter.Q.value = v.q;
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(v.noiseLevel * loudness, when);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, when + v.noiseDecay);
    burst.connect(filter).connect(burstGain).connect(out);
    burst.start(when, Math.random() * 0.25, v.noiseDecay + 0.02);

    // Body: a tone that falls in pitch, so the hit has weight.
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(v.bodyFrom * vary, when);
    body.frequency.exponentialRampToValueAtTime(v.bodyTo * vary, when + v.bodyDecay);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, when);
    bodyGain.gain.exponentialRampToValueAtTime(v.bodyLevel * loudness, when + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + v.bodyDecay);
    body.connect(bodyGain).connect(out);
    body.start(when);
    body.stop(when + v.bodyDecay + 0.02);
}

type Impacts = { frame: number; strength: number; kind: keyof typeof VOICES }[];

// Schedules a whole throw's impacts. speed < 1 for slow-motion suspense rolls.
export function playDiceImpacts(impacts: Impacts, speed = 1) {
    if (muted) return;
    const ctx = audio();
    if (!ctx || !impactBus) return;
    scheduleImpacts(ctx, impactBus, ctx.currentTime + 0.02, impacts, speed);
}

function scheduleImpacts(ctx: BaseAudioContext, bus: AudioNode, start: number, impacts: Impacts, speed: number) {
    const lastByKind: Record<string, number> = {};
    for (const impact of impacts) {
        // Square-root curve: soft knocks are still heard, hard ones don't dominate.
        const loudness = Math.min(1, Math.sqrt(impact.strength / 10));
        if (loudness < 0.2) continue;
        const when = start + impact.frame / 60 / speed;
        // Many dice landing in the same instant blur into one knock rather than a buzz.
        if (when - (lastByKind[impact.kind] ?? -1) < 0.015) continue;
        lastByKind[impact.kind] = when;
        knock(ctx, bus, when, impact.kind, loudness);
    }
}

// Development only: renders a throw offline to raw samples, for listening to the sound
// outside the game (see main.tsx's test hook).
export async function renderImpacts(impacts: Impacts, seconds: number, sampleRate = 44100) {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
    const live = audio(); // reuse the noise buffer
    if (!live || !noise) throw new Error('audio unavailable');
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18; glue.ratio.value = 4; glue.attack.value = 0.003; glue.release.value = 0.12;
    const level = ctx.createGain();
    level.gain.value = 0.85;
    glue.connect(level).connect(ctx.destination);
    scheduleImpacts(ctx, glue, 0.05, impacts, 1);
    return (await ctx.startRendering()).getChannelData(0);
}

// ---- A cork pulled from a bottle (every Thonic drunk) ----
// A short squeak as the cork twists free, then the pop: a hollow tone that drops fast as the
// air rushes in, over a click of bright noise. The Fizzy Thomic adds a fizz afterwards.
function scheduleCorkPop(ctx: BaseAudioContext, out: AudioNode, when: number, fizz: boolean) {
    const squeak = ctx.createOscillator();
    squeak.type = 'triangle';
    squeak.frequency.setValueAtTime(1300, when);
    squeak.frequency.linearRampToValueAtTime(1700, when + 0.07);
    const squeakGain = ctx.createGain();
    squeakGain.gain.setValueAtTime(0.0001, when);
    squeakGain.gain.exponentialRampToValueAtTime(0.06, when + 0.02);
    squeakGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    squeak.connect(squeakGain).connect(out);
    squeak.start(when);
    squeak.stop(when + 0.1);

    const pop = when + 0.1;
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(720, pop);
    body.frequency.exponentialRampToValueAtTime(190, pop + 0.07);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, pop);
    bodyGain.gain.exponentialRampToValueAtTime(0.75, pop + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, pop + 0.11);
    body.connect(bodyGain).connect(out);
    body.start(pop);
    body.stop(pop + 0.13);

    if (!noise) return;
    const click = ctx.createBufferSource();
    click.buffer = noise;
    const clickTone = ctx.createBiquadFilter();
    clickTone.type = 'bandpass';
    clickTone.frequency.value = 2400;
    clickTone.Q.value = 0.9;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.5, pop);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, pop + 0.025);
    click.connect(clickTone).connect(clickGain).connect(out);
    click.start(pop);
    click.stop(pop + 0.04);

    if (!fizz) return;
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hissTone = ctx.createBiquadFilter();
    hissTone.type = 'highpass';
    hissTone.frequency.value = 5000;
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.0001, pop + 0.05);
    hissGain.gain.exponentialRampToValueAtTime(0.12, pop + 0.15);
    hissGain.gain.exponentialRampToValueAtTime(0.0001, pop + 0.9);
    hiss.connect(hissTone).connect(hissGain).connect(out);
    hiss.start(pop + 0.05);
    hiss.stop(pop + 0.95);
}

export function playCorkPop(fizz = false) {
    if (muted) return;
    const ctx = audio();
    if (!ctx) return;
    scheduleCorkPop(ctx, ctx.destination, ctx.currentTime + 0.02, fizz);
}

// Development only: renders the cork pop offline to raw samples, for listening outside the game.
export async function renderCorkPop(fizz = false, sampleRate = 22050) {
    const ctx = new OfflineAudioContext(1, Math.ceil(1.2 * sampleRate), sampleRate);
    audio(); // makes the shared noise buffer
    scheduleCorkPop(ctx, ctx.destination, 0.02, fizz);
    return (await ctx.startRendering()).getChannelData(0);
}

// Remembered on this device, so a muted phone stays quiet next time.
function readMuted() {
    try { return localStorage.getItem('tavernMuted') === '1'; } catch { return false; }
}

let muted = readMuted();
music.muted = muted;
ambience.muted = muted;

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
    try { localStorage.setItem('tavernMuted', value ? '1' : '0'); } catch { /* storage unavailable */ }
    if (!value) startMusic();
}

export function isMuted() {
    return muted;
}
