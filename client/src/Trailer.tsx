import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FilmDie, prepareOpeningThrow } from './FilmDie';
import { film, type FilmSpec, type FilmThrow } from './game';
import type { RollTrack } from './physics';
import { loadFilmSound, loadTrailerOld, playDiceImpacts, playTrailerMusic, playTrailerOld, unlockAudio } from './sounds';
import './intro.css';
import './trailer.css';

// The trailer (9 Nov, the user's: for an upright phone, to screen-record). Open the game with ?trailer
// in the address (e.g. /next/?trailer), tap, and it plays. Since 11 Nov (the user's, from
// docs/trailer-brainstorm.md), about 45 s:
//   the cold open: the old game (stills of the real old page, from `main`) in an old phone, its tune
//     thin and muffled; its flat 6 tile lifts off the table, turns, and becomes the new die...
//   ...the intro's opening die, the real table teaching the 2 and the 4, the Devil's three 6s;
//   every opponent as a blacked-out outline, a line-up by place, Jaguar almost seen;
//   the three places; "Between fights...": six of the vendors and events, each with their line;
//   one last die in slow motion for a Perfect 24, and the title with the user's tagline.
// Since 11 Nov the music is the user's own trailer track (TrailerMusic.mp3, about 91 beats a minute): a
// swell from 0.85 s, the music arriving at 2.76 s, a new section on a low boom at 12.77 s, its last hits at
// 24.1 s, then a fade. The swell plays under the cold open, as the old 6 lifts; the arrival is the new die's
// first knock (music time 0); the boom's section plays twice (joined on the boom). The trailer's times below
// are written as they were on the intro's music (a hit every 6 s, its 18-24 s bar played twice: "old" times),
// and M moves each onto the track's sections: the Devil's three 6s land on the boom, the rivals and the
// places ride its first pass, the vendors and the last throw the second, the title its last hits.
const COLD = 6; // the cold open's length: the music arrives after it
const LEAD = 0.4; // the opening die falls a moment before the music arrives
const BAR = 6; // (old times: the intro music's bar that was played twice)
const TRACK = { swell: 0.85, arrive: 2.76, boom: 12.77, last: 24.1 }; // in the track's own seconds
const A = TRACK.boom - TRACK.arrive, B = TRACK.last - TRACK.boom; // its first section, and the one played twice
// Old time to music time: the intro music's sections (0-12, 12-24, 24-34.6, the title) onto the track's.
const MAP: [number, number][] = [[0, 0], [12, A], [24, A + B], [34.6, A + 2 * B], [39, A + 2 * B + 4.4]];
const M = (t: number) => {
    for (let i = 1; i < MAP.length; i++) {
        const [a0, b0] = MAP[i - 1], [a1, b1] = MAP[i];
        if (t <= a1 || i === MAP.length - 1) return b0 + ((t - a0) * (b1 - b0)) / (a1 - a0);
    }
    return t;
};
const T = (t: number) => M(t) + COLD + LEAD; // old time to the trailer's clock
const ART = `${import.meta.env.BASE_URL}art/`;

// The hand: a 2, then a 4, then three 6s (the Devil), then the last die, a 6, for 24.
const THROWS: FilmSpec[] = [
    { dice: [[0, 3], [1, 2], [2, 5], [3, 1], [4, 6], [5, 3]], keep: [1], seed: 240 },
    { dice: [[0, 5], [2, 1], [3, 4], [4, 3], [5, 2]], keep: [3], seed: 24 },
    { dice: [[0, 6], [2, 6], [4, 1], [5, 6]], keep: [0, 2, 5], seed: 666, devil: true },
    { dice: [[4, 6]], keep: [4], seed: 2424, perfect: true, slow: true, cheer: true }
];
// When each throw lands, by the music (the Devil's on the 12 s hit).
const LANDS = [7.5, 9.7, 12.0, 26.7 + BAR]; // (old times)
// When the table's throws land, in music time: the 2 and the 4 spaced for whole throws (each up to 1.8 s, and its
// keep), the Devil's three 6s on the track's boom, the last throw where its old time falls. (11 Nov: squeezed onto
// the track by M, the 4's throw began as the 2 was landing, and the 2 never showed.)
// The track's first section is four bars (its boom on the fourth bar line, 11 Nov): the opening, then a bar
// each for the 2 and the 4, the Devil's three 6s on the boom.
const BAR_S = A / 4;
const LAND_AT = [2 * BAR_S, 3 * BAR_S, A, M(LANDS[3])];
// The opening die's shot (music time): its words, then it fades and the black lifts, with the table laid
// underneath before the 2's throw starts (laying it resets the tray), so the whole tumble is seen.
const OPEN = { words: [0.5, 2.6], end: 2.6, fade: 0.4, black: 3.0, gone: 3.4 };
const TABLE_AT = 2.7;

