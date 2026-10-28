import { paceSeconds, type Pace } from './physics';
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
    gunshot: load('Gunshot.mp3', 0.85),
    // The user's ability sounds (26 Oct).
    mindWhip: load('MindWhip.mp3', 0.75),
    cursed: load('YouAreCursed.mp3', 0.75),
    sympathy: load('SympathyForTheDevil.mp3', 0.75),
    marthaPuff: load('MarthaPuff.mp3', 0.75),
    marthaSwitch: load('MarthaSwitch.mp3', 0.75),
    // Between fights (the user's, 27 Oct): what a soak or a candle brings.
    tubGood: load('HotTubGood.mp3', 0.75),
    tubBad: load('HotTubBad.mp3', 0.75),
    ladyChoice: load('LadyChoice.mp3', 0.75),
    // 28 Oct: the slow-motion last throw, a fight's payout, the Shield, a Thonic drunk.
    gasp: load('Gasp.wav', 0.75),
    coinPayout: load('CoinPayout.mp3', 0.7),
    shield: load('Shield.mp3', 0.75),
    drinkPotion: load('DrinkPotion.mp3', 0.75),
    // Thom, as you buy from him (the user's, 28 Oct).
    thomMmmHm: load('ThomMmmHm.m4a', 0.85),
    thomVitality: load('ThomVitality.m4a', 0.85),
    thomOhYes: load('ThomOhYes.m4a', 0.85)
};
// Where each clip's sound really starts (s): these open with silence, which came in late against
// the picture (the user, 28 Oct: the Devil's two lagged; measured from the decoded files).
const LEAD: Partial<Record<keyof typeof sfx, number>> = { devil: 0.66, sympathy: 0.88, marthaPuff: 0.22, thomMmmHm: 0.46, thomVitality: 0.4, thomOhYes: 0.46 };
// The clips decoded for Web Audio once it's running (see audio()): a buffer starts the moment it's
// asked to, where an <audio> element can lag noticeably on phones.
const buffers = new Map<keyof typeof sfx, AudioBuffer>();
let decoding = false;
function decodeClips(ctx: AudioContext) {
    if (decoding) return;
    decoding = true;
    (Object.entries(sfx) as [keyof typeof sfx, HTMLAudioElement][]).forEach(([name, el]) => {
        fetch(el.src).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers.set(name, buf); }).catch(() => {});
    });
}

const MUSIC_VOLUME = 0.4, AMBIENCE_VOLUME = 0.5;
const music = load('BackgroundMusic.mp3', MUSIC_VOLUME, true);
const ambience = load('Ambience.mp3', AMBIENCE_VOLUME, true);
// The hot tub's and the Lady's shrine's own ambience (the user's, 27 Oct), looping while their
// scene is up. Under the music switch, like the tavern's ambience, which fades down meanwhile.
// (The Lady's music a little louder than the hot tub's bubbling: the user, 28 Oct.)
const SCENE_VOLUME = { hotTub: 0.6, shrine: 0.85, thom: 0.6 };
// (Thom's cart since 28 Oct: the user's loop.)
const sceneAmbience = { hotTub: load('HotTubAmbience.mp3', 0, true), shrine: load('LadyIntro.mp3', 0, true), thom: load('ThomAmbience.mp3', 0, true) };
Object.values(sceneAmbience).forEach(el => { el.preload = 'none'; }); // (fetched when a scene opens, not with the page: the hot tub's is 1.9 MB)
export type SceneAmbience = keyof typeof sceneAmbience;

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
        decodeClips(audioContext);
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
export function playDiceImpacts(impacts: Impacts, pace: Pace | number = 1) {
    if (muted) return;
    const ctx = audio();
    if (!ctx || !impactBus) return;
    scheduleImpacts(ctx, impactBus, ctx.currentTime + 0.02, impacts, typeof pace === 'number' ? { speed: pace } : pace);
}

