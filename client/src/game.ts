import { io } from 'socket.io-client';
import * as THREE from 'three';
import { calloutText, isLocked, type DieStatus, type TurnOutcome, type TurnView } from './rules';
import { simulateRoll, readFrame, trackDuration, type RollTrack } from './physics';
import { waitingPosition } from './layout';
import { playCorkPop, playDiceImpacts, playSound, startMusic, ABILITY_SOUNDS } from './sounds';

// Talks to the game server and holds everything the UI and the 3D table draw from.
// The server decides every roll; this file only animates and displays its decisions.

export const BOT_ID = 'BOT_MOLAR';

export interface Player {
    id: string;
    name: string;
    avatar: string;
    lives: number;
    score: number | null;
    busted: boolean;
    connected: boolean;
}

export interface Keepsake { id: string; name: string; text: string }

// One of Thom's Thonics. `drink`: tapped by the player (the others work by themselves).
export interface Thonic { id: string; name: string; text: string; price: number; drink: boolean }

// A round changed by an ability (server.js beginTavernRound): Mind Whip, the Curse (lowest valid
// score wins) or the Devil (`by` throws three 6s; the other side can't score above devilCap).
// `by` is 'player' when Martha's mask was worn.
export interface RoundEffect { kind: 'mind' | 'curse' | 'devil'; by: 'opponent' | 'player'; ability: string; as: string | null; landed?: boolean }

// A Tavern Crawl opponent (server.js TAVERN_ENCOUNTERS).
export interface Enemy { id: string; name: string; intro: string; ability: string | null; lives: number }

export interface TavernRun {
    encounterNumber: number;
    // Who sits across the table: the current opponent or, between fights, the one just beaten
    // (enemy is already the next one then). number: their place in the run.
    seated?: Enemy & { number: number };
    totalEncounters: number;
    place: string; // The Ghoul and Gourd, then the Yawning Portal
    roundEffect?: RoundEffect | null;
    devilCap?: number;
    maskReady?: boolean; // Martha's mask can be worn this fight
    enemy: Enemy;
    keepsakes: Keepsake[];
    pendingKeepsakeChoices: Keepsake[] | null;
    runComplete?: boolean;
    purse: number;
    shelf: Thonic[];
    shelfSize: number;
    shop: { stock: Thonic[]; free?: boolean } | null; // Thom's cart is open (free: the Loyalty Card's free Thonic is still to take)
    interlude: Interlude | null; // between fights (see server.js startInterlude)
    lastWin: ShopArrival | null; // the fight just won
    clearEye?: boolean; // a Clear-Eye Thonic is waiting to cancel the opponent's next ability
    abilityUsed?: Record<string, number | boolean>; // uses of each ability this fight
    abilityMax?: number; // the opponent's uses a fight
    abilityLeft?: boolean; // the opponent's ability has uses left this fight
    ladysGrace?: boolean; // the Lady's Grace: the next dust that would cost a heart doesn't
    tubSurge?: TubSurge | null; // the Wild Magic Hot Tub's surge on one of your dice, this fight
    nextSurge?: string | null; // ...or waiting for the next fight
}

// The Wild Magic Hot Tub's surges (server.js HOT_TUB_SURGES); die: the die it works on.
export interface TubSurge { id: 'noOnes' | 'twin' | 'lucky' | 'scalding' | 'soggy' | 'pruney'; name: string; text: string; good: boolean; die: number }