// ---- The cold open (trailer seconds, before the music) ----
// The real old page at 384x780 (art/trailer/old-*.webp, captured from `main` on 11 Nov), and where
// its buttons and its 6 sat in those pixels.
const OLD_W = 384, OLD_H = 780;
const OLD_SHOTS: { art: string; from: number; to: number }[] = [
    { art: 'old-start', from: 0, to: 1.35 },
    { art: 'old-table', from: 1.35, to: 2.3 },
    { art: 'old-rolled', from: 2.3, to: 3.5 },
    { art: 'old-kept', from: 3.5, to: COLD }
];
const OLD_TAPS: { x: number; y: number; at: number }[] = [
    { x: 191, y: 617, at: 1.05 }, // Enter Tavern
    { x: 116, y: 639, at: 1.9 }, // Roll Dice
    { x: 260, y: 438, at: 3.2 } // the 2, kept
];
const OLD_SIX = { x: 80, y: 418, w: 40 }; // the 6 left on the table, as the 2 is kept
const SIX_LIFT = 4.2; // the 6 lifts off the old table, turns and grows, and is gone into the new die

// ---- The rivals: every opponent as a blacked-out outline, a row per place ----
// seat: how much larger their cut-out is drawn at the table so heads match (portraits.ts), eased here.
const LINEUP: { place: string; at: number; who: { art: string; seat?: number }[] }[] = [
    { place: 'The Ghoul and Gourd', at: 13.6, who: [{ art: 'mcgrath', seat: 1.25 }, { art: 'frak', seat: 1.1 }, { art: 'danhausen', seat: 1.15 }, { art: 'duke' }, { art: 'martha', seat: 1.08 }] },
    { place: 'The Yawning Portal', at: 14.3, who: [{ art: 'sylvester' }, { art: 'vaelin-inkhand' }, { art: 'stason' }, { art: 'ridgeler' }, { art: 'brodor', seat: 1.15 }] },
    { place: 'The Salty Swallow', at: 15.0, who: [{ art: 'klarg' }, { art: 'rokr' }, { art: 'aed' }, { art: 'hangman' }, { art: 'jaguar' }] } // (Áéd since 11 Nov, the user's)
];
const LINEUP_FROM = 13.6, LINEUP_TO = 18;
// Its dark background fades in over the Devil's leaving, and stays until the first place has faded in over it
// (11 Nov: the table showed through at both seams).
const LINEUP_IN = LINEUP_FROM - 0.45, LINEUP_OUT = LINEUP_TO + 0.4;
const LIGHTNING = 15.7; // lit from behind, all at once
const REVEAL = 16.9; // Jaguar, the last of them, lit from the front for a few frames

const PLACES: { art: string; name: string; focus: string }[] = [
    { art: 'tavern.webp', name: 'The Ghoul and Gourd', focus: '50% 45%' },
    { art: 'yawning-portal.webp', name: 'The Yawning Portal', focus: '50% 55%' },
    { art: 'salty-swallow-sets-sail.webp', name: 'The Salty Swallow', focus: '48% 45%' }
];
const PLACES_FROM = 18, PLACE_LEN = 2;

