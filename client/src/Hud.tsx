import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { screenInsets } from './layout';
import { actions, canPutBack, store, BOT_ID, type GameState, type Keepsake, type Snapshot, type TavernSummary, type Thonic } from './game';
import { Rules } from './rules';
import { areSoundsOff, isMusicOff, playSound, setMusicOff, setSoundsOff } from './sounds';
import { AVATAR_IDS, avatarStyle, portraitFor } from './portraits';
import { acrossTheTable, opponentName } from './Backdrop';

const REACTIONS = ['😀', '😂', '😮', '😎', '😭'];

// The bot's portrait is its name (one per Tavern Crawl encounter); players pick an avatar.
const playerPortrait = (id: string, name: string, avatar: string) => portraitFor(id === BOT_ID ? name : avatar);

function readPrefs() {
    try {
        return {
            name: localStorage.getItem('tavernName') ?? '',
            avatar: localStorage.getItem('tavernAvatar') ?? 'Devil',
            code: localStorage.getItem('tavernRoom') ?? ''
        };
    } catch {
        return { name: '', avatar: 'Devil', code: '' };
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
    const [avatar, setAvatar] = useState(AVATAR_IDS.includes(prefs.avatar) ? prefs.avatar : 'Devil');
    const [code, setCode] = useState(invite || (['COMP', 'TAVERN'].includes(prefs.code) ? '' : prefs.code));
    const [lives, setLives] = useState(3);

    const join = (tableCode: string) => {
        savePrefs(name, avatar, tableCode);
        actions.join(name, avatar, tableCode, lives);
    };

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
                <button className={invite ? 'secondary' : 'primary'} onClick={() => join('COMP')}>Solo vs The Molar</button>
                <button className={invite ? 'secondary' : 'primary alt'} onClick={() => join('TAVERN')}>Tavern Crawl</button>
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
    return !p.connected ? 'Offline' : p.lives <= 0 ? 'Out' : p.score === null ? '–' : p.busted ? 'Dust' : String(p.score);
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
    return scores.length > 1 && p.score === Math.min(...scores) ? 'lowest' : 'scored';
}

// What the player rolling now has to do. The lowest score of the round loses a life (and
// dust always does), so the score to beat is the lowest among those who've finished.
function scoreToBeat(state: GameState, rollerId: string): { label: string; target: number | null } | null {
    const finished = state.roundPlayers.filter(id => id !== rollerId && state.players[id] && state.players[id].score !== null);
    if (finished.length === 0) return null; // first to roll: nothing to beat yet
    const scores = finishedScores(state, rollerId);
    if (scores.length === 0) return { label: 'Everyone else dusted: just find a 2 and a 4', target: null };
    return { label: 'Score to beat', target: Math.min(...scores) };
}

function Hearts({ lives, starting }: { lives: number; starting: number }) {
    const n = Math.max(0, lives);
    return <div className="hearts" aria-label={`${n} lives`}>{'♥'.repeat(n)}<span>{'♥'.repeat(Math.max(0, starting - n))}</span></div>;
}

// Player chips: a column at the top left on wide screens, a scrolling row above the
// controls on phones. A bot opponent has a nameplate on the table edge instead.
function Players({ snap, state, ids, className = '' }: { snap: Snapshot; state: GameState; ids: string[]; className?: string }) {
    // On phones the row scrolls sideways: keep whoever is rolling in view.
    const row = useRef<HTMLDivElement>(null);
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
                    <div key={id} className={`player ${id === state.currentTurnId ? 'current' : ''} ${inRound ? '' : 'out'} ${id === snap.myId ? 'me' : ''}`}>
                        <div className="portrait" style={avatarStyle(playerPortrait(id, p.name, p.avatar))} />
                        <div>
                            <div className="name">{p.name}</div>
                            <Hearts lives={p.lives} starting={state.startingLives} />
                        </div>
                        <div className={`score ${scoreClass(state, id)}`}>{scoreText(p)}</div>
                    </div>
                );
            })}
        </div>
    );
}

