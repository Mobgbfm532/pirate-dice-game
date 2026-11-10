import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { screenInsets } from './layout';
import { CELEBRATION_MS, DEVIL_MS, MOMENT_SHOW_MS, MULTIPLAYER_CALLOUTS, actions, canPutBack, handComplete, heartFromHand, readSavedRun, trailerWanted, klargStealing, SEA_SHOW_MS, SEA_HOLD_MS, SEA_LAND_MS, WAVE_SHOW_MS, type SeaState, type SeaRoll, type LeagueRow, type RoundResultRow, showToast, store, BOT_ID, type GameState, type DiceThrow, type Keepsake, type Interlude, type ShopArrival, type Snapshot, type Spot, type TavernSummary, type Thonic, type Enemy } from './game';
import { Rules, coins, keepsNeeded, type TurnView } from './rules';
import { areSoundsOff, isMusicOff, playCoins, playDiceImpacts, playSound, setMusicOff, setSoundsOff, startSceneAmbience, playShipBell, playSeaSwell, setBossMusic } from './sounds';
import { simulateRoll } from './physics';
import { LivingPainting, preloadPainting } from './LivingPainting';
import { AVATAR_IDS, EDITABLE, PORTRAITS, SEATABLE, SPOT_PORTRAITS, spotPortrait, avatarStyle, editPortrait, editSeat, editablePortrait, portraitEdits, portraitFor, seatEditsNow, seatPreview } from './portraits';
import { acrossTheTable, opponentName, opponentPortraitKey, placeBackdrop, sceneFileOf } from './Backdrop';
import { lookNext } from './look';
import { IntroFilm, Rain, introChoice, introSeen, liftCurtain, preloadIntro, saveIntroChoice } from './Intro';
import { Trailer } from './Trailer';
import { QUALITY, TUNE_LABELS, framesPerSecond, quality, resetTune, setQuality, setTune, tunePanel, tuneStore, tuning, type Quality, type Tuning } from './tuning';

// The tavern's five reactions (the user's, 3 Nov), painted by the user the same day (art/reaction-<id>.jpg
// -> art/reactions/<id>.webp). The emoji is what travels between players (and what the classic page shows).
const REACTIONS: { emoji: string; id: string; name: string }[] = [
    { emoji: '🍻', id: 'cheers', name: 'Cheers' },
    { emoji: '🃏', id: 'ha', name: 'Ha!' },
    { emoji: '😮', id: 'ooh', name: 'Ooh' },
    { emoji: '😏', id: 'smug', name: 'Smug' },
    { emoji: '💔', id: 'woe', name: 'Woe' }
];
const PAINTED_REACTIONS = new Set(['cheers', 'ha', 'ooh', 'smug', 'woe']);
const reactionIcon = (emoji: string) => {
    const r = REACTIONS.find(x => x.emoji === emoji);
    return r && PAINTED_REACTIONS.has(r.id)
        ? <img src={`${import.meta.env.BASE_URL}art/reactions/${r.id}.webp`} alt="" draggable={false} />
        : <span className="emoji">{emoji}</span>;
};

// The bot's portrait is its name (one per Tavern Crawl encounter); players pick an avatar.
const playerPortrait = (id: string, name: string, avatar: string) => portraitFor(id === BOT_ID ? opponentPortraitKey(name) : avatar);

function readPrefs() {
    try {
        return {
            name: localStorage.getItem('tavernName') ?? '',
            avatar: localStorage.getItem('tavernAvatar') ?? AVATAR_IDS[0],
            code: localStorage.getItem('tavernRoom') ?? ''
        };
    } catch {
        return { name: '', avatar: AVATAR_IDS[0], code: '' };
    }
}

function savePrefs(name: string, avatar: string, code: string) {
    try {
        localStorage.setItem('tavernName', name);
        localStorage.setItem('tavernAvatar', avatar);
        localStorage.setItem('tavernRoom', code);
    } catch { /* storage unavailable */ }
}

// An invite link looks like /next/?table=CODE.
function invitedTable() {
    const code = new URLSearchParams(location.search).get('table');
    return code ? code.trim().toUpperCase().slice(0, 10) : '';
}

function JoinScreen() {
    const prefs = readPrefs();
    const invite = invitedTable();
    const [name, setName] = useState(prefs.name);
    const [avatar, setAvatar] = useState(AVATAR_IDS.includes(prefs.avatar) ? prefs.avatar : AVATAR_IDS[0]);
    const [code, setCode] = useState(invite || (['COMP', 'TAVERN'].includes(prefs.code) ? '' : prefs.code));
    const [lives, setLives] = useState(3);

    const join = (tableCode: string) => {
        savePrefs(name, avatar, tableCode);
        actions.join(name, avatar, tableCode, lives);
    };
    // A Tavern Crawl saved at an invitation on to the next place.
    const [saved, setSaved] = useState(readSavedRun);
    // The intro film: before a device's first Tavern Crawl, or asked for ("Watch the intro").
    const [film, setFilm] = useState<'crawl' | 'watch' | null>(null);
    const [choice, setChoice] = useState(introChoice);
    const playIntro = choice ?? !introSeen();
    useEffect(() => {
        if (!playIntro || invite) return;
        const wait = setTimeout(preloadIntro, 1200);
        return () => clearTimeout(wait);
    }, [playIntro, invite]);
    if (film) return <IntroFilm onDone={() => {
        liftCurtain();
        if (film === 'crawl') join('TAVERN');
        else setFilm(null);
    }} />;

    return (
        <div className="modal-backdrop">
            <div className="panel join">
                <h1>2, 4, 24</h1>
                <p className="subtitle">Find a 2, find a 4, then chase 24.</p>
                <div className="avatars">
                    {AVATAR_IDS.map(id => (
                        <button key={id} className={`avatar ${id === avatar ? 'selected' : ''}`} style={avatarStyle(portraitFor(id))} onClick={() => { setAvatar(id); playSound('click'); }} aria-label={id} />
                    ))}
                </div>
                <input value={name} maxLength={15} placeholder="Adventurer name" onChange={e => setName(e.target.value)} />
                {invite && <button className="primary" onClick={() => join(invite)}>Join table {invite}</button>}
                {saved && !invite && (
                    <div className="saved-run">
                        <button className="primary" onClick={() => actions.resume(saved, avatar)}>
                            Continue your crawl
                            <span className="detail">{saved.name}: {saved.next} at {saved.place} · {coins(saved.purse)}</span>
                        </button>
                        <button className="link-button" onClick={() => { actions.forgetSavedRun(); setSaved(null); }}>Forget this save</button>
                    </div>
                )}
                {/* (Solo vs The Molar was taken out, 4 Nov, the user's call: the Tavern Crawl is the solo game.) */}
                <button className={invite ? 'secondary' : 'primary'} onClick={() => { if (playIntro) setFilm('crawl'); else join('TAVERN'); }}>Tavern Crawl</button>
                <div className="row">
                    <input value={code} maxLength={10} placeholder="Table code" onChange={e => setCode(e.target.value.toUpperCase())} />
                    <button className="secondary" onClick={() => join(code)}>Join table</button>
                </div>
                {code && !invite && (
                    <div className="lives-pick" role="radiogroup" aria-label="Starting lives for a new table">
                        <span>Lives (new tables)</span>
                        {[2, 3, 4].map(n => (
                            <button key={n} role="radio" aria-checked={lives === n} className={lives === n ? 'selected' : ''} onClick={() => setLives(n)}>
                                {'♥'.repeat(n)}
                            </button>
                        ))}
                    </div>
                )}
                {!invite && (
                    <div className="intro-row">
                        <label className="intro-check">
                            <input type="checkbox" checked={playIntro} onChange={e => { saveIntroChoice(e.target.checked); setChoice(e.target.checked); }} />
                            Play intro before a Tavern Crawl
                        </label>
                        <button className="link-button watch-intro" onClick={() => setFilm('watch')}>Watch it</button>
                    </div>
                )}
                <p className="fine">Prototype of the 3D table. The classic game is still at <a href="/">the main page</a>.</p>
            </div>
        </div>
    );
}

type TurnInfo = { title: string; detail?: string; tone: 'mine' | 'theirs' | 'waiting' | 'dust'; who?: string };

function turnInfo(snap: Snapshot, state: GameState): TurnInfo {
    const tavern = state.mode === 'tavern-crawl';
    if (snap.waiting) return { title: 'Waiting for travelers', detail: 'to join…', tone: 'waiting' };
    if (tavern && state.tavernRun?.pendingKeepsakeChoices) return { title: 'Choose a keepsake', tone: 'mine' };
    const me = snap.myId ? state.players[snap.myId] : null;
    const id = state.currentTurnId;
    const current = id ? state.players[id] : null;
    if (me && me.lives <= 0) return { title: "You're dust", detail: current ? `${current.name} is rolling` : undefined, tone: 'dust', who: current ? id! : undefined };
    if (snap.isMyTurn) return { title: 'Your turn', tone: 'mine', who: snap.myId ?? undefined };
    if (!current) return { title: '', tone: 'theirs' };
    // The server holds their turn for a short while so a phone can reconnect.
    if (!current.connected) return { title: current.name, detail: 'reconnecting…', tone: 'waiting', who: id! };
    return { title: current.name, detail: 'is rolling', tone: 'theirs', who: id! };
}

// Whose turn it is, at the top: a nameplate-style banner with their picture.
function TurnBanner({ snap, state }: { snap: Snapshot; state: GameState | null }) {
    if (!state) return <div className="turn-banner waiting"><span className="title">Connecting…</span></div>;
    const info = turnInfo(snap, state);
    if (!info.title) return <div className="turn-banner empty" />;
    const p = info.who ? state.players[info.who] : null;
    return (
        <div key={`${info.tone}:${info.who ?? info.title}`} className={`turn-banner ${info.tone}`} aria-live="polite">
            {p && <span className="portrait" style={avatarStyle(playerPortrait(info.who!, p.name, p.avatar))} />}
            <span className="text">
                <span className="title">{info.title}</span>
                {info.detail && <span className="detail">{info.detail}</span>}
            </span>
        </div>
    );
}

function scoreText(p: GameState['players'][string]) {
    return !p.connected ? 'Offline' : p.lives <= 0 ? 'Out' : p.scoreHidden ? '?' : p.score === null ? '–' : p.busted ? 'Dust' : String(p.score);
}

// Scores of players who have finished this round and didn't dust.
function finishedScores(state: GameState, exceptId?: string) {
    return state.roundPlayers
        .filter(id => id !== exceptId && state.players[id] && state.players[id].score !== null && !state.players[id].busted)
        .map(id => state.players[id].score as number);
}

// How a round score looks: dust in red; the lowest finished score (the one currently set to
// lose a life, once someone has beaten it) in amber; not yet played, dimmed.
function scoreClass(state: GameState, id: string) {
    const p = state.players[id];
    if (!p || p.score === null) return 'waiting';
    if (p.busted) return 'dust';
    const scores = finishedScores(state);
    const worst = cursed(state) ? Math.max(...scores) : Math.min(...scores);
    return scores.length > 1 && p.score === worst ? 'lowest' : 'scored';
}

// A Tavern Crawl round where the lowest valid score wins (Danhausen's Curse).
function cursed(state: GameState) {
    return state.tavernRun?.roundEffect?.kind === 'curse';
}

// The hot tub's surge on your Wild Magic (aqua) die, in a few words (the hint under Roll; the user's wording, 20 Oct).
const SURGE_HINTS: Record<string, string> = {
    noOnes: 'The Wild Magic die never rolls a 1',
    twin: 'Wild Magic die keeps the better of two rolls',
    lucky: 'The Wild Magic die only rolls 4, 5 or 6',
    scalding: 'The Wild Magic die always lands on a 6',
    soggy: 'The Wild Magic die never rolls a 6'
};

// What this round's ability means for you, on a one-line plaque under the Roll button: its name and
// what it does (5 Nov, the user's: it was a line of text in a coloured pill).
// Mind Whip shows only once it has landed (your first throw) and only while it's still your
// turn; on the opponent's turn the hot tub's surge (if any) shows instead.
// kind: the plaque's colour.
interface RoundBadge { title: string; text: string; kind: string }
const NO_BADGE: RoundBadge = { title: '', text: '', kind: '' };
function roundEffectHint(state: GameState, myTurn: boolean, turn: TurnView | null = null): RoundBadge {
    const effect = state.tavernRun?.roundEffect;
    // Rokr's stars, on your turn: which faces they mark for the next throw (and this one's).
    const stars = myTurn && turn?.stars;
    if (stars && !turn.finalized) {
        const next = stars.next ? stars.next.join(' and ') : '';
        const bound = turn.dice.some(d => d.bound);
        return { title: 'Written in the Stars', text: bound && stars.now ? `Bound: ${stars.now.join(' and ')}. Next: ${next}` : `Next throw binds ${next}`, kind: 'stars' };
    }
    if (turn?.blurActive && myTurn && !turn.finalized) return { title: 'Starry Form', text: 'Keep blind: they show at your next throw', kind: 'stars' };
    const phase = state.tavernRun?.jaguarPhase;
    if (phase === 'cloak') return { title: 'The Cloak', text: 'Jaguar throws after you, his dice hidden', kind: 'cloak' };
    if (phase === 'allIn') return { title: 'All In', text: 'Whoever loses this round loses two hearts', kind: 'allin' };
    const surge = state.tavernRun?.tubSurge;
    const cap = state.tavernRun?.devilCap ?? null;
    if (effect?.kind === 'curse') return { title: 'Cursed round', text: 'The lowest valid score wins', kind: 'curse' };
    if (effect?.kind === 'ink') return { title: 'Inkfire round', text: "Your dice can't land on 6", kind: 'ink' };
    if (effect?.kind === 'stare') return { title: 'Penitent Stare', text: `Your hand scores ${effect.off} less`, kind: 'stare' };
    if (effect?.kind === 'smite') return { title: 'Divine Smite', text: 'Lose this round, lose two hearts', kind: 'smite' };
    if (effect?.kind === 'mind' && effect.landed && myTurn) return { title: 'Mind Whip', text: 'The selected die stays kept', kind: 'mind' };
    // The Devil: three 6s for whoever plays it (no cap on the other side since 21 Oct unless devilCap is set).
    if (effect?.kind === 'devil') {
        if (cap != null) return { title: "Devil's round", text: effect.by === 'player' ? `They can't score above ${cap}` : `You can't score above ${cap}`, kind: 'devil' };
        return effect.by === 'player' ? { title: "Devil's round", text: 'Three 6s for you', kind: 'devil' } : NO_BADGE;
    }
    if (state.tavernRun?.cloud && !turn?.finalized) return { title: 'Cotton Candy Cloud', text: "They can't see your score", kind: 'cloud' };
    if (surge && surge.id !== 'pruney') return { title: surge.name, text: SURGE_HINTS[surge.id], kind: 'tub' };
    return NO_BADGE;
}

// What the player rolling now has to do. The lowest score of the round loses a life (and
// dust always does), so the score to beat is the lowest among those who've finished.
function scoreToBeat(state: GameState, rollerId: string): { label: string; target: number | string | null } | null {
    // (A fog bank: they've finished, but you can't see what.)
    if (state.roundPlayers.some(id => id !== rollerId && state.players[id]?.scoreHidden)) return { label: 'Score to beat', target: '?' };
    const finished = state.roundPlayers.filter(id => id !== rollerId && state.players[id] && state.players[id].score !== null);
    if (finished.length === 0) return null; // first to roll: nothing to beat yet
    const scores = finishedScores(state, rollerId);
    if (scores.length === 0) return null; // everyone else dusted: nothing to beat (the user took the line out, 27 Oct)
    if (cursed(state)) return { label: 'Score to stay under', target: Math.max(...scores) };
    return { label: 'Score to beat', target: Math.min(...scores) };
}

// One heart per life: full, then empty up to the starting number. Since 25 Oct (visuals plan
// step 5) a heart that's lost cracks in two and falls away, and one that comes back pops in with
// a glow. `fight` changes when a new fight starts, where hearts reset without any of that.
const HEART_MS = 900;
// `player`: whose they are, at the table; a lost heart then has its sound as it cracks, and one won
// back by a perfect hand its own as it pops in (the user's, 5 Nov).
function Hearts({ lives, starting, fight = '', player }: { lives: number; starting: number; fight?: string; player?: string }) {
    const n = Math.max(0, lives);
    const seen = useRef({ n, fight });
    const [change, setChange] = useState<{ kind: 'lost' | 'healed'; from: number; to: number; at: number } | null>(null);
    useEffect(() => {
        const was = seen.current;
        seen.current = { n, fight };
        if (was.fight !== fight || was.n === n) return;
        const at = performance.now();
        if (player && n < was.n) playSound('loseHeart');
        else if (player && heartFromHand(player)) playSound('healthPickup');
        setChange(n < was.n ? { kind: 'lost', from: n, to: was.n, at } : { kind: 'healed', from: was.n, to: n, at });
        const timer = setTimeout(() => setChange(c => (c && c.at === at ? null : c)), HEART_MS + 100);
        return () => clearTimeout(timer);
    }, [n, fight, player]);
    const slots = Math.max(starting, n, change?.to ?? 0);
    return (
        <div className="hearts" aria-label={`${n} lives`}>
            {Array.from({ length: slots }, (_, i) => {
                const moving = change && i >= change.from && i < change.to;
                const kind = moving ? (change.kind === 'lost' ? 'breaking' : 'healing') : i < n ? 'full' : 'empty';
                return <span key={moving ? `${i}-${change.at}` : i} className={`heart ${kind}`} style={moving ? { animationDelay: `${(i - change.from) * 0.12}s` } : undefined}>♥</span>;
            })}
        </div>
    );
}

// Which fight it is (a new one resets the hearts without cracks or glows).
const fightKey = (state: GameState) => (state.tavernRun ? `${(state.tavernRun.seated ?? state.tavernRun.enemy).name}` : '');

// Player chips: a column at the top left on wide screens, a scrolling row above the
// controls on phones. A bot opponent has a nameplate on the table edge instead.
function Players({ snap, state, ids, className = '' }: { snap: Snapshot; state: GameState; ids: string[]; className?: string }) {
    // On phones the row scrolls sideways: keep whoever is rolling in view.
    const row = useRef<HTMLDivElement>(null);
    const multiplayer = state.mode !== 'tavern-crawl' && !state.players[BOT_ID];
    useEffect(() => {
        row.current?.querySelector('.player.current')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }, [state.currentTurnId]);
    return (
        <div ref={row} className={`players ${className}`}>
            {ids.map(id => {
                const p = state.players[id];
                if (!p) return null;
                const inRound = state.roundPlayers.includes(id) && p.connected;
                return (
                    <div key={id} data-player={id} className={`player ${id === state.currentTurnId ? 'current' : ''} ${inRound ? '' : 'out'} ${id === snap.myId ? 'me' : ''}`}>
                        <div className="portrait" style={avatarStyle(playerPortrait(id, p.name, p.avatar))} />
                        <div>
                            <FitName name={p.name} />
                            {/* A Tavern Crawl opponent's hearts are out of their own lives, not yours. */}
                            <Hearts lives={p.lives} starting={id === BOT_ID && state.tavernRun ? (state.tavernRun.seated ?? state.tavernRun.enemy).lives : state.startingLives} fight={fightKey(state)} player={id} />
                            {id === BOT_ID && state.tavernRun && <AbilityMarks state={state} />}
                        </div>
                        <div className={`score ${scoreClass(state, id)}`}>{scoreText(p)}</div>
                        {multiplayer && <SeatCallout snap={snap} id={id} />}
                    </div>
                );
            })}
        </div>
    );
}

// A player's name, shrunk to fit its card when it's long (down to MIN_FIT of its size), so all 15
// letters a name may have show instead of "Barthol…" (the user, 3 Nov). Only past that the "…".
const MIN_FIT = 0.62;
function FitName({ name }: { name: string }) {
    const el = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const node = el.current;
        if (!node) return;
        // (Set on the element itself: measured at its own size from the stylesheet each time.)
        // (The text's own width to the fraction of a pixel: whole-pixel widths let a name that only
        // just fits tip into "…".)
        const range = document.createRange();
        const fit = () => {
            node.style.fontSize = '';
            range.selectNodeContents(node);
            const room = node.clientWidth, wants = range.getBoundingClientRect().width;
            if (!(wants > room - 0.5 && room > 0)) return;
            const size = parseFloat(getComputedStyle(node).fontSize);
            node.style.fontSize = `${(size * Math.max(MIN_FIT, (room - 1) / wants)).toFixed(2)}px`;
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(node); // (its own box: a seat card's .who has none, display: contents)
        if (node.parentElement) observer.observe(node.parentElement);
        // (The title font arriving changes the widths: fit again once it has.)
        document.fonts?.ready.then(fit);
        document.fonts?.addEventListener('loadingdone', fit);
        return () => { observer.disconnect(); document.fonts?.removeEventListener('loadingdone', fit); };
    }, [name]);
    return <div ref={el} className="name">{name}</div>;
}

