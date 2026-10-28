import { io } from 'socket.io-client';
import * as THREE from 'three';
import { calloutText, isLocked, onePerfect4Away, perfectHand, type DieStatus, type TurnOutcome, type TurnView } from './rules';
import { simulateRoll, readFrame, paceSeconds, suspensePace, type Pace, type RollTrack } from './physics';
import { waitingPosition } from './layout';
import { lookNext } from './look';
import { playChime, playDiceImpacts, playSound, startMusic, playThomPurchase, ABILITY_SOUNDS, SWITCH_LEAD_MS } from './sounds';

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
// score wins), the Devil (`by` throws three 6s; the other side can't score above devilCap),
// Vaelin's Inkfire (your dice can't land on 6) or the Ridgeler's Divine Smite (lose the round,
// lose two hearts). `by` is 'player' when Martha's mask was worn.
export interface RoundEffect { kind: 'mind' | 'curse' | 'devil' | 'ink' | 'smite'; by: 'opponent' | 'player'; ability: string; as: string | null; landed?: boolean }

// A Tavern Crawl opponent (server.js TAVERN_ENCOUNTERS).
export interface Enemy { id: string; name: string; intro: string; ability: string | null; lives: number }

export interface TavernRun {
    encounterNumber: number;
    // Who sits across the table: the current opponent or, between fights, the one just beaten
    // (enemy is already the next one then). number: their place in the run.
    seated?: Enemy & { number: number };
    totalEncounters: number;
    place: string; // The Ghoul and Gourd, the Yawning Portal, then the Salty Swallow
    roundEffect?: RoundEffect | null;
    devilCap?: number | null; // null: no cap (since 21 Oct)
    maskReady?: boolean; // Martha's mask can be worn this fight
    enemy: Enemy;
    keepsakes: Keepsake[];
    pendingKeepsakeChoices: Keepsake[] | null;
    runComplete?: boolean;
    purse: number;
    shelf: Thonic[];
    shelfSize: number;
    shop: { stock: Thonic[]; free?: boolean; first?: boolean; keepsakes?: (Keepsake & { price: number })[] } | null; // Thom's cart is open (free: the Loyalty Card's free Thonic is still to take; keepsakes: his back shelf)
    thomMet?: boolean; // you've been to Thom's cart this run (his first greeting is different)
    prices?: { shrine: number; hotTub: number }; // what a candle at the Shrine and a soak in the hot tub cost
    interlude: Interlude | null; // between fights (see server.js startInterlude)
    lastWin: ShopArrival | null; // the fight just won
    clearEye?: boolean; // a Clear-Eye Thonic is waiting to cancel the opponent's next ability
    abilityUsed?: Record<string, number | boolean>; // uses of each ability this fight
    encounterKeepsakeUses?: Record<string, boolean>; // keepsakes that have worked this fight
    abilityMax?: number; // the opponent's uses a fight
    jaguarPhase?: 'talk' | 'cloak' | 'allIn' | null; // Jaguar's phase this round
    abilityLeft?: boolean; // the opponent's ability has uses left this fight
    ladysGrace?: boolean; // the Lady's Grace: the next dust that would cost a heart doesn't
    tubSurge?: TubSurge | null; // the Wild Magic Hot Tub's surge on one of your dice, this fight
    nextSurge?: string | null; // ...or waiting for the next fight
}

// A roll that lost, risen from its die as a ghost: kind 'tub' (aqua, Double Bubble) or 'plain'.
export interface Ghost { die: number; kept: number; lost: number; kind: 'tub' | 'plain' }

// The Wild Magic Hot Tub's surges (server.js HOT_TUB_SURGES); die: the die it works on.
export interface TubSurge { id: 'noOnes' | 'twin' | 'lucky' | 'scalding' | 'soggy' | 'pruney'; name: string; text: string; good: boolean; die: number }

// Between fights, one event: now and then a pickpocket or the Hooded Stranger, else two spots
// catch your eye and you go to one.
export type Spot = 'thom' | 'shrine' | 'diceDen' | 'hotTub';
export interface DiceThrow { you: [number, number]; them: [number, number] }
export type Interlude =
    | { stage: 'pickpocket'; steal: number; catchOn: number; roll?: number; caught?: boolean; lost?: number }
    | { stage: 'choose'; spots: Spot[]; after?: 'pickpocket' | 'stranger' | 'darren' } // after: a random event came first
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
    // After a boss (Martha, Brodor): their keepsake (`drop`) and the invitation on to `place`,
    // from `from`. `save` is sealed by the server.
    | { stage: 'invitation'; place: string; from?: string | null; boss?: string | null; drop?: Keepsake | null; save: string };