// The opponent's name, lives and score on the table edge, under their portrait.
function OpponentPlate({ state }: { state: GameState }) {
    const bot = state.players[BOT_ID];
    if (!bot) return null;
    const starting = state.mode === 'tavern-crawl' && state.tavernRun ? state.tavernRun.enemy.lives : state.startingLives;
    return (
        <div className={`opponent-plate ${state.currentTurnId === BOT_ID ? 'current' : ''}`}>
            {state.tavernRun && <span className="encounter">{state.tavernRun.encounterNumber}/{state.tavernRun.totalEncounters}</span>}
            <span className="name">{opponentName() ?? bot.name}</span>
            <Hearts lives={bot.lives} starting={starting} />
            <span className={`score ${scoreClass(state, BOT_ID)}`}>{scoreText(bot)}</span>
        </div>
    );
}

// Always the same size, whoever's turn it is, so the table doesn't shift between turns.
function TurnControls({ snap }: { snap: Snapshot }) {
    const turn = snap.turn;
    if (!turn) return <div className="controls" />;
    const hiddenLocked = turn.dice.some(d => d.hidden && d.status !== 'active');
    const scoring = Rules.scoreDice(turn.dice);
    // A Steady Thonic turns dust into a 0.
    const dust = turn.finalized && !!turn.outcome?.busted && !turn.steady;
    const scoreText = dust ? 'X' : turn.finalized && turn.outcome?.busted ? '0' : hiddenLocked ? '?' : String(scoring.score);
    const state = snap.state;
    const goal = state && !snap.waiting ? scoreToBeat(state, turn.playerId) : null;
    const roller = state?.players[turn.playerId];
    // Green once the dice already beat it (with the 2 and 4 in hand), amber on a tie.
    const standing = goal?.target != null && !hiddenLocked && scoring.has2 && scoring.has4
        ? (scoring.score > goal.target ? 'ahead' : scoring.score === goal.target ? 'level' : '')
        : '';

    let label = 'Roll Dice';
    let disabled = !turn.canRoll;
    if (snap.rolling) { label = 'Rolling…'; disabled = true; }
    else if (turn.finalized) { label = snap.endingTurn ? 'Ending…' : 'End Turn'; disabled = snap.endingTurn; }

    const hint = snap.isMyTurn && snap.putBackSlot !== null ? 'Tap a kept die to put it back'
        : snap.isMyTurn && turn.hasRolled && !turn.finalized && !snap.rolling && turn.locksThisRoll === 0 && !turn.canRoll ? 'Tap dice to keep them, then roll again' : '';

    return (
        <div className="controls">
            {goal ? (
                <div className="goal">
                    <span className="label">{goal.target != null && !snap.isMyTurn && roller ? `${roller.name} must beat` : goal.label}</span>
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
                className={`roll ${turn.finalized ? 'end' : ''} ${snap.isMyTurn ? '' : 'idle'}`}
                disabled={disabled || !snap.isMyTurn}
                onClick={actions.roll}
                aria-hidden={!snap.isMyTurn}
            >{snap.isMyTurn ? label : roller ? `${roller.name}'s turn` : label}</button>
            <div className="hint">{hint}</div>
        </div>
    );
}

// Keepsakes won so far in a Tavern Crawl (the encounter number is on the nameplate).
function TavernStrip({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun;
    if (!run) return null;
    return (
        <div className="tavern-strip">
            <span className="purse" aria-label={`${run.purse} gold`}><span aria-hidden="true">🪙</span> {run.purse}</span>
            <Shelf snap={snap} state={state} />
            {run.keepsakes.map(k => <span key={k.id} className="keepsake" title={k.text}>{k.name}</span>)}
        </div>
    );
}

// A small painted bottle; the colour says which Thonic it is.
function Bottle({ thonic }: { thonic: Thonic | null }) {
    return <span className={`bottle ${thonic ? thonic.id : 'empty'}`} aria-hidden="true"><span className="liquid" /></span>;
}

// When a Thonic can be drunk, always on your own turn (the server checks the same):
// Healing and Clear-Eye before you roll; Fizzy after a roll that shows 1s; Second Thoughts
// after a roll, once you've kept a die; Steady any time, once a turn.
function drinkable(t: Thonic, snap: Snapshot, state: GameState) {
    const turn = snap.turn;
    const me = snap.myId ? state.players[snap.myId] : null;
    const run = state.tavernRun;
    if (!t.drink || !me || !run || !turn || !snap.isMyTurn || snap.rolling || snap.endingTurn) return false;
    switch (t.id) {
        case 'healing': return !turn.hasRolled && me.lives < state.startingLives;
        case 'clearEye': return !turn.hasRolled && !!run.enemy.ability && !run.clearEye;
        case 'fizzy': return turn.hasRolled && !turn.finalized && turn.dice.some(d => d.status === 'active' && !d.hidden && d.value === 1);
        case 'secondThoughts': return turn.dice.some(d => canPutBack(turn, d.status));
        case 'steady': return !turn.steady;
        default: return false;
    }
}

// The Thonics you carry. One lights up when it can be drunk: tap to pick it up, tap again to
// drink. Second Thoughts then asks you to tap the kept die to put back.
function Shelf({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const [armed, setArmed] = useState<number | null>(null);
    useEffect(() => {
        if (armed === null) return;
        const timer = setTimeout(() => setArmed(null), 2500);
        return () => clearTimeout(timer);
    }, [armed]);
    const slots = Array.from({ length: run.shelfSize }, (_, i) => run.shelf.at(i) ?? null);
    return (
        <span className="shelf" aria-label="Thonics">
            {slots.map((t, i) => {
                const choosing = snap.putBackSlot === i;
                const usable = !!t && (choosing || drinkable(t, snap, state));
                return (
                    <button
                        key={i}
                        className={`shelf-slot ${usable ? 'usable' : ''} ${armed === i || choosing ? 'armed' : ''}`}
                        disabled={!usable}
                        title={t ? `${t.name}: ${t.text}` : 'Empty'}
                        aria-label={t ? (choosing ? `Cancel ${t.name}` : armed === i ? `Drink ${t.name}` : t.name) : 'Empty shelf slot'}
                        onClick={() => {
                            if (!t || !usable) return;
                            if (choosing) { actions.cancelPutBack(); return; }
                            if (armed !== i) { setArmed(i); playSound('click'); return; }
                            setArmed(null);
                            if (t.id === 'secondThoughts') actions.startPutBack(i);
                            else actions.drinkThonic(i);
                        }}
                    >
                        <Bottle thonic={t} />
                        {armed === i && !choosing && <span className="drink-label">Drink?</span>}
                        {choosing && <span className="drink-label">Pick a die</span>}
                    </button>
                );
            })}
        </span>
    );
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
const KEEPSAKE_ICONS: Record<string, string> = {
    bentCopper: '🛡️',
    blessedTankard: '🕶️',
    luckySeat: '🃏',
    velvetCushion: '🪶',
    steadyHand: '✋'
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
                            <span className="icon" aria-hidden="true">{KEEPSAKE_ICONS[c.id] ?? '✦'}</span>
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

// The end of a Tavern Crawl: how far you got, the gold, and the leaderboard.
function TavernOver({ summary, leaderboard }: { summary: TavernSummary; leaderboard: Snapshot['leaderboard'] }) {
    const gold = useCountUp(summary.gold);
    const b = summary.breakdown;
    const rows: [string, string][] = [
        ['How far you got', String(b.progress)],
        ['Hearts spared', String(b.hearts)],
        ['Perfect 24s', String(b.perfect)],
        ["Spent at Thom's", b.spent ? `−${b.spent}` : '0']
    ];
    // Your best on the board (the board keeps each name's best run).
    const mine = leaderboard.findIndex(e => e.name === summary.name);
    const board = leaderboard.slice(0, 8);
    return (
        <div className="modal-backdrop">
            <div className={`panel run-over ${summary.won ? 'won' : 'lost'}`}>
                <h1>{summary.won ? 'Victory!' : 'Run over'}</h1>
                <p className="subtitle">
                    {summary.won ? 'You beat the whole House Table.' : `${summary.fellTo} ended your run.`}
                </p>
                <ol className="crawl-path" aria-label="Opponents">
                    {summary.encounters.map((name, i) => {
                        const state = i < summary.defeated ? 'beaten' : name === summary.fellTo ? 'fell' : 'unmet';
                        return (
                            <li key={name} className={state} title={name} aria-label={`${name}: ${state === 'beaten' ? 'beaten' : state === 'fell' ? 'lost to' : 'not reached'}`}>
                                <span className="mini-portrait" style={avatarStyle(portraitFor(name))} />
                                <span className="mark" aria-hidden="true">{state === 'beaten' ? '✓' : state === 'fell' ? '✗' : ''}</span>
                            </li>
                        );
                    })}
                </ol>
                <div className="gold">
                    <span className="coin" aria-hidden="true">🪙</span>
                    <span className="amount">{gold}</span>
                    <span className="unit">gold</span>
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
                                    <span className="gold-amount">{e.gold}</span>
                                </li>
                            ))}
                        </ol>
                        {mine >= board.length && <p className="fine">Your best: #{mine + 1} with {leaderboard[mine].gold} gold</p>}
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

const INTRO_MS = 5000;

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

// A Tavern Crawl opponent sits down: a name card on the table edge under their bust.
// Tap to dismiss.
function EncounterIntro({ snap, onDone }: { snap: Snapshot; onDone: (showing: boolean) => void }) {
    const [visible, dismiss] = useMoment(snap.introAt, INTRO_MS);
    useEffect(() => onDone(visible), [visible, onDone]);
    // The first throw clears it away, so it never sits over the dice.
    useEffect(() => { if (snap.rolling) dismiss(); }, [snap.rolling, dismiss]);
    const run = snap.state?.tavernRun;
    if (!visible || !run) return null;
    const enemy = run.enemy;
    const ability = enemy.ability ? Rules.ABILITY_NAMES[enemy.ability as keyof typeof Rules.ABILITY_NAMES] : null;
    return (
        <button key={snap.introAt} className="encounter-intro" onClick={dismiss}>
            <span className="encounter">Opponent {run.encounterNumber} of {run.totalEncounters}</span>
            <span className="name">{enemy.name}</span>
            <Hearts lives={enemy.lives} starting={enemy.lives} />
            {ability && <span className="ability">{ability}</span>}
            <span className="intro">{enemy.intro}</span>
        </button>
    );
}

// An opponent's signature move. Klarg's steal and Rokr's stars happen on the 3D table; here
// the move's name, plus The Hangman's card and Jaguar's -3.
function AbilityMomentView({ snap }: { snap: Snapshot }) {
    const moment = snap.ability;
    const [visible] = useMoment(moment?.at ?? 0, moment?.ability === 'The Ace of Spades' ? 3200 : 2600);
    if (!visible || !moment) return null;
    const kind = moment.ability.toLowerCase().replace(/[^a-z]+/g, '-');
    return (
        <div key={moment.at} className={`ability-moment ${kind} ${moment.name === "Thom's Thonics" ? 'thonic' : ''}`} aria-live="polite">
            <div className="ability-banner">
                <span className="who">{moment.name}</span>
                <span className="what">{moment.ability}</span>
                {moment.ability === 'Smooth Talk' && <span className="minus">−3</span>}
                {moment.extra && <span className="plus">{moment.extra}</span>}
            </div>
            {moment.ability === 'The Ace of Spades' && (
                <div className="ace-card" aria-hidden="true">
                    <span className="corner">A<br />♠</span>
                    <span className="pip">♠</span>
                    <span className="corner bottom">A<br />♠</span>
                </div>
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
    const [leaving, setLeaving] = useState(false);
    const leave = () => {
        if (leaving) return;
        setLeaving(true);
        setTimeout(actions.leaveShop, LEAVE_MS);
    };
    return (
        <div className={`thom-scene ${leaving ? 'leaving' : ''}`} role="dialog" aria-label="Thom's Thonics. Thom: What ya havin'?">
            <div className="thom-stage" aria-hidden="true">
                <div className="thom-lantern" />
                <div className="thom-speech">What ya havin'?</div>
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
                {arrival && (
                    <p className="winnings">
                        {arrival.defeated} is beaten: <strong>+{arrival.gold.win}</strong> gold
                        {arrival.gold.hearts > 0 && <>, <strong>+{arrival.gold.hearts}</strong> for hearts left</>}
                    </p>
                )}
                <p className="purse-line"><span aria-hidden="true">🪙</span> <strong>{run.purse}</strong> gold in your purse</p>
                <div className="thonic-cards">
                    {shop.stock.map((t, i) => {
                        const short = run.purse < t.price;
                        return (
                            <div key={t.id} className="thonic-card" style={{ animationDelay: `${0.9 + i * 0.15}s` }}>
                                <Bottle thonic={t} />
                                <strong>{t.name}</strong>
                                <span className="text">{t.text}</span>
                                <button className="buy" disabled={short || shelfFull} onClick={() => actions.buyThonic(t.id)}>
                                    {shelfFull ? 'Shelf full' : short ? `${t.price} gold` : `Buy · ${t.price}`}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="shop-footer">
                    <div className="shop-shelf" aria-label="Your shelf">
                        {Array.from({ length: run.shelfSize }, (_, i) => run.shelf.at(i) ?? null).map((t, i) => (
                            <span key={i} className="shelf-slot" title={t ? t.name : 'Empty'}><Bottle thonic={t} /></span>
                        ))}
                    </div>
                    <button className="primary onward" onClick={leave} disabled={leaving}>
                        On to {arrival?.nextEnemy ?? run.enemy.name}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Modals({ snap }: { snap: Snapshot }) {
    const modal = snap.modal;
    if (snap.state?.tavernRun?.shop && !modal) return <ThomShop snap={snap} state={snap.state} />;
    if (!modal) return null;
    if (modal.type === 'keepsakes') return <KeepsakeCards key={modal.nextEnemy} {...modal} />;
    if (modal.type === 'tavernOver') return <TavernOver summary={modal.summary} leaderboard={snap.leaderboard} />;
    return (
        <div className="modal-backdrop">
            <div className="panel">
                <p className="game-over">{modal.message}</p>
                <div className="row">
                    <button className="primary" onClick={actions.playAgain}>Play again</button>
                    <button className="secondary" onClick={actions.dismissModal}>Close</button>
                </div>
            </div>
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

export function Hud() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const [musicOff, setMusicOffState] = useState(isMusicOff());
    const [soundsOff, setSoundsOffState] = useState(areSoundsOff());
    const [introShowing, setIntroShowing] = useState(false);
    const footerRef = useFooterInset();

    if (!snap.joined) return <JoinScreen />;
    const state = snap.state;
    const botAcross = acrossTheTable()?.isBot ?? false;
    // A bot opponent has its nameplate; everyone else gets a chip.
    // You first, so your own chip is always in view; the rest in turn order.
    const chips = state ? state.playerOrder.filter(id => !(botAcross && id === BOT_ID))
        .sort((x, y) => Number(y === snap.myId) - Number(x === snap.myId)) : [];

    return (
        <div className="hud">
            <header>
                <button className="leave" onClick={actions.leave} aria-label="Leave table" title="Leave table">⟵</button>
                <span className="room">{snap.roomLabel}</span>
                <div className="turn-slot"><TurnBanner snap={snap} state={state} /></div>
                <div className="sound-toggles">
                    <button className={`mute ${musicOff ? 'off' : ''}`} onClick={() => { setMusicOff(!musicOff); setMusicOffState(!musicOff); }}
                        aria-label={musicOff ? 'Music on' : 'Music off'} aria-pressed={!musicOff} title={musicOff ? 'Music is off' : 'Music is on'}>🎵</button>
                    <button className={`mute ${soundsOff ? 'off' : ''}`} onClick={() => { setSoundsOff(!soundsOff); setSoundsOffState(!soundsOff); }}
                        aria-label={soundsOff ? 'Game sounds on' : 'Game sounds off'} aria-pressed={!soundsOff} title={soundsOff ? 'Game sounds are off' : 'Game sounds are on'}>🔊</button>
                </div>
            </header>
            {state && botAcross && !introShowing && <OpponentPlate state={state} />}
            <EncounterIntro snap={snap} onDone={setIntroShowing} />
            <AbilityMomentView snap={snap} />
            {snap.waiting && <WaitingCard snap={snap} />}
            <YourTurnBanner at={snap.yourTurnAt} />

            <div className="callout-area" aria-live="polite">
                {snap.callout && <div key={snap.callout.key} className="callout" style={{ color: snap.callout.color }}>{snap.callout.text}</div>}
            </div>

            <div className="toasts">
                {snap.toasts.map(t => (
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
                        {REACTIONS.map(r => <button key={r} onClick={() => actions.react(r)} aria-label={`React ${r}`}>{r}</button>)}
                    </div>
                )}
            </footer>
            <Modals snap={snap} />
        </div>
    );
}