// At a multiplayer table "The Early Ross!" and "Didn't Bite!" (only those) flash over the roller's
// nameplate, theirs or your own chip (the user's call, 3 Nov), instead of over the table.
// It's drawn on a layer of its own over the whole page, centred on the nameplate and larger than it
// (inside the card the footer's row clipped it to a sliver, the user saw): a banner bursting out of a
// flash of light in the callout's colour, with sparks, a shine sweeping over it, then rising away.
function SeatCallout({ snap, id }: { snap: Snapshot; id: string }) {
    const anchor = useRef<HTMLSpanElement>(null);
    const [box, setBox] = useState<{ x: number; y: number } | null>(null);
    const flash = snap.seatFlash?.playerId === id ? snap.seatFlash : null;
    const c = flash ?? snap.callout;
    const text = flash ? flash.text : c && c.playerId === id ? MULTIPLAYER_CALLOUTS[c.kind] : undefined;
    useLayoutEffect(() => {
        const card = anchor.current?.parentElement;
        if (!text || !card) { setBox(null); return; }
        const r = card.getBoundingClientRect();
        // (kept on screen: a card at the edge would push half the banner off it)
        const half = Math.min(150, window.innerWidth / 2 - 8);
        setBox({ x: Math.min(window.innerWidth - half, Math.max(half, r.left + r.width / 2)), y: r.top + r.height / 2 });
    }, [text, c?.key]);
    if (!text || !c) return null;
    return (
        <>
            <span ref={anchor} hidden />
            {box && createPortal(
                <div key={c.key} className={`callout-burst ${c.kind}`} style={{ left: box.x, top: box.y, '--callout': c.color } as React.CSSProperties} aria-live="polite">
                    <span className="burst-light" />
                    <span className="burst-rays" />
                    {Array.from({ length: 10 }, (_, i) => <span key={i} className="burst-spark" style={{ '--a': `${i * 36 + 8}deg`, '--d': `${46 + (i * 17) % 34}px` } as React.CSSProperties} />)}
                    <span className="burst-banner"><span className="burst-text">{text}</span></span>
                </div>, document.body)}
        </>
    );
}

// A reaction rising from its sender's nameplate (a multiplayer table; the user's call, 3 Nov): the
// token swells out of a little light, bobs and floats up and away; a few at once fan out a little.
function ReactionBursts({ snap }: { snap: Snapshot }) {
    return createPortal(<>{snap.reactions.map(r => <ReactionBurst key={r.key} reaction={r} />)}</>, document.body);
}
function ReactionBurst({ reaction }: { reaction: Snapshot['reactions'][number] }) {
    const [at, setAt] = useState<{ x: number; y: number; way: 'down' | 'side' } | null>(null);
    useLayoutEffect(() => {
        const card = document.querySelector(`[data-player="${CSS.escape(reaction.playerId)}"]`);
        if (!card) return;
        const r = card.getBoundingClientRect();
        const drift = ((reaction.key * 37) % 5 - 2) * 12; // (a few at once don't sit on each other)
        // From a card up top (the bar, a seat by the tray) it bobs on the card and drifts a little down
        // (on a computer the bar sits right over the tray); from a chip in the footer it pops out
        // beside the chip, clear of the slot rail and the dice above.
        const footer = r.top > window.innerHeight * 0.55;
        const x = footer ? r.right + 34 : r.left + r.width / 2 + drift;
        setAt({ x: Math.min(window.innerWidth - 34, Math.max(34, x)), y: r.top + r.height / 2, way: footer ? 'side' : 'down' });
    }, [reaction]);
    if (!at) return null;
    return (
        <div className={`reaction-burst ${at.way}`} style={{ left: at.x, top: at.y }} aria-hidden="true">
            <span className="reaction-glow" />
            <span className="reaction-token">{reactionIcon(reaction.emoji)}</span>
        </div>
    );
}

// Whether a media query matches now, kept up to date.
function useMedia(query: string) {
    const [matches, setMatches] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
    useEffect(() => {
        const list = matchMedia(query);
        const changed = () => setMatches(list.matches);
        list.addEventListener('change', changed);
        changed();
        return () => list.removeEventListener('change', changed);
    }, [query]);
    return matches;
}

// A multiplayer table (the user's call, 3 Nov): nobody sits across, so the other players take the
// space the opponent's portrait had, a row of cards under the header (two rows from five on a
// phone), in turn order, and your own chip stays in the footer. The camera keeps the table below
// the bar (screenInsets.top) and lets it grow into the rest.
function Rivals({ snap, state }: { snap: Snapshot; state: GameState }) {
    // A big screen seats them round the table instead (the user's pick, 3 Nov): a column of cards
    // either side of the tray, like people sitting there; the bar only where the sides are too narrow.
    const seats = useMedia('(min-width: 1180px) and (min-height: 640px)');
    const bar = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = bar.current;
        if (!el) return;
        // The table goes below this: the bar's bottom, or with seats the header's (the points after a
        // throw still get their band under it).
        const measure = () => {
            const top = seats ? (document.querySelector('.hud header')?.getBoundingClientRect().bottom ?? 0) : el.getBoundingClientRect().bottom;
            screenInsets.top = top;
            document.documentElement.style.setProperty('--rivals-bottom', `${Math.round(top)}px`);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        window.addEventListener('resize', measure);
        measure();
        return () => { observer.disconnect(); window.removeEventListener('resize', measure); screenInsets.top = 0; };
    }, [seats]);
    const others = state.playerOrder.filter(id => id !== snap.myId && state.players[id]);
    const card = (id: string) => {
        const p = state.players[id];
        const inRound = state.roundPlayers.includes(id) && p.connected;
        const finished = p.connected && p.score !== null && p.lives > 0;
        return (
            <div key={id} data-player={id} className={`player rival ${id === state.currentTurnId ? 'current' : ''} ${inRound ? '' : 'out'} ${finished ? 'finished' : ''}`}>
                <div className="portrait" style={avatarStyle(playerPortrait(id, p.name, p.avatar))} />
                <div className="who">
                    <FitName name={p.name} />
                    <Hearts lives={p.lives} starting={state.startingLives} fight={fightKey(state)} player={id} />
                </div>
                {/* Their score this round, big once they've finished: what you have to beat (keyed, so
                    it lands with a pop each time it changes). */}
                <div key={`${p.score}:${p.busted}`} className={`score ${scoreClass(state, id)} ${finished ? 'final' : ''}`}>{p.connected ? scoreText(p) : 'Away'}</div>
                <SeatCallout snap={snap} id={id} />
            </div>
        );
    };
    if (seats) {
        const half = Math.ceil(others.length / 2);
        return (
            <div ref={bar} className="rivals seats">
                {others.length === 0 && <span className="rivals-empty">Waiting for travelers to join…</span>}
                <div className="seat-col left">{others.slice(0, half).map(card)}</div>
                <div className="seat-col right">{others.slice(half).map(card)}</div>
            </div>
        );
    }
    return (
        <div ref={bar} className={`rivals count-${Math.min(others.length, 6)} ${others.length > 6 ? 'many' : ''}`}>
            {others.length === 0 && <span className="rivals-empty">Waiting for travelers to join…</span>}
            {others.map(card)}
        </div>
    );
}

// The opponent's name, lives and score on the table edge, under their portrait.
function OpponentPlate({ state, onInfo }: { state: GameState; onInfo: () => void }) {
    const bot = state.players[BOT_ID];
    const name = opponentName();
    if (!bot || (state.tavernRun && !name)) return null; // nobody at the table between fights
    const seated = state.tavernRun ? state.tavernRun.seated ?? state.tavernRun.enemy : null;
    const starting = seated ? seated.lives : state.startingLives;
    return (
        <div className={`opponent-plate ${state.currentTurnId === BOT_ID ? 'current' : ''}`}>
            {seated && <button className="plate-info" onClick={onInfo} aria-label={`About ${seated.name}`} title={`About ${seated.name}`}>i</button>}
            <span className="name">{name ?? bot.name}</span>
            <Hearts lives={bot.lives} starting={starting} fight={fightKey(state)} player={BOT_ID} />
            {state.tavernRun && <AbilityMarks state={state} />}
            {/* Klarg's hand (9 Nov, the user's): the die he snatched, until his turn starts with it kept. */}
            {state.tavernRun?.klargHand && !klargStealing() && (
                <span className="klarg-hand" title={`Klarg has your ${state.tavernRun.klargHand} for his hand`} aria-label={`Klarg holds a ${state.tavernRun.klargHand}`}>
                    <Die value={state.tavernRun.klargHand} />
                </span>
            )}
            <span className={`score ${scoreClass(state, BOT_ID)}`}>{scoreText(bot)}</span>
        </div>
    );
}

// The Salty Swallow's sea (9 Nov, the user's), on the plaque under Roll: a little ship leaning
// the way she lists and rocking, this round's weather and the next's (the forecast). (A chip in
// the header sat over the opponent's bust: the user's call, it moved here.)
const SEA_EFFECT: Record<SeaState['id'], string> = { calm: 'a steady deck', starboard: 'every die +1 (no 1s)', port: 'every die −1 (no 6s)', rogue: 'a wave takes a loose die at the second throw', squall: 'keep two dice from every throw', fog: "neither sees the other's hand", becalmed: 'three throws, then dice stay' };
const SEA_NEXT: Record<SeaState['id'], string> = { calm: 'calm', starboard: 'starboard', port: 'port', rogue: 'heavy seas', squall: 'squall', fog: 'fog', becalmed: 'becalmed' };
function SeaPlaque({ sea, next }: { sea: SeaState; next: SeaState | null }) {
    return (
        <div className={`round-plaque round-sea sea-${sea.id}`} title={`${sea.name}. ${sea.text}${next ? ` Next round: ${next.name}.` : ''}`}>
            <span className="sea-ship" aria-hidden="true">⛵</span> <b>{sea.name}:</b> {SEA_EFFECT[sea.id]}{next && <span className="sea-next"> · Next: {SEA_NEXT[next.id]}</span>}
        </div>
    );
}
// What the line under Roll says: a round's plaque, or the tip. Aboard the Salty Swallow the sea is
// always there (over the tip), taking turns with an opponent's ability when there is one.
// A tap on either opens its explainer (9 Nov, the user's), the same card as the items on your strip.
function HintLine({ badge, plaque, tip, sea, next, powers, face, faces, phase }: { badge: RoundBadge; plaque: boolean; tip: string; sea: SeaState | null; next: SeaState | null; powers: { name: string; text: string }[]; face: number | null; faces: SeaState['id'][] | null; phase?: string | null }) {
    const turnAbout = useTakingTurns(!!sea && !!badge.kind);
    const [open, setOpen] = useState<'sea' | 'ability' | null>(null);
    const close = useCallback(() => setOpen(null), []);
    const showSea = !!sea && (!badge.kind || turnAbout === 1);
    const showAbility = !showSea && (plaque || (!!sea && !!badge.kind));
    const tap = (which: 'sea' | 'ability') => () => { playSound('click'); setOpen(which); };
    return (
        <>
            {showSea ? <button key="sea" className="plaque-button" onClick={tap('sea')} aria-label={`About the sea: ${sea!.name}`}><SeaPlaque sea={sea!} next={next} /></button>
                : showAbility ? (
                    <button key="ability" className="plaque-button" onClick={tap('ability')} aria-label={`About ${badge.title}`}>
                        <div className={`round-plaque round-${badge.kind}`}><b>{badge.title}:</b> {badge.text}</div>
                    </button>
                ) : tip}
            {open === 'sea' && sea && <SeaInfo sea={sea} face={face} faces={faces} phase={phase} onClose={close} />}
            {open === 'ability' && badge.kind && <AbilityInfo badge={badge} powers={powers} onClose={close} />}
        </>
    );
}

// The sea's explainer: what this round's does, the forecast, and how the sea works.
const SEA_EXPLAIN: Record<SeaState['id'], string> = {
    starboard: 'The ship leans to starboard: every die thrown lands one higher. A 1 becomes a 2, a 5 a 6, and a 6 stays a 6, so there are no 1s and 6s come twice as often.',
    port: 'The ship leans to port: every die thrown lands one lower. A 6 becomes a 5, a 2 a 1, and a 1 stays a 1, so there are no 6s, and no hand can reach 24 this round.',
    calm: 'A steady deck: the dice land as they fall.',
    squall: 'A squall: rain and wind lash the deck, and every hand must keep two dice from each throw instead of one (or every die left, if only one or two were thrown). Hands are rushed: a 2 or a 4 is easy to miss. Your opponent keeps two as well.',
    becalmed: "Becalmed: the wind drops and the sails hang slack. Each hand gets three throws, and whatever dice the third leaves stay just as they lie: no fourth throw, so keep a 2 and a 4 early. Your opponent has three as well.",
    fog: "A fog bank: neither side can see across the table. Your opponent's dice land hidden and stay hidden, and their score with them, until both hands are done; they can't see yours either. You play to a target you can't see, so going second is no help this round.",
    rogue: "Heavy seas: as each hand's second throw is made, a rogue wave crosses the deck and one loose die, at random, goes over the rail. That hand finishes with five dice, so the best it can score is 18. Keep your 2 and your 4 the moment they show. (If only one loose die is left, the wave spares it.)"
};
// Jaguar's dial follows his phase (10 Nov): what it is now, in words.
const JAGUAR_SEA: Record<string, string> = {
    talk: "In the eye of the storm while Jaguar talks: calm, or a fog bank. His Cloak brings the storm wall, and All In every wave at once.",
    cloak: "The storm wall, since Jaguar drew his Cloak: squalls and rogue waves. On his last heart it's rogue waves all round.",
    allIn: "All In: the storm at its worst, a rogue wave on every face between the lists."
};
function SeaInfo({ sea, face, faces, phase, onClose }: { sea: SeaState; face: number | null; faces: SeaState['id'][] | null; phase?: string | null; onClose: () => void }) {
    // This leg's dial in words: e.g. "1 port · 2-5 calm · 6 starboard".
    const ranges: string[] = [];
    (faces ?? []).forEach((id, i) => {
        const last = ranges.length && ranges[ranges.length - 1].endsWith(` ${id}`) ? ranges.pop()! : null;
        ranges.push(last ? `${last.split(' ')[0].split('-')[0]}-${i + 1} ${id}` : `${i + 1} ${id}`);
    });
    return (
        <ItemInfo icon={faces ? <span className="sea-info-dial" style={{ '--to': `${face ? faceAngle(face) : 0}deg` } as React.CSSProperties}><SeaDial faces={faces} face={face} /></span> : <span className={`sea-info-ship sea-${sea.id}`}><span className="sea-ship">⛵</span></span>} kind="The sea, this round" name={sea.name} onClose={onClose}
            text={<>
                <p>{SEA_EXPLAIN[sea.id]}</p>
                {face && <p><b>The sea die showed {face}.</b></p>}
                {ranges.length > 0 && <p><b>Out here:</b> {ranges.join(' · ')}.</p>}
                {phase && JAGUAR_SEA[phase] && <p>{JAGUAR_SEA[phase]}</p>}
                <p className="item-small">Aboard the Salty Swallow every round from the second begins with a roll of the sea die. The sea leans everyone's dice, the opponent's too. A 2 and a 4 come up as often as ever.</p>
            </>} />
    );
}

// An opponent's ability (or a round's effect) on the plaque: its painting and what it does.
const KIND_ABILITY: Record<string, string> = { curse: 'You are Cursed', ink: 'Inkfire Brand', stare: 'Penitent Stare', smite: 'Divine Smite', mind: 'Mind Whip', devil: 'Sympathy for the Devil', cloak: 'The Cloak', allin: 'All In' };
function AbilityInfo({ badge, powers, onClose }: { badge: RoundBadge; powers: { name: string; text: string }[]; onClose: () => void }) {
    const name = KIND_ABILITY[badge.kind] ?? badge.title;
    const power = powers.find(p => p.name === name || p.name === badge.title);
    const art = ABILITY_ART[name] ?? ABILITY_ART[badge.title];
    return (
        <ItemInfo icon={art ? <img src={`${import.meta.env.BASE_URL}art/${art}`} alt="" draggable={false} /> : '✦'} kind="This round" name={badge.title} onClose={onClose}
            text={<>
                <p><b>{badge.text}.</b></p>
                {power && power.text !== badge.text && <p>{power.text}</p>}
            </>} />
    );
}
// Two plaques wanting the one line (the sea and an opponent's ability): they take turns.
function useTakingTurns(both: boolean, ms = 3500) {
    const [which, setWhich] = useState(0);
    useEffect(() => {
        if (!both) { setWhich(0); return; }
        const timer = setInterval(() => setWhich(w => 1 - w), ms);
        return () => clearInterval(timer);
    }, [both, ms]);
    return which;
}

// The opponent's ability on their nameplate: one ✦ per use this fight, lit while it's left and
// dark once spent. The plate flashes when one is spent.
// The opponent's ✦ marks: all of them (the nameplate), or one power's own (`power`: its place in
// `powers`, on the entrance card).
function AbilityMarks({ state, power }: { state: GameState; power?: number }) {
    const run = state.tavernRun!;
    const enemy = run.seated ?? run.enemy;
    const ability = enemy.ability;
    const own = power !== undefined ? run.powerMarks?.[power] : undefined;
    const max = own ? own[0] : run.abilityMax ?? 0;
    if (!ability || !max) return null;
    const raw = run.abilityUsed?.[ability];
    const used = Math.min(max, own ? own[1] : run.abilitySpent ?? (raw === true ? 1 : Number(raw || 0)));
    const name = own ? enemy.powers?.[power!]?.name ?? '' : Rules.ABILITY_NAMES[ability as keyof typeof Rules.ABILITY_NAMES] ?? ability;
    const several = !own && (enemy.powers?.length ?? 1) > 1;
    const label = several ? `Abilities: ${max - used} of ${max} uses left this fight` : `${name}: ${max - used} of ${max} left this fight`;
    return (
        <span key={used} className={`ability-marks ${used > 0 ? 'spent-now' : ''}`} title={label} aria-label={label}>
            {Array.from({ length: max }, (_, i) => <span key={i} className={i < max - used ? 'left' : 'used'}>✦</span>)}
        </span>
    );
}

// Always the same size, whoever's turn it is, so the table doesn't shift between turns.
function TurnControls({ snap }: { snap: Snapshot }) {
    const turn = snap.turn;
    if (!turn) return <div className="controls" />;
    const hiddenLocked = turn.dice.some(d => d.hidden && d.status !== 'active');
    const scoring = Rules.scoreDice(turn.dice);
    // A Steady Thonic: a dust hand scores its dice as they lie.
    const dust = turn.finalized && !!turn.outcome?.busted && !turn.steady;
    const scoreText = dust ? 'X' : hiddenLocked ? '?' : String(scoring.score);
    const state = snap.state;
    const goal = state && !snap.waiting ? scoreToBeat(state, turn.playerId) : null;
    const roller = state?.players[turn.playerId];
    // Green once the dice already beat it (with the 2 and 4 in hand), amber on a tie.
    const low = !!state && cursed(state);
    const standing = typeof goal?.target === "number" && !hiddenLocked && scoring.has2 && scoring.has4
        ? ((low ? scoring.score < goal.target : scoring.score > goal.target) ? 'ahead' : scoring.score === goal.target ? 'level' : '')
        : '';

    let label = 'Roll Dice';
    let disabled = !turn.canRoll;
    if (snap.rolling) { label = 'Rolling…'; disabled = true; }
    else if (turn.finalized || handComplete(turn)) { label = snap.endingTurn ? 'Ending…' : 'End Turn'; disabled = snap.endingTurn; }

    const badge = state ? roundEffectHint(state, turn.playerId === snap.myId, turn) : NO_BADGE;
    const tip = snap.isMyTurn && snap.putBackSlot !== null ? 'Tap a kept die to put it back'
        : snap.isMyTurn && turn.hasRolled && !turn.finalized && !snap.rolling && !turn.canRoll && turn.locksThisRoll < keepsNeeded(turn)
            ? (keepsNeeded(turn) >= 2 ? (turn.locksThisRoll === 0 ? 'Squall: keep two dice, then roll again' : 'Squall: keep one more die')
                // (Becalmed: how many throws the hand has left.)
                : turn.maxThrows && turn.maxThrows - turn.rollCount === 1 ? 'Keep some: your last throw, and they stay as they lie'
                : turn.maxThrows ? `Becalmed: ${turn.maxThrows - turn.rollCount} throws left`
                : 'Tap dice to keep them, then roll again')
            : '';
    // (Rokr's stars come before the tip: which faces can't be kept is what you need to know.)
    const badgeFirst = badge.kind === 'stars' || !tip;
    const plaque = badgeFirst && !!badge.kind;

    return (
        <div className="controls">
            {goal ? (
                <div className="goal">
                    <span className="label">{goal.target != null && !snap.isMyTurn && roller ? `${roller.name} must ${low ? 'stay under' : 'beat'}` : goal.label}</span>
                    {goal.target != null && <span className="target">{goal.target}</span>}
                </div>
            ) : state && !snap.waiting && (
                // First to roll: nothing to beat yet. Keeps its space so the table doesn't move.
                <div className="goal placeholder" aria-hidden="true"><span className="label">Score to beat</span><span className="target">0</span></div>
            )}
            <div className="turn-score">
                <span className="label">Turn score</span>
                <span className={`value ${dust ? 'dust' : standing}`}>{scoreText}</span>
            </div>
            <button
                className={`roll ${turn.finalized || handComplete(turn) ? 'end' : ''} ${snap.isMyTurn ? '' : 'idle'}`}
                disabled={disabled || !snap.isMyTurn}
                onClick={actions.roll}
                aria-hidden={!snap.isMyTurn}
            >{snap.isMyTurn ? label : roller ? `${roller.name}'s turn` : label}</button>
            {/* A hot tub fight: its badge can take two lines on small phones, so the space is kept the whole fight (the table doesn't jump when a tip replaces it). */}
            <div className={`hint ${state?.tavernRun ? 'crawl' : ''} ${state?.tavernRun?.tubSurge && state.tavernRun.tubSurge.id !== 'pruney' ? 'tub-fight' : ''}`}>
                <HintLine badge={badge} plaque={plaque} tip={tip} sea={state?.tavernRun?.sea ?? null} next={state?.tavernRun?.nextSea ?? null}
                    powers={(state?.tavernRun ? (state.tavernRun.seated ?? state.tavernRun.enemy).powers : null) ?? []}
                    face={state?.tavernRun?.seaFace ?? null} faces={state?.tavernRun?.seaFaces ?? null} phase={state?.tavernRun?.jaguarPhase ?? null} />
            </div>
        </div>
    );
}

