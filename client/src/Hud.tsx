import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { screenInsets } from './layout';
import { actions, canPutBack, readSavedRun, showToast, store, BOT_ID, type GameState, type DiceThrow, type Keepsake, type Interlude, type ShopArrival, type Snapshot, type Spot, type TavernSummary, type Thonic } from './game';
import { Rules } from './rules';
import { areSoundsOff, isMusicOff, playCoins, playDiceImpacts, playSound, setMusicOff, setSoundsOff } from './sounds';
import { simulateRoll } from './physics';
import { AVATAR_IDS, SPOT_PORTRAITS, avatarStyle, portraitFor } from './portraits';
import { acrossTheTable, opponentName, opponentPortraitKey } from './Backdrop';

const REACTIONS = ['😀', '😂', '😮', '😎', '😭'];

// The bot's portrait is its name (one per Tavern Crawl encounter); players pick an avatar.
const playerPortrait = (id: string, name: string, avatar: string) => portraitFor(id === BOT_ID ? opponentPortraitKey(name) : avatar);

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
    // A Tavern Crawl saved at an invitation on to the next place.
    const [saved, setSaved] = useState(readSavedRun);

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
                            <span className="detail">{saved.name}: {saved.next} at {saved.place} · {saved.purse} gold</span>
                        </button>
                        <button className="link-button" onClick={() => { actions.forgetSavedRun(); setSaved(null); }}>Forget this save</button>
                    </div>
                )}
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
    const worst = cursed(state) ? Math.max(...scores) : Math.min(...scores);
    return scores.length > 1 && p.score === worst ? 'lowest' : 'scored';
}

// A Tavern Crawl round where the lowest valid score wins (Danhausen's Curse).
function cursed(state: GameState) {
    return state.tavernRun?.roundEffect?.kind === 'curse';
}

// The hot tub's surge on your Wild Magic (aqua) die, in a few words (the hint under Roll; the user's wording, 20 Oct).
const SURGE_HINTS: Record<string, string> = {
    noOnes: 'the Wild Magic die never rolls a 1',
    twin: 'the Wild Magic die rolls twice and keeps the better result.',
    lucky: 'the Wild Magic die only rolls 4, 5 or 6',
    scalding: 'the Wild Magic die always lands on a 6',
    soggy: 'the Wild Magic die never rolls a 6'
};

// What this round's ability means for you, in a line (shown under the Roll button).
// Mind Whip shows only once it has landed (your first throw) and only while it's still your
// turn; on the opponent's turn the hot tub's surge (if any) shows instead.
// Returns the line and its badge colour.
function roundEffectHint(state: GameState, myTurn: boolean): { text: string; kind: string } {
    const effect = state.tavernRun?.roundEffect;
    const surge = state.tavernRun?.tubSurge;
    const cap = state.tavernRun?.devilCap ?? null;
    if (effect?.kind === 'curse') return { text: 'Cursed round: the lowest valid score wins', kind: 'curse' };
    if (effect?.kind === 'ink') return { text: "Inkfire round: your dice can't land on 6", kind: 'ink' };
    if (effect?.kind === 'smite') return { text: 'Divine Smite: lose this round, lose two hearts', kind: 'smite' };
    if (effect?.kind === 'mind' && effect.landed && myTurn) return { text: 'Mind Whip: the selected die stays kept', kind: 'mind' };
    // The Devil: three 6s for whoever plays it (no cap on the other side since 21 Oct unless devilCap is set).
    if (effect?.kind === 'devil') return cap != null
        ? { text: effect.by === 'player' ? `Devil's round: they can't score above ${cap}` : `Devil's round: you can't score above ${cap}`, kind: 'devil' }
        : effect.by === 'player' ? { text: "Devil's round: three 6s for you", kind: 'devil' } : { text: '', kind: '' };
    if (surge && surge.id !== 'pruney') return { text: `${surge.name}: ${SURGE_HINTS[surge.id]}`, kind: 'tub' };
    return { text: '', kind: '' };
}

