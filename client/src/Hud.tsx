import { useState, useSyncExternalStore } from 'react';
import { actions, store, BOT_ID, type GameState, type Snapshot } from './game';
import { Rules } from './rules';
import { isMuted, playSound, setMuted } from './sounds';

const AVATARS: { id: string; file: string }[] = [
    { id: 'Devil', file: 'Devil.png' },
    { id: 'Vaelin', file: 'vaelin.png' },
    { id: 'Rokr', file: 'Rokr.png' },
    { id: 'The Hangman', file: 'The Hangman.png' },
    { id: 'Klarg', file: 'klarg.png' },
    { id: 'Jaguar Cantona', file: 'Jaguar.png' }
];

const ENEMY_ART: Record<string, string> = {
    'The Molar': 'Molar.png', Klarg: 'klarg.png', Rokr: 'Rokr.png', 'The Hangman': 'The Hangman.png', 'Jaguar Cantona': 'Jaguar.png'
};

const REACTIONS = ['😀', '😂', '😮', '😎', '😭'];

function avatarSrc(playerId: string, name: string, avatar: string) {
    const file = playerId === BOT_ID ? ENEMY_ART[name] ?? 'Molar.png' : AVATARS.find(a => a.id === avatar)?.file ?? 'Devil.png';
    return `/${encodeURI(file)}`;
}

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

function JoinScreen() {
    const prefs = readPrefs();
    const [name, setName] = useState(prefs.name);
    const [avatar, setAvatar] = useState(AVATARS.some(a => a.id === prefs.avatar) ? prefs.avatar : 'Devil');
    const [code, setCode] = useState(['COMP', 'TAVERN'].includes(prefs.code) ? '' : prefs.code);

    const join = (tableCode: string) => {
        savePrefs(name, avatar, tableCode);
        actions.join(name, avatar, tableCode);
    };

    return (
        <div className="modal-backdrop">
            <div className="panel join">
                <h1>2, 4, 24</h1>
                <p className="subtitle">Find a 2, find a 4, then chase 24.</p>
                <div className="avatars">
                    {AVATARS.map(a => (
                        <button key={a.id} className={`avatar ${a.id === avatar ? 'selected' : ''}`} onClick={() => { setAvatar(a.id); playSound('click'); }} aria-label={a.id}>
                            <img src={`/${encodeURI(a.file)}`} alt="" />
                        </button>
                    ))}
                </div>
                <input value={name} maxLength={15} placeholder="Adventurer name" onChange={e => setName(e.target.value)} />
                <button className="primary" onClick={() => join('COMP')}>Solo vs The Molar</button>
                <button className="primary alt" onClick={() => join('TAVERN')}>Tavern Crawl</button>
                <div className="row">
                    <input value={code} maxLength={10} placeholder="Table code" onChange={e => setCode(e.target.value.toUpperCase())} />
                    <button className="secondary" onClick={() => join(code)}>Join table</button>
                </div>
                <p className="fine">Prototype of the 3D table. The classic game is still at <a href="/">the main page</a>.</p>
            </div>
        </div>
    );
}

function turnLine(snap: Snapshot, state: GameState) {
    const tavern = state.mode === 'tavern-crawl';
    if (!tavern && !snap.roomLabel.startsWith('Solo') && state.playerOrder.length < 2) return 'Waiting for travelers to join…';
    if (tavern && state.tavernRun?.pendingKeepsakeChoices) return 'Choose a keepsake';
    const me = snap.myId ? state.players[snap.myId] : null;
    const current = state.currentTurnId ? state.players[state.currentTurnId] : null;
    if (me && me.lives <= 0) return current ? `You're dust! ${current.name} is rolling…` : "You're dust!";
    if (snap.isMyTurn) return 'Your turn!';
    return current ? `${current.name} is rolling…` : '';
}

function Players({ snap, state }: { snap: Snapshot; state: GameState }) {
    return (
        <div className="players">
            {state.playerOrder.map(id => {
                const p = state.players[id];
                if (!p) return null;
                const inRound = state.roundPlayers.includes(id) && p.connected;
                const lives = Math.max(0, p.lives);
                const score = !p.connected ? 'Offline' : p.lives <= 0 ? 'Out' : p.score === null ? '–' : p.busted ? 'Dust' : String(p.score);
                return (
                    <div key={id} className={`player ${id === state.currentTurnId ? 'current' : ''} ${inRound ? '' : 'out'} ${id === snap.myId ? 'me' : ''}`}>
                        <img src={avatarSrc(id, p.name, p.avatar)} alt="" />
                        <div>
                            <div className="name">{p.name}</div>
                            <div className="hearts" aria-label={`${lives} lives`}>{'♥'.repeat(lives)}<span>{'♥'.repeat(Math.max(0, state.startingLives - lives))}</span></div>
                        </div>
                        <div className="score">{score}</div>
                    </div>
                );
            })}
        </div>
    );
}

function TurnControls({ snap }: { snap: Snapshot }) {
    const turn = snap.turn;
    if (!turn) return null;
    const hiddenLocked = turn.dice.some(d => d.hidden && d.status !== 'active');
    const scoreText = turn.finalized && turn.outcome?.busted ? 'X' : hiddenLocked ? '?' : String(Rules.scoreDice(turn.dice).score);

    let label = 'Roll Dice';
    let disabled = !turn.canRoll;
    if (snap.rolling) { label = 'Rolling…'; disabled = true; }
    else if (turn.finalized) { label = snap.endingTurn ? 'Ending…' : 'End Turn'; disabled = snap.endingTurn; }

    const hint = snap.isMyTurn && turn.hasRolled && !turn.finalized && !snap.rolling && turn.locksThisRoll === 0 ? 'Tap dice to keep them, then roll again' : '';

    return (
        <div className="controls">
            <div className="turn-score">
                <span className="label">Turn score</span>
                <span className={`value ${turn.finalized && turn.outcome?.busted ? 'dust' : ''}`}>{scoreText}</span>
            </div>
            {snap.isMyTurn && (
                <button className={`roll ${turn.finalized ? 'end' : ''}`} disabled={disabled} onClick={actions.roll}>{label}</button>
            )}
            <div className="hint">{hint}</div>
        </div>
    );
}

function TavernStrip({ state }: { state: GameState }) {
    const run = state.tavernRun;
    if (!run) return null;
    return (
        <div className="tavern-strip">
            <span>Encounter {run.encounterNumber} of {run.totalEncounters}: <strong>{run.enemy.name}</strong></span>
            {run.keepsakes.map(k => <span key={k.id} className="keepsake" title={k.text}>{k.name}</span>)}
        </div>
    );
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

export function Hud() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const [muted, setMutedState] = useState(isMuted());

    if (!snap.joined) return <JoinScreen />;
    const state = snap.state;

    return (
        <div className="hud">
            <header>
                <span className="room">{snap.roomLabel}</span>
                <span className={`turn-line ${snap.isMyTurn ? 'mine' : ''}`}>{state ? turnLine(snap, state) : 'Connecting…'}</span>
                <button className="mute" onClick={() => { setMuted(!muted); setMutedState(!muted); }} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🎵'}</button>
            </header>
            {state && <Players snap={snap} state={state} />}
            {state && <TavernStrip state={state} />}

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

            <footer>
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
