import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FilmDie, prepareOpeningThrow } from './FilmDie';
import { film, type FilmSpec, type FilmThrow } from './game';
import type { RollTrack } from './physics';
import { loadFilmSound, playDiceImpacts, playTrailerMusic, unlockAudio } from './sounds';
import './intro.css';
import './trailer.css';

// The trailer (9 Nov, the user's: about 30 s, for an upright phone, to screen-record). Open the game
// with ?trailer in the address (e.g. /next/?trailer), tap, and it plays: the intro's opening die,
// the real table teaching the 2 and the 4, the Devil's three 6s, the rivals, the places, then one
// last die in slow motion for a Perfect 24, and the title with the user's tagline. The music is the
// intro's (IntroMusic.mp3, a hit every 6 s); each section starts on a hit.
const LEAD = 0.4; // the opening die falls a moment before the music's first hit
const T = (t: number) => t + LEAD;
const ART = `${import.meta.env.BASE_URL}art/`;

// The hand: a 2, then a 4, then three 6s (the Devil), then the last die, a 6, for 24.
const THROWS: FilmSpec[] = [
    { dice: [[0, 3], [1, 2], [2, 5], [3, 1], [4, 6], [5, 3]], keep: [1], seed: 240 },
    { dice: [[0, 5], [2, 1], [3, 4], [4, 3], [5, 2]], keep: [3], seed: 24 },
    { dice: [[0, 6], [2, 6], [4, 1], [5, 6]], keep: [0, 2, 5], seed: 666, devil: true },
    { dice: [[4, 6]], keep: [4], seed: 2424, perfect: true, slow: true, cheer: true }
];
// When each throw lands, by the music (the Devil's on the 12 s hit).
const LANDS = [7.5, 9.7, 12.0, 26.7];

// The rivals, one painting a beat (Frak onwards; McGrath has no ability).
const RIVALS: { name: string; art: string; colour: string }[] = [
    { name: 'Frak', art: 'ability-mind-whip', colour: '#5fbf6a' },
    { name: 'Danhausen', art: 'ability-cursed', colour: '#9b59d0' },
    { name: 'Sylvester Stonefist', art: 'ability-back-of-the-head', colour: '#d0843a' },
    { name: 'Vaelin Inkhand', art: 'ability-inkfire', colour: '#7a3cff' },
    { name: 'The Ridgeler', art: 'ability-divine-smite', colour: '#f2c33c' },
    { name: 'Brodor', art: 'ability-astral-flood', colour: '#3fc8d8' },
    { name: 'Klarg', art: 'ability-reach-around', colour: '#c23a2a' },
    { name: 'Rokr', art: 'ability-starry-form', colour: '#3a5cff' },
    { name: 'The Hangman', art: 'ability-ace-of-spades', colour: '#8fa0ae' },
    { name: 'Jaguar Cantona', art: 'ability-all-in', colour: '#e0a82e' }
];
const RIVALS_FROM = 13.6, RIVALS_TO = 18;
const RIVAL_LEN = (RIVALS_TO - RIVALS_FROM) / RIVALS.length;

const PLACES: { art: string; name: string; focus: string }[] = [
    { art: 'tavern.webp', name: 'The Ghoul and Gourd', focus: '50% 45%' },
    { art: 'yawning-portal.webp', name: 'The Yawning Portal', focus: '50% 55%' },
    { art: 'salty-swallow-sets-sail.webp', name: 'The Salty Swallow', focus: '48% 45%' }
];
const PLACES_FROM = 18, PLACE_LEN = 2;

const HITS = [6, 12, 18, 24];
const TITLE_AT = 28.6;
const END_AT = 33;

const ALL_ART = [...RIVALS.map(r => `${ART}${r.art}.webp`), ...PLACES.map(p => ART + p.art), `${ART}devil-sixes.webp`];
function loadArt() {
    return Promise.all(ALL_ART.map(src => {
        const image = new Image();
        image.src = src;
        return image.decode().catch(() => {});
    }));
}

const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