// Between fights, one event: now and then a pickpocket or the Hooded Stranger, else two spots
// catch your eye and you go to one.
export type Spot = 'thom' | 'shrine' | 'diceDen' | 'hotTub';
export interface DiceThrow { you: [number, number]; them: [number, number] }
export type Interlude =
    | { stage: 'pickpocket'; steal: number; catchOn: number; roll?: number; caught?: boolean; lost?: number }
    | { stage: 'choose'; spots: Spot[] }
    | { stage: 'shrine' }
    | { stage: 'diceDen'; bets: number[]; bet: number | null; throws: DiceThrow[] }
    | { stage: 'stranger'; offers: Keepsake[]; hearts: number }
    | { stage: 'hotTub' }
    // Darren Snakehands: one die (up to smashOn a Thonic smashes, up to giftOn a free one, else a Thonic and gold).
    | { stage: 'darren'; smashOn: number; giftOn: number; roll?: number; outcome?: 'smash' | 'gift' | 'catch'; smashed?: Thonic; paid?: number; thonic?: Thonic; gold?: number }
    | { stage: 'done'; spot: 'hotTub'; surge: TubSurge; hearts?: number }
    | { stage: 'done'; spot: 'shrine'; gift: 'favour' | 'grace'; hearts?: number }
    | { stage: 'done'; spot: 'diceDen'; bet: number; throws?: DiceThrow[]; won?: boolean }
    | { stage: 'done'; spot: 'stranger'; keepsake: Keepsake | null; hearts?: number }
    // After Martha: her mask is the invitation to the final. `save` is sealed by the server.
    | { stage: 'invitation'; place: string; save: string };

// The end of a Tavern Crawl run, won or lost (sent with gameOver).
export interface TavernSummary {
    won: boolean;
    name: string;
    defeated: number;
    encounters: string[];
    fellTo: string | null;
    gold: number;
    breakdown: { progress: number; hearts: number; perfect: number; events?: number; spent: number };
    stats: { encountersDefeated: number; livesLost: number; keepsakesActivated: number; perfect24s: number };
    keepsakes: string[];
}

// An opponent's signature move, shown as its own moment rather than a pop-up.
export interface AbilityMoment { name: string; ability: string; text: string; at: number; extra?: string }

// What the last fight paid out, shown when Thom's cart opens.
// A fight won (server.js): what it paid, shown on the summary before the next event (`at`: once).
export interface ShopArrival {
    defeated: string; nextEnemy: string; place?: number; at?: number; resumed?: boolean; mask?: Keepsake;
    gold: { win: number; hearts: number; heartsLeft?: number; perHeart?: number; perPlace?: number };
}

export interface GameState {
    players: Record<string, Player>;
    playerOrder: string[];
    roundPlayers: string[];
    currentTurnId?: string;
    isTieBreaker: boolean;
    roundNumber: number;
    startingLives: number;
    mode: 'classic' | 'tavern-crawl';
    tavernRun: TavernRun | null;
}

export interface Toast { id: number; title: string; text: string; tone: 'info' | 'signature' | 'result' }

export type Modal =
    | { type: 'keepsakes'; defeated: string; nextEnemy: string; transitionMessage: string | null; choices: Keepsake[] }
    | { type: 'gameOver'; message: string }
    | { type: 'tavernOver'; summary: TavernSummary };

export interface Snapshot {
    joined: boolean;
    roomLabel: string;
    myId: string | null;
    state: GameState | null;
    turn: TurnView | null;
    isMyTurn: boolean;
    rolling: boolean;
    endingTurn: boolean;
    callout: { text: string; color: string; key: string } | null;
    toasts: Toast[];
    modal: Modal | null;
    leaderboard: { name: string; gold: number }[];
    roomCode: string;
    waiting: boolean; // a classic table with nobody to play yet
    yourTurnAt: number; // when play last came round to you (for the banner)
    introAt: number; // when the current Tavern Crawl opponent was introduced
    ability: AbilityMoment | null;
    shopArrival: ShopArrival | null;
    // The scenes between fights are up (the summary, the event, Thom's cart): they wait for the
    // fight's last roll to finish (BETWEEN_PAUSE_MS), and while they're up nobody sits at the table.
    betweenShown: boolean;
    putBackSlot: number | null; // a Second Thoughts Thonic is waiting for a kept die to be tapped
}

export interface DiePose { position: THREE.Vector3; quaternion: THREE.Quaternion }

// How long Klarg waits after the dice stop before reaching over.
const STEAL_PAUSE_MS = 500;

// Read every frame by the 3D table, so it lives outside React state.
export const table = {
    roll: null as null | { track: RollTrack; startedAt: number; speed: number; hidden: Set<number> },
    rest: new Map<number, DiePose>(), // where each unlocked die is lying in the tray
    lockOrder: new Map<number, number>(), // die id -> when it was locked, so slots never reshuffle
    stolenAt: new Map<number, number>(), // die id -> time Klarg took it
    devilAt: 0,
    celebrateAt: 0
};