// The end of a Tavern Crawl run, won or lost (sent with gameOver).
// Each name's best run: its points, and the gold it ended with.
export interface LeaderboardEntry { name: string; points: number; gold: number }

export interface TavernSummary {
    won: boolean;
    name: string;
    defeated: number;
    encounters: string[];
    fellTo: string | null;
    points: number; // the leaderboard's score (since 23 Oct)
    gold: number;    // the purse at the end
    breakdown: { fights: number; hearts: number; perfect: number; reached: number; gold: number; purse: number; events: number; spent: number };
    stats: { encountersDefeated: number; livesLost: number; keepsakesActivated: number; perfect24s: number };
    keepsakes: string[];
}

// An opponent's signature move, shown as its own moment rather than a pop-up.
// cancelled: a Clear-Eye stopped it (its banner shows, without its effect; the Thonic's moment follows).
export interface AbilityMoment { name: string; ability: string; text: string; at: number; extra?: string; keepsake?: string; thonic?: string; cancelled?: boolean }

// What the last fight paid out, shown when Thom's cart opens.
// A fight won (server.js): what it paid, shown on the summary before the next event (`at`: once).
export interface ShopArrival {
    defeated: string; nextEnemy: string; place?: number; at?: number; resumed?: boolean; drop?: Keepsake | null; // drop: a boss's keepsake
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
    leaderboard: LeaderboardEntry[];
    roomCode: string;
    waiting: boolean; // a classic table with nobody to play yet
    yourTurnAt: number; // when play last came round to you (for the banner)
    introAt: number; // when the current Tavern Crawl opponent was introduced
    ability: AbilityMoment | null;
    shopArrival: ShopArrival | null;
    // The scenes between fights are up (the summary, the event, Thom's cart): they wait for the
    // fight's last roll to finish (BETWEEN_PAUSE_MS), and while they're up nobody sits at the table.
    betweenShown: boolean;
    // The rolls that lost (Double Bubble on the hot tub's aqua die, Stason's Flourish on all of
    // his), shown as ghost dice once the dice stop.
    ghosts: { dice: Ghost[]; at: number } | null;
    putBackSlot: number | null; // a Second Thoughts Thonic is waiting for a kept die to be tapped
    // A perfect hand's celebration (since 23 Oct): a 24, or in a cursed round (lowest wins) the
    // 2, the 4 and four 1s. who: the player's name when it isn't you.
    celebration: { kind: 'perfect24' | 'perfect4'; at: number; who: string | null } | null;
    devil: { at: number; who: string | null } | null; // three 6s landed (who: when it isn't you)
}

export interface DiePose { position: THREE.Vector3; quaternion: THREE.Quaternion }

// How long Klarg waits after the dice stop before reaching over.
const STEAL_PAUSE_MS = 500;