// Keepsakes won so far in a Tavern Crawl (the encounter number is on the nameplate).
function TavernStrip({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun;
    if (!run) return null;
    return (
        <div className="tavern-strip">
            <span className="purse" aria-label={coins(run.purse)}><span aria-hidden="true">🪙</span> {run.purse}</span>
            <Shelf snap={snap} state={state} />
            {/* Keepsakes as small round pictures, not names, so a few fit beside your chip
                (the user, 21 Oct). Tap one for its info panel; it dims once spent this fight. */}
            {(run.keepsakes.length > 0 || run.ladysGrace || run.bard?.words || run.bard?.song || run.kram?.now || run.omen || run.notaro) && (
                <span className="keepsake-row">
                    {run.keepsakes.map(k => k.id === 'marthasMask'
                        ? <MaskKeepsake key={k.id} snap={snap} state={state} />
                        : k.id === 'mysteryFlavour' ? <MysteryKeepsake key={k.id} snap={snap} state={state} />
                        : <KeepsakeIcon key={k.id} icon={keepsakeIcon(k.id)} name={k.name} text={k.text} spent={!!run.encounterKeepsakeUses?.[k.id] && ONCE_A_FIGHT.has(k.id)} />)}
                    {run.ladysGrace && <KeepsakeIcon icon={keepsakeIcon('ladysGrace')} name="The Lady's Grace" text="The next time you'd lose a heart to dust, the Lady saves you." kind="A blessing" blessing />}
                    {run.bard?.words && <KeepsakeIcon icon={keepsakeIcon('cuttingWords')} name="Cutting Words" text={`The Bard's song: ${run.enemy.name}'s first hand that counts this fight scores 3 less.`} kind="A song" blessing />}
                    {run.bard?.song && <SongKeepsake snap={snap} state={state} />}
                    {run.omen && <KeepsakeIcon icon={keepsakeIcon(run.omen.id)} name={run.omen.name} text={run.omen.text.replace(' next fight', ' this fight')} kind={run.omen.good ? 'A good omen' : 'A bad omen'} blessing />}
                    {run.notaro && <KeepsakeIcon icon={keepsakeIcon('notaroRed')} name="Notaro Red" text="Your first hand that counts this fight scores 2 more." kind="A refreshment" blessing />}
                    {run.kram?.now && <KeepsakeIcon icon={keepsakeIcon('kram')} name="Sworn to Kram" text={run.kram.more ? `Your dice never land on 1, this fight and the next${run.kram.more > 1 ? ` ${run.kram.more}` : ''}.` : 'Your dice never land on 1 this fight.'} kind="Fealty" blessing />}
                </span>
            )}
        </div>
    );
}

// Keepsakes that work once a fight (dimmed once they have).
const ONCE_A_FIGHT = new Set(['bentCopper', 'luckySeat', 'velvetCushion', 'marthasMask', 'bottomlessFlask', 'mysteryFlavour']);

// Any item's info panel, opened by a tap on it (6 Nov, the user's: like an opponent's card, and it
// replaces the toast that went away by itself). An item that can be used now has its button here.
interface ItemAction { label: string; note?: string; run: () => void }
function ItemInfo({ icon, kind, name, text, status, actions: buttons = [], onClose }: { icon: React.ReactNode; kind: string; name: string; text: React.ReactNode; status?: string; actions?: ItemAction[]; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(
        <div className="item-veil" role="dialog" aria-label={name} onClick={onClose}>
            <div className="item-card">
                <span className="item-picture" aria-hidden="true">{icon}</span>
                <span className="item-kind">{kind}</span>
                <span className="item-name">{name}</span>
                <div className="item-text">{text}</div>
                {status && <span className="item-status">{status}</span>}
                {buttons.map(b => (
                    <button key={b.label} className="primary item-use" onClick={e => { e.stopPropagation(); onClose(); b.run(); }}>
                        {b.label}{b.note && <small>{b.note}</small>}
                    </button>
                ))}
                <span className="tap">Tap to close</span>
            </div>
        </div>,
        document.body
    );
}

function KeepsakeIcon({ icon, name, text, spent = false, blessing = false, kind = 'A keepsake' }: { icon: React.ReactNode; name: string; text: string; spent?: boolean; blessing?: boolean; kind?: string }) {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    return (
        <>
            <button className={`keepsake-icon ${spent ? 'spent' : ''} ${blessing ? 'blessing' : ''}`} aria-label={`About ${name}`} onClick={() => { playSound('click'); setOpen(true); }}>
                <span aria-hidden="true">{icon}</span>
            </button>
            {open && <ItemInfo icon={icon} kind={kind} name={name} text={text} status={spent ? 'Used this fight' : undefined} onClose={close} />}
        </>
    );
}

// Martha's mask: lit when it can be worn (your turn, once a fight, in a round no one has played
// a trick in yet). Danhausen's Curse before you roll; the Duke's Devil any time in your turn
// with three or more dice to throw (the user's call, 21 Oct): the next throw lands three 6s.
// A tap opens its panel, with its choices when it can be worn.
const MASK_TEXT = "Once a fight: wear Danhausen's Curse before you roll (lowest valid score wins the round), or the Duke's Devil any time in your turn with three or more dice to throw (your next throw lands three 6s).";

function MaskKeepsake({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const turn = snap.turn;
    const [open, setOpen] = useState(false);
    const ready = !!run.maskReady && snap.isMyTurn && !!turn && !turn.finalized && !run.roundEffect && !snap.rolling;
    const curse = ready && !turn!.hasRolled;
    const devil = ready && turn!.dice.filter(d => d.status === 'active').length >= 3;
    const usable = curse || devil;
    const close = useCallback(() => setOpen(false), []);
    const devilNote = state.tavernRun?.devilCap != null ? `three 6s; they max ${state.tavernRun.devilCap}` : turn?.hasRolled ? 'next throw: three 6s' : 'three 6s for you';
    return (
        <>
            <button className={`keepsake-icon ${usable ? 'usable' : ''} ${run.maskReady ? '' : 'spent'}`} aria-label="About Martha's Mask" onClick={() => { playSound('click'); setOpen(true); }}>
                <span aria-hidden="true">{keepsakeIcon('marthasMask')}</span>
            </button>
            {open && <ItemInfo icon={keepsakeIcon('marthasMask')} kind="A keepsake" name="Martha's Mask" text={MASK_TEXT} status={run.maskReady ? undefined : 'Used this fight'} onClose={close} actions={[
                ...(curse ? [{ label: 'Wear the Curse', note: 'lowest wins', run: () => actions.wearMask('curse') }] : []),
                ...(devil ? [{ label: 'Wear the Devil', note: devilNote, run: () => actions.wearMask('devil') }] : [])
            ]} />}
        </>
    );
}

// Mystery Flavour, Martha's Elf Bar (4 Nov): once a fight it works as this fight's flavour does
// (one of Johnny's four, drawn as the fight starts; its painting shows which). Lit when that
// flavour could be puffed now; a tap opens its panel, with "Puff" when it can be.
const ELF_BAR_NAMES: Record<string, string> = { purpleHaze: 'Purple Haze', cottonCandyCloud: 'Cotton Candy Cloud', lemonLevitation: 'Lemon Levitation', watermelonHindsight: 'Watermelon Hindsight' };
const ELF_BAR_TEXT: Record<string, string> = {
    purpleHaze: 'after a throw showing a 1, while you still need a 2 or a 4: that 1 becomes it',
    cottonCandyCloud: "on your turn, while your opponent is still to throw: they play this round without seeing your score",
    lemonLevitation: 'after a throw: throw again without keeping a die',
    watermelonHindsight: 'undo your last throw: those dice are thrown again'
};

function MysteryKeepsake({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const mystery = run.mystery;
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const flavour = mystery?.flavour ?? 'purpleHaze';
    const usable = !!mystery?.ready && drinkable({ id: flavour, name: '', text: '', price: 0, drink: true, elf: true } as Thonic, snap, state);
    const taste = ELF_BAR_TEXT[flavour];
    return (
        <>
            <button className={`keepsake-icon ${usable ? 'usable' : ''} ${mystery?.ready ? '' : 'spent'}`} aria-label="About Mystery Flavour" onClick={() => { playSound('click'); setOpen(true); }}>
                <span aria-hidden="true">{mysteryIcon(flavour)}</span>
            </button>
            {open && (
                <ItemInfo icon={mysteryIcon(flavour)} kind="A keepsake" name="Mystery Flavour" status={mystery?.ready ? undefined : 'Puffed this fight'} onClose={close}
                    text={<>
                        <p>Martha's own Elf Bar. It never runs out: one puff a fight, and each fight it tastes of one of Johnny's four, at random.</p>
                        <p><b>This fight: {ELF_BAR_NAMES[flavour]}.</b> {taste[0].toUpperCase() + taste.slice(1)}.</p>
                    </>}
                    actions={usable ? [{ label: 'Puff', note: ELF_BAR_NAMES[flavour], run: actions.puffMystery }] : []} />
            )}
        </>
    );
}

// Mystery Flavour's picture: the user's painting of Martha's brass vape (4 Nov), with a dot in
// this fight's flavour's colour on the strip (none on the invitation, where no fight has chosen one).
function mysteryIcon(flavour?: string) {
    return (
        <span className="mystery-art">
            <img className="item-art" src={`${import.meta.env.BASE_URL}art/keepsakes/mysteryFlavour.webp`} alt="" draggable={false} />
            {flavour && <i className={`flavour-dot ${flavour}`} />}
        </span>
    );
}

// The Bard's Inspiring Song: right after your first throw of the fight, before you keep a die,
// it lights up; a tap opens its panel, with "Throw again" while it can be.
function SongKeepsake({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const turn = snap.turn;
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const usable = run.bard?.song === 'now' && snap.isMyTurn && !!turn && !turn.finalized && !snap.rolling
        && turn.dice.every(d => d.status === 'active' || d.mind);
    const text = "The Bard's song: right after your first throw this fight, you may throw it all again.";
    return (
        <>
            <button className={`keepsake-icon blessing ${usable ? 'usable' : ''}`} aria-label="About Inspiring Song" onClick={() => { playSound('click'); setOpen(true); }}>
                <span aria-hidden="true">{keepsakeIcon('inspiringSong')}</span>
            </button>
            {open && <ItemInfo icon={keepsakeIcon('inspiringSong')} kind="A song" name="Inspiring Song" text={text} onClose={close} actions={usable ? [{ label: 'Throw again', run: actions.inspiringSong }] : []} />}
        </>
    );
}

// The Thonics with the user's paintings (29 Oct; art/thonic-<id>.jpg, cut out to art/thonics/<id>.webp).
const PAINTED_THONICS = new Set(['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye']);

// A Thonic's bottle: its painting, or a small bottle drawn in CSS (the colour says which).
function Bottle({ thonic }: { thonic: Thonic | null }) {
    if (thonic?.elf) return <Vape bar={thonic} />;
    if (thonic && PAINTED_THONICS.has(thonic.id)) {
        return <span className={`bottle painted ${thonic.id}`} aria-hidden="true"><img src={`${import.meta.env.BASE_URL}art/thonics/${thonic.id}.webp`} alt="" draggable={false} /></span>;
    }
    return <span className={`bottle ${thonic ? thonic.id : 'empty'}`} aria-hidden="true"><span className="liquid" /></span>;
}

// An Elf Bar: a slim vape in its flavour's colour, with a dot for each puff left (dim once
// puffed this fight).
function Vape({ bar }: { bar: Thonic }) {
    // (The user's paintings since 29 Oct: art/elfbar-<id>.jpg, cut out to art/elfbars/<id>.webp.)
    return (
        <span className={`vape ${bar.id} ${bar.puffed ? 'puffed' : ''} painted`} aria-hidden="true">
            <img src={elfBarArt(bar.id)} alt="" draggable={false} />
            {bar.puffs !== undefined && <span className="puffs">{Array.from({ length: bar.puffs }, (_, i) => <i key={i} />)}</span>}
        </span>
    );
}

const elfBarArt = (id: string) => `${import.meta.env.BASE_URL}art/elfbars/${id}.webp`;
const ELF_BARS = new Set(['purpleHaze', 'cottonCandyCloud', 'lemonLevitation', 'watermelonHindsight']);

// When a Thonic can be drunk, always on your own turn (the server checks the same):
// Healing and Clear-Eye before you roll (Clear-Eye while the opponent's ability has uses left,
// one at a time); Fizzy after a roll that shows 1s; Second Thoughts
// after a roll, once you've kept a die; Steady any time, once a turn.
function drinkable(t: Thonic, snap: Snapshot, state: GameState) {
    const turn = snap.turn;
    const me = snap.myId ? state.players[snap.myId] : null;
    const run = state.tavernRun;
    if (!t.drink || !me || !run || !turn || !snap.isMyTurn || snap.rolling || snap.endingTurn) return false;
    switch (t.id) {
        case 'healing': return !turn.hasRolled && me.lives < state.startingLives;
        case 'clearEye': return !turn.hasRolled && !!run.enemy.ability && !!run.abilityLeft && !run.clearEye;
        case 'fizzy': return turn.hasRolled && !turn.finalized && turn.dice.some(d => d.status === 'active' && !d.hidden && d.value === 1);
        case 'secondThoughts': return turn.dice.some(d => canPutBack(turn, d.status));
        case 'steady': return !turn.steady;
        // Elf Bars: one puff a fight (the server checks the same).
        case 'purpleHaze': {
            if (t.puffed || !turn.hasRolled || turn.finalized) return false;
            const kept = turn.dice.filter(d => d.status !== 'active' && d.status !== 'stolen').map(d => d.value);
            return (!kept.includes(2) || !kept.includes(4)) && turn.dice.some(d => d.status === 'active' && !d.hidden && !d.bound && d.value === 1);
        }
        case 'cottonCandyCloud': {
            const bot = state.players[BOT_ID];
            return !t.puffed && !run.cloud && !turn.finalized && !!bot && state.roundPlayers.includes(BOT_ID) && bot.score === null;
        }
        case 'lemonLevitation': return !t.puffed && turn.hasRolled && !turn.finalized && turn.locksThisRoll === 0 && !turn.canRoll;
        case 'watermelonHindsight': return !t.puffed && turn.hasRolled;
        default: return false;
    }
}

// The Thonics you carry. One lights up when it can be drunk. A tap opens its panel, with its Drink or
// Puff button when it can be used. Second Thoughts then asks you to tap the kept die to put back.
function Shelf({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const [openSlot, setOpenSlot] = useState<number | null>(null);
    const close = useCallback(() => setOpenSlot(null), []);
    // (A shelf can hold more than its size for a while: the Potion Belt left behind for a boss's
    // keepsake keeps the Thonic in its slot until it's drunk. 10 Nov.)
    const slots = Array.from({ length: Math.max(run.shelfSize, run.shelf.length) }, (_, i) => run.shelf.at(i) ?? null);
    const open = openSlot !== null ? slots[openSlot] : null;
    const canUse = !!open && drinkable(open, snap, state);
    return (
        <span className="shelf" aria-label="Thonics">
            {slots.map((t, i) => {
                const choosing = snap.putBackSlot === i;
                const usable = !!t && (choosing || drinkable(t, snap, state));
                return (
                    <button
                        key={i}
                        className={`shelf-slot ${usable ? 'usable' : t ? 'idle' : ''} ${choosing ? 'armed' : ''}`}
                        disabled={!t}
                        title={t ? t.name : 'Empty'}
                        aria-label={t ? (choosing ? `Cancel ${t.name}` : `About ${t.name}`) : 'Empty shelf slot'}
                        onClick={() => {
                            if (!t) return;
                            if (choosing) { actions.cancelPutBack(); return; }
                            playSound('click');
                            setOpenSlot(i);
                        }}
                    >
                        <Bottle thonic={t} />
                        {choosing && <span className="drink-label">Pick a die</span>}
                    </button>
                );
            })}
            {open && openSlot !== null && (
                <ItemInfo icon={itemPicture(open)} kind={open.elf ? 'An Elf Bar' : 'A Thonic'} name={open.name} text={open.text} onClose={close}
                    status={open.elf ? `${open.puffs} puff${open.puffs === 1 ? '' : 's'} left${open.puffed ? ', puffed this fight' : ''}` : undefined}
                    actions={canUse ? [{ label: open.elf ? 'Puff' : 'Drink', run: () => { if (open.id === 'secondThoughts') actions.startPutBack(openSlot); else actions.drinkThonic(openSlot); } }] : []} />
            )}
        </span>
    );
}

// An item's picture on its panel: the painting alone, large.
function itemPicture(t: Thonic) {
    if (t.elf) return <img className="item-art" src={elfBarArt(t.id)} alt="" draggable={false} />;
    if (PAINTED_THONICS.has(t.id)) return <img className="item-art" src={`${import.meta.env.BASE_URL}art/thonics/${t.id}.webp`} alt="" draggable={false} />;
    return <Bottle thonic={t} />;
}

// Shown on a classic table until a second player arrives.
function WaitingCard({ snap }: { snap: Snapshot }) {
    return (
        <div className="panel waiting-card">
            <h2>Waiting for friends</h2>
            <p>Your table is <strong className="table-code">{snap.roomCode}</strong></p>
            <button className="primary" onClick={actions.share}>Share invite link</button>
            <p className="fine">Friends can also type the code on the start screen.</p>
        </div>
    );
}

// A big "Your turn!" when play comes round to you.
function YourTurnBanner({ at }: { at: number }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (!at) return;
        setVisible(true);
        const timer = setTimeout(() => setVisible(false), 1600);
        return () => clearTimeout(timer);
    }, [at]);
    return visible ? <div key={at} className="your-turn" aria-live="assertive">Your turn!</div> : null;
}

// A picture for each keepsake card.
// Keepsakes with the user's paintings (29 Oct; art/keepsake-<id>.jpg, cut out to art/keepsakes/<id>.webp).
// The others (the blessings and songs) keep their emoji.
const PAINTED_KEEPSAKES = new Set(['bentCopper', 'velvetCushion', 'luckySeat', 'loyaltyCard', 'potionBelt', 'loadedDie', 'marthasMask', 'brodorsSunglasses',
    // ...and the blessings and the Bard's songs (shown the same way, on the strip and in their moments).
    'ladysGrace', 'cuttingWords', 'inspiringSong', 'kram',
    // ...and the three of 30 Oct, and Martha's Elf Bar (4 Nov).
    'misersPurse', 'gamblersCharm', 'bottomlessFlask', 'mysteryFlavour',
    // ...and the Salty Swallow's omens and refreshments (9 Nov).
    'notaroRed', 'ebonShield', 'fairWinds', 'followingSea', 'albatross', 'blackSpot']);
function keepsakeIcon(id: string): React.ReactNode {
    if (id === 'mysteryFlavour') return mysteryIcon();
    if (PAINTED_KEEPSAKES.has(id)) return <img className="item-art" src={`${import.meta.env.BASE_URL}art/keepsakes/${id}.webp`} alt="" draggable={false} />;
    return KEEPSAKE_ICONS[id] ?? '✦';
}

const KEEPSAKE_ICONS: Record<string, string> = {
    bentCopper: '🛡️',
    luckySeat: '🃏',
    velvetCushion: '🪶',
    loadedDie: '🎲',
    potionBelt: '🧪',
    loyaltyCard: '🎫',
    marthasMask: '🎭',
    brodorsSunglasses: '🕶️',
    // The Bard's songs and fealty to Kram (not keepsakes, but shown the same way).
    cuttingWords: '🗡️',
    inspiringSong: '🎶',
    kram: '🔱',
    // 30 Oct (their emoji, before the paintings came).
    misersPurse: '💰',
    gamblersCharm: '🍀',
    bottomlessFlask: '⚗️',
    // The Salty Swallow's: Yvesil's omens and Jorvash's refreshments.
    fairWinds: '⛵',
    followingSea: '🌊',
    albatross: '🕊️',
    blackSpot: '⚫',
    notaroRed: '🍷',
    ebonShield: '💧',
    // Elf Bars, as they're puffed.
    purpleHaze: '🌫️',
    cottonCandyCloud: '🍭',
    lemonLevitation: '🍋',
    watermelonHindsight: '🍉'
};

// After beating an opponent: three keepsakes dealt as cards. Tap one to pick it up, then
// take it (two steps, so a stray tap on a phone doesn't decide the run).
function KeepsakeCards({ defeated, nextEnemy, transitionMessage, choices }: { defeated: string; nextEnemy: string; transitionMessage: string | null; choices: Keepsake[] }) {
    const [picked, setPicked] = useState<string | null>(null);
    const chosen = choices.find(c => c.id === picked);
    return (
        <div className="modal-backdrop">
            <div className="keepsake-offer">
                <h2>{transitionMessage ?? `${defeated} leaves the table.`}</h2>
                <p className="next-up">
                    <span className="mini-portrait" style={avatarStyle(portraitFor(nextEnemy))} />
                    <span>Next: <strong>{nextEnemy}</strong>. Choose a keepsake.</span>
                </p>
                <div className="keepsake-cards">
                    {choices.map((c, i) => (
                        <button
                            key={c.id}
                            className={`keepsake-card ${picked === c.id ? 'picked' : ''} ${picked && picked !== c.id ? 'passed' : ''}`}
                            style={{ animationDelay: `${i * 0.12}s` }}
                            onClick={() => { setPicked(c.id); playSound('click'); }}
                            aria-pressed={picked === c.id}
                        >
                            <span className="icon" aria-hidden="true">{keepsakeIcon(c.id)}</span>
                            <strong>{c.name}</strong>
                            <span className="text">{c.text}</span>
                        </button>
                    ))}
                </div>
                <button className="primary take" disabled={!chosen} onClick={() => chosen && actions.chooseKeepsake(chosen.id)}>
                    {chosen ? `Take ${chosen.name}` : 'Tap a card'}
                </button>
            </div>
        </div>
    );
}

// Counts up to a number, for the gold total.
function useCountUp(target: number, ms = 1200) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        let frame = 0;
        const start = performance.now();
        const tick = () => {
            const t = Math.min(1, (performance.now() - start) / ms);
            setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
            if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, ms]);
    return value;
}

// The end of a Tavern Crawl: how far you got, the points, and the leaderboard (by points since
// 23 Oct: the opponents beaten, the hearts spared, how far a lost run got, and the gold left).
function TavernOver({ summary, leaderboard, met }: { summary: TavernSummary; leaderboard: Snapshot['leaderboard']; met?: string[] }) {
    const points = useCountUp(summary.points);
    const b = summary.breakdown;
    const rows: [string, string][] = [
        ['Opponents beaten', String(b.fights)],
        ['Hearts spared', String(b.hearts)],
        ...(b.perfect ? [['Perfect 24s', String(b.perfect)] as [string, string]] : []),
        ...(b.reached ? [['How far you got', String(b.reached)] as [string, string]] : []),
        [`Gold left · ${coins(b.purse)}`, String(b.gold)]
    ];
    // Your best on the board (the board keeps each name's best run).
    const mine = leaderboard.findIndex(e => e.name === summary.name);
    const board = leaderboard.slice(0, 8);
    return (
        <div className="modal-backdrop">
            <div className={`panel run-over ${summary.won ? 'won' : 'lost'}`}>
                <h1>{summary.won ? 'Victory!' : 'Run over'}</h1>
                <p className="subtitle">
                    {summary.won ? 'You won the final aboard the Salty Swallow.' : summary.fellTo === 'Sperm McGrath' ? "You couldn't beat Sperm?" : `${summary.fellTo} ended your run.`}
                </p>
                <ol className="crawl-path" aria-label="Opponents">
                    {summary.encounters.map((name, i) => {
                        const state = i < summary.defeated ? 'beaten' : name === summary.fellTo ? 'fell' : 'unmet';
                        // Someone you have never sat down with (in any run) stays a "?" (the user, 3 Nov).
                        const id = summary.encounterIds?.[i];
                        if (met && id && !met.includes(id)) {
                            return (
                                <li key={name} className="unmet unknown" title="Not met yet" aria-label="Someone you haven't met yet">
                                    <span className="mini-portrait unknown-face" />
                                </li>
                            );
                        }
                        return (
                            <li key={name} className={state} title={name} aria-label={`${name}: ${state === 'beaten' ? 'beaten' : state === 'fell' ? 'lost to' : 'not reached'}`}>
                                <span className="mini-portrait" style={avatarStyle(portraitFor(name))} />
                                <span className="mark" aria-hidden="true">{state === 'beaten' ? '✓' : state === 'fell' ? '✗' : ''}</span>
                            </li>
                        );
                    })}
                </ol>
                <div className="gold">
                    <span className="coin" aria-hidden="true">🏆</span>
                    <span className="amount">{points.toLocaleString()}</span>
                    <span className="unit">points</span>
                </div>
                <dl className="gold-rows">
                    {rows.map(([label, value]) => (
                        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                    ))}
                </dl>
                {board.length > 0 && (
                    <div className="leaderboard">
                        <h2>Leaderboard</h2>
                        <ol>
                            {board.map((e, i) => (
                                <li key={e.name} className={i === mine ? 'me' : ''}>
                                    <span className="rank">{i + 1}</span>
                                    <span className="who">{e.name}</span>
                                    <span className="gold-amount">{(e.points ?? 0).toLocaleString()}</span>
                                </li>
                            ))}
                        </ol>
                        {mine >= board.length && <p className="fine">Your best: #{mine + 1} with {(leaderboard[mine].points ?? 0).toLocaleString()} points</p>}
                    </div>
                )}
                <div className="row">
                    <button className="primary" onClick={actions.playAgain}>New run</button>
                    <button className="secondary" onClick={actions.leave}>Leave</button>
                </div>
            </div>
        </div>
    );
}



// Shows something for `ms` after `at` (a performance.now() time), then hides it.
function useMoment(at: number, ms: number) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (!at) return;
        setVisible(true);
        const timer = setTimeout(() => setVisible(false), Math.max(0, ms - (performance.now() - at)));
        return () => clearTimeout(timer);
    }, [at, ms]);
    const hide = useCallback(() => setVisible(false), []);
    return [visible, hide] as const;
}