const socket = io({ transports: ['websocket', 'polling'] });

let snapshot: Snapshot = {
    joined: false,
    roomLabel: '',
    myId: null,
    state: null,
    turn: null,
    isMyTurn: false,
    rolling: false,
    endingTurn: false,
    callout: null,
    toasts: [],
    modal: null,
    leaderboard: [],
    roomCode: '',
    waiting: false,
    yourTurnAt: 0,
    introAt: 0,
    ability: null,
    shopArrival: null,
    betweenShown: false,
    putBackSlot: null
};

const listeners = new Set<() => void>();

function update(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(l => l());
}

export const store = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    get: () => snapshot
};

// ---- Toasts ----

let toastId = 0;
export function showToast(title: string, text: string, tone: Toast['tone'] = 'info', ms = 3200) {
    const toast = { id: ++toastId, title, text, tone };
    update({ toasts: [...snapshot.toasts, toast].slice(-3) });
    setTimeout(() => update({ toasts: snapshot.toasts.filter(t => t.id !== toast.id) }), ms);
}

// ---- Turn updates, applied strictly in order ----

const tasks: ((done: () => void) => void)[] = [];
let taskRunning = false;

function enqueue(task: (done: () => void) => void) {
    tasks.push(task);
    if (!taskRunning) runNext();
}

function runNext() {
    const task = tasks.shift();
    if (!task) { taskRunning = false; return; }
    taskRunning = true;
    task(runNext);
}

// A classic table needs a second player before anyone can roll.
function isWaiting(state: GameState | null) {
    return !!state && state.mode === 'classic' && !state.players[BOT_ID] && state.playerOrder.length < 2;
}

function computeIsMyTurn(state: GameState | null, turn: TurnView | null) {
    if (!state || !turn || !snapshot.myId || isWaiting(state)) return false;
    const me = state.players[snapshot.myId];
    return turn.playerId === snapshot.myId && !!me && me.lives > 0;
}

// No commentary in a Tavern Crawl: the opponents' signature moves are the show there.
const quietTable = () => snapshot.state?.mode === 'tavern-crawl';

function setCallout(turn: TurnView | null, callout: string | null, outcome: TurnOutcome | null) {
    if (!turn || quietTable()) { if (snapshot.callout) update({ callout: null }); return; }
    const mine = turn.playerId === snapshot.myId;
    const shown = calloutText(callout, mine, turn.playerId === BOT_ID, outcome);
    const key = `${turn.key}|${callout}`;
    if (snapshot.callout && snapshot.callout.key === key) return;
    update({ callout: shown ? { ...shown, key } : null });
}

function resetTrayForNewTurn() {
    table.rest.clear();
    table.stolenAt.clear();
    table.lockOrder.clear();
    for (let id = 0; id < 6; id++) {
        table.rest.set(id, { position: waitingPosition(id), quaternion: new THREE.Quaternion() });
    }
}

let lockCounter = 0;
function recordLockOrder(turn: TurnView) {
    turn.dice.forEach(d => {
        if (!isLocked(d)) table.lockOrder.delete(d.id);
        else if (!table.lockOrder.has(d.id)) table.lockOrder.set(d.id, ++lockCounter);
    });
}

// Taps move a die at once instead of waiting for the server. Each tap is kept as pending
// and shown on top of the server's turns until the server confirms it (or 1.5s passes,
// e.g. if the server refused it, and the board falls back to what the server says).
const PENDING_MS = 1500;
let serverTurn: TurnView | null = null;
const pendingTaps = new Map<number, { status: DieStatus; at: number }>();

function withPendingTaps(turn: TurnView | null): TurnView | null {
    if (!turn || pendingTaps.size === 0) return turn;
    const now = performance.now();
    pendingTaps.forEach((tap, id) => {
        const confirmed = turn.dice.find(d => d.id === id)?.status === tap.status;
        if (confirmed || now - tap.at > PENDING_MS) pendingTaps.delete(id);
    });
    if (pendingTaps.size === 0 || turn.finalized) return turn;
    const dice = turn.dice.map(d => (pendingTaps.has(d.id) ? { ...d, status: pendingTaps.get(d.id)!.status } : d));
    const locksThisRoll = dice.filter(d => d.status === 'lockedThisTurn').length;
    const canRoll = dice.some(d => d.status === 'active') && (!turn.hasRolled || locksThisRoll > 0);
    return { ...turn, dice, locksThisRoll, canRoll };
}