// Read every frame by the 3D table, so it lives outside React state.
export const table = {
    roll: null as null | { track: RollTrack; startedAt: number; speed: number; pace: Pace; hidden: Set<number> },
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
    ghosts: null,
    putBackSlot: null,
    celebration: null,
    devil: null
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

// One moment at a time (the user's call, 21 Oct: an ability, a keepsake, a Thonic and the
// round's result used to land all at once). Each waits in the queue until the one before has
// had MOMENT_GAP_MS on screen; anything queued behind it (a roll, the next state) waits too.
// Dice are never thrown under one (the user's call, 23 Oct): a roll waits until the last moment
// has gone (momentGoneAt; the server holds its throws to the same clock, momentsLeft).
const MOMENT_GAP_MS = 1700;
export const MOMENT_SHOW_MS = 1850; // an ability's banner (useMoment in Hud), a move's toast (3.6 s until 26 Oct, 2.6 s until 27 Oct)
const RESULT_GAP_MS = 1200, RESULT_SHOW_MS = 2600; // the round's result
let momentFreeAt = 0;
let momentGoneAt = 0;
// earliest: when it may show at the soonest, apart from the gap (Klarg's steal waits for his hand).
// shown: how long it stays up.
function enqueueMoment(show: () => void, gap = MOMENT_GAP_MS, earliest = () => 0, shown = MOMENT_SHOW_MS) {
    enqueue(done => setTimeout(() => {
        show();
        const now = performance.now();
        momentFreeAt = now + gap;
        momentGoneAt = Math.max(momentGoneAt, now + shown);
        done();
    }, Math.max(0, momentFreeAt - performance.now(), earliest() - performance.now())));
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
    if (pendingTaps.size) setTimeout(() => { if (serverTurn === serverView) applyTurn(serverView); }, PENDING_MS + 50);
    const isMyTurn = computeIsMyTurn(snapshot.state, turn);
    update({
        turn,
        isMyTurn,
        endingTurn: isNewTurn ? false : snapshot.endingTurn
    });
    if (isNewTurn && isMyTurn) announceYourTurn();
    if (turn) setCallout(turn, turn.callout, turn.outcome);
}

// How long a perfect hand's celebration holds the screen (Hud's Celebration); what comes next waits.
export const CELEBRATION_MS = 2800;
// Three 6s land (since 23 Oct, the user's): fire up the screen, the devil with her three 6s and
// "Devil's titties" (Hud's DevilSixes). Taps still reach the dice; what comes next waits.
export const DEVIL_MS = 1500;

function showDevil(turn: TurnView) {
    table.devilAt = performance.now();
    playSound('devil');
    const who = turn.playerId !== snapshot.myId ? snapshot.state?.players[turn.playerId]?.name ?? null : null;
    update({ devil: { at: performance.now(), who } });
    const gone = performance.now() + DEVIL_MS;
    momentFreeAt = Math.max(momentFreeAt, gone);
    momentGoneAt = Math.max(momentGoneAt, gone);
}

function playOutcomeSounds(event: { type: string; outcome?: TurnOutcome } | null, turn: TurnView | null) {
    if (!event) return;
    const mine = snapshot.isMyTurn;
    // (In the new look a kept die clacks as it reaches its slot, Dice.tsx, so no click here.)
    if (event.type === 'toggle' && !mine && !lookNext) playSound('click');
    if (event.type !== 'finalized' || !event.outcome) return;
    const { busted, score, suspense } = event.outcome;
    // In a cursed round (Danhausen's, or his face on Martha or your mask) the lowest valid hand
    // wins: four 1s with the 2 and 4 is its perfect hand, and a 24 its worst.
    const cursed = snapshot.state?.tavernRun?.roundEffect?.kind === 'curse';
    const perfect = perfectHand(event.outcome, cursed);
    if (perfect) {
        playSound('yay');
        if (perfect === 'perfect24') table.celebrateAt = performance.now();
        const who = turn && turn.playerId !== snapshot.myId ? snapshot.state?.players[turn.playerId]?.name ?? null : null;
        update({ celebration: { kind: perfect, at: performance.now(), who } });
        // A moment of its own: the round's result and the next throw wait for it.
        const gone = performance.now() + CELEBRATION_MS;
        momentFreeAt = Math.max(momentFreeAt, gone);
        momentGoneAt = Math.max(momentGoneAt, gone);
    }
    else if (busted) playSound(suspense === 'survival' ? 'aww' : 'bust');
    else if (cursed && score === 24) playSound('ohwell');
    else if (suspense === 'perfect') playSound('ohwell');
    else if (suspense === 'survival') playSound('yay');
}

socket.on('turnState', (data: { turn: TurnView | null; event: { type: string; outcome?: TurnOutcome } | null }) => {
    enqueue(done => {
        // Sylvester knocked a kept die loose: the server's hand wins over taps still showing.
        if (data.event?.type === 'punched') pendingTaps.clear();
        applyTurn(data.turn);
        playOutcomeSounds(data.event, data.turn);
        done();
    });
});

socket.on('diceRolled', (data: { turn: TurnView; preRollCallout: string | null; suspense: string; devil: boolean; throwSeed?: number; rerolled?: number[]; ghosts?: Ghost[] }) => {
    enqueue(done => setTimeout(() => {
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
        // A cursed round's chance at its perfect hand (since 26 Oct, the user's): the 2, the 4 and
        // three 1s kept, one die to throw for the fourth 1. The server's suspense doesn't know the
        // Curse, so the throw gets its slow motion here.
        const perfect4Chance = snapshot.state?.tavernRun?.roundEffect?.kind === 'curse' && !!before && !data.rerolled && onePerfect4Away(before.dice);
        const speed = data.suspense !== 'none' || perfect4Chance ? 0.55 : 1;
        // A suspense roll's last bounce plays in slow motion (visuals plan step 2).
        const pace: Pace = speed < 1 && lookNext ? suspensePace(track, speed) : { speed };
        const durationMs = paceSeconds(pace, track.frames) * 1000;

        table.roll = { track, startedAt: performance.now(), speed, pace, hidden: new Set(rolled.filter(d => d.hidden).map(d => d.id)) };
        // The room holds its breath as the camera leans in on a slow-motion last throw (the user's clip, 28 Oct).
        if (speed < 1) playSound('gasp');
        // Rokr's blur lifts the moment the next roll starts (not when it lands): the dice already
        // kept show their faces at once, and the stars over the thrown ones go.
        const unblurred = before && before.blurActive && !turn.blurActive
            ? { ...before, blurActive: false, dice: before.dice.map(d => thrownIds.has(d.id) ? { ...d, hidden: false } : turn.dice.find(n => n.id === d.id) ?? d) }
            : null;
        update(unblurred ? { rolling: true, turn: unblurred } : { rolling: true });
        setCallout(turn, data.preRollCallout, null);
        playDiceImpacts(track.impacts, pace);

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
            if (data.devil) showDevil(turn);
            update({ rolling: false, ...(data.ghosts ? { ghosts: { dice: data.ghosts, at: performance.now() } } : {}) });
            applyTurn(turn);
            done();
        }, durationMs + 120);
    }, Math.max(0, momentGoneAt - performance.now())));
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

// In a Tavern Crawl, a state that arrives while rolls or moments are still playing out waits
// behind them, so a round's glow, an ability's mark or a lost heart don't show before the moment
// that explains them.
socket.on('gameStateUpdate', (state: GameState) => {
    if (state.mode === 'tavern-crawl' && taskRunning) enqueue(done => { applyState(state); done(); });
    else applyState(state);
});

function applyState(state: GameState) {
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
}

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
    // The entrance is a moment of its own: what comes next (the round's abilities, the first
    // throw) waits until the name card has gone.
    const gone = performance.now() + INTRO_MS;
    momentFreeAt = Math.max(momentFreeAt, gone);
    momentGoneAt = Math.max(momentGoneAt, gone);
}
// An opponent's entrance: the name card's time on screen (Hud): 4.5 s since 23 Oct (the user's
// calls: 5, then 6, then 1.5 shorter).
export const INTRO_MS = 4500;