function scheduleImpacts(ctx: BaseAudioContext, bus: AudioNode, start: number, impacts: Impacts, pace: Pace) {
    const lastByKind: Record<string, number> = {};
    for (const impact of impacts) {
        // Square-root curve: soft knocks are still heard, hard ones don't dominate.
        const loudness = Math.min(1, Math.sqrt(impact.strength / 10));
        if (loudness < 0.2) continue;
        const when = start + paceSeconds(pace, impact.frame);
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
    scheduleImpacts(ctx, glue, 0.05, impacts, { speed: 1 });
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

// A coin landing on the pile: a short metallic clink (inharmonic partials, a fast decay).
function scheduleCoin(ctx: BaseAudioContext, out: AudioNode, when: number, pitch = 1) {
    [[2637, 0.22], [3951, 0.12], [5588, 0.07]].forEach(([freq, level], i) => {
        const tone = ctx.createOscillator();
        tone.type = 'sine';
        tone.frequency.setValueAtTime(freq * pitch * (1 + i * 0.013), when);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(level, when + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28 - i * 0.06);
        tone.connect(gain).connect(out);
        tone.start(when);
        tone.stop(when + 0.3);
    });
}

// Coins added to the purse: a few clinks, a little apart and slightly different.
export function playCoins(count = 3) {
    if (muted) return;
    const ctx = audio();
    if (!ctx) return;
    for (let i = 0; i < count; i++) scheduleCoin(ctx, ctx.destination, ctx.currentTime + 0.02 + i * 0.075, 0.94 + ((i * 7) % 5) * 0.03);
}

// A keepsake works: a bright rising fanfare of bell tones (a major arpeggio, each note ringing on).
export function playChime() {
    if (muted) return;
    const ctx = audio();
    if (!ctx) return;
    const start = ctx.currentTime + 0.02;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const when = start + i * 0.09;
        [[1, 0.16], [2.01, 0.05]].forEach(([partial, level]) => {
            const tone = ctx.createOscillator();
            tone.type = 'sine';
            tone.frequency.setValueAtTime(freq * partial, when);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0001, when);
            gain.gain.exponentialRampToValueAtTime(level, when + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
            tone.connect(gain).connect(ctx.destination);
            tone.start(when);
            tone.stop(when + 0.95);
        });
    });
}

// Development only: renders the cork pop offline to raw samples, for listening outside the game.
export async function renderCorkPop(fizz = false, sampleRate = 22050) {
    const ctx = new OfflineAudioContext(1, Math.ceil(1.2 * sampleRate), sampleRate);
    audio(); // makes the shared noise buffer
    scheduleCorkPop(ctx, ctx.destination, 0.02, fizz);
    return (await ctx.startRendering()).getChannelData(0);
}

// Music (the background tune and the tavern's ambience) and game sounds (dice, taps, cork
// pops, cheers) switch on and off separately. Remembered on this device. The old
// `tavernMuted = "1"` still silences both (tests rely on it) until either is switched.
function readSetting(key: string) {
    try { return localStorage.getItem('tavernMuted') === '1' || localStorage.getItem(key) === '1'; } catch { return false; }
}
function saveSettings() {
    try {
        localStorage.removeItem('tavernMuted');
        localStorage.setItem('tavernMusicOff', musicOff ? '1' : '0');
        localStorage.setItem('tavernSoundsOff', muted ? '1' : '0');
    } catch { /* storage unavailable */ }
}

let musicOff = readSetting('tavernMusicOff');
let muted = readSetting('tavernSoundsOff'); // game sounds
music.muted = musicOff;
ambience.muted = musicOff;
Object.values(sceneAmbience).forEach(el => { el.muted = musicOff; });

export function playSound(name: SoundName, playbackRate = 1) {
    if (muted) return;
    const el = sfx[name], lead = LEAD[name] ?? 0, buffer = buffers.get(name);
    if (buffer && audioContext && audioContext.state === 'running') {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        const level = audioContext.createGain();
        level.gain.value = el.volume;
        source.connect(level).connect(audioContext.destination);
        source.start(0, lead);
        return;
    }
    el.currentTime = lead;
    el.playbackRate = playbackRate;
    el.play().catch(() => {});
}

// One of Thom's lines, at random, as you buy a Thonic or a keepsake from him.
const THOM_LINES: SoundName[] = ['thomMmmHm', 'thomVitality', 'thomOhYes'];
export function playThomPurchase() {
    playSound(THOM_LINES[Math.floor(Math.random() * THOM_LINES.length)]);
}