function applyTurn(serverView: TurnView | null) {
    if (!serverView || !serverTurn || serverTurn.key !== serverView.key) pendingTaps.clear();
    serverTurn = serverView;
    const turn = withPendingTaps(serverView);
    const isNewTurn = !turn || !snapshot.turn || snapshot.turn.key !== turn.key;
    if (isNewTurn) resetTrayForNewTurn();
    if (isNewTurn && snapshot.putBackSlot !== null) update({ putBackSlot: null });
    if (turn) recordLockOrder(turn);
    const isMyTurn = computeIsMyTurn(snapshot.state, turn);
    update({
        turn,
        isMyTurn,
        endingTurn: isNewTurn ? false : snapshot.endingTurn
    });
    if (isNewTurn && isMyTurn) announceYourTurn();
    if (turn) setCallout(turn, turn.callout, turn.outcome);
}

function playOutcomeSounds(event: { type: string; outcome?: TurnOutcome } | null) {
    if (!event) return;
    const mine = snapshot.isMyTurn;
    if (event.type === 'toggle' && !mine) playSound('click');
    if (event.type !== 'finalized' || !event.outcome) return;
    const { busted, score, suspense } = event.outcome;
    if (busted) playSound(suspense === 'survival' ? 'aww' : 'bust');
    else if (score === 24) { playSound('yay'); table.celebrateAt = performance.now(); }
    else if (suspense === 'perfect') playSound('ohwell');
    else if (suspense === 'survival') playSound('yay');
}

socket.on('turnState', (data: { turn: TurnView | null; event: { type: string; outcome?: TurnOutcome } | null }) => {
    enqueue(done => {
        applyTurn(data.turn);
        playOutcomeSounds(data.event);
        done();
    });
});

socket.on('diceRolled', (data: { turn: TurnView; preRollCallout: string | null; suspense: string; devil: boolean; throwSeed?: number; rerolled?: number[] }) => {
    enqueue(done => {
        const turn = data.turn;
        if (!snapshot.turn || snapshot.turn.key !== turn.key) resetTrayForNewTurn();

        // The dice this roll threw: the ones that were active just before it. (A die Klarg
        // stole earlier in the turn stays out of play; one he takes now was thrown first.)
        const before = snapshot.turn && snapshot.turn.key === turn.key ? snapshot.turn : null;
        // (A Fizzy Thomic throws only the dice it names.)
        const thrownIds = data.rerolled ? new Set(data.rerolled) : new Set((before ? before.dice : turn.dice.filter(d => d.status !== 'stolen'))
            .filter(d => d.status === 'active').map(d => d.id));
        const rolled = turn.dice.filter(d => thrownIds.has(d.id));
        const track = simulateRoll(rolled.map(d => d.id), rolled.map(d => (d.hidden ? 0 : d.value)), data.throwSeed);
        const speed = data.suspense !== 'none' ? 0.55 : 1;
        const durationMs = (trackDuration(track) / speed) * 1000;

        table.roll = { track, startedAt: performance.now(), speed, hidden: new Set(rolled.filter(d => d.hidden).map(d => d.id)) };
        // Rokr's blur lifts the moment the next roll starts (not when it lands): the dice already
        // kept show their faces at once, and the stars over the thrown ones go.
        const unblurred = before && before.blurActive && !turn.blurActive
            ? { ...before, blurActive: false, dice: before.dice.map(d => thrownIds.has(d.id) ? { ...d, hidden: false } : turn.dice.find(n => n.id === d.id) ?? d) }
            : null;
        update(unblurred ? { rolling: true, turn: unblurred } : { rolling: true });
        setCallout(turn, data.preRollCallout, null);
        playDiceImpacts(track.impacts, speed);

        setTimeout(() => {
            // Leave each die exactly where its throw ended.
            rolled.forEach((d, i) => {
                const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
                readFrame(track, track.frames - 1, i, pose.position, pose.quaternion);
                table.rest.set(d.id, pose);
                // Klarg waits until every die has stopped, then reaches over a moment later.
                if (d.status === 'stolen') table.stolenAt.set(d.id, performance.now() + STEAL_PAUSE_MS);
            });
            table.roll = null;
            if (data.devil) { table.devilAt = performance.now(); playSound('devil'); }
            update({ rolling: false });
            applyTurn(turn);
            done();
        }, durationMs + 120);
    });
});