// Invite link for a classic table: opens the 3D table with the code filled in.
export function inviteLink(code: string) {
    return `${location.origin}${import.meta.env.BASE_URL}?table=${encodeURIComponent(code)}`;
}

socket.on('leaderboardUpdate', (entries: LeaderboardEntry[]) => {
    update({ leaderboard: Array.isArray(entries) ? entries : [] });
});

// Moves with their own on-table moment (see Hud's AbilityMoment and the 3D dice).
const ABILITY_MOMENTS = new Set(['Reach Around', 'Constellation Blur', 'The Ace of Spades', 'Smooth Talk', 'Mind Whip', 'You are Cursed', 'Sympathy for the Devil',
    'Disguises', 'Back of the Head', 'Inkfire Brand', 'Flourish', 'Divine Smite', 'Astral Flood',
    // the Salty Swallow as the final tier (25 Oct)
    'Written in the Stars', 'Dead Eye', 'The Cloak', 'All In']);

// The server sends a move while the dice may still be tumbling on screen, so it waits its
// turn in the queue: it shows once the roll has finished. Reach Around waits a little longer,
// so the name and sound land just as Klarg's hand lifts the die.
socket.on('signatureMove', (data: { name: string; ability: string; text: string; cancelled?: boolean; disguise?: string | null }) => {
    const steal = data.ability === 'Reach Around';
    enqueueMoment(() => {
        const sound = ABILITY_SOUNDS[data.ability];
        if (data.cancelled) { /* a Clear-Eye stopped it: silent */ }
        else if (data.disguise && data.ability !== 'Disguises') {
            playSound('marthaSwitch');
            if (sound) setTimeout(() => playSound(sound), SWITCH_LEAD_MS);
        } else if (sound) playSound(sound);
        if (ABILITY_MOMENTS.has(data.ability)) update({ ability: { ...data, at: performance.now() } });
        else showToast(`${data.name}: ${data.ability}`, data.text, 'signature', MOMENT_SHOW_MS);
    }, MOMENT_GAP_MS, () => (steal ? Math.max(0, ...table.stolenAt.values()) : 0));
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
    enqueueMoment(() => {
        playSound('drinkPotion'); // the user's clip (28 Oct; it was a synthesized cork pop)
        update({ ability: { name: "Thom's Thonics", ability: data.name, text: data.text, thonic: data.id, extra: data.id === 'healing' ? '+1 ♥' : undefined, at: performance.now() } });
    });
});

