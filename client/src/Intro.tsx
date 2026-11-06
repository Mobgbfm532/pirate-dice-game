import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FilmDie, prepareOpeningThrow } from './FilmDie';
import { film, type FilmThrow } from './game';
import type { RollTrack } from './physics';
import { fetchFilmSound, loadFilmSound, playFilmSound, playDiceImpacts, unlockAudio } from './sounds';
import './intro.css';

// The intro film (the user's paintings, sounds and words, 5 Nov): plays on a device's first Tavern
// Crawl, and from "Watch the intro" on the start screen. Everything but the dice is the page: each
// shot is a painting drifting at its own speed, timed by CSS delays from one start. The dice are the
// real ones, on the real table (game.ts `film`), with this film's layers lifted off the canvas.
//
// Its beat is the music's: IntroMusic.mp3 hits every 6 s (0, 6, 12, 18, 24), then dies away, and each
// shot starts on a hit. Times below are the music's (`LEAD` is the die falling before the first hit).
const LEAD = 0.4;
const T = (t: number) => t + LEAD;

const ART = `${import.meta.env.BASE_URL}art/`;
const PAINTINGS = ['intro/town.webp', 'intro/foreground.webp', 'intro/door.webp', 'yawning-portal.webp', 'salty-swallow.webp'];
const DICE_SHEET = `${import.meta.env.BASE_URL}textures/dice-faces.jpg`; // (the opening die's faces, ready for it)

const FILM_END = T(29.5);
const DICE_FROM = T(16.6), DICE_TO = T(25.3);
// The three throws of the lesson; each must be over before the next (the last lands on the 24 s hit).
const THROW_AT = [T(17.5), T(19.6), T(21.7)];
const THROW_LONGEST = 1.8;

const SEEN_KEY = 'tavernIntroSeen';
export function introSeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
// The start screen's tick box (the user's, 5 Nov): whether the film plays before a Tavern Crawl.
// Until a player has chosen, it's ticked on a device that hasn't seen the film.
export function introChoice(): boolean | null {
    try { const v = localStorage.getItem('tavernIntroOn'); return v === null ? null : v === '1'; } catch { return null; }
}
export function saveIntroChoice(on: boolean) {
    try { localStorage.setItem('tavernIntroOn', on ? '1' : '0'); } catch { /* storage unavailable */ }
}
function markIntroSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}

// What the film needs, fetched ahead on the start screen of a device that hasn't seen it.
let paintings: Promise<unknown> | null = null;
function loadPaintings() {
    return (paintings ??= Promise.all([...PAINTINGS.map(p => ART + p), DICE_SHEET].map(src => {
        const image = new Image();
        image.src = src;
        return image.decode().catch(() => {});
    })));
}
export function preloadIntro() {
    void loadPaintings();
    fetchFilmSound();
}

// After the film: black lifts off whatever comes next (the entrance card, or the start screen).
export function liftCurtain() {
    const curtain = document.createElement('div');
    curtain.className = 'film-curtain';
    document.body.appendChild(curtain);
    setTimeout(() => curtain.classList.add('lift'), 500);
    setTimeout(() => curtain.remove(), 1700);
}