// Play has come round to you: a banner, a swoosh, and a short buzz on phones.
function announceYourTurn() {
    update({ yourTurnAt: performance.now() });
    playSound('swoosh');
    // Browsers only allow vibration after the player has tapped the page.
    try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(120); } catch { /* not supported */ }
}

// ---- Your seat ----
// The table you're at is remembered for this browser tab, so a refresh or a dropped
// connection (a phone going to sleep) puts you straight back in your seat. The server
// recognises you by the session token and hands your seat back.

interface Seat { roomCode: string; name: string; avatar: string; lives: number; resume?: string }

// A Tavern Crawl saved at the invitation to the final (localStorage, kept on this device).
export interface SavedRun { save: string; name: string; place: string; next: string; purse: number; at: number }

export function readSavedRun(): SavedRun | null {
    try { return JSON.parse(localStorage.getItem('tavernSave') ?? 'null'); } catch { return null; }
}

function writeSavedRun(run: SavedRun | null) {
    try {
        if (run) localStorage.setItem('tavernSave', JSON.stringify(run));
        else localStorage.removeItem('tavernSave');
    } catch { /* storage unavailable */ }
}

function readSeat(): Seat | null {
    try { return JSON.parse(sessionStorage.getItem('tavernSeat') ?? 'null'); } catch { return null; }
}

function writeSeat(seat: Seat | null) {
    try {
        if (seat) sessionStorage.setItem('tavernSeat', JSON.stringify(seat));
        else sessionStorage.removeItem('tavernSeat');
    } catch { /* storage unavailable */ }
}

function takeSeat(seat: Seat) {
    socket.emit('joinTavern', { name: seat.name, avatar: seat.avatar, roomCode: seat.roomCode, token: getSessionToken(), startingLives: seat.lives, resume: seat.resume });
}

function roomLabel(code: string) {
    return code.startsWith('COMP-') ? 'Solo vs The Molar' : code.startsWith('TVRN-') ? 'House Table' : `Table ${code}`;
}

socket.on('connect', () => {
    update({ myId: socket.id ?? null });
    const seat = readSeat();
    if (seat) takeSeat(seat);
});

// A fight won: the last roll plays out on the table and the beaten opponent stays a moment
// before the scenes between fights come up.
const BETWEEN_PAUSE_MS = 1400;
let betweenPending = false;

socket.on('gameStateUpdate', (state: GameState) => {
    const waiting = isWaiting(state);
    const isMyTurn = computeIsMyTurn(state, snapshot.turn);
    // The second player arriving starts play; if it starts with you, say so.
    const nowYourTurn = snapshot.waiting && !waiting && isMyTurn;
    const run = state.tavernRun;
    const between = !!run && !!(run.interlude || run.shop);
    // Straight in after a reload or a resume; after a fight, once its last roll has played out.
    const fromFight = !!snapshot.state?.tavernRun && !snapshot.state.tavernRun.interlude && !snapshot.state.tavernRun.shop;
    update({ state, isMyTurn, waiting, ...(between ? {} : { betweenShown: false }) });
    if (between && !snapshot.betweenShown && !betweenPending) {
        if (!fromFight) update({ betweenShown: true });
        else {
            betweenPending = true;
            enqueue(done => setTimeout(() => {
                betweenPending = false;
                const now = snapshot.state?.tavernRun;
                if (now && (now.interlude || now.shop)) update({ betweenShown: true });
                done();
            }, BETWEEN_PAUSE_MS));
        }
    }
    if (nowYourTurn) announceYourTurn();
    introduceOpponent(state);
});