// The Lady's Grace saves a dust: her moment on the table, like a Thonic's (no cork).
socket.on('blessingUsed', (data: { id: string; name: string; text: string }) => {
    enqueueMoment(() => {
        playSound('yay');
        update({ ability: { name: 'Shrine to the Lady', ability: data.name, text: data.text, extra: '♥ saved', at: performance.now() } });
    });
});

// A keepsake works: its own moment with a fanfare (the user's call, 21 Oct; it was a toast).
socket.on('keepsakeActivated', (data: { id: string; name: string; text: string }) => {
    enqueueMoment(() => {
        if (data.id === 'bentCopper') playSound('shield'); // the user's clip for the Shield (28 Oct)
        else playChime();
        update({ ability: { name: 'Keepsake', ability: data.name, text: data.text, keepsake: data.id, at: performance.now() } });
    });
});

// After the round's last roll has played out. Not when the round ended a Tavern Crawl fight or
// the run (ends): the fight summary (or the run-over screen) comes up instead.
socket.on('roundResult', (data: { message: string; ends?: boolean }) => {
    if (data.ends) return;
    enqueueMoment(() => showToast('Round result', data.message, 'result', RESULT_SHOW_MS), RESULT_GAP_MS, () => 0, RESULT_SHOW_MS);
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
        if (!die || die.status === 'permanentlyLocked' || die.status === 'stolen' || die.mind || die.mustRoll) return; // (a knocked-loose die is rolled, not kept)
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
        playThomPurchase();
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
    // A keepsake from Thom's back shelf.
    buyKeepsake(id: string) {
        playThomPurchase();
        socket.emit('buyKeepsake', id);
    },
    chooseSpot(spot: Spot) {
        playSound('click');
        socket.emit('chooseSpot', spot);
    },
    pickpocket(action: 'roll' | 'on') {
        playSound('click');
        socket.emit('pickpocket', action);
    },
    // After a random event, on to the two spots (server lookAround).
    lookAround() {
        playSound('click');
        socket.emit('lookAround');
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
    // e.g. ability('Keepsake', 'Shield', { keepsake: 'bentCopper', text: 'Shield protects a life.' })
    // (hold: keep it up that much longer, to look at a still of it)
    ability(name: string, ability: string, more: Partial<AbilityMoment> = {}, hold = 0) { update({ ability: { name, ability, text: '', ...more, at: performance.now() + hold } }); },
    intro() { update({ introAt: performance.now() }); },
    celebrate(kind: 'perfect24' | 'perfect4', who: string | null = null) { if (kind === 'perfect24') table.celebrateAt = performance.now(); update({ celebration: { kind, at: performance.now(), who } }); },
    // (hold: keep it up that much longer, to look at a still of it)
    devil(who: string | null = null, hold = 0) { table.devilAt = performance.now(); update({ devil: { at: performance.now() + hold, who } }); }
};

resetTrayForNewTurn();

// Back in your seat after a refresh (the socket rejoins the table when it connects).
const savedSeat = readSeat();
if (savedSeat) snapshot = { ...snapshot, joined: true, roomLabel: roomLabel(savedSeat.roomCode), roomCode: savedSeat.roomCode };
