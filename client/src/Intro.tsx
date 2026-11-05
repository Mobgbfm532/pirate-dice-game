import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
        const measure = () => setSize({ W: window.innerWidth, H: window.innerHeight });
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

// Rain over the door: one tile of streaks, scrolled.
let rainTile = '';
function rainImage() {
    if (rainTile) return rainTile;
    const size = 320, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.lineCap = 'round';
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) {
        const x = r() * size, y = r() * size, len = 14 + r() * 26;
        g.strokeStyle = `rgba(190,215,240,${(0.1 + r() * 0.25).toFixed(2)})`;
        g.lineWidth = 0.7 + r() * 0.7;
        // Drawn again across the tile's edges, so it joins up as it scrolls.
        for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]]) {
            g.beginPath();
            g.moveTo(x + ox, y + oy);
            g.lineTo(x + ox - len * 0.16, y + oy + len);
            g.stroke();
        }
    }
    return (rainTile = canvas.toDataURL());
}

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
            setReady(true);
            const started = performance.now();
            // The die's first hit on the music's first (its throw starts just before it).
            const hit = die.impacts[0]?.frame ?? 0;
            const dieAt = Math.max(0, LEAD - hit / 60);
            dieClock.current.at = started + dieAt * 1000;
            after(dieAt, () => playDiceImpacts(die.impacts));
            after(T(6.4), () => setOpening(null)); // (its canvas goes once the town has covered it)
            // (A sound that arrives late comes in where the film has got to.)
            void sound.then(() => { if (!gone) stopSound.current = playFilmSound(LEAD, (performance.now() - started) / 1000); });
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
            root.current?.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = T(t) * 1000; });
        };
    }, [ready]);

    const rain = useMemo(rainImage, []);
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
                <>

                    <Shot at={5.85} end={11.7} fade={0.45}>
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
                        <i className="film-rain" style={{ backgroundImage: `url(${rain})` }} />
                        <i className="film-rain far" style={{ backgroundImage: `url(${rain})` }} />
                    </Shot>

                    <Shot at={11.85} end={14.8} fade={0.3}>
                        <Plate src="yawning-portal.webp" screen={screen} at={11.85} len={3.6} drift={{ aspect: 1584 / 672, focus: [0.505, 0.6], aim: [0.5, 0.56], seen: 0.75, from: 1.02, to: 1.16 }}>
                            <Lamp x={0.505} y={0.62} size={0.15} beat={2} colour="rgba(96, 214, 255, 0.5)" />
                            <Lamp x={0.19} y={0.6} size={0.1} beat={5} />
                        </Plate>
                    </Shot>

                    <Shot at={14.8} end={17.2} fade={0.3}>
                        <Plate src="salty-swallow.webp" screen={screen} at={14.8} len={3.1} drift={{ aspect: 1584 / 672, focus: [0.68, 0.45], aim: [0.5, 0.5], seen: 0.75, from: 1.2, to: 1.04 }}>
                            <Lamp x={0.292} y={0.25} size={0.06} beat={1} />
                            <Lamp x={0.71} y={0.28} size={0.06} beat={3} />
                            <Lamp x={0.2} y={0.62} size={0.06} beat={4} />
                            <Lamp x={0.94} y={0.42} size={0.08} beat={6} colour="rgba(140, 190, 255, 0.4)" />
                        </Plate>
                    </Shot>

                    <Shot at={24.5} end={40} fade={0.6}>
                        <Plate src="intro/door.webp" screen={screen} at={24.5} len={5.2} ease="cubic-bezier(0.5, 0, 0.9, 0.7)" drift={{ aspect: 896 / 1195, focus: [0.79, 0.56], aim: [0.5, 0.5], from: 1, to: 1.5 }}>
                            <Lamp x={0.643} y={0.47} size={0.17} beat={1} />
                            <Lamp x={0.232} y={0.482} size={0.1} beat={2} />
                            <Lamp x={0.18} y={0.49} size={0.05} beat={3} />
                            <i className="film-doorlight" style={vars({ '--at': `${T(26)}s` })} />
                        </Plate>
                        <i className="film-rain" style={{ backgroundImage: `url(${rain})` }} />
                        <i className="film-rain far" style={{ backgroundImage: `url(${rain})` }} />
                    </Shot>

                    {/* The music's hits. */}
                    {[6, 12, 18, 24].map(t => <i key={t} className="film-flash" style={vars({ '--at': `${T(t - 0.04)}s` })} />)}

                    <Line place="under" at={[1.5]} out={5.1} text="Every town has a game." />
                    <Line at={[6.7, 8.1, 9.6]} out={11.3} text="In this one, some play for gold, *others* play for glory." />
                    <Line at={[12.3]} out={14.4} text="Few get past the Portal." />
                    <Line at={[15]} out={16.9} text="Fewer still get past the Ship." />
                    <p className="film-line top lesson" style={vars({ '--start': `${THROW_AT[0]}s`, '--end': `${T(24.5)}s` })}>
                        <span className="film-word" style={vars({ '--at': `${THROW_AT[0]}s` })}>Find a 2. </span>
                        <span className="film-word" style={vars({ '--at': `${THROW_AT[1]}s` })}>Find a 4. </span>
                        <span className="film-word gold" style={vars({ '--at': `${THROW_AT[2]}s` })}>Chase 24.</span>
                    </p>
                    <Line at={[25.1, 26.5]} out={28.3} text="But first, you have to get past the bouncer..." />

                    {/* Through the door: its light floods the screen, then black. */}
                    <i className="film-floodlight" style={vars({ '--at': `${T(28.3)}s` })} />
                    <i className="film-out" style={vars({ '--at': `${T(29)}s` })} />
                </>
            )}
            <i className="film-bar top" />
            <i className="film-bar bottom" />
            <button className="film-skip" onClick={finish}>Skip ›</button>
        </div>
    );
}