// What the player rolling now has to do. The lowest score of the round loses a life (and
// dust always does), so the score to beat is the lowest among those who've finished.
function scoreToBeat(state: GameState, rollerId: string): { label: string; target: number | null } | null {
    const finished = state.roundPlayers.filter(id => id !== rollerId && state.players[id] && state.players[id].score !== null);
    if (finished.length === 0) return null; // first to roll: nothing to beat yet
    const scores = finishedScores(state, rollerId);
    if (scores.length === 0) return { label: 'Everyone else dusted: just find a 2 and a 4', target: null };
    if (cursed(state)) return { label: 'Score to stay under', target: Math.max(...scores) };
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
                            {/* A Tavern Crawl opponent's hearts are out of their own lives, not yours. */}
                            <Hearts lives={p.lives} starting={id === BOT_ID && state.tavernRun ? (state.tavernRun.seated ?? state.tavernRun.enemy).lives : state.startingLives} />
                            {id === BOT_ID && state.tavernRun && <AbilityMarks state={state} />}
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
    const name = opponentName();
    if (!bot || (state.tavernRun && !name)) return null; // nobody at the table between fights
    const seated = state.tavernRun ? state.tavernRun.seated ?? state.tavernRun.enemy : null;
    const starting = seated ? seated.lives : state.startingLives;
    return (
        <div className={`opponent-plate ${state.currentTurnId === BOT_ID ? 'current' : ''}`}>
            {state.tavernRun && <span className="encounter">{state.tavernRun.seated?.number ?? state.tavernRun.encounterNumber}/{state.tavernRun.totalEncounters}</span>}
            <span className="name">{name ?? bot.name}</span>
            <Hearts lives={bot.lives} starting={starting} />
            {state.tavernRun && <AbilityMarks state={state} />}
            <span className={`score ${scoreClass(state, BOT_ID)}`}>{scoreText(bot)}</span>
        </div>
    );
}

// The opponent's ability on their nameplate: one ✦ per use this fight, lit while it's left and
// dark once spent. The plate flashes when one is spent.
function AbilityMarks({ state }: { state: GameState }) {
    const run = state.tavernRun!;
    const ability = (run.seated ?? run.enemy).ability;
    const max = run.abilityMax ?? 0;
    if (!ability || !max) return null;
    const raw = run.abilityUsed?.[ability];
    const used = Math.min(max, raw === true ? 1 : Number(raw || 0));
    const name = Rules.ABILITY_NAMES[ability as keyof typeof Rules.ABILITY_NAMES] ?? ability;
    return (
        <span key={used} className={`ability-marks ${used > 0 ? 'spent-now' : ''}`}
            title={`${name}: ${max - used} of ${max} left this fight`} aria-label={`${name}: ${max - used} of ${max} left`}>
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
    const standing = goal?.target != null && !hiddenLocked && scoring.has2 && scoring.has4
        ? ((low ? scoring.score < goal.target : scoring.score > goal.target) ? 'ahead' : scoring.score === goal.target ? 'level' : '')
        : '';

    let label = 'Roll Dice';
    let disabled = !turn.canRoll;
    if (snap.rolling) { label = 'Rolling…'; disabled = true; }
    else if (turn.finalized) { label = snap.endingTurn ? 'Ending…' : 'End Turn'; disabled = snap.endingTurn; }

    const badge = state ? roundEffectHint(state, turn.playerId === snap.myId) : { text: '', kind: '' };
    const tip = snap.isMyTurn && snap.putBackSlot !== null ? 'Tap a kept die to put it back'
        : snap.isMyTurn && turn.hasRolled && !turn.finalized && !snap.rolling && turn.locksThisRoll === 0 && !turn.canRoll ? 'Tap dice to keep them, then roll again'
            : '';
    const hint = tip || badge.text;

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
                className={`roll ${turn.finalized ? 'end' : ''} ${snap.isMyTurn ? '' : 'idle'}`}
                disabled={disabled || !snap.isMyTurn}
                onClick={actions.roll}
                aria-hidden={!snap.isMyTurn}
            >{snap.isMyTurn ? label : roller ? `${roller.name}'s turn` : label}</button>
            {/* A hot tub fight: its badge can take two lines on small phones, so the space is kept the whole fight (the table doesn't jump when a tip replaces it). */}
            <div className={`hint ${!tip && badge.kind ? `round-${badge.kind}` : ''} ${state?.tavernRun?.tubSurge && state.tavernRun.tubSurge.id !== 'pruney' ? 'tub-fight' : ''}`}>{hint}</div>
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
            {/* Keepsakes as small round pictures, not names, so a few fit beside your chip
                (the user, 21 Oct). Tap one for a reminder of what it does; it dims once spent this fight. */}
            {(run.keepsakes.length > 0 || run.ladysGrace) && (
                <span className="keepsake-row">
                    {run.keepsakes.map(k => k.id === 'marthasMask'
                        ? <MaskKeepsake key={k.id} snap={snap} state={state} />
                        : <KeepsakeIcon key={k.id} icon={KEEPSAKE_ICONS[k.id] ?? '✦'} name={k.name} text={k.text} spent={!!run.encounterKeepsakeUses?.[k.id] && ONCE_A_FIGHT.has(k.id)} />)}
                    {run.ladysGrace && <KeepsakeIcon icon="🕯️" name="The Lady's Grace" text="The next time you'd lose a heart to dust, the Lady saves you." blessing />}
                </span>
            )}
        </div>
    );
}

