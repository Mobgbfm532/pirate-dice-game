import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { screenInsets } from './layout';
import { actions, store, BOT_ID, type GameState, type Snapshot } from './game';
import { Rules } from './rules';
import { isMuted, playSound, setMuted } from './sounds';
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

function turnLine(snap: Snapshot, state: GameState) {
    const tavern = state.mode === 'tavern-crawl';
    if (snap.waiting) return 'Waiting for travelers to join…';
    if (tavern && state.tavernRun?.pendingKeepsakeChoices) return 'Choose a keepsake';
    const me = snap.myId ? state.players[snap.myId] : null;
    const current = state.currentTurnId ? state.players[state.currentTurnId] : null;
    if (me && me.lives <= 0) return current ? `You're dust! ${current.name} is rolling…` : "You're dust!";
    if (snap.isMyTurn) return 'Your turn!';
    // The server holds their turn for a short while so a phone can reconnect.
    if (current && !current.connected) return `Waiting for ${current.name} to reconnect…`;
    return current ? `${current.name} is rolling…` : '';
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
function scoreToBeat(state: GameState, rollerId: string): { label: string; target: number | null } {
    const finished = state.roundPlayers.filter(id => id !== rollerId && state.players[id] && state.players[id].score !== null);
    if (finished.length === 0) return { label: 'First to roll: set the score', target: null };
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
    return (
        <div className={`players ${className}`}>
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
    const scoreText = turn.finalized && turn.outcome?.busted ? 'X' : hiddenLocked ? '?' : String(scoring.score);
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

    const hint = snap.isMyTurn && turn.hasRolled && !turn.finalized && !snap.rolling && turn.locksThisRoll === 0 ? 'Tap dice to keep them, then roll again' : '';

    return (
        <div className="controls">
            {goal && (
                <div className="goal">
                    <span className="label">{goal.target != null && !snap.isMyTurn && roller ? `${roller.name} must beat` : goal.label}</span>
                    {goal.target != null && <span className="target">{goal.target}</span>}
                </div>
            )}
            <div className="turn-score">
                <span className="label">Turn score</span>
                <span className={`value ${turn.finalized && turn.outcome?.busted ? 'dust' : standing}`}>{scoreText}</span>
            </div>
            <button
                className={`roll ${turn.finalized ? 'end' : ''}`}
                disabled={disabled || !snap.isMyTurn}
                onClick={actions.roll}
                style={snap.isMyTurn ? undefined : { visibility: 'hidden' }}
                aria-hidden={!snap.isMyTurn}
            >{label}</button>
            <div className="hint">{hint}</div>
        </div>
    );
}

// Keepsakes won so far in a Tavern Crawl (the encounter number is on the nameplate).
function TavernStrip({ state }: { state: GameState }) {
    const run = state.tavernRun;
    if (!run || run.keepsakes.length === 0) return null;
    return (
        <div className="tavern-strip">
            {run.keepsakes.map(k => <span key={k.id} className="keepsake" title={k.text}>{k.name}</span>)}
        </div>
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

function Modals({ snap }: { snap: Snapshot }) {
    const modal = snap.modal;
    if (!modal) return null;
    if (modal.type === 'keepsakes') {
        return (
            <div className="modal-backdrop">
                <div className="panel">
                    <h2>{modal.transitionMessage ?? `${modal.defeated} leaves the table.`}</h2>
                    <p>Next opponent: <strong>{modal.nextEnemy}</strong>. Choose a keepsake first.</p>
                    <div className="choices">
                        {modal.choices.map(c => (
                            <button key={c.id} className="choice" onClick={() => actions.chooseKeepsake(c.id)}>
                                <strong>{c.name}</strong>
                                <span>{c.text}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
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
    const [muted, setMutedState] = useState(isMuted());
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
                <span className={`turn-line ${snap.isMyTurn ? 'mine' : ''}`}>{state ? turnLine(snap, state) : 'Connecting…'}</span>
                <button className="mute" onClick={() => { setMuted(!muted); setMutedState(!muted); }} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🎵'}</button>
            </header>
            {state && botAcross && <OpponentPlate state={state} />}
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
                {state && <TavernStrip state={state} />}
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