// Each Tavern Crawl opponent gets an entrance (name card, bust sliding in) when they sit
// down. Remembered for this tab, so a refresh or reconnect doesn't replay it.
function introduceOpponent(state: GameState) {
    const run = state.tavernRun;
    if (state.mode !== 'tavern-crawl' || !run || run.pendingKeepsakeChoices || run.shop || run.interlude || run.runComplete) return;
    const key = `${snapshot.roomCode}#${run.encounterNumber}`;
    try {
        if (sessionStorage.getItem('tavernIntro') === key) return;
        sessionStorage.setItem('tavernIntro', key);
    } catch { /* storage unavailable: introduce anyway */ }
    update({ introAt: performance.now() });
}

// Invite link for a classic table: opens the 3D table with the code filled in.
export function inviteLink(code: string) {
    return `${location.origin}${import.meta.env.BASE_URL}?table=${encodeURIComponent(code)}`;
}

socket.on('leaderboardUpdate', (entries: { name: string; gold: number }[]) => {
    update({ leaderboard: Array.isArray(entries) ? entries : [] });
});

// Moves with their own on-table moment (see Hud's AbilityMoment and the 3D dice).
const ABILITY_MOMENTS = new Set(['Reach Around', 'Constellation Blur', 'The Ace of Spades', 'Smooth Talk', 'Mind Whip', 'You are Cursed', 'Sympathy for the Devil']);

// The server sends a move while the dice may still be tumbling on screen, so it waits its
// turn in the queue: it shows once the roll has finished. Reach Around waits a little longer,
// so the name and sound land just as Klarg's hand lifts the die.
socket.on('signatureMove', (data: { name: string; ability: string; text: string }) => {
    enqueue(done => {
        const steal = data.ability === 'Reach Around' ? Math.max(0, ...table.stolenAt.values()) - performance.now() : 0;
        setTimeout(() => {
            const sound = ABILITY_SOUNDS[data.ability];
            if (sound) playSound(sound);
            if (ABILITY_MOMENTS.has(data.ability)) update({ ability: { ...data, at: performance.now() } });
            else showToast(`${data.name}: ${data.ability}`, data.text, 'signature', 3600);
            done();
        }, Math.max(0, steal));
    });
});

// A saved run the server wouldn't open (changed, or opened already): this is a fresh crawl.
socket.on('resumeFailed', () => {
    showToast('That save could not be opened', 'It was used already, or the server has been reset. A new crawl begins.', 'info', 5000);
});

// A fight is won: the run pauses between fights (tavernRun.interlude, then maybe Thom's
// cart in tavernRun.shop).
socket.on('offerShop', (data: ShopArrival) => {
    update({ shopArrival: data }); // (the fanfare plays when the summary comes up)
});

// A Thonic was drunk, or worked by itself (Last Gasp): shown like an opponent's move.
socket.on('thonicUsed', (data: { id: string; name: string; text: string }) => {
    enqueue(done => {
        playCorkPop(data.id === 'fizzy');
        update({ ability: { name: "Thom's Thonics", ability: data.name, text: data.text, extra: data.id === 'healing' ? '+1 ♥' : undefined, at: performance.now() } });
        done();
    });
});

// The Lady's Grace saves a dust: her moment on the table, like a Thonic's (no cork).
socket.on('blessingUsed', (data: { id: string; name: string; text: string }) => {
    enqueue(done => {
        playSound('yay');
        update({ ability: { name: 'Shrine to the Lady', ability: data.name, text: data.text, extra: '♥ saved', at: performance.now() } });
        done();
    });
});

socket.on('keepsakeActivated', (data: { name: string; text: string }) => {
    showToast(`Keepsake: ${data.name}`, data.text, 'signature', 3600);
});

socket.on('roundResult', (data: { message: string }) => {
    showToast('Round result', data.message, 'result', 4200);
});

socket.on('displayMessage', (data: { text: string }) => {
    if (data.text && !quietTable()) showToast('', data.text, 'info', 2600);
});

socket.on('receiveReaction', (data: { name: string; emoji: string }) => {
    const labels: Record<string, string> = { hood: '😈', swords: '⚔️', shield: '🛡️', skull: '💀' };
    showToast(data.name, labels[data.emoji] ?? data.emoji, 'info', 1800);
});