// ---- Between fights: six of the vendors and events, a beat each (the repeated bar) ----
// scene: a painting that is the whole stage (the Shrine, the hot tub); else a cut-out rising behind its
// counter in its own light, over its place.
const VENDORS: { name: string; art: string; line?: string; back?: string; glow: string; scene?: boolean }[] = [
    { name: "Thom's Thonics", art: 'thom', line: "What ya havin'?", back: 'tavern.webp', glow: '#ffb35c' },
    { name: 'Stop, thief!', art: 'pickpocket', line: 'Finders keepers!', back: 'tavern.webp', glow: '#ff6a4a' },
    { name: 'Shrine to the Lady', art: 'shrine', scene: true, glow: '#8fd8ff' },
    { name: 'Wild Magic Hot Tub', art: 'hot-tub', line: '*bubble bubble* ✨', scene: true, glow: '#5ff0d8' },
    { name: 'Johnny Elf Bar', art: 'elf-kid', line: 'Psst! Wanna touch the sky?', back: 'yawning-portal.webp', glow: '#c77dff' },
    { name: 'Yvesil', art: 'yvesil', line: 'Shall I read your next fight?', back: 'salty-swallow-at-sea.webp', glow: '#5fe0ff' }
];
const VENDORS_FROM = 24, VENDOR_LEN = BAR / VENDORS.length;

const HITS = [A, A + B, A + 2 * B]; // (music time: the track's boom, its repeat, its last hits)
const TITLE_AT = 28.6 + BAR;
const END_AT = 33 + BAR;

const ALL_ART = [
    ...OLD_SHOTS.map(s => `${ART}trailer/${s.art}.webp`),
    ...LINEUP.flatMap(r => r.who.map(w => `${ART}${w.art}.webp`)),
    ...PLACES.map(p => ART + p.art),
    ...VENDORS.flatMap(v => [`${ART}${v.art}.webp`, ...(v.back ? [ART + v.back] : [])]),
    `${ART}devil-sixes.webp`
];
function loadArt() {
    return Promise.all([...new Set(ALL_ART)].map(src => {
        const image = new Image();
        image.src = src;
        return image.decode().catch(() => {});
    }));
}

const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;
const pct = (n: number, of: number) => `${(100 * n) / of}%`;

// A part of the trailer, there only from `from` to `to` (music time); its animations start as it appears.
function Part({ now, from, to, children }: { now: number; from: number; to: number; children: (len: number) => ReactNode }) {
    return now >= T(from) && now < T(to) ? <>{children(T(to) - T(from))}</> : null;
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
            {/* (the user's, 11 Nov) */}
            <p className="tr-soon tr-beat" style={vars({ '--d': '2.6s' })}>Coming Soon</p>
        </>
    );
}