export const ABILITY_SOUNDS: Record<string, SoundName> = {
    'Reach Around': 'reachAround',
    'Constellation Blur': 'constellation',
    'The Ace of Spades': 'gunshot',
    'Back of the Head': 'swoosh', // the Yawning Portal's other four have no sounds of their own yet
    'Mind Whip': 'mindWhip',
    'You are Cursed': 'cursed',
    'Sympathy for the Devil': 'sympathy',
    'Disguises': 'marthaPuff' // Martha's vape; her switch of faces comes with the trick she copies
};
// A face put on (Martha's copied trick, or your mask): her switch sound, then the trick's own
// sound this long after it starts.
export const SWITCH_LEAD_MS = 750;

// Browsers only allow audio after the player has interacted with the page.
export function startMusic() {
    audio(); // the impact sounds need the audio context unlocked by a tap, like the music
    if (musicOff || !music.paused) return;
    music.play().catch(() => {});
    ambience.play().catch(() => {});
}

// Volume fades (one at a time per element; a new one takes over from wherever the last got to).
const fades = new WeakMap<HTMLAudioElement, number>();
function fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void) {
    clearInterval(fades.get(el));
    const from = el.volume, start = performance.now();
    const id = window.setInterval(() => {
        const p = Math.min(1, (performance.now() - start) / ms);
        el.volume = from + (to - from) * p;
        if (p >= 1) { clearInterval(id); fades.delete(el); then?.(); }
    }, 40);
    fades.set(el, id);
}

// Starts a scene's ambience (with the music switch on) and fades the tavern's music down under
// it; the returned function fades it out and the music back up.
// Looped through Web Audio when it's running, which repeats seamlessly (an <audio> element leaves a
// small gap at the join; Thom's is a perfect loop); an <audio> element otherwise.
const sceneBuffers = new Map<string, Promise<AudioBuffer>>();
const playingScenes = new Set<GainNode>();
function startSceneLoop(ctx: AudioContext, name: SceneAmbience) {
    const url = sceneAmbience[name].src;
    if (!sceneBuffers.has(url)) sceneBuffers.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)));
    const level = ctx.createGain();
    level.gain.value = 0;
    level.connect(ctx.destination);
    playingScenes.add(level);
    let source: AudioBufferSourceNode | null = null, stopped = false;
    sceneBuffers.get(url)!.then(buffer => {
        if (stopped) return;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(level);
        source.start();
        level.gain.setTargetAtTime(SCENE_VOLUME[name], ctx.currentTime, 0.25);
    }).catch(() => {});
    return () => {
        stopped = true;
        level.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
        setTimeout(() => { source?.stop(); level.disconnect(); playingScenes.delete(level); }, 1500);
    };
}

export function startSceneAmbience(name: SceneAmbience) {
    if (musicOff) return () => {};
    if (audioContext && audioContext.state === 'running') {
        const stop = startSceneLoop(audioContext, name);
        fade(music, MUSIC_VOLUME * 0.25, 700);
        fade(ambience, AMBIENCE_VOLUME * 0.25, 700);
        return () => {
            stop();
            fade(music, MUSIC_VOLUME, 1000);
            fade(ambience, AMBIENCE_VOLUME, 1000);
        };
    }
    const el = sceneAmbience[name];
    el.currentTime = 0;
    el.volume = 0;
    el.play().catch(() => {});
    fade(el, SCENE_VOLUME[name], 700);
    fade(music, MUSIC_VOLUME * 0.25, 700);
    fade(ambience, AMBIENCE_VOLUME * 0.25, 700);
    return () => {
        fade(el, 0, 700, () => el.pause());
        fade(music, MUSIC_VOLUME, 1000);
        fade(ambience, AMBIENCE_VOLUME, 1000);
    };
}

export function setMusicOff(value: boolean) {
    musicOff = value;
    music.muted = value;
    ambience.muted = value;
    Object.values(sceneAmbience).forEach(el => { el.muted = value; if (value) el.pause(); });
    if (value && audioContext) playingScenes.forEach(level => level.gain.setTargetAtTime(0, audioContext!.currentTime, 0.1));
    saveSettings();
    if (value) { music.pause(); ambience.pause(); } else startMusic();
}

export function isMusicOff() {
    return musicOff;
}

export function setSoundsOff(value: boolean) {
    muted = value;
    saveSettings();
    if (!value) audio();
}

export function areSoundsOff() {
    return muted;
}