socket.on('offerKeepsakes', (data: Omit<Extract<Modal, { type: 'keepsakes' }>, 'type'>) => {
    playSound('winner');
    update({ modal: { type: 'keepsakes', ...data } });
});

socket.on('gameOver', (data: { message: string; tavern?: TavernSummary }) => {
    if (data.tavern) {
        playSound(data.tavern.won ? 'winner' : 'aww');
        update({ modal: { type: 'tavernOver', summary: data.tavern } });
    } else {
        update({ modal: { type: 'gameOver', message: data.message } });
    }
});

socket.on('triggerNewGameSplash', () => {
    // Whoever pressed Play again, the new game has started for everyone at the table.
    if (snapshot.modal?.type === 'gameOver' || snapshot.modal?.type === 'tavernOver') update({ modal: null });
    playSound('swoosh');
    if (snapshot.state?.mode === 'tavern-crawl') {
        // A fresh run: The Molar is introduced again.
        try { sessionStorage.removeItem('tavernIntro'); } catch { /* storage unavailable */ }
        introduceOpponent(snapshot.state);
    } else {
        showToast('', 'A new game begins!', 'signature', 2000);
    }
});

// ---- Player actions ----

function getSessionToken() {
    try {
        let token = sessionStorage.getItem('tavernToken');
        if (!token) {
            token = Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem('tavernToken', token);
        }
        return token;
    } catch {
        return Math.random().toString(36).substring(2, 15);
    }
}

// Which dice a Second Thoughts Thonic can put back: those kept on an earlier roll, or any kept
// die once the hand is finished (the server applies the same rule).
export function canPutBack(turn: TurnView, status: string) {
    return turn.hasRolled && (status === 'permanentlyLocked' || (turn.finalized && status === 'lockedThisTurn'));
}