// The cold open: the old game in an old phone, a fond memory. Its animations all count from the
// trailer's start (it is there from then), so their delays are trailer seconds.
function ColdOpen({ now }: { now: number }) {
    const at = (from: number, to: number) => now >= from && now < to;
    return (
        <div className="tr-old" style={vars({ '--cold': `${COLD}s`, '--lift': `${SIX_LIFT}s` })}>
            <div className="tr-phone-box">
                <div className="tr-phone">
                    <div className="tr-phone-screen">
                        {OLD_SHOTS.map(s => (
                            <img key={s.art} className="tr-old-shot" src={`${ART}trailer/${s.art}.webp`} alt="" draggable={false}
                                style={vars({ '--from': `${s.from}s`, '--to': `${s.to}s` })} />
                        ))}
                        {OLD_TAPS.map(t => (
                            <i key={t.at} className="tr-tap" style={vars({ left: pct(t.x, OLD_W), top: pct(t.y, OLD_H), '--at': `${t.at}s` })} />
                        ))}
                        <i className="tr-old-grain" />
                    </div>
                </div>
                {/* The old flat 6 (outside the phone, which dims): it lifts off the table and turns into the new die. */}
                <span className="tr-old-six" style={vars({ left: pct(OLD_SIX.x, OLD_W), top: pct(OLD_SIX.y, OLD_H), width: pct(OLD_SIX.w, OLD_W) })}><b>6</b></span>
            </div>
            <span className="tr-old-stamp">Version 1</span>
            {at(0.25, 3.95) && <Words len={3.7} place="top" className="old">The original game was fine...</Words>}
        </div>
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
        let stopOld = () => {};
        let ticker = 0;
        const timers: number[] = [];
        const after = (seconds: number, fn: () => void) => { timers.push(window.setTimeout(fn, Math.max(0, seconds) * 1000)); };
        void (async () => {
            const sound = Promise.all([loadFilmSound(), loadTrailerOld()]);
            await Promise.race([loadArt(), new Promise(r => setTimeout(r, 8000))]);
            await Promise.race([sound, new Promise(r => setTimeout(r, 6000))]);
            if (gone) return;
            const throws = film.prepare(1.8, THROWS);
            const die = prepareOpeningThrow();
            setOpening(die);
            await Promise.race([new Promise<void>(r => { dieDrawn.current = r; }), new Promise(r => setTimeout(r, 2500))]);
            if (gone) return;
            started.current = performance.now();
            // Development: the trailer's clock in music time (the cold open is before 0), for stills at exact moments.
            if (import.meta.env.DEV) (window as unknown as { __trailerAt: () => number }).__trailerAt = () => (performance.now() - started.current) / 1000 - COLD - LEAD;
            setReady(true);
            setNow(0);
            handlers.current.onReady();
            ticker = window.setInterval(() => setNow((performance.now() - started.current) / 1000), 40);
            // The cold open's sound: the old tune, its click and roll, cut dead as the new die falls.
            stopOld = playTrailerOld(COLD - 0.1, [{ at: OLD_TAPS[0].at, clip: 'click' }, { at: OLD_TAPS[1].at, clip: 'roll' }, { at: OLD_TAPS[2].at, clip: 'click' }]);
            // The track: its swell under the cold open (from before music time 0), through its boom's section,
            // that section again, then its last hits and fade.
            stopMusic = playTrailerMusic(COLD + LEAD, 0, [[TRACK.swell - TRACK.arrive, TRACK.swell, TRACK.last - TRACK.swell], [A + B, TRACK.boom, B], [A + 2 * B, TRACK.last]]);
            // The opening die: its first knock on the music's first hit.
            const hit = die.impacts[0]?.frame ?? 0;
            const dieAt = Math.max(0, COLD + LEAD - hit / 60);
            dieClock.current.at = started.current + dieAt * 1000;
            after(dieAt, () => playDiceImpacts(die.impacts));
            after(COLD + LEAD + OPEN.gone, () => setOpening(null));
            // The table: the first three throws, the rivals, places and vendors over it, then the last throw.
            after(COLD + LEAD + TABLE_AT, () => film.showTable()); // (before the first throw starts: it resets the tray)
            throws.forEach((one: FilmThrow, i) => after(COLD + LEAD + LAND_AT[i] - one.ms / 1000, () => film.playThrow(one)));
            after(T(13.6), () => film.hideTable());
            after(T(23.7 + BAR), () => film.showAgain());
            after(T(END_AT), () => handlers.current.onDone());
        })();
        return () => {
            gone = true;
            timers.forEach(clearTimeout);
            clearInterval(ticker);
            stopOld();
            stopMusic();
            film.end();
        };
    }, []);

    return (
        <>
            {!ready && <div className="tr-loading">Loading…</div>}
            {ready && now < COLD + LEAD + OPEN.black && <div className="film-black-plain" />}
            {opening && (
                <div className={ready ? 'film-shot' : 'film-shot waiting'} style={vars({ '--at': `${COLD}s`, '--end': `${COLD + LEAD + OPEN.end}s`, '--fade': `${OPEN.fade}s` })}>
                    <FilmDie track={opening} clock={dieClock.current} onDrawn={() => dieDrawn.current()} />
                </div>
            )}
            {ready && now < COLD + 0.2 && <ColdOpen now={now} />}
            {/* The second line comes as the old 6 lifts and turns (the user's words, 11 Nov), and stays a
                moment over the dark as the new die falls. */}
            {ready && now >= SIX_LIFT && now < COLD + 0.8 && <Words len={COLD + 0.8 - SIX_LIFT} place="top" className="old turn">But it was time to rebuild the tavern.</Words>}
            {ready && (
                <>
                    {now >= COLD + LEAD + OPEN.words[0] && now < COLD + LEAD + OPEN.words[1] && <Words len={OPEN.words[1] - OPEN.words[0]} place="under">It's time to roll the dice.</Words>}

                    {/* The table shows through here: the 2, the 4, then the Devil. */}
                    {[['Keep the 2.', LAND_AT[0], 'lesson'], ['Keep the 4.', LAND_AT[1], 'lesson second']].map(([words, at, kind]) => {
                        const from = COLD + LEAD + (at as number), to = COLD + LEAD + A - 0.4;
                        return now >= from && now < to ? <Words key={words} len={to - from} place="top" className={kind as string}>{words}</Words> : null;
                    })}

                    {/* The rivals, blacked out. */}
                    <Part now={now} from={LINEUP_IN} to={LINEUP_OUT}>
                        {len => (
                            <div className="tr-lineup" style={vars({ '--len': `${len}s`, '--bolt': `${M(LIGHTNING) - M(LINEUP_IN)}s`, '--reveal': `${M(REVEAL) - M(LINEUP_IN)}s` })}>
                                <i className="tr-bolt" />
                                {LINEUP.map(row => (
                                    <div key={row.place} className="tr-row" style={vars({ '--d': `${M(row.at) - M(LINEUP_IN)}s` })}>
                                        <span className="tr-row-place">{row.place}</span>
                                        <div className="tr-row-figures">
                                            {row.who.map(w => (
                                                <img key={w.art} className={`tr-sil${w.art === 'jaguar' ? ' reveal' : ''}`} src={`${ART}${w.art}.webp`} alt="" draggable={false}
                                                    style={vars({ '--s': w.seat ?? 1 })} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Part>
                    <Part now={now} from={LIGHTNING + 0.1} to={LINEUP_TO}>{len => <Words len={len} place="top" className="lesson">Fifteen rivals.</Words>}</Part>

                    {/* The places. */}
                    {PLACES.map((p, i) => (
                        <Part key={p.art} now={now} from={PLACES_FROM + i * PLACE_LEN} to={PLACES_FROM + (i + 1) * PLACE_LEN + (i < 2 ? 0.3 : 0.25)}>
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

                    {/* Between fights: the vendors and events, a beat each. */}
                    {VENDORS.map((v, i) => (
                        <Part key={v.art} now={now} from={VENDORS_FROM + i * VENDOR_LEN} to={VENDORS_FROM + (i + 1) * VENDOR_LEN + (i < VENDORS.length - 1 ? 0.12 : 0.05)}>
                            {len => (
                                <div className={`tr-vendor${v.scene ? ' scene' : ''}`} style={vars({ '--len': `${len}s`, '--c': v.glow })}>
                                    {v.back && <img className="tr-vendor-back" src={ART + v.back} alt="" draggable={false} />}
                                    {v.scene
                                        ? <img className="tr-vendor-scene" src={`${ART}${v.art}.webp`} alt="" draggable={false} />
                                        : <img className="tr-vendor-figure" src={`${ART}${v.art}.webp`} alt="" draggable={false} />}
                                    {v.line && <span className="tr-vendor-line">{v.line}</span>}
                                    <span className="tr-vendor-name">{v.name}</span>
                                </div>
                            )}
                        </Part>
                    ))}
                    <Part now={now} from={VENDORS_FROM + 0.1} to={VENDORS_FROM + BAR}>{len => <Words len={len} place="top" className="lesson">Between fights...</Words>}</Part>

                    {/* Back at the table: the last die. */}
                    <Part now={now} from={24.1 + BAR} to={26.5 + BAR}>{len => <Words len={len} place="top" className="lesson">One last throw...</Words>}</Part>

                    {HITS.map(t => (now >= t + COLD + LEAD - 0.05 && now < t + COLD + LEAD + 0.8 ? <i key={t} className="film-flash" style={vars({ '--at': '0s' })} /> : null))}

                    <Part now={now} from={TITLE_AT} to={99}>{() => <div className="tr-card"><TitleCard /></div>}</Part>
                </>
            )}
        </>
    );
}