// Keepsakes that work once a fight (dimmed once they have).
const ONCE_A_FIGHT = new Set(['bentCopper', 'luckySeat', 'velvetCushion', 'marthasMask']);

function KeepsakeIcon({ icon, name, text, spent = false, blessing = false }: { icon: string; name: string; text: string; spent?: boolean; blessing?: boolean }) {
    const remind = () => { playSound('click'); showToast(`${icon} ${name}`, spent ? `${text} (Used this fight.)` : text, 'info', 4200); };
    return (
        <button className={`keepsake-icon ${spent ? 'spent' : ''} ${blessing ? 'blessing' : ''}`} aria-label={`${name}: ${text}`} onClick={remind}>
            <span aria-hidden="true">{icon}</span>
        </button>
    );
}

// Martha's mask: lit when it can be worn (your turn, once a fight, in a round no one has played
// a trick in yet). Danhausen's Curse before you roll; the Duke's Devil any time in your turn
// with three or more dice to throw (the user's call, 21 Oct): the next throw lands three 6s.
// Tap, then pick; when it can't be worn, a tap is a reminder of what it does.
const MASK_TEXT = "Once a fight: wear Danhausen's Curse before you roll (lowest valid score wins the round), or the Duke's Devil any time in your turn with three or more dice to throw (your next throw lands three 6s).";

function MaskKeepsake({ snap, state }: { snap: Snapshot; state: GameState }) {
    const run = state.tavernRun!;
    const turn = snap.turn;
    const [open, setOpen] = useState(false);
    const ready = !!run.maskReady && snap.isMyTurn && !!turn && !turn.finalized && !run.roundEffect && !snap.rolling;
    const curse = ready && !turn!.hasRolled;
    const devil = ready && turn!.dice.filter(d => d.status === 'active').length >= 3;
    const usable = curse || devil;
    useEffect(() => { if (!usable) setOpen(false); }, [usable]);
    const wear = (kind: 'curse' | 'devil') => { setOpen(false); actions.wearMask(kind); };
    const tap = () => {
        playSound('click');
        if (usable) setOpen(!open);
        else showToast("🎭 Martha's Mask", run.maskReady ? MASK_TEXT : `${MASK_TEXT} (Used this fight.)`, 'info', 5200);
    };
    return (
        <span className="mask-keepsake">
            <button className={`keepsake-icon ${usable ? 'usable' : ''} ${run.maskReady ? '' : 'spent'}`} aria-label={`Martha's Mask: ${MASK_TEXT}`} onClick={tap}>
                <span aria-hidden="true">🎭</span>
            </button>
            {open && (
                <span className="mask-choice" role="group" aria-label="Wear a disguise for this round">
                    {curse && <button onClick={() => wear('curse')}>Curse<small>lowest wins</small></button>}
                    {devil && <button onClick={() => wear('devil')}>Devil<small>{state.tavernRun?.devilCap != null ? `three 6s; they max ${state.tavernRun.devilCap}` : turn!.hasRolled ? 'next throw: three 6s' : 'three 6s for you'}</small></button>}
                </span>
            )}
        </span>
    );
}