// A part of the trailer, there only from `from` to `to` (music time); its animations start as it appears.
function Part({ now, from, to, children }: { now: number; from: number; to: number; children: (len: number) => ReactNode }) {
    return now >= T(from) && now < T(to) ? <>{children(to - from)}</> : null;
}
// Words that fade in as they appear and out before they go.
function Words({ len, place, className = '', children }: { len: number; place: 'top' | 'low' | 'under'; className?: string; children: ReactNode }) {
    return <p className={`tr-words ${place} ${className}`} style={vars({ '--len': `${len}s` })}>{children}</p>;
}

export function Trailer() {
    const [phase, setPhase] = useState<'start' | 'loading' | 'playing' | 'done'>('start');
    const [run, setRun] = useState(0);
    const begin = () => {
        if (phase === 'loading' || phase === 'playing') return;
        unlockAudio();
        setPhase('loading');
        setRun(n => n + 1);
    };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') location.href = location.pathname; };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    return (
        <div className="film trailer">
            {phase === 'start' && (
                <button className="tr-start" onClick={begin}>
                    <span className="tr-start-title">2, 4, 24</span>
                    <span>Tap to play the trailer</span>
                    <span className="tr-start-note">Sound on. Start your screen recording first.</span>
                </button>
            )}
            {run > 0 && phase !== 'done' && <Reel key={run} onReady={() => setPhase('playing')} onDone={() => setPhase('done')} />}
            {phase === 'done' && (
                <div className="tr-card still">
                    <TitleCard />
                    <div className="tr-after">
                        <button onClick={begin}>↻ Play again</button>
                        <button onClick={() => { location.href = location.pathname; }}>To the game</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function TitleCard() {
    return (
        <>
            <h1 className="tr-title">2, 4, 24</h1>
            <p className="tr-tagline">
                <span className="tr-beat" style={vars({ '--d': '0.5s' })}>Keep the 2.</span>
                <span className="tr-beat" style={vars({ '--d': '1.1s' })}>Keep the 4.</span>
                <span className="tr-beat gold" style={vars({ '--d': '1.8s' })}>Become a legend.</span>
            </p>
        </>
    );
}

function Reel({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
    const [ready, setReady] = useState(false);
    const [opening, setOpening] = useState<RollTrack | null>(null);
    const started = useRef(0);
    const [now, setNow] = useState(-1);
    const dieClock = useRef({ at: Infinity });
    const dieDrawn = useRef<() => void>(() => {});
    const handlers = useRef({ onReady, onDone });
    handlers.current = { onReady, onDone };

    useEffect(() => {
        film.begin();
        let gone = false;
        let stopMusic = () => {};
        let ticker = 0;
        const timers: number[] = [];
        const after = (seconds: number, fn: () => void) => { timers.push(window.setTimeout(fn, Math.max(0, seconds) * 1000)); };
        void (async () => {
            const sound = loadFilmSound();
            await Promise.race([loadArt(), new Promise(r => setTimeout(r, 8000))]);
            await Promise.race([sound, new Promise(r => setTimeout(r, 6000))]);
            if (gone) return;
            const throws = film.prepare(1.8, THROWS);
            const die = prepareOpeningThrow();
            setOpening(die);
            await Promise.race([new Promise<void>(r => { dieDrawn.current = r; }), new Promise(r => setTimeout(r, 2500))]);
            if (gone) return;
            started.current = performance.now();
            // Development: the trailer's clock in music time, for stills at exact moments.
            if (import.meta.env.DEV) (window as unknown as { __trailerAt: () => number }).__trailerAt = () => (performance.now() - started.current) / 1000 - LEAD;
            setReady(true);
            setNow(0);
            handlers.current.onReady();
            ticker = window.setInterval(() => setNow((performance.now() - started.current) / 1000), 40);
            stopMusic = playTrailerMusic(LEAD, 0);
            // The opening die: its first knock on the music's first hit.
            const hit = die.impacts[0]?.frame ?? 0;
            const dieAt = Math.max(0, LEAD - hit / 60);
            dieClock.current.at = started.current + dieAt * 1000;
            after(dieAt, () => playDiceImpacts(die.impacts));
            after(T(6.2), () => setOpening(null));
            // The table: the first three throws, the rivals and places over it, then the last throw.
            after(T(4.9), () => film.showTable()); // (before the first throw starts: it resets the tray)
            throws.forEach((one: FilmThrow, i) => after(T(LANDS[i]) - one.ms / 1000, () => film.playThrow(one)));
            after(T(13.6), () => film.hideTable());
            after(T(23.7), () => film.showAgain());
            after(T(END_AT), () => handlers.current.onDone());
        })();
        return () => {
            gone = true;
            timers.forEach(clearTimeout);
            clearInterval(ticker);
            stopMusic();
            film.end();
        };
    }, []);

    return (
        <>
            {!ready && <div className="tr-loading">Loading…</div>}
            {ready && now < T(5.6) && <div className="film-black-plain" />}
            {opening && (
                <div className={ready ? 'film-shot' : 'film-shot waiting'} style={vars({ '--at': '0s', '--end': `${T(5.3)}s`, '--fade': '0.4s' })}>
                    <FilmDie track={opening} clock={dieClock.current} onDrawn={() => dieDrawn.current()} />
                </div>
            )}
            {ready && (
                <>
                    <Part now={now} from={1.4} to={5.3}>{len => <Words len={len} place="under">Roll six dice.</Words>}</Part>

                    {/* The table shows through here: the 2, the 4, then the Devil. */}
                    <Part now={now} from={LANDS[0]} to={11.6}>{len => <Words len={len} place="top" className="lesson">Keep the 2.</Words>}</Part>
                    <Part now={now} from={LANDS[1]} to={11.6}>{len => <Words len={len} place="top" className="lesson second">Keep the 4.</Words>}</Part>

                    {/* The rivals. */}
                    {RIVALS.map((r, i) => (
                        <Part key={r.art} now={now} from={RIVALS_FROM + i * RIVAL_LEN} to={RIVALS_FROM + (i + 1) * RIVAL_LEN + (i === RIVALS.length - 1 ? 0.15 : 0.02)}>
                            {() => (
                                <div className="tr-rival" style={vars({ '--c': r.colour })}>
                                    <img src={`${ART}${r.art}.webp`} alt="" draggable={false} />
                                    <span className="tr-rival-name">{r.name}</span>
                                </div>
                            )}
                        </Part>
                    ))}
                    <Part now={now} from={RIVALS_FROM + 0.2} to={RIVALS_TO}>{len => <Words len={len} place="top" className="lesson">Fourteen rivals.</Words>}</Part>

                    {/* The places. */}
                    {PLACES.map((p, i) => (
                        <Part key={p.art} now={now} from={PLACES_FROM + i * PLACE_LEN} to={PLACES_FROM + (i + 1) * PLACE_LEN + (i < 2 ? 0.3 : 0.05)}>
                            {len => (
                                <div className="tr-place" style={vars({ '--len': `${len}s` })}>
                                    <img src={ART + p.art} alt="" draggable={false} style={{ objectPosition: p.focus }} />
                                    <span className="tr-place-name">{p.name}</span>
                                </div>
                            )}
                        </Part>
                    ))}
                    <Part now={now} from={PLACES_FROM + 0.25} to={PLACES_FROM + 2 * PLACE_LEN}>{len => <Words len={len} place="low">Two taverns.</Words>}</Part>
                    <Part now={now} from={PLACES_FROM + 2 * PLACE_LEN + 0.15} to={24}>{len => <Words len={len} place="low">One ship.</Words>}</Part>

                    {/* Back at the table: the last die. */}
                    <Part now={now} from={24.1} to={26.5}>{len => <Words len={len} place="top" className="lesson">One last throw...</Words>}</Part>

                    {HITS.map(t => <Part key={t} now={now} from={t - 0.05} to={t + 0.8}>{() => <i className="film-flash" style={vars({ '--at': '0s' })} />}</Part>)}

                    <Part now={now} from={TITLE_AT} to={99}>{() => <div className="tr-card"><TitleCard /></div>}</Part>
                </>
            )}
        </>
    );
}
