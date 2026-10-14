import { io } from 'socket.io-client';
import * as THREE from 'three';
import { calloutText, isLocked, type TurnOutcome, type TurnView } from './rules';
import { simulateRoll, readFrame, trackDuration, type RollTrack } from './physics';
import { waitingPosition } from './layout';
import { playSound, startMusic, ABILITY_SOUNDS } from './sounds';

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

export interface TavernRun {
    encounterNumber: number;
    totalEncounters: number;
    enemy: { id: string; name: string; intro: string; ability: string | null; lives: number };
    keepsakes: Keepsake[];
    pendingKeepsakeChoices: Keepsake[] | null;
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
    | { type: 'gameOver'; message: string };

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
}

export interface DiePose { position: THREE.Vector3; quaternion: THREE.Quaternion }

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
    yourTurnAt: 0
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

function setCallout(turn: TurnView | null, callout: string | null, outcome: TurnOutcome | null) {
    if (!turn) { update({ callout: null }); return; }
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

function applyTurn(turn: TurnView | null) {
    const isNewTurn = !turn || !snapshot.turn || snapshot.turn.key !== turn.key;
    if (isNewTurn) resetTrayForNewTurn();
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

socket.on('diceRolled', (data: { turn: TurnView; preRollCallout: string | null; suspense: string; devil: boolean; throwSeed?: number }) => {
    enqueue(done => {
        const turn = data.turn;
        if (!snapshot.turn || snapshot.turn.key !== turn.key) resetTrayForNewTurn();

        // Dice that were in play before this roll: still active, or just stolen by Klarg.
        const rolled = turn.dice.filter(d => d.status === 'active' || d.status === 'stolen');
        const track = simulateRoll(rolled.map(d => d.id), rolled.map(d => (d.hidden ? 0 : d.value)), data.throwSeed);
        const speed = data.suspense !== 'none' ? 0.55 : 1;
        const durationMs = (trackDuration(track) / speed) * 1000;

        table.roll = { track, startedAt: performance.now(), speed, hidden: new Set(rolled.filter(d => d.hidden).map(d => d.id)) };
        update({ rolling: true });
        setCallout(turn, data.preRollCallout, null);
        playSound('roll', 0.85 + Math.random() * 0.3);

        setTimeout(() => {
            // Leave each die exactly where its throw ended.
            rolled.forEach((d, i) => {
                const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
                readFrame(track, track.frames - 1, i, pose.position, pose.quaternion);
                table.rest.set(d.id, pose);
                if (d.status === 'stolen') table.stolenAt.set(d.id, performance.now());
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
    try { navigator.vibrate?.(120); } catch { /* not supported */ }
}

// ---- Your seat ----
// The table you're at is remembered for this browser tab, so a refresh or a dropped
// connection (a phone going to sleep) puts you straight back in your seat. The server
// recognises you by the session token and hands your seat back.

interface Seat { roomCode: string; name: string; avatar: string; lives: number }

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
    socket.emit('joinTavern', { name: seat.name, avatar: seat.avatar, roomCode: seat.roomCode, token: getSessionToken(), startingLives: seat.lives });
}

function roomLabel(code: string) {
    return code.startsWith('COMP-') ? 'Solo vs The Molar' : code.startsWith('TVRN-') ? 'House Table' : `Table ${code}`;
}

socket.on('connect', () => {
    update({ myId: socket.id ?? null });
    const seat = readSeat();
    if (seat) takeSeat(seat);
});

socket.on('gameStateUpdate', (state: GameState) => {
    const waiting = isWaiting(state);
    const isMyTurn = computeIsMyTurn(state, snapshot.turn);
    // The second player arriving starts play; if it starts with you, say so.
    const nowYourTurn = snapshot.waiting && !waiting && isMyTurn;
    update({ state, isMyTurn, waiting });
    if (nowYourTurn) announceYourTurn();
});

// Invite link for a classic table: opens the 3D table with the code filled in.
export function inviteLink(code: string) {
    return `${location.origin}${import.meta.env.BASE_URL}?table=${encodeURIComponent(code)}`;
}

socket.on('leaderboardUpdate', (entries: { name: string; gold: number }[]) => {
    update({ leaderboard: Array.isArray(entries) ? entries : [] });
});

socket.on('signatureMove', (data: { name: string; ability: string; text: string }) => {
    const sound = ABILITY_SOUNDS[data.ability];
    if (sound) playSound(sound);
    showToast(`${data.name}: ${data.ability}`, data.text, 'signature', 3600);
});

socket.on('keepsakeActivated', (data: { name: string; text: string }) => {
    showToast(`Keepsake: ${data.name}`, data.text, 'signature', 3600);
});

socket.on('roundResult', (data: { message: string }) => {
    showToast('Round result', data.message, 'result', 4200);
});

socket.on('displayMessage', (data: { text: string }) => {
    if (data.text) showToast('', data.text, 'info', 2600);
});

socket.on('receiveReaction', (data: { name: string; emoji: string }) => {
    const labels: Record<string, string> = { hood: '😈', swords: '⚔️', shield: '🛡️', skull: '💀' };
    showToast(data.name, labels[data.emoji] ?? data.emoji, 'info', 1800);
});

socket.on('offerKeepsakes', (data: Omit<Extract<Modal, { type: 'keepsakes' }>, 'type'>) => {
    playSound('winner');
    update({ modal: { type: 'keepsakes', ...data } });
});

socket.on('gameOver', (data: { message: string }) => {
    update({ modal: { type: 'gameOver', message: data.message } });
});

socket.on('triggerNewGameSplash', () => {
    // Whoever pressed Play again, the new game has started for everyone at the table.
    if (snapshot.modal?.type === 'gameOver') update({ modal: null });
    playSound('swoosh');
    showToast('', 'A new game begins!', 'signature', 2000);
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
        const { turn, isMyTurn, rolling } = snapshot;
        if (!turn || !isMyTurn || rolling || !turn.hasRolled || turn.finalized) return;
        const die = turn.dice.find(d => d.id === dieId);
        if (!die || die.status === 'permanentlyLocked' || die.status === 'stolen') return;
        playSound('click');
        socket.emit('toggleDie', dieId);
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

resetTrayForNewTurn();

// Back in your seat after a refresh (the socket rejoins the table when it connects).
const savedSeat = readSeat();
if (savedSeat) snapshot = { ...snapshot, joined: true, roomLabel: roomLabel(savedSeat.roomCode), roomCode: savedSeat.roomCode };