// A small painted bottle; the colour says which Thonic it is.
function Bottle({ thonic }: { thonic: Thonic | null }) {
    return <span className={`bottle ${thonic ? thonic.id : 'empty'}`} aria-hidden="true"><span className="liquid" /></span>;
}

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
    luckySeat: '🃏',
    velvetCushion: '🪶',
    loadedDie: '🎲',
    potionBelt: '🧪',
    loyaltyCard: '🎫',
    marthasMask: '🎭',
    brodorsSunglasses: '🕶️'
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
        ...(b.perfect ? [['Perfect 24s', String(b.perfect)] as [string, string]] : []), // no gold for 24s since 19 Oct
        ['Between fights', b.events ? (b.events > 0 ? `+${b.events}` : `−${-b.events}`) : '0'],
        ['Spent', b.spent ? `−${b.spent}` : '0']
    ];
    // Your best on the board (the board keeps each name's best run).
    const mine = leaderboard.findIndex(e => e.name === summary.name);
    const board = leaderboard.slice(0, 8);
    return (
        <div className="modal-backdrop">
            <div className={`panel run-over ${summary.won ? 'won' : 'lost'}`}>
                <h1>{summary.won ? 'Victory!' : 'Run over'}</h1>
                <p className="subtitle">
                    {summary.won ? 'You won the final aboard the Salty Swallow.' : `${summary.fellTo} ended your run.`}
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
            <span className="encounter">{run.place} · Opponent {run.encounterNumber} of {run.totalEncounters}</span>
            <span className="name">{enemy.name}</span>
            <Hearts lives={enemy.lives} starting={enemy.lives} />
            {ability && <span className="ability">{ability}</span>}
            <span className="intro">{enemy.intro}</span>
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
            {kind === 'stars' && Array.from({ length: 18 }, (_, i) => <span key={i} className="star" style={{ left: `${(i * 53) % 100}%`, top: `${i % 2 ? (i * 29) % 22 : 78 + (i * 17) % 20}%`, animationDelay: `${(i * 0.37) % 2.4}s` }} />)}
        </div>
    );
}