export const actions = {
    join(name: string, avatar: string, tableCode: string, lives = 3) {
        let roomCode = tableCode.trim().toUpperCase();
        if (roomCode === 'COMP') roomCode = `COMP-${Math.floor(1000 + Math.random() * 9000)}`;
        else if (roomCode === 'TAVERN') roomCode = `TVRN-${Math.floor(1000 + Math.random() * 9000)}`;
        if (!roomCode) roomCode = 'PUBLIC';

        startMusic();
        const seat = { roomCode, name, avatar, lives };
        writeSeat(seat);
        takeSeat(seat);
        update({ joined: true, roomLabel: roomLabel(roomCode), roomCode });
    },
    leave() {
        writeSeat(null);
        // A fresh page is the simplest clean slate: new socket, no table state.
        location.href = import.meta.env.BASE_URL;
    },
    async share() {
        const url = inviteLink(snapshot.roomCode);
        try {
            if (navigator.share) { await navigator.share({ title: '2, 4, 24', text: `Join my table ${snapshot.roomCode}`, url }); return; }
        } catch { /* cancelled or unavailable: fall back to copying */ }
        try {
            await navigator.clipboard.writeText(url);
            showToast('', 'Invite link copied', 'info', 2200);
        } catch {
            showToast('Invite link', url, 'info', 8000);
        }
    },
    roll() {
        const { turn, isMyTurn, rolling } = snapshot;
        if (!turn || !isMyTurn || rolling) return;
        startMusic();
        if (turn.finalized) {
            update({ endingTurn: true });
            socket.emit('endTurn');
        } else if (turn.canRoll) {
            socket.emit('rollDice');
        }
    },
    toggleDie(dieId: number) {
        const { turn, isMyTurn, rolling, putBackSlot } = snapshot;
        if (turn && isMyTurn && !rolling && putBackSlot !== null) {
            const kept = turn.dice.find(d => d.id === dieId);
            if (kept && canPutBack(turn, kept.status)) {
                update({ putBackSlot: null });
                socket.emit('drinkThonic', putBackSlot, dieId);
            }
            return;
        }
        if (!turn || !isMyTurn || rolling || !turn.hasRolled || turn.finalized) return;
        const die = turn.dice.find(d => d.id === dieId);
        if (!die || die.status === 'permanentlyLocked' || die.status === 'stolen' || die.mind) return;
        playSound('click');
        socket.emit('toggleDie', dieId);

        // Show the result straight away rather than waiting for the server.
        pendingTaps.set(dieId, { status: die.status === 'active' ? 'lockedThisTurn' : 'active', at: performance.now() });
        const shown = withPendingTaps(serverTurn);
        if (shown) recordLockOrder(shown);
        update({ turn: shown });
        // If the server never confirms, drop the tap and show the server's board again.
        setTimeout(() => {
            if (pendingTaps.size === 0) return;
            update({ turn: withPendingTaps(serverTurn) });
        }, PENDING_MS + 50);
    },
    buyThonic(id: string) {
        playSound('click');
        socket.emit('buyThonic', id);
    },
    leaveShop() {
        actions.moveOn();
    },
    // A saved Tavern Crawl carries on at a fresh table (the save is used up).
    resume(saved: SavedRun, avatar: string) {
        writeSavedRun(null);
        const roomCode = `TVRN-${Math.floor(1000 + Math.random() * 9000)}`;
        startMusic();
        const seat = { roomCode, name: saved.name, avatar, lives: 3, resume: saved.save };
        writeSeat(seat);
        takeSeat(seat);
        update({ joined: true, roomLabel: roomLabel(roomCode), roomCode });
    },
    forgetSavedRun() {
        writeSavedRun(null);
    },
    // At the invitation to the final: keep the run on this device and leave the table.
    saveAndLeave(save: string, info: Omit<SavedRun, 'save' | 'at'>) {
        writeSavedRun({ save, ...info, at: Date.now() });
        actions.leave();
    },
    // Martha's mask: before you roll, wear Danhausen's Curse or the Duke's Devil for the round.
    wearMask(kind: 'curse' | 'devil') {
        playSound('click');
        socket.emit('wearMask', kind);
    },
    // Between fights: on to the next opponent, from Thom's cart or any spot.
    moveOn() {
        playSound('swoosh');
        socket.emit('moveOn');
        update({ shopArrival: null });
    },
    chooseSpot(spot: Spot) {
        playSound('click');
        socket.emit('chooseSpot', spot);
    },
    pickpocket(action: 'roll' | 'on') {
        playSound('click');
        socket.emit('pickpocket', action);
    },
    darren(action: 'roll' | 'on') {
        playSound('click');
        socket.emit('darren', action);
    },
    // The Wild Magic Hot Tub: climb in; the wild magic surges.
    soak() {
        playSound('click');
        socket.emit('hotTub', 'soak');
    },
    // The Shrine: light a candle; the Lady grants a blessing at random.
    pray() {
        playSound('click');
        socket.emit('shrinePick', 'pray');
    },
    diceBet(bet: number) {
        playSound('click');
        socket.emit('diceBet', bet);
    },
    diceRoll() {
        socket.emit('diceRoll');
    },
    strangerPick(id: string | null) {
        playSound('click');
        socket.emit('strangerPick', id);
    },
    drinkThonic(slot: number, dieId?: number) {
        socket.emit('drinkThonic', slot, dieId);
    },
    // Second Thoughts: after drinking is confirmed, the next tap on a kept die names it.
    startPutBack(slot: number) {
        update({ putBackSlot: slot });
    },
    cancelPutBack() {
        if (snapshot.putBackSlot !== null) update({ putBackSlot: null });
    },
    chooseKeepsake(id: string) {
        playSound('click');
        socket.emit('chooseKeepsake', id);
        update({ modal: null });
    },
    playAgain() {
        playSound('click');
        socket.emit('playAgain');
        update({ modal: null });
    },
    dismissModal() {
        update({ modal: null });
    },
    react(emoji: string) {
        socket.emit('sendReaction', emoji);
    }
};

// Development only (see main.tsx): play an opponent's signature moment or entrance on
// demand, to check how it looks without waiting for it to happen in a game.
export const preview = {
    ability(name: string, ability: string) { update({ ability: { name, ability, text: '', at: performance.now() } }); },
    intro() { update({ introAt: performance.now() }); }
};

resetTrayForNewTurn();

// Back in your seat after a refresh (the socket rejoins the table when it connects).
const savedSeat = readSeat();
if (savedSeat) snapshot = { ...snapshot, joined: true, roomLabel: roomLabel(savedSeat.roomCode), roomCode: savedSeat.roomCode };