// A perfect hand (since 23 Oct, the user's): "Perfect 24!" in gold with a burst of light and
// sparks; in a cursed round, where the lowest hand wins, four 1s with the 2 and 4 get "Perfect
// ...4?" in Danhausen's violet and white, not quite sure of itself. In the middle of the green felt
// (since 24 Oct); the opponent's name with it when it's theirs.
function Celebration({ snap }: { snap: Snapshot }) {
    const c = snap.celebration;
    const [visible] = useMoment(c?.at ?? 0, CELEBRATION_MS);
    if (!visible || !c) return null;
    const four = c.kind === 'perfect4';
    return (
        <div key={c.at} className={`celebration ${four ? 'perfect4' : 'perfect24'}`} aria-live="polite">
            <div className="celebration-rays" aria-hidden="true" />
            <div className="celebration-text">
                {c.who && <span className="who">{c.who}</span>}
                {/* (Perfect ...4?: each piece its own box in a row. Nested in the gradient-filled word, the
                    animated "..." was drawn over the P on a phone, the user saw, 3 Nov.) */}
                {four
                    ? <span className="what-row"><span className="what">Perfect</span><span className="what dots">...</span><span className="what">4</span><span className="what huh">?</span></span>
                    : <span className="what">Perfect 24!</span>}
            </div>
            <div className="celebration-sparks" aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                    <span key={i} style={{ '--a': `${i * 22.5 + (i % 2) * 9}deg`, '--d': `${70 + (i * 37) % 60}px`, animationDelay: `${(i % 4) * 0.06}s` } as React.CSSProperties} />
                ))}
            </div>
        </div>
    );
}

// Three 6s land (since 23 Oct, the user's): fire surges up the screen, the devil rises holding
// her three 6s, and a banner says "Devil's titties". Taps go through to the dice.
// Since 24 Oct a living painting: her flames move, her pips pulse, her eyes glint.
const DEVIL_EYES: [[number, number], [number, number]] = [[0.453, 0.274], [0.609, 0.291]];
preloadPainting('devil-sixes');
function DevilSixes({ snap }: { snap: Snapshot }) {
    const d = snap.devil;
    const [visible] = useMoment(d?.at ?? 0, DEVIL_MS);
    if (!visible || !d) return null;
    return (
        <div key={d.at} className="devil-sixes" aria-live="polite">
            <div className="devil-surge" aria-hidden="true" />
            <div className="devil-flames" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                    <span key={i} style={{ left: `${(i * 5.9 + (i % 3) * 2) % 100}%`, '--h': `${22 + (i * 23) % 26}vh`, animationDelay: `${(i * 0.13) % 0.7}s` } as React.CSSProperties} />
                ))}
            </div>
            <LivingPainting name="devil-sixes" eyes={DEVIL_EYES} className="devil-picture" />
            <div className="devil-banner">
                {d.who && <span className="who">{d.who}</span>}
                <span className="what">Devil's titties</span>
            </div>
        </div>
    );
}