function useScreen() {
    const [size, setSize] = useState({ W: window.innerWidth, H: window.innerHeight });
    useEffect(() => {
        // (Only when the width changes, as the phone turns: an address bar showing or hiding changes the
        // height, and would move a painting mid-shot.)
        const measure = () => setSize(was => (was.W === window.innerWidth ? was : { W: window.innerWidth, H: window.innerHeight }));
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);
    return size;
}

const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// One painting, covering the screen around its focus and pushing towards it. `seen`: how much of the
// painting's height may show (the Portal's and the ship's own foreground table is left out).
interface Drift { aspect: number; focus: [number, number]; aim?: [number, number]; seen?: number; from: number; to: number }
function plateStyle(W: number, H: number, { aspect, focus: [fx, fy], aim: [ax, ay] = [0.5, 0.5], seen = 1, to }: Drift) {
    const ph = Math.max(H / seen, W / aspect), pw = ph * aspect;
    const left = clamp(W / 2 - fx * pw, W - pw, 0), top = clamp(H / 2 - fy * ph, H - ph * seen, 0);
    const ox = left + fx * pw, oy = top + fy * ph;
    // How far the push may also slide the focus towards the aim without showing an edge.
    const dx = clamp(W * ax - ox, W - ox - (left + pw - ox) * to, -ox - (left - ox) * to);
    const dy = clamp(H * ay - oy, H - oy - (top + ph * seen - oy) * to, -oy - (top - oy) * to);
    return { left, top, width: pw, height: ph, transformOrigin: `${fx * 100}% ${fy * 100}%`, '--dx': `${dx}px`, '--dy': `${dy}px` };
}

function Shot({ at, end, fade = 0.5, children, className = '' }: { at: number; end: number; fade?: number; children: ReactNode; className?: string }) {
    return <div className={`film-shot ${className}`} style={vars({ '--at': `${Math.max(0, T(at))}s`, '--end': `${T(end)}s`, '--fade': `${fade}s` })}>{children}</div>;
}

function Plate({ src, drift, screen, at, len, ease = 'linear', children }: { src: string; drift: Drift; screen: { W: number; H: number }; at: number; len: number; ease?: string; children?: ReactNode }) {
    return (
        <div className="film-plate" style={{ ...plateStyle(screen.W, screen.H, drift), ...vars({ '--from': drift.from, '--to': drift.to, '--at': `${T(at)}s`, '--len': `${len}s`, '--ease': ease }) }}>
            <img src={ART + src} alt="" draggable={false} />
            {children}
        </div>
    );
}

// A light in a painting, breathing like a flame: where it stands (share of the painting), how wide
// (share of its width), and a beat of its own.
function Lamp({ x, y, size, beat = 1, colour }: { x: number; y: number; size: number; beat?: number; colour?: string }) {
    return <i className="film-lamp" style={vars({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${size * 100}%`, '--beat': `${(1.7 + beat * 0.53).toFixed(2)}s`, '--wait': `${(-beat * 0.77).toFixed(2)}s`, ...(colour ? { '--glow': colour } : {}) })} />;
}

// A line of narration (the user's call, 5 Nov): each piece up to a comma fades in whole, at its own
// time in `at` (one time per piece). *word* is italic.
function Line({ at, out, place = 'low', text }: { at: number[]; out: number; place?: 'low' | 'under'; text: string }) {
    return (
        <p className={`film-line ${place}`} style={vars({ '--start': `${T(at[0])}s`, '--end': `${T(out)}s` })}>
            {text.split(/(?<=,) /).map((piece, n) => (
                <span key={n}>
                    {n > 0 && ' '}
                    <span className="film-word sentence" style={vars({ '--at': `${T(at[n])}s` })}>
                        {piece.split(/(\*[^*]+\*)/).map((part, i) => (part.startsWith('*') ? <em key={i} className="film-slant">{part.slice(1, -1)}</em> : part))}
                    </span>
                </span>
            ))}
        </p>
    );
}

// Rain: streaks drawn afresh each frame on one canvas the size of the screen. (Until 6 Nov, two big
// scrolling layers per shot, far too much for a phone's graphics memory, with everything else.)
function Rain() {
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const el = canvas.current;
        const g = el?.getContext('2d');
        if (!el || !g) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const W = window.innerWidth, H = window.innerHeight;
        el.width = Math.round(W * ratio);
        el.height = Math.round(H * ratio);
        g.scale(ratio, ratio);
        g.lineCap = 'round';
        // A little slant, as the wind has it: for each pixel down, this far left.
        const slant = Math.tan((9 * Math.PI) / 180);
        const area = W * H;
        const make = (count: number, speed: number, long: number) => Array.from({ length: Math.min(count, 500) }, () => {
            const len = long * (0.5 + Math.random() * 0.8);
            return { x: Math.random() * (W + H * slant), y: Math.random() * (H + 60) - 60, len, v: speed * (0.9 + Math.random() * 0.2) };
        });
        const layers = [
            { drops: make(area / 1500, 340, 22), width: 0.8, colour: 'rgba(190, 215, 240, 0.1)' },
            { drops: make(area / 2600, 760, 32), width: 1.2, colour: 'rgba(200, 222, 245, 0.24)' }
        ];
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let frame = 0, last = performance.now();
        const draw = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            g.clearRect(0, 0, W, H);
            for (const { drops, width, colour } of layers) {
                g.lineWidth = width;
                g.strokeStyle = colour;
                g.beginPath();
                for (const d of drops) {
                    if (!still) d.y += d.v * dt;
                    if (d.y > H) { d.y = -d.len - Math.random() * 40; d.x = Math.random() * (W + H * slant); }
                    const x = d.x - d.y * slant;
                    g.moveTo(x, d.y);
                    g.lineTo(x - d.len * slant, d.y + d.len);
                }
                g.stroke();
            }
            if (!still) frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, []);
    return <canvas ref={canvas} className="film-rain" aria-hidden="true" />;
}

// A part of the film exists only around its own time (6 Nov: with every shot alive for the whole film
// a phone was asked for nearly 50 layers at once, and the last scene glitched). Its CSS delays are all
// from the film's start, so it passes on how far the film had got as it appeared (--elapsed).
interface FilmClock { now: () => number }
function Timed({ clock, from, to, children }: { clock: FilmClock; from: number; to: number; children: ReactNode }) {
    const now = clock.now();
    return now >= T(from) && now < T(to) ? <TimedBody clock={clock}>{children}</TimedBody> : null;
}
function TimedBody({ clock, children }: { clock: FilmClock; children: ReactNode }) {
    const [elapsed] = useState(clock.now);
    return <div style={vars({ display: 'contents', '--elapsed': `${elapsed.toFixed(3)}s` })}>{children}</div>;
}
// Each part: when it appears and goes, a moment either side of its time on screen.
const WINDOWS = {
    town: [5.6, 12.3], portal: [11.6, 15.3], ship: [14.5, 17.7], door: [24.2, 99],
    lineGame: [-1, 5.7], lineTown: [6.4, 11.9], linePortal: [12.1, 15], lineShip: [14.8, 17.5], lesson: [17.2, 25.1], lineDoor: [24.9, 28.9],
    flood: [28, 99], out: [28.8, 99]
} as const;
const HITS = [6, 12, 18, 24];
const hitWindow = (t: number) => [t - 0.2, t + 0.9] as const;

// The left and right of the foreground frame slide out past the camera, faster than the town.
const FG = { width: 1376, height: 768, leftEdge: 440, rightEdge: 970, lantern: [1105, 305] };
function Foreground({ W, H, at }: { W: number; H: number; at: number }) {
    const s = (H * 1.04) / FG.height;
    const upright = W < H;
    // (Upright, the parts are placed by the walls, the lantern and the barrels, not the eaves above them.)
    const leftEdge = upright ? 335 : FG.leftEdge, rightEdge = upright ? 1045 : FG.rightEdge;
    const reachL = Math.min(leftEdge * s, W * (upright ? 0.2 : 0.26));
    const reachR = Math.min((FG.width - rightEdge) * s, W * (upright ? 0.32 : 0.26));
    const box = (left: number) => ({ left: `${left}px`, top: `${(H - FG.height * s) / 2}px`, width: `${FG.width * s}px`, height: `${FG.height * s}px`, '--slide': `${Math.round(Math.max(W * 0.2, reachL * 1.1))}px`, '--at': `${T(at)}s`, backgroundImage: `url(${ART}intro/foreground.webp)` });
    const lantern = { left: `${(FG.lantern[0] / FG.width) * 100}%`, top: `${(FG.lantern[1] / FG.height) * 100}%` };
    return (
        <>
            <div className="film-fg left" style={vars(box(reachL - leftEdge * s))} />
            <div className="film-fg right" style={vars(box(W - reachR - rightEdge * s))}>
                <i className="film-lamp near" style={vars({ ...lantern, width: '11%', '--beat': '2.1s', '--wait': '-0.6s' })} />
            </div>
        </>
    );
}

export function IntroFilm({ onDone }: { onDone: () => void }) {
    const screen = useScreen();
    const [ready, setReady] = useState(false);
    const [opening, setOpening] = useState<RollTrack | null>(null);
    // The film's clock: seconds since it started (a dev still holds it at one moment).
    const started = useRef(0);
    const held = useRef<number | null>(null);
    const clock = useRef<FilmClock>({ now: () => held.current ?? (performance.now() - started.current) / 1000 }).current;
    const [, setTick] = useState(0); // (parts come and go when this moves on)
    const [still, setStill] = useState(0);
    const dieClock = useRef({ at: Infinity });
    const dieDrawn = useRef<() => void>(() => {});
    const root = useRef<HTMLDivElement>(null);
    const finished = useRef(false);
    const done = useRef(onDone);
    done.current = onDone;
    const stopSound = useRef<() => void>(() => {});
    const finish = () => {
        if (finished.current) return;
        finished.current = true;
        stopSound.current();
        done.current();
    };

    useEffect(() => {
        markIntroSeen();
        unlockAudio();
        film.begin();
        let gone = false;
        const timers: number[] = [];
        const after = (seconds: number, run: () => void) => { timers.push(window.setTimeout(run, seconds * 1000)); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
        window.addEventListener('keydown', onKey);
        const sound = loadFilmSound();

        void (async () => {
            // Black until the paintings and sound are in (a slow connection doesn't wait long for the sound).
            await loadPaintings();
            await Promise.race([sound, new Promise(r => setTimeout(r, 5000))]);
            if (gone) return;
            const throws = film.prepare(THROW_LONGEST);
            // The die's canvas is drawn once, unseen, before the clock starts (its first frame is slow).
            const die = prepareOpeningThrow();
            setOpening(die);
            await Promise.race([new Promise<void>(r => { dieDrawn.current = r; }), new Promise(r => setTimeout(r, 2500))]);
            if (gone) return;
            started.current = performance.now();
            setReady(true);
            // Parts come and go on these.
            [...Object.values(WINDOWS), ...HITS.map(hitWindow)].flat().filter(t => t < 40).forEach(t => after(T(t) + 0.005, () => setTick(n => n + 1)));
            // The die's first hit on the music's first (its throw starts just before it).
            const hit = die.impacts[0]?.frame ?? 0;
            const dieAt = Math.max(0, LEAD - hit / 60);
            dieClock.current.at = started.current + dieAt * 1000;
            after(dieAt, () => playDiceImpacts(die.impacts));
            after(T(6.4), () => setOpening(null)); // (its canvas goes once the town has covered it)
            // (A sound that arrives late comes in where the film has got to.)
            void sound.then(() => { if (!gone) stopSound.current = playFilmSound(LEAD, (performance.now() - started.current) / 1000); });
            after(DICE_FROM, () => film.showTable());
            throws.forEach((one: FilmThrow, i) => after(THROW_AT[i], () => film.playThrow(one)));
            after(DICE_TO, () => film.hideTable());
            after(FILM_END, finish);
        })();

        return () => {
            gone = true;
            timers.forEach(clearTimeout);
            window.removeEventListener('keydown', onKey);
            stopSound.current();
            stopSound.current = () => {};
            film.end();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Development: holds the film's paintings at a moment, to look at a still (the dice need it running).
    useEffect(() => {
        if (!import.meta.env.DEV || !ready) return;
        (window as unknown as { __filmSeek: (t: number) => void }).__filmSeek = t => {
            held.current = T(t);
            setStill(n => n + 1);
            requestAnimationFrame(() => root.current?.getAnimations({ subtree: true }).forEach(a => a.pause()));
        };
    }, [ready]);

    const { W, H } = screen;

    return (
        <div className="film" ref={root}>
            {!ready && <div className="film-wait" />}
            {ready && <div className="film-black" style={vars({ '--gone': `${T(17.1)}s` })} />}
            {opening && (
                <div className={ready ? 'film-shot' : 'film-shot waiting'} style={vars({ '--at': '0s', '--end': `${T(5.5)}s`, '--fade': '0.4s' })}>
                    <FilmDie track={opening} clock={dieClock.current} onDrawn={() => dieDrawn.current()} />
                </div>
            )}
            {ready && (
                <Fragment key={still}>

                    <Timed clock={clock} from={WINDOWS.town[0]} to={WINDOWS.town[1]}><Shot at={5.85} end={11.7} fade={0.45}>
                        <Plate src="intro/town.webp" screen={screen} at={5.85} len={6.6} drift={{ aspect: 1376 / 768, focus: [0.52, 0.62], aim: [0.5, 0.56], from: 1, to: 1.13 }}>
                            <Lamp x={0.216} y={0.54} size={0.13} beat={1} />
                            <Lamp x={0.783} y={0.5} size={0.13} beat={2} />
                            <Lamp x={0.385} y={0.62} size={0.05} beat={3} />
                            <Lamp x={0.647} y={0.635} size={0.05} beat={4} />
                            <Lamp x={0.524} y={0.63} size={0.16} beat={5} colour="rgba(255, 186, 96, 0.5)" />
                            <Lamp x={0.482} y={0.71} size={0.03} beat={6} />
                            <i className="film-mist one" />
                            <i className="film-mist two" />
                        </Plate>
                        <Foreground W={W} H={H} at={5.85} />
                        <Rain />
                    </Shot></Timed>

                    <Timed clock={clock} from={WINDOWS.portal[0]} to={WINDOWS.portal[1]}><Shot at={11.85} end={14.8} fade={0.3}>
                        <Plate src="yawning-portal.webp" screen={screen} at={11.85} len={3.6} drift={{ aspect: 1584 / 672, focus: [0.505, 0.6], aim: [0.5, 0.56], seen: 0.75, from: 1.02, to: 1.16 }}>
                            <Lamp x={0.505} y={0.62} size={0.15} beat={2} colour="rgba(96, 214, 255, 0.5)" />
                            <Lamp x={0.19} y={0.6} size={0.1} beat={5} />
                        </Plate>
                    </Shot></Timed>

                    <Timed clock={clock} from={WINDOWS.ship[0]} to={WINDOWS.ship[1]}><Shot at={14.8} end={17.2} fade={0.3}>
                        <Plate src="salty-swallow.webp" screen={screen} at={14.8} len={3.1} drift={{ aspect: 1584 / 672, focus: [0.68, 0.45], aim: [0.5, 0.5], seen: 0.75, from: 1.2, to: 1.04 }}>
                            <Lamp x={0.292} y={0.25} size={0.06} beat={1} />
                            <Lamp x={0.71} y={0.28} size={0.06} beat={3} />
                            <Lamp x={0.2} y={0.62} size={0.06} beat={4} />
                            <Lamp x={0.94} y={0.42} size={0.08} beat={6} colour="rgba(140, 190, 255, 0.4)" />
                        </Plate>
                    </Shot></Timed>

                    <Timed clock={clock} from={WINDOWS.door[0]} to={WINDOWS.door[1]}><Shot at={24.5} end={40} fade={0.6}>
                        <Plate src="intro/door.webp" screen={screen} at={24.5} len={5.2} ease="cubic-bezier(0.5, 0, 0.9, 0.7)" drift={{ aspect: 896 / 1195, focus: [0.79, 0.56], aim: [0.5, 0.5], from: 1, to: 1.5 }}>
                            <Lamp x={0.643} y={0.47} size={0.17} beat={1} />
                            <Lamp x={0.232} y={0.482} size={0.1} beat={2} />
                            <Lamp x={0.18} y={0.49} size={0.05} beat={3} />
                            <i className="film-doorlight" style={vars({ '--at': `${T(26)}s` })} />
                        </Plate>
                        <Rain />
                    </Shot></Timed>

                    {/* The music's hits. */}
                    {HITS.map(t => <Timed key={t} clock={clock} from={hitWindow(t)[0]} to={hitWindow(t)[1]}><i className="film-flash" style={vars({ '--at': `${T(t - 0.04)}s` })} /></Timed>)}

                    <Timed clock={clock} from={WINDOWS.lineGame[0]} to={WINDOWS.lineGame[1]}><Line place="under" at={[1.5]} out={5.1} text="Every town has a game." /></Timed>
                    <Timed clock={clock} from={WINDOWS.lineTown[0]} to={WINDOWS.lineTown[1]}><Line at={[6.7, 8.1, 9.6]} out={11.3} text="In this one, some play for gold, *others* play for glory." /></Timed>
                    <Timed clock={clock} from={WINDOWS.linePortal[0]} to={WINDOWS.linePortal[1]}><Line at={[12.3]} out={14.4} text="Few get past the Portal." /></Timed>
                    <Timed clock={clock} from={WINDOWS.lineShip[0]} to={WINDOWS.lineShip[1]}><Line at={[15]} out={16.9} text="Fewer still get past the Ship." /></Timed>
                    <Timed clock={clock} from={WINDOWS.lesson[0]} to={WINDOWS.lesson[1]}><p className="film-line top lesson" style={vars({ '--start': `${THROW_AT[0]}s`, '--end': `${T(24.5)}s` })}>
                        <span className="film-word" style={vars({ '--at': `${THROW_AT[0]}s` })}>Find a 2. </span>
                        <span className="film-word" style={vars({ '--at': `${THROW_AT[1]}s` })}>Find a 4. </span>
                        <span className="film-word gold" style={vars({ '--at': `${THROW_AT[2]}s` })}>Chase 24.</span>
                    </p></Timed>
                    <Timed clock={clock} from={WINDOWS.lineDoor[0]} to={WINDOWS.lineDoor[1]}><Line at={[25.1, 26.5]} out={28.3} text="But first, you have to get past the bouncer..." /></Timed>

                    {/* Through the door: its light floods the screen, then black. */}
                    <Timed clock={clock} from={WINDOWS.flood[0]} to={WINDOWS.flood[1]}><i className="film-floodlight" style={vars({ '--at': `${T(28.3)}s` })} /></Timed>
                    <Timed clock={clock} from={WINDOWS.out[0]} to={WINDOWS.out[1]}><i className="film-out" style={vars({ '--at': `${T(29)}s` })} /></Timed>
                </Fragment>
            )}
            <i className="film-bar top" />
            <i className="film-bar bottom" />
            <button className="film-skip" onClick={finish}>Skip ›</button>
        </div>
    );
}