// An opponent's signature move. Klarg's steal and Rokr's stars happen on the 3D table; here
// the move's name, plus the shot from The Hangman's revolver and Jaguar's -3.
function AbilityMomentView({ snap }: { snap: Snapshot }) {
    const moment = snap.ability;
    const [visible] = useMoment(moment?.at ?? 0, moment?.ability === 'The Ace of Spades' ? 3600 : 3600);
    if (!visible || !moment) return null;
    const kind = moment.ability.toLowerCase().replace(/[^a-z]+/g, '-');
    // An opponent's ability (or your mask) takes over the screen: a flash in its colours and a
    // banner across it with what happened (the user asked for more flare, 21 Oct). So does a
    // keepsake as it works, with its picture in a burst of gold (the Shield: a force field).
    // Thonics and the Lady keep the small plaque on the table's edge.
    const takeover = moment.name !== "Thom's Thonics" && moment.name !== 'Shrine to the Lady';
    const keepsake = moment.keepsake;
    return (
        <div key={moment.at} className={`ability-moment ${kind} ${moment.name === "Thom's Thonics" ? 'thonic' : ''} ${keepsake ? 'keepsake-moment' : ''} ${takeover ? 'takeover' : ''}`} aria-live="polite">
            <div className="ability-banner">
                <span className="who">{moment.name}</span>
                <span className="what">{moment.ability}</span>
                {takeover && moment.text && <span className="line">{moment.text}</span>}
                {moment.ability === 'Smooth Talk' && <span className="minus">−3</span>}
                {moment.extra && <span className="plus">{moment.extra}</span>}
            </div>
            {moment.ability === 'Reach Around' && (
                <div className="claw-marks" aria-hidden="true"><span /><span /><span /></div>
            )}
            {moment.ability === 'Smooth Talk' && <div className="gold-sweep" aria-hidden="true" />}
            {moment.ability === 'Back of the Head' && <div className="punch-burst" aria-hidden="true" />}
            {moment.ability === 'Disguises' && <div className="mask-flare" aria-hidden="true">🎭</div>}
            {keepsake && <div className="keepsake-flare" aria-hidden="true">{KEEPSAKE_ICONS[keepsake] ?? '✦'}</div>}
            {keepsake === 'bentCopper' && <div className="forcefield" aria-hidden="true" />}
            {moment.ability === 'Inkfire Brand' && <div className="ink-six" aria-hidden="true">6</div>}
            {moment.ability === 'Flourish' && <div className="rapier-slash" aria-hidden="true"><span /><span /></div>}
            {moment.ability === 'Divine Smite' && <div className="smite-beam" aria-hidden="true" />}
            {moment.ability === 'Astral Flood' && <div className="flood-light" aria-hidden="true" />}
            {moment.ability === 'The Ace of Spades' && (
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
                <p className="purse-line"><span aria-hidden="true">🪙</span> <strong>{run.purse}</strong> gold in your purse</p>
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
                                    {shelfFull ? 'Shelf full' : shop.free ? 'Free' : short ? `${t.price} gold` : `Buy · ${t.price}`}
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
                                        <span className="icon" aria-hidden="true">{KEEPSAKE_ICONS[k.id] ?? '✦'}</span>
                                        <span className="about"><strong>{k.name}</strong><span className="text">{k.text}</span></span>
                                        <button className="buy" disabled={short} onClick={() => actions.buyKeepsake(k.id)}>
                                            {short ? `${k.price} gold` : `Buy · ${k.price}`}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className="shop-footer">
                    <div className="shop-shelf" aria-label="Your shelf">
                        {Array.from({ length: run.shelfSize }, (_, i) => run.shelf.at(i) ?? null).map((t, i) => (
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

// ---- Between fights: two spots in the tavern catch your eye ----
const SPOTS: Record<Spot, { name: string; line: string; offer: string }> = {
    thom: { name: "Thom's Thonics", line: '"What ya havin\'?"', offer: 'Buy Thonics with your purse' },
    shrine: { name: 'Shrine to the Lady', line: 'Candles for the Lady, who keeps sailors safe.', offer: 'A blessing from the Lady' },
    diceDen: { name: 'The Dice Den', line: '"Fancy a quick throw, friend?"', offer: 'Bet gold on two dice' },
    hotTub: { name: 'The Wild Magic Hot Tub', line: 'Bubbling, glowing, faintly humming.', offer: 'A wild surge on one of your dice' }
};

// Who (or what) is at the spot, in a lit round frame.
function SpotPicture({ spot }: { spot: Spot }) {
    return (
        <span className={`spot-pic ${spot}`} aria-hidden="true">
            <span className="face" style={avatarStyle(SPOT_PORTRAITS[spot])} />
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
            style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/tavern.webp")` }}>
            <div className="interlude-body">
                <PurseLine state={state} />
                <h2 className="interlude-title">Make your choice</h2>
                <div className="spot-cards">
                    {interlude.spots.map((spot, i) => (
                        <button key={spot} className="spot-card" style={{ animationDelay: `${0.25 + i * 0.15}s` }} onClick={() => actions.chooseSpot(spot)}>
                            <SpotPicture spot={spot} />
                            <strong>{SPOTS[spot].name}</strong>
                            <span className="line">{SPOTS[spot].line}</span>
                            <span className="offer">{SPOTS[spot].offer}{spot === 'shrine' && run.prices?.shrine ? ` · ${run.prices.shrine} gold` : spot === 'hotTub' && run.prices?.hotTub ? ` · ${run.prices.hotTub} gold` : ''}</span>
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
const INVITATIONS: Record<string, { title: string; line: (place: string) => string; gift: string }> = {
    'Martha Mystery': {
        title: 'You qualify for the Yawning Portal',
        line: place => `Martha Mystery lifts off her mask and presses it into your hand. "You've earned this. Show it at ${inSentence(place)}."`,
        gift: "is yours: once a fight, before you roll, wear Danhausen's Curse or the Duke's Devil for the round."
    },
    Brodor: {
        title: 'Word from the docks',
        line: () => `Brodor flips you his sunglasses. "Keep 'em, champ." Then word reaches the Portal: the Salty Swallow has docked, and her crew are the finest players on the coast.`,
        gift: 'are yours: a finished 23 restores a heart, like a 24.'
    }
};
// A place's name inside a sentence: "on to the Salty Swallow".
const inSentence = (place: string) => place.replace(/^The /, 'the ');

function Invitation({ state, interlude, next, leaving, onMoveOn }: { state: GameState; interlude: Extract<Interlude, { stage: 'invitation' }>; next: string; leaving: boolean; onMoveOn: () => void }) {
    const run = state.tavernRun!;
    const me = Object.values(state.players).find(p => p.id !== BOT_ID);
    const story = INVITATIONS[interlude.boss ?? ''] ?? INVITATIONS['Martha Mystery'];
    const drop = interlude.drop ?? { id: 'marthasMask', name: "Martha's Mask", text: '' };
    const save = () => actions.saveAndLeave(interlude.save, { name: me?.name ?? 'Traveller', place: interlude.place, next, purse: run.purse });
    return (
        <div className={`interlude-scene invitation ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={story.title}
            style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/tavern.webp")` }}>
            <div className="interlude-body">
                <PurseLine state={state} />
                <h2 className="interlude-title">{story.title}</h2>
                <div className="invitation-card">
                    <span className="icon" aria-hidden="true">{KEEPSAKE_ICONS[drop.id] ?? '✦'}</span>
                    <p>{story.line(interlude.place)}</p>
                    <p className="mask-text"><strong>{drop.name}</strong> {story.gift}</p>
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
    return <p className="purse-line"><span aria-hidden="true">🪙</span> <strong>{state.tavernRun!.purse}</strong> gold in your purse</p>;
}

// The spots, and the events that find you instead (the pickpocket, the Hooded Stranger).
type SceneSpot = Exclude<Spot, 'thom'> | 'pickpocket' | 'stranger' | 'darren';

// Each scene's sign, and what its character says as things happen.
const SCENES: Record<SceneSpot, { name: string; tag: string }> = {
    pickpocket: { name: 'Stop, thief!', tag: 'A hand in your purse' },
    shrine: { name: 'Shrine to the Lady', tag: 'Goddess of sailors' },
    diceDen: { name: 'The Dice Den', tag: 'Two dice each. Highest wins.' },
    stranger: { name: 'The Hooded Stranger', tag: 'Keepsakes, for a price' },
    hotTub: { name: 'The Wild Magic Hot Tub', tag: 'Soak at your own risk' },
    darren: { name: 'Darren Snakehands', tag: 'The barman, and his snakes' }
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
        case 'done':
            if (interlude.spot === 'diceDen') {
                if (!interlude.bet) return 'Suit yourself.';
                if (!revealed) return 'Your throw. Make it count.';
                return interlude.won ? "Beginner's luck…" : 'The house thanks you!';
            }
            if (interlude.spot === 'stranger') return interlude.keepsake ? 'A fine choice. Mind your heart.' : 'Another time, then.';
            if (interlude.spot === 'hotTub') return interlude.surge.good ? '*bubble bubble* ✨' : '*glorp*';
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
            : interlude.stage === 'done' && interlude.spot === 'shrine' ? 'blessed'
                : interlude.stage === 'done' && interlude.spot === 'hotTub' ? (interlude.surge.good ? 'blessed surged' : 'escaped surged')
                    : interlude.stage === 'darren' && interlude.roll !== undefined && revealed ? (interlude.outcome === 'smash' ? 'escaped' : 'caught')
                        : '';
    const portrait = SPOT_PORTRAITS[spot];
    return (
        <div className={`thom-scene spot-scene ${spot} ${mood} ${leaving ? 'leaving' : ''}`} role="dialog" aria-label={`${SCENES[spot].name}${line ? `: ${line}` : ''}`}>
            <div className="thom-stage" aria-hidden="true"
                style={spot === 'shrine' ? { backgroundImage: `url("${portrait.src}")` } : undefined}>
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
            <button className="primary onward wraps" onClick={onLookAround}>Look around the tavern</button>
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
                    <button className="primary" disabled={run.purse < (run.prices?.hotTub ?? 0)} onClick={actions.soak}>Climb in{run.prices?.hotTub ? ` · ${run.prices.hotTub} gold` : ''}</button>
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
                    <button className="primary" disabled={run.purse < (run.prices?.shrine ?? 0)} onClick={actions.pray}>Light a candle{run.prices?.shrine ? ` · ${run.prices.shrine} gold` : ''}</button>
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
                            <button key={bet} className="primary" onClick={() => actions.diceBet(bet)}>Bet {bet}</button>
                        ))}
                        <button className="secondary" onClick={() => actions.diceBet(0)}>No thanks</button>
                    </div>
                </>
            );
        }
        return <DiceDenTable bet={interlude.bet} throws={interlude.throws} setRevealed={setRevealed} next={null} />;
    }

    if (interlude.stage === 'stranger') {
        const chosen = interlude.offers.find(k => k.id === picked);
        return (
            <>
                <p className="scene-text">Take one, and you start the fight with {next} on <strong>{interlude.hearts} hearts</strong>.</p>
                <div className="keepsake-cards">
                    {interlude.offers.map((k, i) => (
                        <button key={k.id} className={`keepsake-card ${picked === k.id ? 'picked' : picked ? 'passed' : ''}`} style={{ animationDelay: `${0.9 + i * 0.15}s` }} onClick={() => setPicked(k.id)}>
                            <span className="icon" aria-hidden="true">{KEEPSAKE_ICONS[k.id] ?? '✦'}</span>
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
                        : 'You leave the dice to others.'}
            </p>
            <div className="event-choices">{interlude.spot === 'stranger' ? afterEvent : challenge}</div>
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
            playSound(interlude.caught ? 'yay' : 'aww');
        }, DIE_ROLL_MS);
        return () => clearTimeout(timer);
    }, [rolled, interlude.roll, interlude.caught, setRevealed]);
    const catchFaces = Array.from({ length: 7 - interlude.catchOn }, (_, i) => interlude.catchOn + i).join(', ').replace(/, (\d)$/, ' or $1');
    const done = rolled && !rolling;
    return (
        <>
            {!rolled && <p className="scene-text">The thief is making off with <strong>{interlude.steal}</strong> gold. Roll a {catchFaces} to catch them.</p>}
            {rolled && (
                <div className={`dice-row single ${done ? (interlude.caught ? 'good' : 'bad') : ''}`}>
                    <Die value={interlude.roll!} rolling={rolling} />
                </div>
            )}
            {done && (
                <p className={`outcome ${interlude.caught ? 'good' : 'bad'}`}>
                    {interlude.caught
                        ? <>You rolled a {interlude.roll}: <strong>caught the thief!</strong> Your gold is safe.</>
                        : <>You rolled a {interlude.roll}: the thief slips away with <strong>{interlude.lost}</strong> gold. You have {purse} left.</>}
                </p>
            )}
            <div className="event-choices">
                {!rolled && <button className="primary" onClick={() => actions.pickpocket('roll')}>Roll to catch the thief</button>}
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
                            : <>You rolled a {interlude.roll}: a tray of glasses goes over. You pay <strong>{interlude.paid}</strong> gold for the glass.</>)
                        : <>You rolled a {interlude.roll}: {interlude.thonic ? <>a free <strong>{interlude.thonic.name}</strong> for your shelf</> : <>your shelf is full, so <strong>{interlude.gold}</strong> gold instead</>}
                            {interlude.outcome === 'catch' && interlude.thonic && <>, and <strong>+{interlude.gold}</strong> gold</>}.</>}
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
            <p className="scene-text">Your bet: <strong>{bet}</strong> gold</p>
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
                    {won ? <>You win <strong>+{bet}</strong> gold!</> : <>The gambler takes your {bet} gold.</>}
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
const WIN_STEP_MS = 700;
const winKey = (won: ShopArrival) => String(won.at ?? won.defeated);
function readSeenWin() {
    try { return localStorage.getItem('tavernWinSeen') ?? ''; } catch { return ''; }
}

function FightWon({ state, won, onLeaving, onNext }: { state: GameState; won: ShopArrival; onLeaving: () => void; onNext: () => void }) {
    const run = state.tavernRun!;
    const gold = won.gold;
    const heartsLeft = gold.heartsLeft ?? (gold.perHeart ? Math.round(gold.hearts / gold.perHeart) : 0);
    const rows = [
        { key: 'win', label: `Beating ${won.defeated}`, detail: won.place && gold.perPlace ? `opponent ${won.place} × ${gold.perPlace}` : '', amount: gold.win },
        ...(gold.hearts > 0 ? [{ key: 'hearts', label: 'Hearts left', detail: gold.perHeart ? `${heartsLeft} × ${gold.perHeart}` : '', amount: gold.hearts }] : [])
    ];
    const total = gold.win + gold.hearts;
    const [before] = useState(() => Math.max(0, run.purse - total));
    // step: how many rows are showing; one more than the rows = the purse counts up.
    const [step, setStep] = useState(0);
    useEffect(() => {
        playSound('winner');
        const timers = rows.map((row, i) => setTimeout(() => { setStep(i + 1); playCoins(row.key === 'win' ? 4 : 2); }, 500 + i * WIN_STEP_MS));
        timers.push(setTimeout(() => { setStep(rows.length + 1); playCoins(6); }, 500 + rows.length * WIN_STEP_MS));
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
            style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/tavern.webp")` }}>
            <div className="interlude-body">
                <span className="won-portrait" style={avatarStyle(portraitFor(won.defeated))} aria-hidden="true" />
                <h2 className="interlude-title">{won.defeated} is defeated!</h2>
                {won.place && <p className="won-fight">Fight {won.place} of {run.totalEncounters}</p>}
                <ul className="won-rows">
                    {rows.map((row, i) => (
                        <li key={row.key} className={i < step ? 'shown' : ''}>
                            <span className="what">
                                {row.label}
                                {row.key === 'hearts' && <span className="won-hearts" aria-hidden="true">{Array.from({ length: heartsLeft }, (_, k) => <span key={k} style={{ animationDelay: `${0.12 * k}s` }}>♥</span>)}</span>}
                                {row.detail && <span className="detail">{row.detail}</span>}
                            </span>
                            <span className="amount">+{row.amount}</span>
                        </li>
                    ))}
                </ul>
                <div className={`won-purse ${counting ? 'shown' : ''}`}>
                    <span aria-hidden="true">🪙</span>
                    <span className="amount">{before + added}</span>
                    <span className="unit">gold in your purse</span>
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
                {/* While an ability lasts, the screen's edges glow in its colours (pointer-free, clear of the dice). */}
                {state && <AbilityAura snap={snap} state={state} />}
                {/* Tavern Crawl: the opponent's nameplate and your chip show whose turn it is. */}
                {state?.mode !== 'tavern-crawl' && <div className="turn-slot"><TurnBanner snap={snap} state={state} /></div>}
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