// Who an opponent is and what they can do: their entrance card, and the same again from the ⓘ on
// their nameplate (5 Nov, the user's). Each ability has its painting where there is one.
function OpponentCard({ enemy, place, state, close, leaving }: { enemy: Enemy; place: string; state: GameState; close: string; leaving?: boolean }) {
    // A long card on a short screen rises until it all shows, over the opponent if it must (the CSS
    // keeps it above the screen's bottom edge, wherever the table's far edge moves to).
    const card = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => { card.current?.style.setProperty('--card-h', `${card.current.offsetHeight}px`); });
    return (
        <div ref={card} className={`encounter-intro ${leaving ? 'leaving' : ''}`}>
            <span className="encounter">{place}{enemy.boss ? ' · Boss' : ''}</span>
            <span className="name">{enemy.name}</span>
            <Hearts lives={enemy.lives} starting={enemy.lives} />
            <span className="intro">{enemy.blurb}</span>
            {enemy.powers.length > 0 && (
                <div className="powers">
                    {enemy.powers.map((power, i) => (
                        <div key={power.name} className="power">
                            {ABILITY_ART[power.name]
                                ? <img src={`${import.meta.env.BASE_URL}art/${ABILITY_ART[power.name]}`} alt="" draggable={false} />
                                : <span className="no-art" aria-hidden="true">✦</span>}
                            <div>
                                <span className="power-name">{power.name}{state.tavernRun?.powerMarks?.length === enemy.powers.length ? <AbilityMarks state={state} power={i} /> : i === 0 && <AbilityMarks state={state} />}</span>
                                <span className="power-text">{power.text}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <span className="tap">{close}</span>
        </div>
    );
}

// A Tavern Crawl opponent sits down: their card, on the table's edge under their bust. It stays
// until it's tapped (5 Nov, the user's); everything that comes next waits for that.
function EncounterIntro({ snap }: { snap: Snapshot }) {
    const [leavingAt, setLeavingAt] = useState(0);
    const run = snap.state?.tavernRun;
    if (!snap.introShowing || !run || !snap.state) return null;
    const leaving = leavingAt === snap.introAt;
    const leave = () => {
        if (leaving) return;
        setLeavingAt(snap.introAt);
        playSound('click');
        setTimeout(actions.dismissIntro, 240);
    };
    return (
        <button key={snap.introAt} className={`intro-veil ${leaving ? 'leaving' : ''}`} onClick={leave} autoFocus>
            <OpponentCard enemy={run.enemy} place={run.place} state={snap.state} close="Tap to continue" leaving={leaving} />
        </button>
    );
}

// While an ability lasts, a glow round the screen's edges in its colours (never over the dice:
// it's an inset shadow at the edges, and it takes no taps):
//   the Curse        violet, breathing          (Danhausen, or Martha in his face, or your mask)
//   the Devil        embers rising, red edges   (the Duke's round, once his three 6s land)
//   Mind Whip        green-violet mist          (once it lands on your throw, until Frak's turn)
//   Rokr's blur      twinkling stars            (while your dice are blurred)
//   Inkfire          inky flames licking up     (Vaelin's round)
//   Divine Smite     a holy gold glow           (the Ridgeler's round)
function AbilityAura({ snap, state }: { snap: Snapshot; state: GameState }) {
    const effect = state.tavernRun?.roundEffect;
    const turn = snap.turn;
    // The Curse, the Devil, Inkfire and Divine Smite glow for the whole round.
    const kind = effect && effect.kind !== 'mind' ? effect.kind
        : effect?.kind === 'mind' && effect.landed && !!turn && turn.playerId === snap.myId ? 'mind'
            : turn?.blurActive ? 'stars'
                : null;
    if (!kind) return null;
    return (
        <div className={`aura ${kind === 'curse' ? 'curse-veil' : `${kind}-veil`}`} aria-hidden="true">
            {kind === 'devil' && Array.from({ length: 14 }, (_, i) => <span key={i} className="ember" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.53) % 4}s` }} />)}
            {/* Inkfire's flames keep to the outer tenth of each bottom corner, clear of the badge under Roll and the slot rail. */}
            {kind === 'ink' && Array.from({ length: 10 }, (_, i) => <span key={i} className={`ink-flame ${i % 2 ? 'left' : 'right'}`} style={{ left: i % 2 ? `${(i * 3) % 8}%` : `calc(${92 + (i * 3) % 8}% - 22px)`, animationDelay: `${(i * 0.47) % 2.2}s` }} />)}
            {/* Divine Smite: holy light pouring down from the top and gold sparks drifting down the edges. */}
            {kind === 'smite' && <>
                <span className="smite-shaft" />
                {Array.from({ length: 16 }, (_, i) => <span key={i} className="smite-spark" style={{ left: i % 2 ? `${(i * 5) % 14}%` : `${86 + (i * 5) % 14}%`, animationDelay: `${(i * 0.41) % 3}s` }} />)}
            </>}
            {kind === 'stars' && Array.from({ length: 18 }, (_, i) => <span key={i} className="star" style={{ left: `${(i * 53) % 100}%`, top: `${i % 2 ? (i * 29) % 22 : 78 + (i * 17) % 20}%`, animationDelay: `${(i * 0.37) % 2.4}s` }} />)}
        </div>
    );
}

// An opponent's signature move. Klarg's steal and Rokr's stars happen on the 3D table; here
// the move's name, plus the shot from The Hangman's revolver and Jaguar's -3.
// The user's paintings of the abilities (26 Oct; more to come): each rises above its banner as the
// moment plays, like the devil's three 6s. Fetched ahead, so the first showing isn't blank.
const ABILITY_ART: Record<string, string> = {
    'Mind Whip': 'ability-mind-whip.webp',
    'You are Cursed': 'ability-cursed.webp',
    'Sympathy for the Devil': 'ability-devil.webp',
    'Disguises': 'ability-disguises.webp',
    // 26 Oct: the Yawning Portal's and the ship's.
    'Back of the Head': 'ability-back-of-the-head.webp',
    'Inkfire Brand': 'ability-inkfire.webp',
    'Vexing Rapier': 'ability-flourish.webp',
    'Astral Flood': 'ability-astral-flood.webp',
    'Reach Around': 'ability-reach-around.webp',
    'Starry Form': 'ability-starry-form.webp',
    // 9 Nov: the ship's last three.
    'Penitent Stare': 'ability-penitent-stare.webp',
    'The Ace of Spades': 'ability-ace-of-spades.webp',
    'All In': 'ability-all-in.webp',
    // 27 Oct: Jaguar's.
    'Smooth Talk': 'ability-smooth-talk.webp',
    'The Cloak': 'ability-the-cloak.webp',
    // 28 Oct: the Ridgeler's.
    'Divine Smite': 'ability-divine-smite.webp'
};
Object.values(ABILITY_ART).forEach(file => { new Image().src = `${import.meta.env.BASE_URL}art/${file}`; });

function AbilityMomentView({ snap }: { snap: Snapshot }) {
    const moment = snap.ability;
    const [visible] = useMoment(moment?.at ?? 0, MOMENT_SHOW_MS);
    if (!visible || !moment) return null;
    const kind = moment.ability.toLowerCase().replace(/[^a-z]+/g, '-');
    // An opponent's ability (or your mask) takes over the screen: a flash in its colours and a
    // banner across it with what happened (the user asked for more flare, 21 Oct). So does a
    // keepsake as it works, with its picture in a burst of gold (the Shield: a force field).
    // Thonics and the Lady keep the small plaque on the table's edge.
    // (The Lady's Grace and the Bard's songs: like a Thonic, their icon big over a parchment label, 3 Nov.)
    const takeover = moment.name !== "Thom's Thonics" && moment.name !== 'Shrine to the Lady' && !moment.blessing;
    const keepsake = moment.keepsake;
    // A Clear-Eye cancelled it: the banner, struck through, and none of the move's effect.
    const fx = !moment.cancelled;
    const art = takeover && fx ? ABILITY_ART[moment.ability] : undefined;
    // A signature move rises up the screen like the devil's three 6s (the user, 26 Oct): a sheet of
    // light in its colours sweeps up from the bottom, plumes lick up, and the banner (and painting)
    // shoot up into place. Keepsakes keep their gold burst.
    const surge = takeover && fx && !keepsake;
    return (
        <div key={moment.at} className={`ability-moment ${kind} ${moment.name === "Thom's Thonics" || moment.blessing ? 'thonic' : ''} ${keepsake ? 'keepsake-moment' : ''} ${takeover ? 'takeover' : ''} ${moment.cancelled ? 'cancelled' : ''} ${art ? 'with-art' : ''}`} aria-live="polite">
            {/* With a painting the moment is a scene of its own (the user's call, 26 Oct): a stage in
                its colours over the whole screen, motes of light rising, the painting pushing in. */}
            {art && (
                <div className="ability-stage" aria-hidden="true">
                    {/* Light rays turning slowly behind the painting. */}
                    <span className="rays" />
                    {/* Brodor's Astral Flood: his painting's aurora drifting behind him, and stars. */}
                    {moment.ability === 'Astral Flood' && <>
                        <span className="aurora" />
                        {Array.from({ length: 18 }, (_, i) => <span key={i} className="twinkle" style={{ left: `${(i * 37 + 11) % 97}%`, top: `${(i * 53 + 7) % 72}%`, animationDelay: `${(i * 0.13) % 0.9}s` }} />)}
                    </>}
                    {Array.from({ length: 14 }, (_, i) => <span key={i} className="mote" style={{ left: `${(i * 7.3 + (i % 4) * 3) % 100}%`, animationDelay: `${(i * 0.11) % 0.8}s` }} />)}
                </div>
            )}
            {surge && (
                <div className="ability-rise" aria-hidden="true">
                    <div className="ability-surge" />
                    {Array.from({ length: 12 }, (_, i) => (
                        <span key={i} className="plume" style={{ left: `${(i * 8.7 + (i % 3) * 2) % 100}%`, '--h': `${18 + (i * 19) % 22}vh`, animationDelay: `${(i * 0.11) % 0.5}s` } as React.CSSProperties} />
                    ))}
                </div>
            )}
            {art && <img className="ability-art" src={`${import.meta.env.BASE_URL}art/${art}`} alt="" />}
            {/* A Thonic drunk (28 Oct, the user: "make it look better"): its bottle, big, pops its cork
                and tips up in a glow of its own colour while bubbles rise, over its name on a label. */}
            {/* The Lady's Grace or a Bard's song: its icon rises and sways in a glow of its colour, with
                sparkles (the Lady) or notes (the Bard) drifting up, like a Thonic drunk. */}
            {moment.blessing && (
                <div className={`potion-moment blessing-moment potion-${moment.blessing}`} aria-hidden="true">
                    <span className="potion-glow" />
                    {Array.from({ length: 9 }, (_, i) => <span key={i} className={moment.blessing === 'ladysGrace' ? 'bubble sparkle' : 'bubble note'} style={{ '--x': `${(i * 23) % 70 - 35}px`, '--s': `${6 + (i * 7) % 9}px`, '--d': `${0.25 + (i * 0.09) % 0.6}s` } as React.CSSProperties}>{moment.blessing === 'ladysGrace' ? '' : i % 2 ? '♪' : '♫'}</span>)}
                    <span className="blessing-icon">{keepsakeIcon(moment.blessing)}</span>
                </div>
            )}
            {moment.thonic && (
                <div className={`potion-moment potion-${moment.thonic}`} aria-hidden="true">
                    <span className="potion-glow" />
                    {Array.from({ length: 9 }, (_, i) => <span key={i} className="bubble" style={{ '--x': `${(i * 23) % 60 - 30}px`, '--s': `${5 + (i * 7) % 9}px`, '--d': `${0.25 + (i * 0.09) % 0.6}s` } as React.CSSProperties} />)}
                    <Bottle thonic={{ id: moment.thonic } as Thonic} />
                </div>
            )}
            <div className={`ability-banner ${moment.thonic ? `potion-${moment.thonic}` : moment.blessing ? `potion-${moment.blessing}` : ''}`}>
                {/* As it lands: a shockwave ring from its middle (its edges glow and a shine sweeps it, in CSS). */}
                {surge && <span className="impact" aria-hidden="true" />}
                {/* An opponent's ability (or your mask) shows its name alone (the user's call, 28 Oct), and
                    so does a Thonic, and the Lady's Grace (no "Shrine to the Lady" over it, the user, 4 Nov);
                    keepsakes keep who and what. */}
                {(!takeover && !moment.thonic && moment.name !== 'Shrine to the Lady' || keepsake) && <span className="who">{moment.name}</span>}
                <span className="what">{moment.ability}</span>
                {takeover && keepsake && moment.text && <span className="line">{moment.text}</span>}
                {moment.ability === 'Smooth Talk' && fx && /knocks/.test(moment.text ?? '') && <span className="minus">−3</span>}
                {moment.cancelled && <span className="cancelled-stamp">Cancelled</span>}
                {moment.extra && <span className="plus">{moment.extra}</span>}
            </div>
            {fx && moment.ability === 'Reach Around' && (
                <div className="claw-marks" aria-hidden="true"><span /><span /><span /></div>
            )}
            {fx && moment.ability === 'Smooth Talk' && <div className="gold-sweep" aria-hidden="true" />}
            {fx && moment.ability === 'Back of the Head' && <div className="punch-burst" aria-hidden="true" />}
            {moment.ability === 'Disguises' && <div className="mask-flare" aria-hidden="true">🎭</div>}
            {keepsake && <div className={`keepsake-flare ${ELF_BARS.has(keepsake) || PAINTED_KEEPSAKES.has(keepsake) ? 'painted' : ''}`} aria-hidden="true">{ELF_BARS.has(keepsake) ? <img src={elfBarArt(keepsake)} alt="" /> : keepsakeIcon(keepsake)}</div>}
            {keepsake === 'bentCopper' && <div className="forcefield" aria-hidden="true" />}
            {fx && moment.ability === 'Inkfire Brand' && <div className="ink-six" aria-hidden="true">6</div>}
            {fx && moment.ability === 'Vexing Rapier' && <div className="rapier-slash" aria-hidden="true"><span /><span /></div>}
            {fx && moment.ability === 'Divine Smite' && <div className="smite-beam" aria-hidden="true" />}
            {/* The hammer lands (a won Smite round): a white-gold flash and cracks of light from the middle. */}
            {fx && moment.hit && <div className="smite-crash" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i} style={{ '--a': `${i * 45 + 12}deg` } as React.CSSProperties} />)}</div>}
            {fx && moment.ability === 'Astral Flood' && <div className="flood-light" aria-hidden="true" />}
            {fx && moment.ability === 'The Ace of Spades' && (
                <>
                    <div className="gun-flash" aria-hidden="true" />
                    <div className="bullet-24" aria-hidden="true"><span className="hole" /><span className="score">24</span></div>
                </>
            )}
        </div>
    );
}

// Thom's Thonics: between fights, a scene of its own. The tavern and the table give way to
// Thom's lantern-lit cart: he rises into view, his sign and counter follow, and the Thonics
// are dealt onto the counter. Buy what the purse allows (up to a full shelf), then on to the
// next opponent; the scene fades out first.
const LEAVE_MS = 450;

function ThomShop({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const shop = run.shop!;
    const arrival = snap.shopArrival;
    const shelfFull = run.shelf.length >= run.shelfSize;
    const pocketsFull = run.keepsakes.length >= (run.maxKeepsakes ?? 5); // five keepsakes at most
    const [leaving, setLeaving] = useState(false);
    const leave = () => {
        if (leaving) return;
        setLeaving(true);
        setTimeout(actions.leaveShop, LEAVE_MS);
    };
    // Thom's cart has its own ambience while it's up (the user's loop, 28 Oct).
    useEffect(() => startSceneAmbience('thom'), []);
    return (
        <div className={`thom-scene ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={`Thom's Thonics. Thom: ${thomSays(state.tavernRun!, !!shop.first)}`}>
            <div className="thom-stage" aria-hidden="true" style={stageVars(SPOT_PORTRAITS.thom)}>
                <div className="thom-lantern" />
                <div className="thom-speech">{thomSays(state.tavernRun!, !!shop.first)}</div>
                <div className="thom-figure">
                    <img className="thom-bust" src={`${import.meta.env.BASE_URL}art/thom.webp`} alt="" />
                    <div className="thom-bottle-glow" />
                </div>
            </div>
            <div className="thom-counter">
                <div className="thom-sign">
                    <h2>Thom's Thonics</h2>
                    <p className="thom-tag">Potions for 2, 4, 24 players</p>
                </div>
                <p className="purse-line"><span aria-hidden="true">🪙</span> <strong>{coins(run.purse)}</strong> in your purse</p>
                {shop.free && <p className="purse-line"><span aria-hidden="true">🎫</span> Loyalty Card: one Thonic free this visit</p>}
                <div className="thonic-cards">
                    {shop.stock.map((t, i) => {
                        // Thom's Loyalty Card: the first Thonic of the visit is free.
                        const price = shop.free ? 0 : t.price;
                        const short = run.purse < price;
                        return (
                            <div key={t.id} className="thonic-card" style={{ animationDelay: `${0.9 + i * 0.15}s` }}>
                                <Bottle thonic={t} />
                                <strong>{t.name}</strong>
                                <span className="text">{t.text}</span>
                                <button className="buy" disabled={short || shelfFull} onClick={() => actions.buyThonic(t.id)}>
                                    {shelfFull ? 'Shelf full' : shop.free ? 'Free' : short ? coins(t.price) : `Buy · ${coins(t.price)}`}
                                </button>
                            </div>
                        );
                    })}
                </div>
                {!!shop.keepsakes?.length && (
                    <div className="back-shelf">
                        <h3>Thom's back shelf</h3>
                        <div className="keepsake-wares">
                            {shop.keepsakes.map((k, i) => {
                                const short = run.purse < k.price;
                                return (
                                    <div key={k.id} className="keepsake-ware" style={{ animationDelay: `${1.3 + i * 0.15}s` }}>
                                        <span className="icon" aria-hidden="true">{keepsakeIcon(k.id)}</span>
                                        <span className="about"><strong>{k.name}</strong><span className="text">{k.text}</span></span>
                                        <button className="buy" disabled={short || pocketsFull} onClick={() => actions.buyKeepsake(k.id)}>
                                            {pocketsFull ? 'Pockets full' : short ? coins(k.price) : `Buy · ${coins(k.price)}`}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className="shop-footer">
                    <div className="shop-shelf" aria-label="Your shelf">
                        {Array.from({ length: Math.max(run.shelfSize, run.shelf.length) }, (_, i) => run.shelf.at(i) ?? null).map((t, i) => (
                            <span key={i} className="shelf-slot" title={t ? t.name : 'Empty'}><Bottle thonic={t} /></span>
                        ))}
                    </div>
                    <button className="primary onward" onClick={leave} disabled={leaving}>
                        Challenge {arrival?.nextEnemy ?? run.enemy.name}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Thom's greeting: the first time you meet him in a run, then his usual (the user's, 23 Oct).
const thomLine = (first: boolean) => (first ? 'Vim, vigour, vitality!' : "What ya havin'?");
// Aboard the Salty Swallow Thom has stowed away, so as not to lose his best customer (6 Nov, the
// user's words): one of these, drawn once for each fight.
const THOM_SHIP_LINES = ["Vim, vigour, vitality! ...and keep your voice down. I'm not on the manifest.", "There's number one customer!", "You're putting my kid through Dwemercore!"];
const thomShipLines = new Map<number, string>();
function thomSays(run: { place?: string; encounterNumber: number }, first: boolean) {
    if (run.place !== 'The Salty Swallow') return thomLine(first);
    if (!thomShipLines.has(run.encounterNumber)) thomShipLines.set(run.encounterNumber, THOM_SHIP_LINES[Math.floor(Math.random() * THOM_SHIP_LINES.length)]);
    return thomShipLines.get(run.encounterNumber)!;
}

// ---- Between fights: two spots in the tavern catch your eye ----
const SPOTS: Record<Spot, { name: string; line: string; offer: string }> = {
    thom: { name: "Thom's Thonics", line: '"What ya havin\'?"', offer: 'Buy Thonics with your purse' },
    shrine: { name: 'Shrine to the Lady', line: 'Candles for the Lady, who keeps sailors safe.', offer: 'A blessing from the Lady' },
    diceDen: { name: 'The Dice Den', line: '"Fancy a quick throw, friend?"', offer: 'Bet gold on two dice' },
    hotTub: { name: 'Wild Magic Hot Tub', line: 'Bubbling, glowing, faintly humming.', offer: 'A wild surge on one of your dice' },
    bard: { name: 'The Bard', line: '"A song for your next fight?"', offer: 'Inspiration for the next fight' },
    elfKid: { name: 'Johnny Elf Bar', line: '"Psst! Wanna touch the sky?"', offer: 'Elf Bars: magic vapes, three puffs each' },
    jorvash: { name: 'Jorvash', line: '"Something to fortify you?"', offer: 'A refreshment for the next fight' },
    yvesil: { name: 'Yvesil', line: '"Shall I read your next fight?"', offer: 'A good omen, or a bad one' }
};

// Who (or what) is at the spot, in a lit round frame.
function SpotPicture({ spot, place }: { spot: Spot; place?: string | null }) {
    return (
        <span className={`spot-pic ${spot}`} aria-hidden="true">
            <span className="face" style={avatarStyle(spotPortrait(spot, place))} />
        </span>
    );
}

// The choice between fights is a screen of its own; each spot (and the pickpocket) is a
// scene like Thom's: the character rises in their own light with a line in a speech bubble,
// their sign and counter slide in, and the counter holds what you can do there.
function Interlude({ state }: { state: GameState }) {
    const run = state.tavernRun!;
    const interlude = run.interlude!;
    const won = run.lastWin;
    const next = won?.nextEnemy ?? run.enemy.name;
    const [leaving, setLeaving] = useState(false);
    const moveOn = () => {
        if (leaving) return;
        setLeaving(true);
        setTimeout(actions.moveOn, LEAVE_MS);
    };
    // After a random event: its scene fades, then the two spots come up.
    const lookAround = () => {
        if (leaving) return;
        setLeaving(true);
        setTimeout(actions.lookAround, LEAVE_MS);
    };
    useEffect(() => setLeaving(false), [interlude.stage]);
    if (interlude.stage === 'invitation') return <Invitation state={state} interlude={interlude} next={next} leaving={leaving} onMoveOn={moveOn} />;
    if (interlude.stage !== 'choose') {
        const spot = interlude.stage === 'done' ? interlude.spot : interlude.stage;
        return <SpotScene key={spot} spot={spot} state={state} next={next} leaving={leaving} onMoveOn={moveOn} onLookAround={lookAround} />;
    }
    return (
        <div className={`interlude-scene ${leaving ? 'leaving' : ''}`} role="dialog" aria-label="Between fights"
            style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/${placeBackdrop(state.tavernRun?.place)}")` }}>
            <div className="interlude-body">
                <PurseLine state={state} />
                <h2 className="interlude-title">Make your choice</h2>
                <div className="spot-cards">
                    {interlude.spots.map((spot, i) => (
                        <button key={spot} className="spot-card" style={{ animationDelay: `${0.25 + i * 0.15}s` }} onClick={() => actions.chooseSpot(spot)}>
                            <SpotPicture spot={spot} place={run.place} />
                            <strong>{SPOTS[spot].name}</strong>
                            <span className="line">{spot === 'thom' ? `"${thomSays(run, !run.thomMet)}"` : SPOTS[spot].line}</span>
                            <span className="offer">{SPOTS[spot].offer}{spot === 'shrine' && run.prices?.shrine ? ` · ${coins(run.prices.shrine)}` : spot === 'hotTub' && run.prices?.hotTub ? ` · ${coins(run.prices.hotTub)}` : spot === 'bard' && run.prices?.bard ? ` · ${coins(run.prices.bard)}` : spot === 'yvesil' && run.prices?.yvesil ? ` · ${coins(run.prices.yvesil)}` : spot === 'jorvash' && run.prices?.jorvash ? ` · ${coins(run.prices.jorvash)}` : ''}</span>
                        </button>
                    ))}
                </div>
                <button className="link-button" onClick={moveOn}>Or challenge {next} right away</button>
            </div>
        </div>
    );
}

// After a boss, the story moves on: their keepsake is yours and you're invited on to the next
// place (after Martha the Yawning Portal; after Brodor the Salty Swallow). Go on now, or keep
// the run on this phone and come back to it (the lobby's "Continue your crawl").
const INVITATIONS: Record<string, { title: string; line: (place: string) => string; after?: string; gift: string }> = {
    'Martha Mystery': {
        title: 'You qualify for the Yawning Portal',
        line: place => `Martha Mystery blows a ring of violet smoke and presses her own Elf Bar into your hand. "You've earned this. Guess the flavour. Show it at ${inSentence(place)}."`,
        gift: "is yours: it never runs out. One puff a fight, and each fight it tastes of one of Johnny's four, at random."
    },
    Brodor: {
        title: 'Word from the docks',
        line: () => `Brodor flips you his sunglasses. "UH-HUH, YEAH! I want you to have these sunglasses. You'll need them when you're soaring high with the griffins! OOH YEAH!"`,
        after: "Word has spread, the Salty Swallow has just docked - and its crew are some of the finest players in the realm. The Five Gallon Jugs request your presence",
        gift: 'are yours: a finished 23 restores a heart, like a 24.'
    }
};
// A place's name inside a sentence: "on to the Salty Swallow".
const inSentence = (place: string) => place.replace(/^The /, 'the ');

function Invitation({ state, interlude, next, leaving, onMoveOn }: { state: GameState; interlude: Extract<Interlude, { stage: 'invitation' }>; next: string; leaving: boolean; onMoveOn: () => void }) {
    const run = state.tavernRun!;
    const me = Object.values(state.players).find(p => p.id !== BOT_ID);
    const story = INVITATIONS[interlude.boss ?? ''] ?? INVITATIONS['Martha Mystery'];
    const drop = interlude.drop ?? { id: 'mysteryFlavour', name: 'Mystery Flavour', text: '' };
    const save = () => actions.saveAndLeave(interlude.save, { name: me?.name ?? 'Traveller', place: interlude.place, next, purse: run.purse });
    // The end of a place (visuals plan step 5, 25 Oct): a sealed letter flutters down, its wax seal
    // cracks and the invitation unfolds out of it (in the new look; a tap skips to it).
    const [skip, setSkip] = useState(!lookNext);
    // Since 30 Oct the boss's keepsake is yours to take or leave; with five already, taking it
    // means choosing one of yours to leave behind.
    const claim = interlude.claim ?? 'took';
    const [swapping, setSwapping] = useState(false);
    const take = () => (interlude.full ? setSwapping(true) : actions.claimDrop(true));
    return (
        <div className={`interlude-scene invitation ${lookNext ? 'arriving' : ''} ${skip ? 'skip' : ''} ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={story.title}
            style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/${placeBackdrop(interlude.from ?? state.tavernRun?.place)}")` }} onPointerDown={() => setSkip(true)}>
            <div className="interlude-body">
                <PurseLine state={state} />
                <h2 className="interlude-title">{story.title}</h2>
                {/* (the letter lands where the invitation then unfolds) */}
                <div className="invitation-slot">
                {!skip && (
                    <div className="letter" aria-hidden="true">
                        <div className="envelope">
                            <span className="flap" />
                            <span className="seal"><i className="half left" /><i className="half right" /></span>
                        </div>
                    </div>
                )}
                <div className="invitation-card">
                    <span className="icon" aria-hidden="true">{keepsakeIcon(drop.id)}</span>
                    <p>{story.line(interlude.place)}</p>
                    {story.after && <p>{story.after}</p>}
                    {claim === 'took' && <p className="mask-text"><strong>{drop.name}</strong> {story.gift}</p>}
                    {claim === 'refused' && <p className="mask-text">You leave <strong>{drop.name}</strong> behind.</p>}
                    {claim === 'open' && !swapping && (
                        <>
                            <p className="mask-text"><strong>{drop.name}</strong>: {drop.text}</p>
                            {interlude.full && <p className="fine">Your pockets are full: taking it means leaving one of yours behind.</p>}
                            <div className="drop-choice">
                                <button className="primary" onClick={take}>Take it</button>
                                <button className="secondary" onClick={() => actions.claimDrop(false)}>Leave it</button>
                            </div>
                        </>
                    )}
                    {claim === 'open' && swapping && (
                        <>
                            <p className="mask-text">Leave which behind for <strong>{drop.name}</strong>?</p>
                            <div className="drop-swap">
                                {run.keepsakes.map(k => (
                                    <button key={k.id} className="keepsake-ware swap" onClick={() => actions.claimDrop(true, k.id)}>
                                        <span className="icon" aria-hidden="true">{keepsakeIcon(k.id)}</span>
                                        <span className="about"><strong>{k.name}</strong></span>
                                    </button>
                                ))}
                            </div>
                            <button className="link-button" onClick={() => setSwapping(false)}>Back</button>
                        </>
                    )}
                </div>
                </div>
                <div className="event-choices">
                    <button className="primary onward" onClick={onMoveOn} disabled={leaving}>On to {inSentence(interlude.place)}</button>
                    <button className="secondary" onClick={save}>Save and continue later</button>
                </div>
                <p className="fine">The save stays on this device. Pick it up from the start screen.</p>
            </div>
        </div>
    );
}

// The purse, on the scenes between fights (what the fight paid has its own screen: FightWon).
function PurseLine({ state }: { state: GameState }) {
    return <p className="purse-line"><span aria-hidden="true">🪙</span> <strong>{coins(state.tavernRun!.purse)}</strong> in your purse</p>;
}

// The spots, and the events that find you instead (the pickpocket, the Hooded Stranger).
type SceneSpot = Exclude<Spot, 'thom'> | 'pickpocket' | 'stranger' | 'darren' | 'kram';

// Each scene's sign, and what its character says as things happen.
const SCENES: Record<SceneSpot, { name: string; tag: string }> = {
    pickpocket: { name: 'Stop, thief!', tag: 'A hand in your purse' },
    shrine: { name: 'Shrine to the Lady', tag: 'Goddess of sailors' },
    diceDen: { name: 'The Dice Den', tag: 'Two dice each. Highest wins.' },
    stranger: { name: 'The Hooded Stranger', tag: 'Keepsakes, for a price' },
    hotTub: { name: 'Wild Magic Hot Tub', tag: 'Soak at your own risk' },
    darren: { name: 'Darren Snakehands', tag: 'The barman, and his snakes' },
    bard: { name: 'The Bard', tag: 'Songs to win by' },
    kram: { name: 'The Cult of Kram', tag: 'Kram abhors an ugly 1' },
    elfKid: { name: 'Johnny Elf Bar', tag: "One of Frak's street urchins" },
    jorvash: { name: 'Jorvash', tag: 'Manservant of the Salty Swallow' },
    yvesil: { name: 'Yvesil', tag: 'Oracle of the Salty Swallow' }
};

function sceneLine(interlude: Interlude, revealed: boolean): string | null {
    switch (interlude.stage) {
        case 'pickpocket':
            if (interlude.roll === undefined || !revealed) return 'Finders keepers!';
            return interlude.caught ? 'Alright, alright! Have it back!' : 'Too slow!';
        case 'diceDen':
            if (!interlude.bet) return 'Fancy a quick throw, friend?';
            if (interlude.throws.length && revealed) return 'A tie! Again!';
            return 'Your throw. Make it count.';
        case 'stranger': return 'I have something for you… for a price.';
        case 'darren':
            if (interlude.roll === undefined || !revealed) return 'Whoa! Mind the snakes!';
            return interlude.outcome === 'smash' ? 'Oops. That one was yours…'
                : interlude.outcome === 'gift' ? 'Sorry, friend. Have this on the house.'
                    : 'The lads caught the lot! Here, for your trouble.';
        case 'shrine': return null;
        case 'bard': return 'A song for your next fight, friend?';
        case 'yvesil': return 'Shall I read your next fight?';
        case 'jorvash': return 'Something to fortify you?';
        case 'elfKid': return interlude.bought.length ? "Nice one! You'll be back." : 'Psst! Wanna touch the sky?';
        case 'kram': return 'Swear fealty to Kram, and no ugly 1 shall trouble you.';
        case 'done':
            if (interlude.spot === 'diceDen') {
                if (!interlude.bet) return 'Suit yourself.';
                if (!revealed) return 'Your throw. Make it count.';
                return interlude.won ? "Beginner's luck…" : 'The house thanks you!';
            }
            if (interlude.spot === 'stranger') return interlude.keepsake ? 'A fine choice. Mind your heart.' : 'Another time, then.';
            if (interlude.spot === 'hotTub') return interlude.surge.good ? '*bubble bubble* ✨' : '*glorp*';
            if (interlude.spot === 'bard') return interlude.song ? 'Go! Let them hear it!' : 'Another time, then.';
            if (interlude.spot === 'yvesil') return !interlude.omen ? 'The sea will tell you itself, then.' : interlude.omen.good ? 'The sea smiles on you.' : 'Ah. I am sorry.';
            if (interlude.spot === 'jorvash') return interlude.drink ? 'Very good.' : 'As you wish.';
            if (interlude.spot === 'kram') return interlude.sworn ? 'Kram is pleased.' : 'Kram will remember this.';
            return null;
        default: return null;
    }
}

function SpotScene({ spot, state, next, leaving, onMoveOn, onLookAround }: { spot: SceneSpot; state: GameState; next: string; leaving: boolean; onMoveOn: () => void; onLookAround: () => void }) {
    const run = state.tavernRun!;
    const interlude = run.interlude!;
    // Dice rolled here tumble first; the character answers once they land.
    const [revealed, setRevealed] = useState(true);
    const line = sceneLine(interlude, revealed);
    // The first line waits for the character to arrive; their answers come at once.
    const firstLine = useRef(line);
    const mood = interlude.stage === 'pickpocket' && interlude.roll !== undefined && revealed ? (interlude.caught ? 'caught' : 'escaped')
        : interlude.stage === 'done' && interlude.spot === 'diceDen' && interlude.bet && revealed ? (interlude.won ? 'lost' : 'won')
            : interlude.stage === 'done' && interlude.spot === 'yvesil' && interlude.omen && !interlude.omen.good ? 'escaped'
                : interlude.stage === 'done' && (interlude.spot === 'shrine' || (interlude.spot === 'bard' && interlude.song) || (interlude.spot === 'yvesil' && interlude.omen) || (interlude.spot === 'jorvash' && interlude.drink) || (interlude.spot === 'kram' && interlude.sworn)) ? 'blessed'
                : interlude.stage === 'done' && interlude.spot === 'hotTub' ? (interlude.surge.good ? 'blessed surged' : 'escaped surged')
                    : interlude.stage === 'darren' && interlude.roll !== undefined && revealed ? (interlude.outcome === 'smash' ? 'escaped' : 'caught')
                        : '';
    const portrait = spotPortrait(spot, run.place); // (the Lady's shrine has its own painting aboard the ship)
    // The hot tub, the Lady's shrine, the Bard and the Cult of Kram have their own ambience while their scene is up, and a
    // sound for what the soak or the candle brings (the user's clips, 27 Oct).
    // (Yvesil's theme, and Weal or Woe as her omen is told: the user's, 9 Nov.)
    useEffect(() => (spot === 'hotTub' || spot === 'shrine' || spot === 'bard' || spot === 'kram' || spot === 'yvesil' ? startSceneAmbience(spot) : undefined), [spot]);
    const result = interlude.stage === 'done' && interlude.spot === 'hotTub' ? (interlude.surge.good ? 'tubGood' : 'tubBad')
        : interlude.stage === 'done' && interlude.spot === 'shrine' ? 'ladyChoice'
            : interlude.stage === 'done' && interlude.spot === 'yvesil' && interlude.omen ? (interlude.omen.good ? 'yvesilWeal' : 'yvesilWoe') : null;
    useEffect(() => { if (result) playSound(result); }, [result]);
    return (
        <div className={`thom-scene spot-scene ${spot} ${mood} ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={`${SCENES[spot].name}${line ? `: ${line}` : ''}`}>
            <div className="thom-stage" aria-hidden="true"
                style={spot === 'shrine' ? { backgroundImage: `url("${portrait.src}")` } : stageVars(portrait)}>
                <div className="thom-lantern" />
                {spot === 'stranger' && <div className="spot-mist" />}
                {spot === 'shrine' && <div className="shrine-candles" />}
                {line && <div key={line} className={`thom-speech ${line !== firstLine.current ? 'quick' : ''}`}>{line}</div>}
                {spot !== 'shrine' && (
                    <div className="thom-figure">
                        <img className="thom-bust" src={portrait.src} alt="" />
                    </div>
                )}
            </div>
            <div className="thom-counter">
                <div className="thom-sign">
                    <h2>{SCENES[spot].name}</h2>
                    <p className="thom-tag">{SCENES[spot].tag}</p>
                </div>
                <PurseLine state={state} />
                <SceneCounter state={state} next={next} onMoveOn={onMoveOn} onLookAround={onLookAround} setRevealed={setRevealed} />
            </div>
        </div>
    );
}

// Where the character's face is in their picture, and its shape: on a wide screen the speech
// bubble is placed by the face (styles.css, the stage's container units), 4 Nov.
function stageVars(p: { face: [number, number]; aspect?: number }) {
    return { '--face-x': p.face[0], '--face-y': p.face[1], '--aspect': p.aspect ?? 0.7 } as React.CSSProperties;
}

// What you can do at the spot, on its counter.
function SceneCounter({ state, next, onMoveOn, onLookAround, setRevealed }: { state: GameState; next: string; onMoveOn: () => void; onLookAround: () => void; setRevealed: (v: boolean) => void }) {
    const run = state.tavernRun!;
    const interlude = run.interlude!;
    const [picked, setPicked] = useState<string | null>(null);
    const challenge = <button className="primary onward" onClick={onMoveOn}>Challenge {next}</button>;
    // A random event (the thief, the Hooded Stranger, Darren) isn't the whole walk: then the two spots.
    // Stacked: the button across the counter, the challenge under it (side by side, a small
    // phone squeezed the button's words onto four lines).
    const afterEvent = (
        <span className="after-event">
            <button className="primary onward wraps" onClick={onLookAround}>Look around the {run.place === 'The Salty Swallow' ? 'ship' : 'tavern'}</button>
            <button className="link-button" onClick={onMoveOn}>Or challenge {next} right away</button>
        </span>
    );

    if (interlude.stage === 'pickpocket') return <PickpocketRoll interlude={interlude} purse={run.purse} setRevealed={setRevealed} next={afterEvent} />;
    if (interlude.stage === 'darren') return <DarrenRoll interlude={interlude} setRevealed={setRevealed} next={afterEvent} />;

    if (interlude.stage === 'hotTub') {
        return (
            <>
                <p className="scene-text">Climb in, and the wild magic surges: most likely one of your dice is blessed for the next fight. Most likely.</p>
                <div className="event-choices">
                    <button className="primary" disabled={run.purse < (run.prices?.hotTub ?? 0)} onClick={actions.soak}>Climb in{run.prices?.hotTub ? ` · ${coins(run.prices.hotTub)}` : ''}</button>
                    <button className="secondary" onClick={onMoveOn}>No thanks: challenge {next}</button>
                </div>
            </>
        );
    }

    if (interlude.stage === 'shrine') {
        return (
            <>
                <p className="scene-text">Light a candle, and the Lady who keeps sailors safe grants a blessing: an extra heart for your next fight, or her Grace against the dust.</p>
                <div className="event-choices">
                    <button className="primary" disabled={run.purse < (run.prices?.shrine ?? 0)} onClick={actions.pray}>Light a candle{run.prices?.shrine ? ` · ${coins(run.prices.shrine)}` : ''}</button>
                    <button className="secondary" onClick={onMoveOn}>No thanks: challenge {next}</button>
                </div>
            </>
        );
    }

    if (interlude.stage === 'diceDen') {
        if (!interlude.bet) {
            return (
                <>
                    <p className="scene-text">Bet against the gambler: two dice each, the higher total doubles your bet.</p>
                    <div className="event-choices">
                        {/* Only the bets the purse can cover. */}
                        {interlude.bets.filter(bet => run.purse >= bet).map(bet => (
                            <button key={bet} className="primary" onClick={() => actions.diceBet(bet)}>Bet {coins(bet)}</button>
                        ))}
                        <button className="secondary" onClick={() => actions.diceBet(0)}>No thanks</button>
                    </div>
                </>
            );
        }
        return <DiceDenTable bet={interlude.bet} throws={interlude.throws} setRevealed={setRevealed} next={null} />;
    }

    // Johnny Elf Bar: Elf Bars for the shelf (not one you already carry).
    if (interlude.stage === 'elfKid') {
        const shelfFull = run.shelf.length >= run.shelfSize;
        return (
            <>
                <p className="scene-text">Each Elf Bar sits on your shelf with <strong>{interlude.puffs} puffs</strong>, one a fight.</p>
                <div className="thonic-cards elf-cards">
                    {interlude.stock.map((t, i) => {
                        const price = run.prices?.elfBars?.[t.id] ?? t.price;
                        const carried = run.shelf.some(s => s.id === t.id);
                        const short = run.purse < price;
                        return (
                            <div key={t.id} className="thonic-card" style={{ animationDelay: `${0.9 + i * 0.12}s` }}>
                                <Bottle thonic={t} />
                                <strong>{t.name.replace(/ Elf Bar$/, '')}</strong>
                                <span className="text">{t.text}</span>
                                <button className="buy" disabled={short || shelfFull || carried} onClick={() => actions.buyElfBar(t.id)}>
                                    {carried ? 'On your shelf' : shelfFull ? 'Shelf full' : short ? coins(price) : `Buy · ${coins(price)}`}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="event-choices">{challenge}</div>
            </>
        );
    }

    // Yvesil: pay, and hear your omen for the next fight.
    if (interlude.stage === 'yvesil') {
        const price = run.prices?.yvesil ?? interlude.price;
        return (
            <>
                <p className="scene-text">Cross her palm, and she reads your fight with {next}. It may not be what you want to hear.</p>
                <div className="event-choices">
                    <button className="primary" disabled={run.purse < price} onClick={() => actions.yvesilPick(true)}>Hear your omen · {coins(price)}</button>
                    <button className="secondary" onClick={() => actions.yvesilPick(false)}>No thanks</button>
                </div>
            </>
        );
    }

    // Jorvash: one of his two refreshments, for the next fight.
    if (interlude.stage === 'jorvash') {
        const chosen = interlude.drinks.find(d => d.id === picked);
        const price = run.prices?.jorvash ?? interlude.price;
        return (
            <>
                <p className="scene-text">One of these before you face {next}?</p>
                <div className="keepsake-cards">
                    {interlude.drinks.map((d, i) => (
                        <button key={d.id} className={`keepsake-card ${picked === d.id ? 'picked' : picked ? 'passed' : ''}`} style={{ animationDelay: `${0.9 + i * 0.15}s` }} onClick={() => setPicked(d.id)}>
                            <span className="icon" aria-hidden="true">{keepsakeIcon(d.id)}</span>
                            <strong>{d.name}</strong>
                            <span className="text">{d.text}</span>
                        </button>
                    ))}
                </div>
                <div className="event-choices">
                    <button className="primary" disabled={!chosen || run.purse < price} onClick={() => chosen && actions.jorvashPick(chosen.id)}>
                        {chosen ? `${chosen.name} · ${coins(price)}` : 'Tap a refreshment'}
                    </button>
                    <button className="secondary" onClick={() => actions.jorvashPick(null)}>No thanks</button>
                </div>
            </>
        );
    }

    // The Bard: one of his songs, for the next fight.
    if (interlude.stage === 'bard') {
        const chosen = interlude.songs.find(s => s.id === picked);
        const price = run.prices?.bard ?? interlude.price;
        return (
            <>
                <p className="scene-text">Pay the Bard, and his song goes with you to the fight with {next}.</p>
                <div className="keepsake-cards">
                    {interlude.songs.map((s, i) => (
                        <button key={s.id} className={`keepsake-card ${picked === s.id ? 'picked' : picked ? 'passed' : ''}`} style={{ animationDelay: `${0.9 + i * 0.15}s` }} onClick={() => setPicked(s.id)}>
                            <span className="icon" aria-hidden="true">{keepsakeIcon(s.id)}</span>
                            <strong>{s.name}</strong>
                            <span className="text">{s.text}</span>
                        </button>
                    ))}
                </div>
                <div className="event-choices">
                    <button className="primary" disabled={!chosen || run.purse < price} onClick={() => chosen && actions.bardPick(chosen.id)}>
                        {chosen ? `${chosen.name} · ${coins(price)}` : 'Tap a song'}
                    </button>
                    <button className="secondary" onClick={() => actions.bardPick(null)}>No thanks</button>
                </div>
            </>
        );
    }

    // The Cult of Kram: swear fealty, and your dice never land on 1 for the next fights.
    if (interlude.stage === 'kram') {
        return (
            <>
                <p className="scene-text">Swear fealty to Kram, and your dice never land on an ugly 1 for your next <strong>{interlude.fights} fights</strong>.</p>
                <div className="event-choices">
                    <button className="primary" onClick={() => actions.kram('swear')}>Swear fealty to Kram</button>
                    <button className="secondary" onClick={() => actions.kram('refuse')}>Refuse</button>
                </div>
            </>
        );
    }

    if (interlude.stage === 'stranger') {
        const chosen = interlude.offers.find(k => k.id === picked);
        return (
            <>
                <p className="scene-text">Take one, and you start the fight with {next} on <strong>{interlude.hearts} hearts</strong>.</p>
                <div className="keepsake-cards">
                    {interlude.offers.map((k, i) => (
                        <button key={k.id} className={`keepsake-card ${picked === k.id ? 'picked' : picked ? 'passed' : ''}`} style={{ animationDelay: `${0.9 + i * 0.15}s` }} onClick={() => setPicked(k.id)}>
                            <span className="icon" aria-hidden="true">{keepsakeIcon(k.id)}</span>
                            <strong>{k.name}</strong>
                            <span className="text">{k.text}</span>
                        </button>
                    ))}
                </div>
                <div className="event-choices">
                    <button className="primary" disabled={!chosen} onClick={() => chosen && actions.strangerPick(chosen.id)}>
                        {chosen ? `Take ${chosen.name}` : 'Tap a keepsake'}
                    </button>
                    <button className="secondary" onClick={() => actions.strangerPick(null)}>No thanks</button>
                </div>
            </>
        );
    }

    if (interlude.stage !== 'done') return null;
    if (interlude.spot === 'diceDen' && interlude.bet && interlude.throws) {
        return <DiceDenTable bet={interlude.bet} throws={interlude.throws} won={interlude.won} setRevealed={setRevealed} next={challenge} />;
    }
    return (
        <>
            <p className={`outcome ${interlude.spot === 'hotTub' ? (interlude.surge.good ? 'good' : 'bad') : ''}`}>
                {interlude.spot === 'hotTub'
                    ? <><span className="blessing-name">{interlude.surge.name}</span>{interlude.surge.id === 'pruney' ? <>You start the fight with {next} on <strong>{interlude.hearts} hearts</strong>.</> : interlude.surge.text.replace('next fight', `against ${next}`)}</>
                    : interlude.spot === 'shrine'
                    ? (interlude.gift === 'favour'
                        ? <><span className="blessing-name">The Lady's Favour</span>You start the fight with {next} on <strong>{interlude.hearts} hearts</strong>.</>
                        : <><span className="blessing-name">The Lady's Grace</span>The next time you'd lose a heart to dust, she saves you.</>)
                    : interlude.spot === 'stranger'
                        ? (interlude.keepsake ? <><strong>{interlude.keepsake.name}</strong> is yours. The next fight starts on {interlude.hearts} hearts.</> : 'You leave the Stranger to the shadows.')
                    : interlude.spot === 'bard'
                        ? (interlude.song ? <><span className="blessing-name">{interlude.song.name}</span>{interlude.song.id === 'cuttingWords' ? <>{next}'s first hand that counts scores 3 less.</> : <>Your first throw against {next}: throw it again if you don't like it.</>}</> : 'You leave the Bard to his lute.')
                    : interlude.spot === 'yvesil'
                        ? (interlude.omen ? <><span className="blessing-name">{interlude.omen.name}</span>{interlude.omen.text}</> : 'You leave the oracle to her cards.')
                    : interlude.spot === 'jorvash'
                        ? (interlude.drink ? <><span className="blessing-name">{interlude.drink.name}</span>{interlude.drink.text}</> : 'You wave Jorvash away.')
                    : interlude.spot === 'kram'
                        ? (interlude.sworn ? <><span className="blessing-name">Sworn to Kram</span>Your dice never land on 1 for your next {interlude.fights} fights.</> : 'You refuse. The cultists melt back into the crowd.')
                        : 'You leave the dice to others.'}
            </p>
            <div className="event-choices">{interlude.spot === 'stranger' || interlude.spot === 'kram' ? afterEvent : challenge}</div>
        </>
    );
}

// A die as on the table: ivory with black pips, a red 1 and green 6. While `rolling`, it
// tumbles through faces.
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, rolling, delay = 0 }: { value: number | null; rolling?: boolean; delay?: number }) {
    const [face, setFace] = useState(value ?? 0);
    useEffect(() => {
        if (!rolling) { setFace(value ?? 0); return; }
        const timer = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
        return () => clearInterval(timer);
    }, [rolling, value]);
    const shown = rolling ? face : value ?? 0;
    return (
        <span className={`die2d face-${shown} ${rolling ? 'rolling' : ''}`} style={{ animationDelay: `${delay}ms` }} aria-label={shown ? String(shown) : 'not rolled'}>
            {Array.from({ length: 9 }, (_, i) => <span key={i} className={PIPS[shown]?.includes(i) ? 'pip' : ''} />)}
        </span>
    );
}

// The sound of real dice: the same physics the table uses, thrown off screen.
function clatter(values: number[]) {
    const track = simulateRoll(values.map((_, i) => i), values);
    playDiceImpacts(track.impacts);
}

const DIE_ROLL_MS = 850;

// The pickpocket: one die to catch the thief. They are the walk's one event: then the next fight.
function PickpocketRoll({ interlude, purse, setRevealed, next }: { interlude: Extract<Interlude, { stage: 'pickpocket' }>; purse: number; setRevealed: (v: boolean) => void; next: JSX.Element }) {
    const rolled = interlude.roll !== undefined;
    const [rolling, setRolling] = useState(false);
    useLayoutEffect(() => {
        if (!rolled) return;
        setRolling(true);
        setRevealed(false);
        clatter([interlude.roll!]);
        const timer = setTimeout(() => {
            setRolling(false);
            setRevealed(true);
            playSound(interlude.caught ? 'yay' : 'thiefLaugh'); // (the thief's laugh as they get away: the user's clip, 4 Nov)
        }, DIE_ROLL_MS);
        return () => clearTimeout(timer);
    }, [rolled, interlude.roll, interlude.caught, setRevealed]);
    const catchFaces = Array.from({ length: 7 - interlude.catchOn }, (_, i) => interlude.catchOn + i).join(', ').replace(/, (\d)$/, ' or $1');
    const done = rolled && !rolling;
    return (
        <>
            {!rolled && <p className="scene-text">The thief is making off with <strong>{coins(interlude.steal)}</strong>. Roll a {catchFaces} to spot them.</p>}
            {rolled && (
                <div className={`dice-row single ${done ? (interlude.caught ? 'good' : 'bad') : ''}`}>
                    <Die value={interlude.roll!} rolling={rolling} />
                </div>
            )}
            {done && (
                <p className={`outcome ${interlude.caught ? 'good' : 'bad'}`}>
                    {interlude.caught
                        ? <>You rolled a {interlude.roll}: <strong>you spotted them!</strong> Your purse is safe.</>
                        : <>You rolled a {interlude.roll}: the thief slips away with <strong>{coins(interlude.lost)}</strong>. You have {coins(purse)} left.</>}
                </p>
            )}
            <div className="event-choices">
                {!rolled && <button className="primary" onClick={() => actions.pickpocket('roll')}>Roll to spot them</button>}
                {done && next}
            </div>
        </>
    );
}

// Darren Snakehands knocks into you: one die decides whether a Thonic smashes, he gives you one
// by way of sorry, or his snakes catch everything (a Thonic and gold). Then the next fight.
function DarrenRoll({ interlude, setRevealed, next }: { interlude: Extract<Interlude, { stage: 'darren' }>; setRevealed: (v: boolean) => void; next: JSX.Element }) {
    const rolled = interlude.roll !== undefined;
    const [rolling, setRolling] = useState(false);
    useLayoutEffect(() => {
        if (!rolled) return;
        setRolling(true);
        setRevealed(false);
        clatter([interlude.roll!]);
        const timer = setTimeout(() => {
            setRolling(false);
            setRevealed(true);
            playSound(interlude.outcome === 'smash' ? 'aww' : 'yay');
            if (interlude.outcome === 'catch') playCoins(5);
        }, DIE_ROLL_MS);
        return () => clearTimeout(timer);
    }, [rolled, interlude.roll, interlude.outcome, setRevealed]);
    const done = rolled && !rolling;
    const good = interlude.outcome !== 'smash';
    return (
        <>
            {!rolled && (
                <p className="scene-text">
                    His snake-arms knock right into you. Roll: 1-{interlude.smashOn} something smashes, {interlude.smashOn + 1}-{interlude.giftOn} he makes it up to you, {interlude.giftOn + 1}-6 the snakes catch everything.
                </p>
            )}
            {rolled && (
                <div className={`dice-row single ${done ? (good ? 'good' : 'bad') : ''}`}>
                    <Die value={interlude.roll!} rolling={rolling} />
                </div>
            )}
            {done && (
                <p className={`outcome ${good ? 'good' : 'bad'}`}>
                    {interlude.outcome === 'smash'
                        ? (interlude.smashed
                            ? <>You rolled a {interlude.roll}: your <strong>{interlude.smashed.name}</strong> smashes on the floor.</>
                            : <>You rolled a {interlude.roll}: a tray of glasses goes over. You pay <strong>{coins(interlude.paid)}</strong> for the glass.</>)
                        : <>You rolled a {interlude.roll}: {interlude.thonic ? <>a free <strong>{interlude.thonic.name}</strong> for your shelf</> : <>your shelf is full, so <strong>{coins(interlude.gold)}</strong> instead</>}
                            {interlude.outcome === 'catch' && interlude.thonic && <>, and <strong>+{coins(interlude.gold)}</strong></>}.</>}
                </p>
            )}
            <div className="event-choices">
                {!rolled && <button className="primary" onClick={() => actions.darren('roll')}>Roll the die</button>}
                {done && next}
            </div>
        </>
    );
}

// The Dice Den: you roll your two dice, then the gambler rolls theirs; a tie rolls again.
// Each new throw plays out in turn (yours, then the gambler's), then the result.
function DiceDenTable({ bet, throws, won, setRevealed, next }: { bet: number; throws: DiceThrow[]; won?: boolean; setRevealed: (v: boolean) => void; next: JSX.Element | null }) {
    const last = throws.at(-1) ?? null;
    const [phase, setPhase] = useState<'ready' | 'you' | 'them' | 'shown'>(last ? 'you' : 'ready');
    const [asked, setAsked] = useState(false);
    useLayoutEffect(() => {
        if (!last) return;
        setAsked(false);
        setPhase('you');
        setRevealed(false);
        clatter(last.you);
        const t1 = setTimeout(() => { setPhase('them'); clatter(last.them); }, DIE_ROLL_MS + 250);
        const t2 = setTimeout(() => {
            setPhase('shown');
            setRevealed(true);
            if (won !== undefined) playSound(won ? 'yay' : 'aww');
        }, 2 * DIE_ROLL_MS + 450);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [throws.length, last, won, setRevealed]);
    const sum = (d: [number, number]) => d[0] + d[1];
    const youShown = last && phase !== 'you';
    const themShown = last && phase === 'shown';
    const tie = phase === 'shown' && won === undefined;
    return (
        <>
            <p className="scene-text">Your bet: <strong>{coins(bet)}</strong></p>
            <div className="dice-den">
                <div className={`dice-row ${themShown && won === true ? 'good' : ''}`}>
                    <span className="who">You</span>
                    <Die value={last ? last.you[0] : null} rolling={phase === 'you'} />
                    <Die value={last ? last.you[1] : null} rolling={phase === 'you'} delay={60} />
                    <span className="total">{youShown ? sum(last.you) : ''}</span>
                </div>
                <div className={`dice-row ${themShown && won === false ? 'good' : ''}`}>
                    <span className="who">Gambler</span>
                    <Die value={last && phase !== 'you' ? last.them[0] : null} rolling={phase === 'them'} />
                    <Die value={last && phase !== 'you' ? last.them[1] : null} rolling={phase === 'them'} delay={60} />
                    <span className="total">{themShown ? sum(last.them) : ''}</span>
                </div>
            </div>
            {tie && <p className="outcome">A tie! Roll again.</p>}
            {phase === 'shown' && won !== undefined && (
                <p className={`outcome ${won ? 'good' : 'bad'}`}>
                    {won ? <>You win <strong>+{coins(bet)}</strong>!</> : <>The gambler takes your {coins(bet)}.</>}
                </p>
            )}
            <div className="event-choices">
                {(phase === 'ready' || tie) && (
                    <button className="primary" disabled={asked} onClick={() => { setAsked(true); actions.diceRoll(); }}>
                        {tie ? 'Roll again' : 'Roll the dice'}
                    </button>
                )}
                {phase === 'shown' && won !== undefined && next}
            </div>
        </>
    );
}

// After a fight is won, before the next event: what it paid, one line at a time with a clink of
// coins, then the purse counting up to its new total. Shown once per win (remembered on this
// device); a resumed run's last win was shown before it was saved.
// What an opponent says on the summary, once you've beaten them (the user's, 5 Nov).
const WON_LINES: Record<string, string> = { 'Sperm McGrath': 'Alright then, in you go' };
const WIN_STEP_MS = 700;
const HEART_TALLY_MS = 160; // between the coin tallies for each heart left
const winKey = (won: ShopArrival) => String(won.at ?? won.defeated);
function readSeenWin() {
    try { return localStorage.getItem('tavernWinSeen') ?? ''; } catch { return ''; }
}

function FightWon({ state, won, onLeaving, onNext }: { state: GameState; won: ShopArrival; onLeaving: () => void; onNext: () => void }) {
    const run = state.tavernRun!;
    const gold = won.gold;
    const heartsLeft = gold.heartsLeft ?? (gold.perHeart ? Math.round(gold.hearts / gold.perHeart) : 0);
    const rows = [
        { key: 'win', label: `Beating ${won.defeated}`, detail: won.place ? `opponent ${won.place}` : '', amount: gold.win },
        ...(gold.hearts > 0 ? [{ key: 'hearts', label: 'Hearts left', detail: gold.perHeart ? `${heartsLeft} × ${coins(gold.perHeart)}` : '', amount: gold.hearts }] : []),
        ...(gold.miser ? [{ key: 'miser', label: "Miser's Purse", detail: '1 for every 10 in your purse', amount: gold.miser }] : [])
    ];
    const total = gold.win + gold.hearts + (gold.miser ?? 0);
    const [before] = useState(() => Math.max(0, run.purse - total));
    // step: how many rows are showing; one more than the rows = the purse counts up.
    const [step, setStep] = useState(0);
    useEffect(() => {
        // The user's sounds (4 Nov): Tavern Crawl Victory as the summary opens; the coin tally once
        // for the win's gold and once for each heart left, in quick succession (the Miser's Purse once).
        playSound('tavernVictory');
        const timers: ReturnType<typeof setTimeout>[] = [];
        rows.forEach((row, i) => {
            const at = 500 + i * WIN_STEP_MS;
            timers.push(setTimeout(() => setStep(i + 1), at));
            const tallies = row.key === 'hearts' ? Math.max(1, heartsLeft) : 1;
            for (let n = 0; n < tallies; n++) timers.push(setTimeout(() => playSound('coinTally'), at + n * HEART_TALLY_MS));
        });
        timers.push(setTimeout(() => { setStep(rows.length + 1); playSound('coinPayout'); }, 500 + rows.length * WIN_STEP_MS)); // the user's clip as the purse total lands (28 Oct)
        return () => timers.forEach(clearTimeout);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const counting = step > rows.length;
    const added = useCountUp(counting ? total : 0, 900);
    const [leaving, setLeaving] = useState(false);
    // The event comes up underneath as the summary fades away (no flash of the table between).
    const next = () => {
        if (leaving) return;
        setLeaving(true);
        onLeaving();
        setTimeout(onNext, LEAVE_MS);
    };
    return (
        <div className={`interlude-scene fight-won ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={`${won.defeated} is defeated`}
            style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/${sceneFileOf(won.defeated)}")` }}>
            <div className="interlude-body">
                <span className="won-portrait" style={avatarStyle(portraitFor(won.defeated))} aria-hidden="true" />
                {WON_LINES[won.defeated] && <p className="won-speech">{WON_LINES[won.defeated]}</p>}
                <h2 className="interlude-title">{won.defeated} is defeated!</h2>
                <ul className="won-rows">
                    {rows.map((row, i) => (
                        <li key={row.key} className={i < step ? 'shown' : ''}>
                            <span className="what">
                                {row.label}
                                {row.key === 'hearts' && <span className="won-hearts" aria-hidden="true">{Array.from({ length: heartsLeft }, (_, k) => <span key={k} style={{ animationDelay: `${0.12 * k}s` }}>♥</span>)}</span>}
                                {row.detail && <span className="detail">{row.detail}</span>}
                            </span>
                            <span className="amount">+{coins(row.amount)}</span>
                        </li>
                    ))}
                </ul>
                <div className={`won-purse ${counting ? 'shown' : ''}`}>
                    <span aria-hidden="true">🪙</span>
                    <span className="amount">{coins(before + added)}</span>
                    <span className="unit">in your purse</span>
                </div>
                <button className="primary onward" onClick={next} disabled={leaving}>Next</button>
            </div>
        </div>
    );
}

function Modals({ snap }: { snap: Snapshot }) {
    const modal = snap.modal;
    const [seenWin, setSeenWin] = useState(readSeenWin);
    const [winLeaving, setWinLeaving] = useState('');
    const run = snap.state?.tavernRun;
    // Between fights: once the fight's last roll has played out (betweenShown), the summary of
    // what it paid, then the event (or Thom's cart) underneath as the summary fades.
    if (run && (run.interlude || run.shop) && !modal) {
        if (!snap.betweenShown) return null;
        const won = run.lastWin;
        const key = won && !won.resumed && winKey(won) !== seenWin ? winKey(won) : '';
        const done = () => {
            try { localStorage.setItem('tavernWinSeen', key); } catch { /* storage unavailable */ }
            setSeenWin(key);
        };
        const scene = run.interlude ? <Interlude state={snap.state!} /> : <ThomShop snap={snap} state={snap.state!} />;
        return (
            <>
                {(!key || winLeaving === key) && scene}
                {key && <FightWon key={key} state={snap.state!} won={won!} onLeaving={() => setWinLeaving(key)} onNext={done} />}
            </>
        );
    }
    if (!modal) return null;
    if (modal.type === 'keepsakes') return <KeepsakeCards key={modal.nextEnemy} {...modal} />;
    if (modal.type === 'tavernOver') return <TavernOver summary={modal.summary} leaderboard={snap.leaderboard} met={snap.state?.tavernRun?.met} />;
    return (
        <div className="modal-backdrop">
            <div className="panel">
                <p className="game-over">{modal.message}</p>
                {snap.league && <LeagueTable rows={snap.league} room={snap.roomCode} me={snap.state && snap.myId ? snap.state.players[snap.myId]?.name : undefined} />}
                <div className="row">
                    <button className="primary" onClick={actions.playAgain}>Play again</button>
                    <button className="secondary" onClick={actions.dismissModal}>Close</button>
                </div>
            </div>
        </div>
    );
}

// Brodor's Astral Flood, after its banner (5 Nov, the user: a big effect on the player's screen): a
// wall of aurora light pours down over the table, ripples out from the felt, and drains away, full
// of falling stars. Over everything, taps go through; the heart he takes breaks as it hits.
// Aboard the Salty Swallow, the sea changes (9 Nov, the user's: "dynamic and atmospheric and weighty
// in true video game fashion"): a wash of sea sweeps in from the side she lists to, a wave crest
// breaks across the screen throwing spray, and a brass clinometer's needle swings past and settles
// on her new heel while the name slams in with what it means and the next round's forecast.
const SEA_WORDS: Record<SeaState['id'], { title: string; rule: string; sub: string }> = {
    starboard: { title: 'Listing to starboard', rule: 'Every die lands one higher', sub: 'No 1s · 6s twice as likely' },
    port: { title: 'Listing to port', rule: 'Every die lands one lower', sub: 'No 6s · no 24 this round' },
    calm: { title: 'The sea calms', rule: 'The dice land true', sub: 'A steady deck' },
    rogue: { title: 'Heavy seas', rule: 'A rogue wave is coming', sub: 'At the second throw it takes a loose die' },
    squall: { title: 'Squall!', rule: 'Keep two dice every throw', sub: 'Rain and wind · hands rushed' },
    fog: { title: 'Fog bank', rule: "Neither sees the other's hand", sub: 'Until both are done · play blind' },
    becalmed: { title: 'Becalmed', rule: 'Three throws a hand', sub: 'The sails hang slack · the third throw stays' }
};
// A brass ship's clinometer: its needle (.sea-needle) swings by CSS, from --from to --to (or rocks).
function Clinometer({ className = '' }: { className?: string }) {
    return (
        <svg className={`sea-gauge ${className}`} viewBox="0 0 220 124" aria-hidden="true">
            <defs>
                <linearGradient id="sea-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6dc8e" /><stop offset="0.5" stopColor="#c9973a" /><stop offset="1" stopColor="#7a5318" /></linearGradient>
                <radialGradient id="sea-face" cx="0.5" cy="1" r="1"><stop offset="0" stopColor="#123447" /><stop offset="1" stopColor="#06141d" /></radialGradient>
            </defs>
            <path d="M14,114 A96,96 0 0 1 206,114 Z" fill="url(#sea-face)" stroke="url(#sea-brass)" strokeWidth="7" />
            {Array.from({ length: 9 }, (_, i) => {
                const a = (-40 + i * 10) * Math.PI / 180, r1 = i % 2 ? 80 : 74, r2 = 88;
                return <line key={i} x1={110 + Math.sin(a) * r1} y1={114 - Math.cos(a) * r1} x2={110 + Math.sin(a) * r2} y2={114 - Math.cos(a) * r2} stroke={i === 4 ? '#ffe9a8' : '#c9a35a'} strokeWidth={i === 4 ? 3 : 2} />;
            })}
            <text x="34" y="106" className="sea-gauge-word">PORT</text>
            <text x="186" y="106" className="sea-gauge-word" textAnchor="end">STBD</text>
            <g className="sea-needle"><path d="M110,114 L106,108 L110,34 L114,108 Z" fill="#ffd36a" stroke="#6b4310" strokeWidth="1" /><circle cx="110" cy="114" r="7" fill="url(#sea-brass)" /></g>
        </svg>
    );
}

// The Salty Swallow sets sail (9 Nov, the user's): as the ship's first opponent sits down, before his
// entrance card. Its gun deck rolls on the swell under swinging lanterns, the ship's bell rings
// twice, the lines are cast off, a wave rises, the clinometer wakes, and the name: "The Salty
// Swallow sets sail". About 6.4 s; a tap skips it. The user's painting of the ship leaving harbour (9 Nov)
// drifts from the lantern-lit quay toward the moon and the open sea.
// Skipper Bren on the docks (9 Nov, the user's): before the Salty Swallow sets sail, Bren, its master,
// meets you on the quay at dusk (the user's painting of the ship at the quay), welcomes you aboard and tells you of the
// sea die; "Climb aboard" casts off. Bren's painting (`art/bust-bren.jpg` → `bren.webp`, the prompt is in
// docs/art-direction.md; the user's, 9 Nov); without it, a silhouette in a captain's hat.
const BREN_LINES = ["You'll be the one from the Portal. Word travels fast on the docks.", "Welcome aboard the Salty Swallow. Out there, we'll make an honest player of you."];
function DockScene() {
    const [line, setLine] = useState(0);
    const [painted, setPainted] = useState(true);
    useEffect(() => {
        playSeaSwell('calm');
        const timer = setTimeout(() => setLine(1), 2600);
        return () => clearTimeout(timer);
    }, []);
    return createPortal(
        <div className="dock-scene" role="dialog" aria-label="Skipper Bren welcomes you aboard">
            <div className="dock-harbour" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/salty-swallow-quay.webp")` }} />
            <div className="dock-stage">
                {/* (The bubble over his head, sized with him: a wrapper the size of the figure.) */}
                <div className={`dock-bren${painted ? '' : ' silhouette'}`}>
                    <div className="dock-figure">
                        {painted
                            ? <img src={`${import.meta.env.BASE_URL}art/bren.webp`} alt="" draggable={false} onError={() => setPainted(false)} />
                            : <BrenSilhouette />}
                    </div>
                    <div key={line} className={`thom-speech dock-speech${line ? " quick" : ""}`}>{BREN_LINES[line]}</div>
                </div>
            </div>
            <div className="dock-counter">
                <div className="dock-plate"><strong>Skipper Bren</strong><span>Master of the Salty Swallow</span></div>
                <p>At sea the weather turns every round. From each fight's second round the <b>sea die</b> is rolled first, and its dial tells you what the sea brings: a list to port or starboard, a squall, a rogue wave, a fog bank, a dead calm. It plays your dice and your opponent's alike.</p>
                <button className="primary" onClick={() => { playSound('click'); actions.boardShip(); }}>Climb aboard</button>
            </div>
        </div>,
        document.body
    );
}
// Until Bren is painted: a figure in a captain's hat against the harbour lights.
function BrenSilhouette() {
    return (
        <svg className="bren-silhouette" viewBox="0 0 200 260" aria-hidden="true">
            {/* Shoulders and a coat collar, a head, and a tricorn hat. */}
            <path d="M14,260 C16,206 46,180 80,170 L86,154 C72,144 66,124 67,104 C69,82 84,70 100,70 C116,70 131,82 133,104 C134,124 128,144 114,154 L120,170 C154,180 184,206 186,260 Z" fill="#120c08" stroke="#ffb85c" strokeWidth="1.4" strokeOpacity="0.5" />
            <path d="M80,170 L100,198 L120,170" fill="none" stroke="#ffb85c" strokeWidth="1.2" strokeOpacity="0.35" />
            <path d="M30,92 C58,60 82,84 100,58 C118,84 142,60 170,92 C140,84 124,90 100,88 C76,90 60,84 30,92 Z" fill="#0e0906" stroke="#ffb85c" strokeWidth="1.4" strokeOpacity="0.55" />
        </svg>
    );
}

const SAIL_MS = 6400;
function SetSail({ at }: { at: number }) {
    useEffect(() => {
        const timers = [
            setTimeout(() => playShipBell(2), 250),
            setTimeout(() => playSeaSwell('heel'), 2300),
            setTimeout(() => actions.endSail(), Math.max(0, SAIL_MS - (performance.now() - at)))
        ];
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.endSail(); };
        window.addEventListener('keydown', onKey);
        return () => { timers.forEach(clearTimeout); window.removeEventListener('keydown', onKey); };
    }, [at]);
    return createPortal(
        <div className="sail-scene" role="dialog" aria-label="The Salty Swallow sets sail" onClick={() => actions.endSail()}>
            <div className="sail-deck harbour" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/salty-swallow-sets-sail.webp")` }} />
            <span className="sail-sea" aria-hidden="true" />
            <span className="sea-foam sail-foam" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                    <i key={i} style={{ left: `${(i * 37 + 5) % 100}%`, animationDelay: `${2.35 + ((i * 0.071) % 0.6)}s`, '--dx': `${((i * 23) % 50) - 25}px`, '--dy': `${60 + (i * 47) % 110}px`, '--s': `${4 + (i * 5) % 8}px` } as React.CSSProperties} />
                ))}
            </span>
            <p className="sail-line first">The bell rings. The lines are cast off…</p>
            <div className="sail-title">
                <strong>The Salty Swallow</strong>
                <span>sets sail</span>
            </div>
            <div className="sail-gauge"><Clinometer className="rocking" /></div>
            <p className="sail-line last">Four fights at sea. Every round, the sea die decides.</p>
            <button className="sail-skip" onClick={e => { e.stopPropagation(); actions.endSail(); }}>Skip ›</button>
        </div>,
        document.body
    );
}
function SeaMoment({ snap }: { snap: Snapshot }) {
    const m = snap.seaMoment;
    const [visible] = useMoment(m?.at ?? 0, m?.changed ? SEA_SHOW_MS : SEA_HOLD_MS);
    if (!visible || !m) return null;
    return createPortal(<SeaRollView key={m.at} m={m} />, document.body);
}
// (Its own piece, so its clock starts as it appears: the die tumbles, then lands on its face.)
function SeaRollView({ m }: { m: SeaRoll & { at: number } }) {
    const [rolling, setRolling] = useState(true);
    useEffect(() => {
        clatter([m.face]);
        const timer = setTimeout(() => setRolling(false), SEA_LAND_MS - 120); // (from when it appears)
        return () => clearTimeout(timer);
    }, [m]);
    const words = SEA_WORDS[m.id];
    const dir = Math.sign(m.shift);
    const vars = { '--dir': dir || 1, '--to': `${faceAngle(m.face)}deg` } as React.CSSProperties;
    return (
        <div className={`sea-moment sea-${m.id} ${m.changed ? 'changed' : 'holds'}`} style={vars} role="status" aria-live="polite">
            <span className="sea-wash" aria-hidden="true" />
            {m.changed && <span className="sea-crest" aria-hidden="true" />}
            {m.changed && (
                <span className="sea-foam" aria-hidden="true">
                    {Array.from({ length: 24 }, (_, i) => (
                        <i key={i} style={{ left: `${(i * 41 + 7) % 100}%`, animationDelay: `${1.65 + ((i * 0.067) % 0.5)}s`, '--dx': `${((i * 29) % 60) - 30 + (dir || 1) * 40}px`, '--dy': `${70 + (i * 53) % 120}px`, '--s': `${4 + (i * 7) % 9}px` } as React.CSSProperties} />
                    ))}
                </span>
            )}
            <div className="sea-card">
                <span className="sea-kicker">The sea die</span>
                <SeaDial faces={m.faces} face={m.face} />
                <span className={`sea-die-wrap ${rolling ? 'rolling' : 'landed'}`}><SeaDie value={m.face} rolling={rolling} /></span>
                <div className="sea-news">
                    <strong className="sea-title">{m.changed ? words.title : `The sea holds`}</strong>
                    <span className="sea-rule">{m.changed ? words.rule : `${m.name}: ${SEA_EFFECT[m.id]}`}</span>
                    {m.changed && <span className="sea-sub">{words.sub}</span>}
                </div>
            </div>
        </div>
    );
}

// The sea die's dial (9 Nov, the user's painting: a brass half-circle under glass, its six sectors numbered
// 1 to 6, PORT and STBD, and a brass needle with a dark stone). Over the painting, each sector is tinted
// by what that face brings on this leg (port red, calm sea-blue, starboard green). The needle hunts while
// the die tumbles, then swings onto the face it landed on (with overshoot) and that sector lights up.
// The painting's geometry, in `sea-dial.webp`'s pixels (1245x679): the needle's pivot, and the sectors'
// radii; the needle (`sea-dial-needle.webp`, 186x701) turns about the middle of its hub ring.
const SEA_COLOURS: Record<SeaState['id'], [string, string]> = { port: ['#c0392b', '#ff6b5a'], calm: ['#2a7fae', '#7fd0f0'], starboard: ['#2e9a5a', '#5fe29a'], rogue: ['#22c7c0', '#b8fff6'], squall: ['#8a5cf0', '#d8c8ff'], fog: ['#aeb8c4', '#ffffff'], becalmed: ['#d9a441', '#ffe2a0'] }; // (10 Nov: brighter, as the tints are screen-blended onto the painting and the old slate and indigo barely showed)
const faceAngle = (face: number) => -75 + (face - 1) * 30;
const DIAL = { w: 1245, h: 679, cx: 621, cy: 626, R: 414, r: 72 };
const NEEDLE = { w: 186, h: 701, px: 92.6, py: 603.6, reach: 372 };
function SeaDial({ faces, face }: { faces: SeaState['id'][]; face: number | null }) {
    const { cx, cy, R, r } = DIAL;
    const at = (deg: number, rad: number) => [cx + Math.sin(deg * Math.PI / 180) * rad, cy - Math.cos(deg * Math.PI / 180) * rad];
    const sector = (i: number) => {
        const a0 = -90 + i * 30, a1 = a0 + 30;
        const [x0, y0] = at(a0, R), [x1, y1] = at(a1, R), [x2, y2] = at(a1, r), [x3, y3] = at(a0, r);
        return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z`;
    };
    const k = NEEDLE.reach / NEEDLE.py; // the needle's scale on the dial
    const needle = { left: `${((cx - NEEDLE.px * k) / DIAL.w) * 100}%`, top: `${((cy - NEEDLE.py * k) / DIAL.h) * 100}%`, width: `${((NEEDLE.w * k) / DIAL.w) * 100}%`, transformOrigin: `${(NEEDLE.px / NEEDLE.w) * 100}% ${(NEEDLE.py / NEEDLE.h) * 100}%` };
    const base = import.meta.env.BASE_URL;
    return (
        <span className="sea-dial" aria-hidden="true">
            <img className="dial-painting" src={`${base}art/sea-dial.webp`} alt="" draggable={false} />
            <svg className="dial-tints" viewBox={`0 0 ${DIAL.w} ${DIAL.h}`}>
                {faces.map((id, i) => (
                    <path key={i} className={`dial-sector ${face === i + 1 ? 'lit' : ''}`} d={sector(i)} fill={SEA_COLOURS[id][0]} style={{ '--lit': SEA_COLOURS[id][1] } as React.CSSProperties} />
                ))}
            </svg>
            <img className="sea-needle" src={`${base}art/sea-dial-needle.webp`} alt="" draggable={false} style={needle} />
        </span>
    );
}

// The sea die itself (the user's painting, 9 Nov: sea-green glass, pearl pips, a pink pearl 1 and
// barnacles): its six faces side by side in `sea-die.webp`. Tumbles through faces like the 2D dice.
function SeaDie({ value, rolling }: { value: number; rolling: boolean }) {
    const [face, setFace] = useState(value);
    useEffect(() => {
        if (!rolling) { setFace(value); return; }
        const timer = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
        return () => clearInterval(timer);
    }, [rolling, value]);
    const shown = rolling ? face : value;
    return <span className="sea-die" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/sea-die.webp")`, backgroundPosition: `${(shown - 1) * 20}% 0` }} aria-label={String(shown)} />;
}

// Heavy seas' rogue wave (10 Nov, the user's): as the second throw is made, a wall of water breaks across
// the screen with spray, the deck heaves, and the die it takes rides the crest over the rail (Dice.tsx);
// a card says so. Taps go through. WAVE_SHOW_MS, like every moment, before the throw.
function WaveMoment({ snap }: { snap: Snapshot }) {
    const m = snap.waveMoment;
    const [visible] = useMoment(m?.at ?? 0, WAVE_SHOW_MS);
    if (!visible || !m) return null;
    const mine = m.playerId === snap.myId;
    return createPortal(
        <div key={m.at} className="sea-moment sea-rogue changed wave-moment" style={{ '--dir': 1 } as React.CSSProperties} role="status" aria-live="polite">
            <span className="sea-wash" aria-hidden="true" />
            <span className="sea-crest" aria-hidden="true" />
            <span className="sea-foam" aria-hidden="true">
                {Array.from({ length: 30 }, (_, i) => (
                    <i key={i} style={{ left: `${(i * 41 + 7) % 100}%`, animationDelay: `${0.45 + ((i * 0.061) % 0.55)}s`, '--dx': `${((i * 29) % 70) - 20 + 50}px`, '--dy': `${90 + (i * 53) % 150}px`, '--s': `${4 + (i * 7) % 10}px` } as React.CSSProperties} />
                ))}
            </span>
            <div className="sea-card">
                <span className="sea-kicker">Heavy seas</span>
                <div className="sea-news">
                    <strong className="sea-title">Rogue wave!</strong>
                    <span className="sea-rule">{mine ? 'One of your dice goes over the rail' : `One of ${m.name || 'their'}${m.name ? "'s" : ''} dice goes over the rail`}</span>
                    <span className="sea-sub">Five dice this hand · best 18</span>
                </div>
            </div>
        </div>,
        document.body
    );
}

// A Squall's round (10 Nov): the intro's rain, heavier and driven by the wind, over the whole table.
// A fog bank (10 Nov): mist drifting over the table while the round lasts.
function FogBank({ snap }: { snap: Snapshot }) {
    const fog = snap.state?.mode === 'tavern-crawl' && snap.state.tavernRun?.sea?.id === 'fog' && !snap.betweenShown;
    if (!fog) return null;
    return createPortal(<div className="fog-bank" aria-hidden="true">{[0, 1, 2, 3].map(i => <span key={i} className={`fog-layer l${i}`} />)}</div>, document.body);
}

function SquallRain({ snap }: { snap: Snapshot }) {
    const squall = snap.state?.mode === 'tavern-crawl' && snap.state.tavernRun?.sea?.id === 'squall' && !snap.betweenShown;
    useEffect(() => (squall ? startSceneAmbience('squall') : undefined), [squall]); // (the user's wind and rain, 10 Nov)
    if (!squall) return null;
    return createPortal(<div className="squall-rain" aria-hidden="true"><Rain className="squall-drops" slant={22} heavy={1.6} /></div>, document.body);
}

// Jaguar's own music while his fight lasts (the user's, 10 Nov), until the run-over screen.
function BossMusic({ snap }: { snap: Snapshot }) {
    const run = snap.state?.mode === 'tavern-crawl' ? snap.state.tavernRun : undefined;
    const on = !!run && (run.seated ?? run.enemy)?.id === 'jaguar' && !snap.betweenShown && snap.modal?.type !== 'tavernOver' && snap.modal?.type !== 'gameOver';
    useEffect(() => setBossMusic(on), [on]);
    useEffect(() => () => setBossMusic(false), []);
    return null;
}

function FloodWave() {
    return (
        <div className="flood-wave" aria-hidden="true">
            <span className="flood-sheet" />
            <span className="flood-ribbons" />
            <span className="flood-flash" />
            {[0, 1, 2].map(i => <span key={i} className="flood-ring" style={{ animationDelay: `${0.55 + i * 0.22}s` }} />)}
            {Array.from({ length: 26 }, (_, i) => (
                <span key={i} className="flood-star" style={{ left: `${(i * 37 + 11) % 98}%`, animationDelay: `${0.1 + (i * 0.083) % 1}s`, '--s': `${3 + (i * 5) % 5}px` } as React.CSSProperties} />
            ))}
        </div>
    );
}

// A multiplayer round's result (4 Nov, the user's call): everyone's score, best first, and who lost a
// heart or goes to sudden death. On the felt, for a few seconds; taps go through to the table.
function RoundResultCard({ rows, myId }: { rows: RoundResultRow[]; myId: string | null }) {
    const tied = rows.filter(r => r.tied).map(r => r.name);
    const nobodyLost = !rows.some(r => r.lost) && tied.length === 0;
    return (
        <div className="round-card" role="status">
            <strong className="round-card-title">Round result</strong>
            <ol>
                {rows.map(r => (
                    <li key={r.id} className={`${r.lost ? 'lost' : ''} ${r.id === myId ? 'me' : ''}`}>
                        <span className="who">{r.name}</span>
                        <span className={`score ${r.busted ? 'dust' : ''}`}>{r.busted ? 'Dust' : r.score}</span>
                        <span className="heart-lost" aria-label={r.lost ? 'loses a life' : undefined}>{r.lost ? '−1 ♥' : r.tied ? 'tied' : ''}</span>
                    </li>
                ))}
            </ol>
            {tied.length > 1 && <p className="round-card-note">Sudden death: {tied.join(' and ')}</p>}
            {nobodyLost && <p className="round-card-note">No lives lost</p>}
        </div>
    );
}

// A league table (4 Nov: table code JUGS): every finished game there, by player name.
function LeagueTable({ rows, room, me }: { rows: LeagueRow[]; room: string; me?: string }) {
    const mine = (me ?? '').trim().toLowerCase();
    return (
        <div className="leaderboard league">
            <h2>{room} league</h2>
            {rows.length === 0 ? <p className="fine">No games finished yet.</p> : (
                <ol>
                    <li className="heads" aria-hidden="true"><span className="rank" /><span className="who" /><span className="num">Won</span><span className="num">Played</span></li>
                    {rows.map((r, i) => (
                        <li key={r.name} className={r.name.trim().toLowerCase() === mine ? 'me' : ''}>
                            <span className="rank">{i + 1}</span>
                            <span className="who">{r.name}</span>
                            <span className="num wins">{r.wins}</span>
                            <span className="num">{r.games}</span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

// Reports how much of the bottom of the screen the controls cover, for the camera.
// A callback ref, because the footer only appears after joining (the HUD shows the start
// screen first), so a mount-time effect would never see it.
function useFooterInset() {
    const cleanup = useRef<(() => void) | null>(null);
    return useCallback((el: HTMLElement | null) => {
        cleanup.current?.();
        cleanup.current = null;
        if (!el) return;
        const measure = () => { screenInsets.bottom = Math.max(0, window.innerHeight - el.getBoundingClientRect().top); };
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        window.addEventListener('resize', measure);
        measure();
        cleanup.current = () => { observer.disconnect(); window.removeEventListener('resize', measure); screenInsets.bottom = 0; };
    }, []);
}

// The tuning panel (step G; with ?tune=1 in the address): sliders for the look's feel, the frame
// rate and the quality level, and a button that copies the settings to send back, so the numbers
// the user picks by eye become the game's (tuning.ts).
// The Portraits tab: pick a character, drag their picture in a big round frame, set the zoom.
// Every round avatar of theirs on this device follows at once; Copy gives the numbers.
function PortraitEditor() {
    const [key, setKey] = useState(EDITABLE[0]);
    const [, redraw] = useState(0);
    const frame = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; y: number } | null>(null);
    const p = editablePortrait(key);
    const nudge = p.nudge ?? [0, 0];
    const set = (zoom: number, n: [number, number]) => { editPortrait(key, { zoom, nudge: n }); redraw(v => v + 1); };
    const move = (e: React.PointerEvent) => {
        if (!drag.current || !frame.current) return;
        const size = frame.current.clientWidth;
        const dx = ((e.clientX - drag.current.x) / size) * 100, dy = ((e.clientY - drag.current.y) / size) * 100;
        drag.current = { x: e.clientX, y: e.clientY };
        const clamp = (v: number) => Math.max(-45, Math.min(45, v));
        set(p.zoom, [clamp(nudge[0] + dx), clamp(nudge[1] + dy)]);
    };
    const copy = async () => {
        const text = JSON.stringify(portraitEdits());
        try { await navigator.clipboard.writeText(text); showToast('', 'Portraits copied: paste them to Claude', 'info', 2600); }
        catch { showToast('Your portraits', text, 'info', 12000); }
    };
    return (
        <div className="portrait-editor">
            <select value={key} onChange={e => setKey(e.target.value)} aria-label="Character">
                {EDITABLE.map(k => <option key={k} value={k}>{k}{portraitEdits()[k] ? ' •' : ''}</option>)}
            </select>
            <div ref={frame} className="portrait-frame" style={avatarStyle(p)}
                onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
                role="img" aria-label={`${key}: drag to move`}>
                <span className="portrait-guide" aria-hidden="true" />
            </div>
            <p className="tune-note">Drag the picture. As small as the nameplates:</p>
            <div className="portrait-smalls" aria-hidden="true">
                <span style={avatarStyle(p)} /><span style={avatarStyle(p)} /><span style={avatarStyle(p)} />
            </div>
            <label className="tune-row">
                <span>Zoom</span>
                <input type="range" min={0.8} max={3.5} step={0.05} value={p.zoom} onChange={e => set(Number(e.target.value), nudge)} />
                <span className="tune-value">×{p.zoom.toFixed(2)}</span>
            </label>
            <p className="tune-note">Move: {nudge[0].toFixed(1)}, {nudge[1].toFixed(1)} (left/right, up/down)</p>
            <div className="tune-actions">
                <button className="primary" onClick={copy}>Copy portraits</button>
                <button className="secondary" onClick={() => { editPortrait(key, null); redraw(v => v + 1); }}>Undo this one</button>
            </div>
        </div>
    );
}

// The At the table tab: who sits across the table, moved and sized by eye against the table's
// centre line. Anyone can be brought to the table to look at; the fight carries on as it was.
function SeatEditor() {
    const [key, setKey] = useState(() => { const now = acrossTheTable()?.key; return now && SEATABLE.includes(now) ? now : SEATABLE[0]; });
    const [, redraw] = useState(0);
    seatPreview.key = key;
    useEffect(() => () => { seatPreview.key = null; }, []);
    const p = PORTRAITS[key];
    const size = p.seat ?? 1, shift = p.seatShift ?? [0, 0];
    const set = (nextSize: number, next: [number, number]) => { editSeat(key, { size: nextSize, shift: next }); redraw(v => v + 1); };
    const copy = async () => {
        const text = JSON.stringify({ seats: seatEditsNow() });
        try { await navigator.clipboard.writeText(text); showToast('', 'Seats copied: paste them to Claude', 'info', 2600); }
        catch { showToast('Your seats', text, 'info', 12000); }
    };
    return (
        <div className="portrait-editor seat-editor">
            {createPortal(<i className="seat-guide" aria-hidden="true" />, document.body)}
            <select value={key} onChange={e => setKey(e.target.value)} aria-label="Opponent">
                {SEATABLE.map(k => <option key={k} value={k}>{k}{seatEditsNow()[k] ? ' •' : ''}</option>)}
            </select>
            <label className="tune-row">
                <span>Left / right</span>
                <input type="range" min={-40} max={40} step={0.5} value={shift[0]} onChange={e => set(size, [Number(e.target.value), shift[1]])} />
                <span className="tune-value">{shift[0].toFixed(1)}</span>
            </label>
            <label className="tune-row">
                <span>Up / down</span>
                <input type="range" min={-40} max={40} step={0.5} value={shift[1]} onChange={e => set(size, [shift[0], Number(e.target.value)])} />
                <span className="tune-value">{shift[1].toFixed(1)}</span>
            </label>
            <label className="tune-row">
                <span>Size</span>
                <input type="range" min={0.6} max={2.8} step={0.01} value={size} onChange={e => set(Number(e.target.value), shift)} />
                <span className="tune-value">×{size.toFixed(2)}</span>
            </label>
            <div className="tune-actions">
                <button className="primary" onClick={copy}>Copy seats</button>
                <button className="secondary" onClick={() => { editSeat(key, null); redraw(v => v + 1); }}>Undo this one</button>
            </div>
        </div>
    );
}

function TuningPanel({ onClose }: { onClose: () => void }) {
    useSyncExternalStore(tuneStore.subscribe, tuneStore.version);
    const [tab, setTab] = useState<'look' | 'portraits' | 'seats'>('look');
    const [fps, setFps] = useState(framesPerSecond());
    useEffect(() => { const t = setInterval(() => setFps(framesPerSecond()), 500); return () => clearInterval(t); }, []);
    const copy = async () => {
        const text = JSON.stringify({ tuning, quality: quality.level, auto: quality.auto, fps, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}` });
        try { await navigator.clipboard.writeText(text); showToast('', 'Settings copied: paste them to Claude', 'info', 2600); }
        catch { showToast('Your settings', text, 'info', 12000); }
    };
    const levels: (Quality | 'auto')[] = ['auto', 'high', 'medium', 'low'];
    return (
        <div className="tune-panel" role="dialog" aria-label="Tuning">
            <div className="tune-head">
                <strong>Tuning</strong>
                <span className="tune-fps">{fps} fps · {quality.level}{quality.auto ? ' (auto)' : ''}</span>
                <button className="tune-close" onClick={onClose} aria-label="Close tuning">✕</button>
            </div>
            <div className="tune-levels tune-tabs">
                <button className={tab === 'look' ? 'on' : ''} onClick={() => setTab('look')}>Look</button>
                <button className={tab === 'portraits' ? 'on' : ''} onClick={() => setTab('portraits')}>Portraits</button>
                <button className={tab === 'seats' ? 'on' : ''} onClick={() => setTab('seats')}>At the table</button>
            </div>
            {tab === 'seats' ? <SeatEditor /> : tab === 'portraits' ? <PortraitEditor /> : <>
            {!lookNext && (
                <p className="tune-note">The classic look is on, so most sliders do nothing. <a href="?look=next">Back to the new look</a></p>
            )}
            <div className="tune-levels">
                {levels.map(l => (
                    <button key={l} className={(l === 'auto' ? quality.auto : !quality.auto && quality.level === l) ? 'on' : ''}
                        onClick={() => (l === 'auto' ? setQuality('high', true) : setQuality(l, false))}>{l === 'auto' ? 'Auto' : l[0].toUpperCase() + l.slice(1)}</button>
                ))}
            </div>
            <p className="tune-note">{QUALITY[quality.level].bloom ? '' : 'Glow off at this level. '}{QUALITY[quality.level].grain ? '' : 'Grain off at this level.'}</p>
            {(Object.keys(TUNE_LABELS) as (keyof Tuning)[]).map(key => (
                <label key={key} className="tune-row">
                    <span>{TUNE_LABELS[key]}</span>
                    <input type="range" min={0} max={2} step={0.05} value={tuning[key]} onChange={e => setTune(key, Number(e.target.value))} />
                    <span className="tune-value">×{tuning[key].toFixed(2)}</span>
                </label>
            ))}
            <div className="tune-actions">
                <button className="primary" onClick={copy}>Copy settings</button>
                <button className="secondary" onClick={resetTune}>Reset</button>
            </div>
            </>}
        </div>
    );
}

export function Hud() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const [musicOff, setMusicOffState] = useState(isMusicOff());
    const [soundsOff, setSoundsOffState] = useState(areSoundsOff());
    const introShowing = snap.introShowing;
    const [infoOpen, setInfoOpen] = useState(false);
    const [tuneOpen, setTuneOpen] = useState(false);
    const [leagueOpen, setLeagueOpen] = useState(false);
    const footerRef = useFooterInset();
    // Phones on their side keep every player in the column at the top left (no room for a bar).
    const sideways = useMedia('(orientation: landscape) and (max-height: 500px)');

    // The trailer (?trailer in the address): the game's own Perfect 24 and three 6s play over the table under it.
    if (trailerWanted) return <><Trailer /><Celebration snap={snap} /><DevilSixes snap={snap} /></>;
    if (!snap.joined) return <JoinScreen />;
    const state = snap.state;
    const botAcross = acrossTheTable()?.isBot ?? false;
    // A bot opponent has its nameplate; everyone else gets a chip.
    // You first, so your own chip is always in view; the rest in turn order.
    // A multiplayer table (no bot, no Tavern Crawl): the others sit in the rivals bar at the top.
    const multiplayer = !!state && state.mode !== 'tavern-crawl' && !state.players[BOT_ID] && !sideways;
    const chips = state ? state.playerOrder.filter(id => !(botAcross && id === BOT_ID) && (!multiplayer || id === snap.myId))
        .sort((x, y) => Number(y === snap.myId) - Number(x === snap.myId)) : [];

    return (
        <div className={`hud ${multiplayer ? 'multiplayer' : ''}`}>
            <header>
                <button className="leave" onClick={actions.leave} aria-label="Leave table" title="Leave table">⟵</button>
                {snap.league && <button className="mute league-button" onClick={() => setLeagueOpen(true)} aria-label="League table" title="League table">🏆</button>}
                <span className="room">{snap.roomLabel}</span>
                {/* While an ability lasts, the screen's edges glow in its colours (pointer-free, clear of the dice). */}
                {state && <AbilityAura snap={snap} state={state} />}
                {/* Tavern Crawl: the opponent's nameplate and your chip show whose turn it is. */}
                {state?.mode !== 'tavern-crawl' && <div className="turn-slot"><TurnBanner snap={snap} state={state} /></div>}
                <div className="sound-toggles">
                    {tunePanel && <button className="mute" onClick={() => setTuneOpen(!tuneOpen)} aria-label="Tuning" title="Tuning">⚙</button>}
                    <button className={`mute ${musicOff ? 'off' : ''}`} onClick={() => { setMusicOff(!musicOff); setMusicOffState(!musicOff); }}
                        aria-label={musicOff ? 'Music on' : 'Music off'} aria-pressed={!musicOff} title={musicOff ? 'Music is off' : 'Music is on'}>🎵</button>
                    <button className={`mute ${soundsOff ? 'off' : ''}`} onClick={() => { setSoundsOff(!soundsOff); setSoundsOffState(!soundsOff); }}
                        aria-label={soundsOff ? 'Game sounds on' : 'Game sounds off'} aria-pressed={!soundsOff} title={soundsOff ? 'Game sounds are off' : 'Game sounds are on'}>🔊</button>
                </div>
            </header>
            {state && multiplayer && <Rivals snap={snap} state={state} />}
            {state && <ReactionBursts snap={snap} />}
            {state && botAcross && !introShowing && <OpponentPlate state={state} onInfo={() => { setInfoOpen(true); playSound('click'); }} />}
            {snap.sailAt ? (snap.sailStage === 'dock' ? <DockScene /> : <SetSail at={snap.sailAt} />) : <EncounterIntro snap={snap} />}
            {infoOpen && state?.tavernRun && !state.tavernRun.interlude && !state.tavernRun.shop && (
                <button className="intro-veil info" onClick={() => setInfoOpen(false)} autoFocus>
                    <OpponentCard enemy={state.tavernRun.seated ?? state.tavernRun.enemy} place={state.tavernRun.place} state={state} close="Tap to close" />
                </button>
            )}
            <AbilityMomentView snap={snap} />
            {snap.floodWaveAt && <FloodWave key={snap.floodWaveAt} />}
            <SeaMoment snap={snap} />
            <WaveMoment snap={snap} />
            <SquallRain snap={snap} />
            <FogBank snap={snap} />
            <BossMusic snap={snap} />
            <Celebration snap={snap} />
            <DevilSixes snap={snap} />
            {snap.waiting && <WaitingCard snap={snap} />}
            {/* (Not over an opponent's entrance card: the card comes first.) */}
            {!introShowing && <YourTurnBanner at={snap.yourTurnAt} />}
            {tunePanel && tuneOpen && <TuningPanel onClose={() => setTuneOpen(false)} />}
            {leagueOpen && snap.league && (
                <div className="modal-backdrop" onClick={() => setLeagueOpen(false)}>
                    <div className="panel" onClick={e => e.stopPropagation()}>
                        <LeagueTable rows={snap.league} room={snap.roomCode} me={state && snap.myId ? state.players[snap.myId]?.name : undefined} />
                        <div className="row"><button className="secondary" onClick={() => setLeagueOpen(false)}>Close</button></div>
                    </div>
                </div>
            )}

            <div className="callout-area" aria-live="polite">
                {snap.callout && !multiplayer && <div key={snap.callout.key} className="callout" style={{ color: snap.callout.color }}>{snap.callout.text}</div>}
            </div>

            {/* The round result sits in the middle of the green felt (the user's call, 3 Nov), the rest higher up. */}
            <div className="toasts felt">
                {snap.roundResult && <RoundResultCard key={snap.roundResult.at} rows={snap.roundResult.rows} myId={snap.myId} />}
                {snap.toasts.filter(t => t.tone === 'result').map(t => (
                    <div key={t.id} className={`toast ${t.tone}`}>
                        {t.title && <strong>{t.title}</strong>}
                        <span>{t.text}</span>
                    </div>
                ))}
            </div>
            <div className="toasts">
                {snap.toasts.filter(t => t.tone !== 'result').map(t => (
                    <div key={t.id} className={`toast ${t.tone}`}>
                        {t.title && <strong>{t.title}</strong>}
                        <span>{t.text}</span>
                    </div>
                ))}
            </div>

            <footer ref={footerRef}>
                {state && <TavernStrip snap={snap} state={state} />}
                {state && <Players snap={snap} state={state} ids={chips} className="side-players" />}
                <TurnControls snap={snap} />
                {state && state.mode !== 'tavern-crawl' && (
                    <div className="reactions">
                        {REACTIONS.map(r => <button key={r.id} className="reaction-coin" onClick={() => actions.react(r.emoji)} aria-label={r.name} title={r.name}>{reactionIcon(r.emoji)}</button>)}
                    </div>
                )}
            </footer>
            <Modals snap={snap} />
        </div>
    );
}
