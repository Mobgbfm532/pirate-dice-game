import { io } from 'socket.io-client';
import * as THREE from 'three';
import { calloutText, dirtyTwenty, isLocked, keepsNeeded, onePerfect4Away, perfectHand, type Die, type DieStatus, type TurnOutcome, type TurnView } from './rules';
import { simulateRoll, readFrame, paceSeconds, suspensePace, type Pace, type RollTrack } from './physics';
import { screenInsets, waitingPosition } from './layout';
import { lookNext } from './look';
import { playSeaSwell, playChime, playDiceImpacts, playSound, startMusic, ABILITY_SOUNDS, SWITCH_LEAD_MS } from './sounds';

// The Salty Swallow's sea (server SEAS): shift +1 every die one higher, -1 one lower.
export interface SeaState { id: 'calm' | 'starboard' | 'port' | 'rogue' | 'squall' | 'fog' | 'becalmed'; name: string; text: string; shift: number }
// The sea die's roll as a round begins (server setSea): its face, the leg's dial, and whether the sea changed.
// Heavy seas' rogue wave (server rogueWave, 10 Nov): the die it takes over the rail, and whose.
export interface RogueWave { dieId: number; value: number; playerId: string; name: string }
export interface SeaRoll extends SeaState { from: string | null; face: number; faces: SeaState['id'][]; changed: boolean }

// Talks to the game server and holds everything the UI and the 3D table draw from.
// The server decides every roll; this file only animates and displays its decisions.

export const BOT_ID = 'BOT_MOLAR';

export interface Player {
    id: string;
    name: string;
    avatar: string;
    dice?: string; // your own dice: a beaten Tavern Crawl opponent's set (20 Nov), as the server allows it
    lives: number;
    score: number | null;
    busted: boolean;
    connected: boolean;
    scoreHidden?: boolean; // a fog bank: they've finished, but their hand stays hidden until yours is done
    waiting?: boolean; // joined a friends' game under way: sits out until the next game (18 Nov)
}

export interface Keepsake { id: string; name: string; text: string }

// One of Thom's Thonics. `drink`: tapped by the player (the others work by themselves).
// (An Elf Bar is on the shelf like a Thonic: elf, with its puffs left and whether it was puffed this fight.)
export interface LeagueRow { name: string; wins: number; games: number }
export interface RoundResultRow { id: string; name: string; score: number; busted: boolean; lost: boolean; tied: boolean }
export interface Thonic { id: string; name: string; text: string; price: number; drink: boolean; elf?: boolean; puffs?: number; puffed?: boolean }

// A round changed by an ability (server.js beginTavernRound): Mind Whip, the Curse (lowest valid
// score wins), the Devil (`by` throws three 6s; the other side can't score above devilCap),
// Vaelin's Inkfire (your dice can't land on 6) or the Ridgeler's Divine Smite (lose the round,
// lose two hearts). `by` is 'player' when Martha's mask was worn.
export interface RoundEffect { kind: 'mind' | 'curse' | 'devil' | 'ink' | 'smite' | 'stare'; by: 'opponent' | 'player'; ability: string; as: string | null; landed?: boolean; off?: number }

// A Tavern Crawl opponent (server.js TAVERN_ENCOUNTERS).
export interface Enemy { id: string; name: string; intro: string; blurb: string; powers: { name: string; text: string }[]; ability: string | null; lives: number; boss?: boolean }

export interface TavernRun {
    encounterNumber: number;
    // Who sits across the table: the current opponent or, between fights, the one just beaten
    // (enemy is already the next one then). number: their place in the run.
    seated?: Enemy & { number: number };
    totalEncounters: number;
    place: string; // The Ghoul and Gourd, the Yawning Portal, then the Salty Swallow
    roundEffect?: RoundEffect | null;
    devilCap?: number | null; // null: no cap (since 21 Oct)
    maskReady?: boolean; // Martha's mask can be worn this fight (nothing gives it since 4 Nov)
    mystery?: { flavour: string; ready: boolean } | null; // Mystery Flavour, Martha's Elf Bar: this fight's flavour
    gilded?: { uses: number; max: number; price: number } | null; // the Gilded Die (17 Nov): uses this fight, the next one's price
    enemy: Enemy;
    keepsakes: Keepsake[];
    pendingKeepsakeChoices: Keepsake[] | null;
    runComplete?: boolean;
    purse: number;
    shelf: Thonic[];
    shelfSize: number;
    shop: { stock: Thonic[]; free?: boolean; first?: boolean; keepsakes?: (Keepsake & { price: number })[] } | null; // Thom's cart is open (free: the Loyalty Card's free Thonic is still to take; keepsakes: his back shelf)
    thomMet?: boolean; // you've been to Thom's cart this run (his first greeting is different)
    met?: string[]; // the opponents (ids) you, by name, have sat down with in any run; the rest show as "?" when a run ends
    prices?: { shrine: number; hotTub: number; bard?: number; yvesil?: number; jorvash?: number; elfBars?: Record<string, number> };
    omen?: Omen | null; // Yvesil's omen this fight
    nextOmen?: Omen | null;
    notaro?: boolean; // Jorvash's Notaro Red, this fight until it lands
    seaWard?: boolean; // Jorvash's Water of the Ebon Shield: the sea die doesn't touch you this fight (17 Nov)
    nextNotaro?: boolean;
    cloud?: boolean; // Cotton Candy Cloud: the opponent can't see your score this round
    maxKeepsakes?: number; // keepsakes you can carry at once // what a candle at the Shrine, a soak in the hot tub and a song from the Bard cost
    // The Bard's song this fight: Inspiring Song ('ready' until your first throw, 'now' while it can
    // be thrown again), Cutting Words (words, until it lands); nextSong: bought for the next fight.
    bard?: { song: 'ready' | 'now' | null; words: boolean; nextSong: 'cuttingWords' | 'inspiringSong' | null };
    kram?: { now: boolean; more: number; markup?: number }; // sworn to Kram: no 1s this fight (now), and for `more` after it
    interlude: Interlude | null; // between fights (see server.js startInterlude)
    lastWin: ShopArrival | null; // the fight just won
    clearEye?: boolean; // a Clear-Eye Thonic is waiting to cancel the opponent's next ability
    abilityUsed?: Record<string, number | boolean>; // uses of each ability this fight
    encounterKeepsakeUses?: Record<string, boolean | number>; // keepsakes that have worked this fight
    abilityMax?: number; // the opponent's uses a fight, every ability of theirs
    abilitySpent?: number; // how many of them are spent
    powerMarks?: [number, number][]; // [uses, spent] for each of their powers, in order
    jaguarPhase?: 'talk' | 'cloak' | 'allIn' | null; // Jaguar's phase this round
    klargHand?: number | null; // the die Klarg snatched, shown on his nameplate until his turn
    sea?: SeaState | null; // aboard the Salty Swallow: this round's weather (9 Nov)
    nextSea?: SeaState | null; // (the old forecast: always null since the sea die, 9 Nov)
    seaFace?: number | null; // the sea die's face this round
    seaFaces?: SeaState['id'][] | null; // this leg's dial: what each face of the sea die brings
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
export type Spot = 'thom' | 'shrine' | 'diceDen' | 'hotTub' | 'bard' | 'elfKid' | 'jorvash' | 'yvesil';
export interface Omen { id: string; name: string; text: string; good: boolean }
export interface Refreshment { id: 'notaroRed' | 'ebonShield'; name: string; text: string }
export interface BardSong { id: 'cuttingWords' | 'inspiringSong'; name: string; text: string }
export interface DiceThrow { you: [number, number]; them: [number, number] }
export type Interlude =
    | { stage: 'pickpocket'; steal: number; catchOn: number; roll?: number; caught?: boolean; lost?: number }
    | { stage: 'choose'; spots: Spot[]; after?: 'pickpocket' | 'stranger' | 'darren' | 'kram' } // after: a random event came first
    | { stage: 'shrine' }
    | { stage: 'diceDen'; bets: number[]; bet: number | null; throws: DiceThrow[] }
    | { stage: 'stranger'; offers: Keepsake[]; hearts: number }
    | { stage: 'hotTub' }
    | { stage: 'elfKid'; stock: Thonic[]; puffs: number; bought: string[] } // Johnny Elf Bar: Elf Bars for the shelf
    | { stage: 'bard'; songs: BardSong[]; price: number } // the Bard (Yawning Portal): a song for the next fight
    | { stage: 'kram'; fights: number; markup?: number } // the Cult of Kram (a Yawning Portal event): swear fealty, no 1s for `fights` fights
    | { stage: 'done'; spot: 'bard'; song: BardSong | null }
    | { stage: 'yvesil'; price: number } // Yvesil (the Salty Swallow): an omen for the next fight
    | { stage: 'done'; spot: 'yvesil'; omen: Omen | null }
    | { stage: 'jorvash'; drinks: Refreshment[]; price: number } // Jorvash (the Salty Swallow): a refreshment for the next fight
    | { stage: 'done'; spot: 'jorvash'; drink: Refreshment | null }
    | { stage: 'done'; spot: 'kram'; sworn: boolean; fights: number; markup?: number }
    // Darren Snakehands: one die (up to smashOn a Thonic smashes, up to giftOn a free one, else a Thonic and gold).
    | { stage: 'darren'; smashOn: number; giftOn: number; roll?: number; outcome?: 'smash' | 'gift' | 'catch'; smashed?: Thonic; paid?: number; thonic?: Thonic; gold?: number }
    | { stage: 'done'; spot: 'hotTub'; surge: TubSurge; hearts?: number }
    | { stage: 'done'; spot: 'shrine'; gift: 'favour' | 'grace'; hearts?: number }
    | { stage: 'done'; spot: 'diceDen'; bet: number; throws?: DiceThrow[]; won?: boolean }
    | { stage: 'done'; spot: 'stranger'; keepsake: Keepsake | null; hearts?: number }
    // After a boss (Martha, Brodor): their keepsake (`drop`) and the invitation on to `place`,
    // from `from`. `save` is sealed by the server.
    // claim: the boss's keepsake is 'open' until taken or left ('took', 'refused'); full: taking it
    // means leaving one of yours behind (five at most).
    | { stage: 'invitation'; place: string; from?: string | null; boss?: string | null; drop?: Keepsake | null; claim?: 'open' | 'took' | 'refused' | null; full?: boolean; save: string };

// The end of a Tavern Crawl run, won or lost (sent with gameOver).
// Each name's best run: its points, and the gold it ended with.
export interface LeaderboardEntry { name: string; points: number; gold: number }

export interface TavernSummary {
    won: boolean;
    name: string;
    defeated: number;
    encounters: string[];
    encounterIds?: string[]; // (the same opponents' ids, for who you've met)
    fellTo: string | null;
    points: number; // the leaderboard's score (since 23 Oct)
    gold: number;    // the purse at the end
    breakdown: { fights: number; hearts: number; perfect: number; reached: number; champion?: number; gold: number; purse: number; events: number; spent: number };
    stats: { encountersDefeated: number; livesLost: number; keepsakesActivated: number; perfect24s: number };
    keepsakes: string[];
}

// An opponent's signature move, shown as its own moment rather than a pop-up.
// cancelled: a Clear-Eye stopped it (its banner shows, without its effect; the Thonic's moment follows).
export interface Aftermath { text: string; ability: string; thonic?: string; from?: { x: number; y: number }; at: number }
export const AFTERMATH_MS = 3600; // the ribbon's time on screen (with the bottle's flight before it: BOTTLE_FLIGHT_MS more)
export const BOTTLE_FLIGHT_MS = 900;
export interface AbilityMoment { who?: string; name: string; ability: string; text: string; at: number; extra?: string; keepsake?: string; thonic?: string; blessing?: string; cancelled?: boolean; hit?: boolean; vapour?: string; minus?: number }

// What the last fight paid out, shown when Thom's cart opens.
// A fight won (server.js): what it paid, shown on the summary before the next event (`at`: once).
export interface ShopArrival {
    defeated: string; nextEnemy: string; place?: number; at?: number; resumed?: boolean; drop?: Keepsake | null; // drop: a boss's keepsake
    gold: { win: number; hearts: number; heartsLeft?: number; perHeart?: number; perPlace?: number; miser?: number }; // miser: the Miser's Purse
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
    callout: { text: string; color: string; key: string; kind: string; playerId: string } | null;
    // Reactions in flight at a multiplayer table, each rising from its sender's nameplate (Hud).
    reactions: { key: number; playerId: string; emoji: string }[];
    toasts: Toast[];
    modal: Modal | null;
    leaderboard: LeaderboardEntry[];
    league: LeagueRow[] | null; // this table's league (a league table only, e.g. JUGS)
    leagueBoards: { room: string; rows: LeagueRow[] }[]; // every league, for the start screen's Hall of Legends (12 Nov)
    seatFlash: { playerId: string; text: string; kind: string; color: string; key: string } | null; // "Dirty 20!" over a nameplate
    floodWaveAt: number | null; // Brodor's Astral Flood pouring over the table
    seaMoment: (SeaRoll & { at: number }) | null; // aboard: the sea die's roll (and a change of sea's banner)
    waveMoment: (RogueWave & { at: number }) | null; // Heavy seas: a rogue wave takes a loose die
    roundResult: { rows: RoundResultRow[]; at: number } | null; // a multiplayer round's result card
    roomCode: string;
    waiting: boolean; // a classic table with nobody to play yet
    yourTurnAt: number; // when play last came round to you (for the banner)
    introAt: number; // when the current Tavern Crawl opponent was introduced
    introShowing: boolean; // their entrance card is up, until it's tapped away
    finale: { at: number; summary: TavernSummary } | null; // the homecoming after Jaguar, before the victory screen (21 Nov)
    sailAt: number; // the Salty Swallow: Skipper Bren on the docks, then it sets sail, before Klarg's entrance card (0: none)
    sailStage: 'dock' | 'sail' | 'portal'; // which of the two is up (or the Yawning Portal's arrival, 17 Nov)
    ability: AbilityMoment | null;
    // What an ability did, in plain words, once its moment has gone (18 Nov, the user's): a ribbon over the
    // opponent's nameplate. thonic/from: Jaguar's Smooth Talker, the bottle flying from your shelf (from: its slot's middle).
    aftermath: Aftermath | null;
    shopArrival: ShopArrival | null;
    // The scenes between fights are up (the summary, the event, Thom's cart): they wait for the
    // fight's last roll to finish (BETWEEN_PAUSE_MS), and while they're up nobody sits at the table.
    betweenShown: boolean;
    // The rolls that lost (Double Bubble on the hot tub's aqua die, Stason's Flourish on all of
    // his), shown as ghost dice once the dice stop.
    ghosts: { dice: Ghost[]; at: number } | null;
    putBackSlot: number | null; // a Second Thoughts Thonic is waiting for a kept die to be tapped
    gildPick: boolean; // the Gilded Die is waiting for a loose die to be tapped (17 Nov)
    // A perfect hand's celebration (since 23 Oct): a 24, or in a cursed round (lowest wins) the
    // 2, the 4 and four 1s. who: the player's name when it isn't you.
    celebration: { kind: CelebrationKind; at: number; who: string | null } | null;
    devil: { at: number; who: string | null } | null; // three 6s landed (who: when it isn't you)
    klargCaughtAt: number; // Klarg's paw got back to his side with your die (his nameplate shows it)
    // A hidden hand (a fog bank, Jaguar's Cloak) shown on his nameplate with the round's result (14 Nov, the user's).
    revealed: { score: number; busted: boolean; at: number } | null;
    filmPause: boolean; // the intro film covers the table: it isn't drawn meanwhile
}

export interface DiePose { position: THREE.Vector3; quaternion: THREE.Quaternion }

// Klarg's Reach Around (9 Nov, the user's: the banner first, then the die goes): the dice land, his
// banner comes up a moment later with the die still on the felt under it, and as the banner leaves
// his hand lifts the die and sweeps it away (STEAL_MS, Dice.tsx). The next throw waits for that.
const STEAL_PAUSE_MS = 500;
export const STEAL_MS = 1700;
export function klargStealing() {
    const now = performance.now();
    return !!snapshot.turn?.dice.some(d => d.status === 'stolen' && (table.stolenAt.get(d.id) ?? 0) + STEAL_MS > now);
}
let stealReadyAt = 0; // when his banner may come up (the dice have settled)
// Dice he has taken that wait on the felt for his banner: the banner sends his paw, however late it
// comes (10 Nov: a fallback of 4 s after the landing sent the paw in before a late banner, on slower
// phones, and the die went before the banner showed).
const stealWaiting = new Set<number>();
const STEAL_FALLBACK_MS = 15000; // (only if the banner never comes)

// Read every frame by the 3D table, so it lives outside React state.
export const table = {
    roll: null as null | { track: RollTrack; startedAt: number; speed: number; pace: Pace; hidden: Set<number> },
    rest: new Map<number, DiePose>(), // where each unlocked die is lying in the tray
    lockOrder: new Map<number, number>(), // die id -> when it was locked, so slots never reshuffle
    stolenAt: new Map<number, number>(), // die id -> time Klarg took it
    washedAt: new Map<number, number>(), // die id -> time a rogue wave takes it over the rail (Heavy seas)
    devilAt: 0,
    seaLurchAt: 0, // the ship's list changed (a new round's sea)
    seaLurch: 0, // which way: + to starboard, - to port
    celebrateAt: 0,
    diceSet: null as string | null // development: every die shows this opponent's set (preview.dice)
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
    reactions: [],
    toasts: [],
    modal: null,
    leaderboard: [],
    league: null,
    leagueBoards: [],
    seatFlash: null,
    floodWaveAt: null,
    seaMoment: null,
    waveMoment: null,
    roundResult: null,
    roomCode: '',
    waiting: false,
    yourTurnAt: 0,
    introAt: 0,
    introShowing: false,
    finale: null,
    sailAt: 0,
    sailStage: 'dock',
    ability: null,
    aftermath: null,
    shopArrival: null,
    betweenShown: false,
    ghosts: null,
    putBackSlot: null,
    gildPick: false,
    celebration: null,
    devil: null,
    klargCaughtAt: 0,
    revealed: null,
    filmPause: false
};

const listeners = new Set<() => void>();

function update(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(l => l());
}

// An ability's painting covers the whole screen (12 Nov, the user: some moments stuttered as they came
// in): the table isn't drawn under it. Its own little signal, so only the canvas hears it, not the HUD.
let tableCovered = false;
const coverListeners = new Set<() => void>();
export const tableCover = {
    get: () => tableCovered,
    set(on: boolean) { if (on === tableCovered) return; tableCovered = on; coverListeners.forEach(l => l()); },
    subscribe(l: () => void) { coverListeners.add(l); return () => { coverListeners.delete(l); }; }
};

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

// While an opponent's entrance card is up, everything behind it waits (queueHeld).
let queueHeld = false;

function enqueue(task: (done: () => void) => void) {
    tasks.push(task);
    if (!taskRunning && !queueHeld) runNext();
}

function runNext() {
    const task = queueHeld ? undefined : tasks.shift();
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
const TABLE_RESULT_SHOW_MS = 4000; // a multiplayer round's result card (the server's too)
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
    }, Math.max(0, momentFreeAt - performance.now(), earliest() - performance.now(), paceUntil - performance.now())));
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
// A multiplayer table (no bot, not a Tavern Crawl): its only words in play are the two callouts
// over the roller's nameplate (the user's call, 3 Nov; Hud's SeatCallout), and a perfect hand's
// celebration.
export const multiplayerTable = () => !!snapshot.state && snapshot.state.mode !== 'tavern-crawl' && !snapshot.state.players[BOT_ID];
export const MULTIPLAYER_CALLOUTS: Record<string, string> = { earlyRoss: 'The Early Ross!', didntBite: "Didn't Bite!" };

function setCallout(turn: TurnView | null, callout: string | null, outcome: TurnOutcome | null) {
    if (!turn || quietTable()) { if (snapshot.callout) update({ callout: null }); return; }
    const mine = turn.playerId === snapshot.myId;
    const shown = calloutText(callout, mine, turn.playerId === BOT_ID, outcome);
    const key = `${turn.key}|${callout}`;
    if (snapshot.callout && snapshot.callout.key === key) return;
    update({ callout: shown && callout ? { ...shown, key, kind: callout, playerId: turn.playerId } : null });
}

function resetTrayForNewTurn() {
    table.rest.clear();
    table.stolenAt.clear();
    stealWaiting.clear();
    table.washedAt.clear();
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
    // A free roll (Second Thoughts, Lemon Levitation) isn't in the view: the server allowed a roll with
    // fewer dice kept than a throw needs, so that stands while the taps are on their way.
    const freeRoll = turn.canRoll && turn.hasRolled && turn.locksThisRoll < keepsNeeded(turn);
    const canRoll = dice.some(d => d.status === 'active') && !(turn.maxThrows && turn.rollCount >= turn.maxThrows) && (!turn.hasRolled || freeRoll || locksThisRoll >= keepsNeeded({ ...turn, dice, locksThisRoll }));
    return { ...turn, dice, locksThisRoll, canRoll };
}

function applyTurn(serverView: TurnView | null) {
    if (!serverView || !serverTurn || serverTurn.key !== serverView.key) pendingTaps.clear();
    serverTurn = serverView;
    const turn = withPendingTaps(serverView);
    const isNewTurn = !turn || !snapshot.turn || snapshot.turn.key !== turn.key;
    if (isNewTurn) resetTrayForNewTurn();
    if (isNewTurn && snapshot.putBackSlot !== null) update({ putBackSlot: null });
    if (isNewTurn && snapshot.gildPick) update({ gildPick: false });
    if (turn) recordLockOrder(turn);
    if (pendingTaps.size) setTimeout(() => { if (serverTurn === serverView) applyTurn(serverView); }, PENDING_MS + 50);
    const isMyTurn = computeIsMyTurn(snapshot.state, turn);
    update({
        turn,
        isMyTurn,
        // (A hand reopened under an End Turn already pressed, as Sylvester's Back of the Head does, is
        // no longer ending: the button comes back to roll the knocked-loose die. The user's freeze, 17 Nov.)
        endingTurn: isNewTurn || !turn || !(turn.finalized || handComplete(turn)) ? false : snapshot.endingTurn
    });
    if (isNewTurn && isMyTurn) announceYourTurn();
    if (turn) setCallout(turn, turn.callout, turn.outcome);
}

// How long a perfect hand's celebration holds the screen (Hud's Celebration); what comes next waits.
export const CELEBRATION_MS = 2800;
// 'logo' (20 Nov, the user's): the 2 FOUR 2 TWENTY-FOUR logo, for a perfect 24 at a friends' table and, in a Tavern
// Crawl, for a round's first throw landing 2, 4, 6, 6, 6, 6 (shown as it lands; the finished 24 then isn't celebrated again).
export type CelebrationKind = 'perfect24' | 'perfect4' | 'logo';
let naturalKey: string | null = null; // the turn whose first throw was celebrated with the logo
function naturalFirstThrow(turn: TurnView) {
    if (snapshot.state?.mode !== 'tavern-crawl' || turn.rollCount !== 1 || snapshot.state.tavernRun?.roundEffect?.kind === 'curse') return false;
    const values = turn.dice.filter(d => d.status === 'active' && !d.hidden).map(d => d.value).sort((a, b) => a - b);
    return values.join(',') === '2,4,6,6,6,6';
}
function celebrate(kind: CelebrationKind, turn: TurnView | null) {
    playSound('yay');
    if (kind !== 'perfect4') table.celebrateAt = performance.now();
    const who = turn && turn.playerId !== snapshot.myId ? snapshot.state?.players[turn.playerId]?.name ?? null : null;
    update({ celebration: { kind, at: performance.now(), who } });
    // A moment of its own: the round's result and the next throw wait for it.
    const gone = performance.now() + CELEBRATION_MS;
    momentFreeAt = Math.max(momentFreeAt, gone);
    momentGoneAt = Math.max(momentGoneAt, gone);
}
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

const WHOA_ON = false; // the user's Whoa is off until they rework it (4 Nov); true brings it back
const SEAT_FLASH_MS = 2600; // a little longer than the burst's own animation
function showSeatFlash(playerId: string, text: string, kind: string, color: string) {
    const key = `${kind}|${performance.now()}`;
    update({ seatFlash: { playerId, text, kind, color, key } });
    setTimeout(() => { if (snapshot.seatFlash?.key === key) update({ seatFlash: null }); }, SEAT_FLASH_MS);
}
let slowThrow = false; // the throw on the table was a slow-motion last one
// Whether a heart this player has just won back came from their perfect hand (once per hand).
let healingHand: { playerId: string; at: number } | null = null;
export function heartFromHand(playerId: string) {
    const hand = healingHand;
    if (!hand || hand.playerId !== playerId || performance.now() - hand.at > 10000) return false;
    healingHand = null;
    return true;
}

function playOutcomeSounds(event: { type: string; outcome?: TurnOutcome } | null, turn: TurnView | null) {
    if (!event) return;
    const mine = snapshot.isMyTurn;
    // (In the new look a kept die clacks as it reaches its slot, Dice.tsx, so no click here.)
    if (event.type === 'toggle' && !mine && !lookNext) playSound('click');
    if (event.type !== 'finalized' || !event.outcome) return;
    const { busted, score, suspense } = event.outcome;
    // A multiplayer hand finishing on 20 (the user's, 4 Nov). Its own timer: pressing End Turn fixes the
    // hand and changes the turn at once, which would clear an ordinary callout before it was seen.
    if (turn && multiplayerTable() && dirtyTwenty(event.outcome)) showSeatFlash(turn.playerId, 'Dirty 20!', 'dirty20', '#c5d04a');
    // In a cursed round (Danhausen's, or his face on Martha or your mask) the lowest valid hand
    // wins: four 1s with the 2 and 4 is its perfect hand, and a 24 its worst.
    const cursed = snapshot.state?.tavernRun?.roundEffect?.kind === 'curse';
    const perfect = perfectHand(event.outcome, cursed);
    // A hand that can win a heart back (a 24; a 23 with Brodor's Sunglasses): the heart's sound, when it comes.
    // (And a cursed round's Perfect ...4?, since 20 Nov: it heals too, with the same sounds.)
    if (turn && !busted && (score >= 23 || perfect === 'perfect4')) healingHand = { playerId: turn.playerId, at: performance.now() };
    // The user's Whoa (4 Nov), on top of the rest: a Perfect ...4?, and any slow-motion last throw as it lands.
    if (WHOA_ON && (slowThrow || perfect === 'perfect4')) playSound('whoa');
    slowThrow = false;
    if (perfect && turn && turn.key === naturalKey) { /* its first throw had the logo already (20 Nov) */ }
    else if (perfect) celebrate(perfect === 'perfect24' && multiplayerTable() ? 'logo' : perfect, turn);
    else if (busted) playSound(suspense === 'survival' ? 'aww' : 'bust');
    else if (cursed && score === 24) playSound('ohwell');
    else if (suspense === 'perfect') playSound('ohwell');
    else if (suspense === 'survival') playSound('yay');
}

socket.on('turnState', (data: { turn: TurnView | null; event: { type: string; outcome?: TurnOutcome } | null }) => {
    enqueue(done => setTimeout(() => {
        // Sylvester knocked a kept die loose: the server's hand wins over taps still showing.
        if (data.event?.type === 'punched') pendingTaps.clear();
        const theirs = !!data.turn && data.turn.playerId !== snapshot.myId;
        applyTurn(data.turn);
        playOutcomeSounds(data.event, data.turn);
        // An opponent's keeps one at a time, the last one seen before the turn moves on.
        if (theirs && data.event?.type === 'toggle') opponentPace(KEEP_GAP_MS);
        if (theirs && data.event?.type === 'finalized') opponentPace(HAND_DONE_MS);
        done();
    }, Math.max(0, paceUntil - performance.now())));
});

// Pacing an opponent's hand (20 Nov, the user's: "the final dice of an opponent will not be locked before their turn
// ends ... it sometimes skips that part or is a lot quicker"): the server's keeps could arrive while their throw was
// still tumbling, and then all showed at once as it landed, with the end of the turn right behind. Now a throw that
// lands is looked at before the first keep, keeps come one at a time, and a finished hand stays a moment before
// anything after it (the next turn, the round's result, the next throw).
// (21 Nov, the user's: near instant once the dice settle; it was 0.7 s, 0.45 s and 1.1 s)
const LANDED_GAP_MS = 150, KEEP_GAP_MS = 220, HAND_DONE_MS = 800;
const LAST_DIE_MS = 400; // a last die kept as it lands: long enough to see it on the felt before it goes to its slot
let paceUntil = 0;
function opponentPace(ms: number) { paceUntil = Math.max(paceUntil, performance.now() + ms); }

socket.on('diceRolled', (data: { sea?: number; turn: TurnView; preRollCallout: string | null; suspense: string; devil: boolean; throwSeed?: number; rerolled?: number[]; ghosts?: Ghost[] }) => {
    enqueue(done => setTimeout(() => {
        const turn = data.turn;
        if (!snapshot.turn || snapshot.turn.key !== turn.key) { resetTrayForNewTurn(); if (snapshot.revealed) update({ revealed: null }); }

        // The dice this roll threw: the ones that were active just before it. (A die Klarg
        // stole earlier in the turn stays out of play; one he takes now was thrown first.)
        const before = snapshot.turn && snapshot.turn.key === turn.key ? snapshot.turn : null;
        // (A Fizzy Thomic throws only the dice it names.)
        // (15 Nov: with no turn known from before this throw, a hand's first throw, the die Klarg takes from
        // it was left out: it stayed in its waiting place while the others landed on and through it.)
        const pool = before ? before.dice.filter(d => d.status === 'active')
            : turn.dice.filter(d => d.status === 'active' || (d.status === 'stolen' && turn.rollCount === 1));
        const thrownIds = data.rerolled ? new Set(data.rerolled) : new Set(pool
            .filter(d => !turn.dice.some(n => n.id === d.id && n.washed)).map(d => d.id));
        const rolled = turn.dice.filter(d => thrownIds.has(d.id));
        // (Aboard a listing ship the dice drift to the low side: data.sea.)
        const track = simulateRoll(rolled.map(d => d.id), rolled.map(d => (d.hidden ? 0 : d.value)), data.throwSeed, data.sea ?? 0);
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
        slowThrow = speed < 1; // (its landing gets the user's Whoa: playOutcomeSounds)
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
                // Klarg's banner comes first; the die waits on the felt for it (signatureMove sets
                // the moment his hand comes; this is only in case the banner never does).
                if (d.status === 'stolen') {
                    stealReadyAt = performance.now() + STEAL_PAUSE_MS;
                    table.stolenAt.set(d.id, performance.now() + STEAL_FALLBACK_MS);
                    stealWaiting.add(d.id);
                }
            });
            table.roll = null;
            // A crawl round's first throw landing a perfect 24 (20 Nov, the user's): the logo, in place of the three 6s.
            if (naturalFirstThrow(turn)) { naturalKey = turn.key; celebrate('logo', turn); }
            else if (data.devil) showDevil(turn);
            update({ rolling: false, ...(data.ghosts ? { ghosts: { dice: data.ghosts, at: performance.now() } } : {}) });
            // A last die thrown (or a becalmed hand's last throw) is kept as it lands, by the rules. It lies where it landed
            // a moment first, then goes to its slot (20 Nov, the user's: an opponent's last die was never seen kept).
            // (Only an opponent's: a die of yours tapped in that moment would be let go by the server.)
            const autoKept = new Set(turn.playerId === snapshot.myId ? [] : turn.dice.filter(d => thrownIds.has(d.id) && d.status === 'lockedThisTurn' && !d.hidden).map(d => d.id));
            if (autoKept.size) {
                applyTurn({ ...turn, finalized: false, outcome: null, canRoll: false, dice: turn.dice.map(d => autoKept.has(d.id) ? { ...d, status: 'active' as const } : d) });
                setTimeout(() => {
                    applyTurn(turn);
                    if (turn.playerId !== snapshot.myId) opponentPace(HAND_DONE_MS);
                    done();
                }, LAST_DIE_MS);
                return;
            }
            applyTurn(turn);
            if (turn.playerId !== snapshot.myId) opponentPace(LANDED_GAP_MS);
            done();
        }, durationMs + 120);
    }, Math.max(0, momentGoneAt - performance.now(), paceUntil - performance.now())));
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

// The trailer (?trailer in the address, 9 Nov): plays on its own, without sitting down at a table.
export const trailerWanted = typeof location !== 'undefined' && new URLSearchParams(location.search).has('trailer');

function readSeat(): Seat | null {
    if (trailerWanted) return null;
    try { return JSON.parse(sessionStorage.getItem('tavernSeat') ?? 'null'); } catch { return null; }
}

function writeSeat(seat: Seat | null) {
    try {
        if (seat) sessionStorage.setItem('tavernSeat', JSON.stringify(seat));
        else sessionStorage.removeItem('tavernSeat');
    } catch { /* storage unavailable */ }
}

function takeSeat(seat: Seat) {
    socket.emit('joinTavern', { name: seat.name, avatar: seat.avatar, roomCode: seat.roomCode, token: getSessionToken(), startingLives: seat.lives, resume: seat.resume, dice: readDiceChoice() ?? undefined });
}

function roomLabel(code: string) {
    return code.startsWith('TVRN-') ? 'House Table' : `Table ${code}`;
}

// A Tavern Crawl's own table code (17 Nov: five letters and digits, about 60 million of them; it was four
// digits, and a second person could land in someone's run).
function newCrawlCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'TVRN-' + Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}
// That table is someone else's crawl: sit down at a fresh one instead.
socket.on('crawlTaken', () => {
    const seat = readSeat();
    if (!seat || !seat.roomCode.startsWith('TVRN')) return;
    const fresh = { ...seat, roomCode: newCrawlCode() };
    writeSeat(fresh);
    takeSeat(fresh);
    update({ roomLabel: roomLabel(fresh.roomCode), roomCode: fresh.roomCode });
});

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
    if (state.mode === 'tavern-crawl' && (taskRunning || queueHeld)) enqueue(done => { applyState(state); done(); });
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
    // The entrance is a moment of its own, and stays until it's tapped away (5 Nov, the user's): what
    // comes next (the round's abilities, the first throw) waits behind it. The last fight's dice go.
    resetTrayForNewTurn();
    // The Salty Swallow sets sail (9 Nov, the user's): its scene first, as the ship's first opponent sits down;
    // his entrance card is underneath it. (Not for test scripts, whose cards go by themselves.)
    const sailing = run.place === 'The Salty Swallow' && (run.seated ?? run.enemy).id === 'klarg' && !scriptedIntro;
    // Arriving at the Yawning Portal (17 Nov, the user's pick of docs/portal-transition-brainstorm.md): the tournament
    // board, then the Portal's doors opening on its well, as its first opponent sits down.
    const arriving = run.place === 'The Yawning Portal' && (run.seated ?? run.enemy).id === 'sylvester' && !scriptedIntro;
    update({ introAt: performance.now(), introShowing: true, turn: null, isMyTurn: false, ...(sailing ? { sailAt: performance.now(), sailStage: 'dock' as const } : arriving ? { sailAt: performance.now(), sailStage: 'portal' as const } : {}) });
    if (scriptedIntro) {
        const gone = performance.now() + INTRO_MS;
        momentFreeAt = Math.max(momentFreeAt, gone);
        momentGoneAt = Math.max(momentGoneAt, gone);
        setTimeout(() => update({ introShowing: false }), INTRO_MS);
    } else queueHeld = true;
}
// Development: test scripts (localStorage.tavernIntroAuto) have the card go by itself after this long.
const INTRO_MS = 4500;
const scriptedIntro = (() => { try { return import.meta.env.DEV && localStorage.getItem('tavernIntroAuto') === '1'; } catch { return false; } })();
const INTRO_LEAVE_MS = 300; // (the server's too)

// Invite link for a classic table: opens the 3D table with the code filled in.
export function inviteLink(code: string) {
    return `${location.origin}${import.meta.env.BASE_URL}?table=${encodeURIComponent(code)}`;
}

socket.on('leagueUpdate', (rows: LeagueRow[]) => {
    update({ league: Array.isArray(rows) ? rows : [] });
});
socket.on('leagueBoards', (boards: { room: string; rows: LeagueRow[] }[]) => {
    update({ leagueBoards: Array.isArray(boards) ? boards.filter(b => b && typeof b.room === 'string' && Array.isArray(b.rows)) : [] });
});

socket.on('leaderboardUpdate', (entries: LeaderboardEntry[]) => {
    update({ leaderboard: Array.isArray(entries) ? entries : [] });
});

// Moves with their own on-table moment (see Hud's AbilityMoment and the 3D dice).
const ABILITY_MOMENTS = new Set(['Reach Around', 'Starry Form', 'Penitent Stare', 'The Ace of Spades', 'Smooth Talker', 'Mind Whip', 'You are Cursed!', 'Sympathy for the Devil',
    'Disguise Self', 'Back of the Head', 'Inkfire Blast', 'Vexing Rapier', 'Divine Smite', 'Astral Flood',
    // the Salty Swallow as the final tier (25 Oct)
    'Written in the Stars', 'Dead Eye', 'The Cloak', 'All In',
    // Áéd's metamagic (11 Nov)
    'Heightened Dice', 'Quickened Dice', 'Empowered Dice', 'Twinned Dice']);

const AED_TRICKS = new Set(['Heightened Dice', 'Quickened Dice', 'Empowered Dice', 'Twinned Dice']);

// The Yawning Portal's hard hitters: the whole screen shakes with their moment.
const SHAKING_ABILITIES = new Set(['Back of the Head', 'Inkfire Blast', 'Divine Smite']);

// The server sends a move while the dice may still be tumbling on screen, so it waits its
// turn in the queue: it shows once the roll has finished. Reach Around waits for the dice to
// settle, and the die it takes goes once its banner has.
socket.on('signatureMove', (data: { name: string; ability: string; text: string; cancelled?: boolean; disguise?: string | null; hit?: boolean; thonic?: string; after?: string }) => {
    const steal = data.ability === 'Reach Around';
    const flood = data.ability === 'Astral Flood' && !data.cancelled;
    enqueueMoment(() => {
        // (Jaguar's Smooth Talker has two clips: drinking your Thonic, or talking points off your hand.)
        const sound = data.ability === 'Smooth Talker' && data.thonic ? 'smoothTalkThonic' : ABILITY_SOUNDS[data.ability];
        if (data.cancelled) { /* a Clear-Eye stopped it: silent */ }
        else if (data.disguise && data.ability !== 'Disguise Self') {
            playSound('marthaSwitch');
            if (sound) setTimeout(() => playSound(sound), SWITCH_LEAD_MS);
        } else if (sound) playSound(sound);
        // The screen shakes as these land (5 Nov, the user's), and as the Ridgeler's hammer comes down.
        if (!data.cancelled && (data.hit || SHAKING_ABILITIES.has(data.ability))) shakeScreen(250, !!data.hit);
        if (ABILITY_MOMENTS.has(data.ability)) update({ ability: { ...data, at: performance.now() } });
        // (Never for Áéd's tricks: his own banners say it, 20 Nov, the user's.)
        if (data.after && !data.cancelled && !AED_TRICKS.has(data.ability)) showAftermath(data, flood ? MOMENT_SHOW_MS + FLOOD_WAVE_MS : MOMENT_SHOW_MS);
        // (20 Nov, the user's: a move with its own moment says it there; the old pop-up of its text flashed up behind it as
        // it left, like the aftermath ribbon, for Frak and the rest. Only a move with no moment of its own gets the pop-up.)
        else if (!ABILITY_MOMENTS.has(data.ability)) showToast(`${data.name}: ${data.ability}`, data.text, 'signature', MOMENT_SHOW_MS);
        // His hand comes for the die as the banner leaves (its last 0.15 s are it rising away).
        if (steal && !data.cancelled) {
            const hand = performance.now() + MOMENT_SHOW_MS - 150;
            snapshot.turn?.dice.forEach(d => { if (d.status === 'stolen' && (stealWaiting.has(d.id) || (table.stolenAt.get(d.id) ?? 0) > performance.now())) table.stolenAt.set(d.id, hand); });
            stealWaiting.clear();
            // (The nameplate shows it in his hand once his paw has got it there.)
            setTimeout(() => update({ klargCaughtAt: performance.now() }), hand - performance.now() + STEAL_MS + 60);
        }
    }, steal ? MOMENT_GAP_MS + STEAL_MS : MOMENT_GAP_MS, () => (steal ? stealReadyAt : 0), steal && !data.cancelled ? MOMENT_SHOW_MS + STEAL_MS : MOMENT_SHOW_MS);
    // Once its banner has gone, the flood pours over the table; the state behind it (the heart he
    // takes) waits in the queue until then, so it breaks as the wave hits.
    if (flood) enqueueMoment(showFloodWave, FLOOD_WAVE_MS, () => momentGoneAt, FLOOD_WAVE_MS);
});

const FLOOD_WAVE_MS = 2200; // (the server's too)

// The aftermath ribbon (18 Nov, the user's: "a banner that tells the player what happens"), `delay` ms from now, as the
// moment leaves. For Jaguar's Smooth Talker the Thonic's slot is measured now, while your shelf still shows it (the
// state that takes it away waits behind the moment), so its bottle can fly from there to him.
function showAftermath(data: { ability: string; after?: string; thonic?: string }, delay: number) {
    let from: { x: number; y: number } | undefined;
    if (data.thonic) {
        const shelf = snapshot.state?.tavernRun?.shelf ?? [];
        const slot = document.querySelectorAll('.shelf .shelf-slot')[shelf.findIndex(t => t?.id === data.thonic)] as HTMLElement | undefined;
        const r = slot?.getBoundingClientRect();
        if (r && r.width > 0) from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    setTimeout(() => {
        const at = performance.now();
        update({ aftermath: { text: data.after!, ability: data.ability, thonic: data.thonic, from, at } });
        setTimeout(() => { if (snapshot.aftermath?.at === at) update({ aftermath: null }); }, AFTERMATH_MS + (data.thonic ? BOTTLE_FLIGHT_MS : 0));
    }, delay);
}
export function dismissAftermath() { update({ aftermath: null }); }
// Aboard the Salty Swallow, each round from the second begins with the sea die (9 Nov, the user's):
// its moment, in turn with the rest (the server's clock too): the die tumbles in and lands, the dial's
// needle swings onto its face, and when the sea changes a wave breaks across, the whole screen heaves
// and leans the way she lists (`heave`), the table lurches, the name slams in, with the swell's sound.
export const SEA_SHOW_MS = 4000; // the sea changes (the server's too)
export const SEA_HOLD_MS = 2800; // the sea holds (the server's too)
export const SEA_LAND_MS = 1150; // the die lands; the needle settles and the news comes just after
const SEA_SHIFTS: Record<string, number> = { calm: 0, starboard: 1, port: -1, rogue: 0, squall: 0, fog: 0, becalmed: 0 };
// The dial's needle (Hud's SeaDial, CSS `dial-needle`: 2.1 s, each step eased by cubic-bezier(0.3, 0.1,
// 0.3, 1)) ticks as it sweeps past each sector line, and clunks as it first reaches its face (55%, as the
// die lands and the sector lights). The user's clips, 13 Nov.
const NEEDLE_MS = 2100;
const NEEDLE_KEYS = (to: number): [number, number][] => [[0, -70], [0.14, 55], [0.28, -30], [0.42, 35], [0.55, to + 16], [0.68, to - 7], [0.8, to + 3], [1, to]];
const CLUNK_AT = 0.55, CLUNK_HIT_MS = 150; // (the clunk's hit comes ~0.15 s after its sound starts)
function bezier(x: number, x1 = 0.3, y1 = 0.1, x2 = 0.3, y2 = 1) {
    const at = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (at(mid, x1, x2) < x) lo = mid; else hi = mid; }
    return at((lo + hi) / 2, y1, y2);
}
export function needleTicks(face: number): number[] {
    const keys = NEEDLE_KEYS(-75 + (face - 1) * 30);
    const angle = (p: number) => {
        let i = 0;
        while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
        const [p0, a0] = keys[i], [p1, a1] = keys[i + 1];
        return a0 + (a1 - a0) * bezier((p - p0) / (p1 - p0));
    };
    const ticks: number[] = [];
    let sector = Math.floor((angle(0) + 90) / 30), last = -Infinity;
    for (let ms = 10; ms <= NEEDLE_MS; ms += 10) {
        const now = Math.floor((angle(ms / NEEDLE_MS) + 90) / 30);
        if (now !== sector && ms - last >= 45 && Math.abs(ms - CLUNK_AT * NEEDLE_MS) > 90) { ticks.push(ms); last = ms; }
        sector = now;
    }
    return ticks;
}
function playDial(face: number) {
    needleTicks(face).forEach((ms, i) => setTimeout(() => playSound('dialNeedle', 0.94 + ((i * 37) % 13) / 100), ms));
    setTimeout(() => playSound('dialClunk'), CLUNK_AT * NEEDLE_MS - CLUNK_HIT_MS);
}
function showSea(data: SeaRoll, hold = 0) {
    const at = performance.now();
    update({ seaMoment: { ...data, at: at + hold } });
    playDial(data.face);
    const news = SEA_LAND_MS + 300;
    // A fog bank's foghorn as the news comes, whether it rolls in or holds (the user's clip, 10 Nov), in place of the swell.
    const fog = data.id === 'fog';
    if (fog) setTimeout(() => playSound('fogHorn'), news);
    // (13 Nov, the user's: a held sea brings its wave too, the swell and the heave with it.)
    setTimeout(() => {
        if (!fog) playSeaSwell(data.shift === 0 ? 'calm' : 'heel');
        heave(data.shift);
        table.seaLurchAt = performance.now();
        table.seaLurch = (data.changed ? data.shift - (SEA_SHIFTS[data.from ?? 'calm'] ?? 0) : 0) || data.shift || 1;
    }, news);
}
socket.on('seaChange', (data: SeaRoll) => {
    const ms = data.changed ? SEA_SHOW_MS : SEA_HOLD_MS;
    enqueueMoment(() => showSea(data), ms, () => 0, ms);
});
// Heavy seas (10 Nov, the user's): as a hand's second throw is made, a rogue wave breaks over the deck
// and one loose die goes over the rail, then the rest are thrown (the server's clock waits for it too).
// The die rides the wave off the table (Dice.tsx, table.washedAt) as the crest passes.
export const WAVE_SHOW_MS = 2400; // (the server's too)
export const WAVE_TAKE_MS = 650; // the crest reaches the table and the die goes
export const WASH_MS = 1100; // the die's ride over the rail
function showWave(data: RogueWave, hold = 0) {
    const at = performance.now();
    update({ waveMoment: { ...data, at: at + hold } });
    playSound('rogueWave'); // (the user's clip, 10 Nov)
    table.washedAt.set(data.dieId, at + WAVE_TAKE_MS);
    setTimeout(() => { heave(1); table.seaLurchAt = performance.now(); table.seaLurch = 1; }, WAVE_TAKE_MS - 150);
}
socket.on('rogueWave', (data: RogueWave) => {
    enqueueMoment(() => showWave(data), WAVE_SHOW_MS, () => 0, WAVE_SHOW_MS);
});
// The deck heaves (9 Nov, the user's: in place of the jitter): the whole page leans a few degrees
// toward the low side (dir 1 starboard, -1 port), rocks back past level and settles; calm seas, a bob.
function heave(dir: number) {
    const el = document.body;
    el.classList.remove('sea-heave');
    void el.offsetWidth; // (restart the animation)
    el.style.setProperty('--heave', String(dir));
    el.classList.add(dir ? 'sea-heave' : 'sea-heave', ...(dir ? [] : ['calm']));
    setTimeout(() => el.classList.remove('sea-heave', 'calm'), 1600);
}

function showFloodWave() {
    const at = performance.now();
    playSound('astralFloodWave'); // (the old Astral Flood clip, with the wave since 17 Nov: the banner has the user's new one)
    update({ floodWaveAt: at });
    setTimeout(() => { if (snapshot.floodWaveAt === at) update({ floodWaveAt: null }); }, FLOOD_WAVE_MS);
}

// The whole page shakes (CSS `.screen-shake`, off for reduced motion), `delay` ms from now.
// quake: the Ridgeler's Divine Smite landing (17 Nov, the user's: earth-shattering): longer and much harder.
function shakeScreen(delay: number, quake = false) {
    const kind = quake ? 'screen-quake' : 'screen-shake';
    setTimeout(() => {
        document.body.classList.remove('screen-shake', 'screen-quake');
        void document.body.offsetWidth; // (restart the animation)
        document.body.classList.add(kind);
        setTimeout(() => document.body.classList.remove(kind), quake ? 1900 : 1100);
    }, delay);
}

// A Tavern Crawl saves itself (16 Nov, the user's "so a crawl is never lost"): the server sends the run's
// save whenever it changes. It's kept on this device (the start screen's Continue) and in this tab's seat,
// so coming back to a table that's gone (the server restarted or slept, or an hour away) brings the run
// with it: in a fight, from that fight's start. null: the run is over, nothing to keep.
socket.on('autoSave', (data: { save: string; name: string; next: string; place: string; purse: number } | null) => {
    const seat = readSeat();
    if (!data) {
        writeSavedRun(null);
        if (seat?.resume) writeSeat({ ...seat, resume: undefined });
        return;
    }
    writeSavedRun({ save: data.save, name: data.name, next: data.next, place: data.place, purse: data.purse, at: Date.now() });
    if (seat && seat.roomCode.startsWith('TVRN')) writeSeat({ ...seat, resume: data.save });
});

// The run was opened from a save. When you tapped Continue that's no news; when this tab came back to a
// table that was gone, say what happened.
let continuing = false;
// The save Continue was pressed with: put back if the server says that run is still being played elsewhere (20 Nov).
let resumingFrom: SavedRun | null = null;
socket.on('crawlLive', () => {
    if (resumingFrom) writeSavedRun(resumingFrom);
    try { sessionStorage.setItem('tavernNotice', 'That crawl is still open in another tab or window. Carry on there, or close it and Continue here.'); } catch { /* no notice */ }
    actions.leave();
});
// (A notice left for after the page reloads.)
try {
    const notice = sessionStorage.getItem('tavernNotice');
    if (notice) { sessionStorage.removeItem('tavernNotice'); setTimeout(() => showToast('Already playing', notice, 'info', 7000), 600); }
} catch { /* none */ }
socket.on('crawlResumed', (data: { fight: boolean; next: string; round?: number | null }) => {
    // (Since 20 Nov a fight picks up at the round it had reached, not its start.)
    const fight = data.round ? `The fight against ${data.next} picks up at round ${data.round}.` : `The fight against ${data.next} starts again.`;
    if (!continuing) showToast('Your crawl was brought back', data.fight ? `The table was lost while you were away. ${fight}` : 'The table was lost while you were away. You are back where you left off.', 'info', 6000);
    continuing = false;
});

// A saved run the server wouldn't open (changed, or opened already): this is a fresh crawl.
socket.on('resumeFailed', () => {
    continuing = false;
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
        playSound('ladyChoice'); // the sound of choosing her blessing (the user's call, 4 Nov; it was the yay)
        update({ ability: { name: 'Shrine to the Lady', ability: data.name, text: data.text, extra: '♥ saved', blessing: 'ladysGrace', at: performance.now() } });
    });
});

// A keepsake works: its own moment with a fanfare (the user's call, 21 Oct; it was a toast).
// (Also the Bard's songs as they work, with who: 'The Bard'.)
socket.on('keepsakeActivated', (data: { id: string; name: string; text: string; who?: string; flavour?: string; minus?: number; extra?: string; after?: string }) => {
    enqueueMoment(() => {
        if (data.id === 'bentCopper') playSound('shield'); // the user's clip for the Shield (28 Oct)
        else if (data.who === 'The Bard') playSound('bardTune'); // either song as it works (the user's tune, 3 Nov)
        else if (data.who?.endsWith('Elf Bar')) playSound('vape'); // a puff (the user's clip, 4 Nov), Martha's Mystery Flavour too
        else playChime();
        // The Bard's songs play like a Thonic drunk (the user's call, 3 Nov): their icon, big, in a glow.
        if (data.who === 'The Bard') {
            update({ ability: { name: 'The Bard', ability: data.name, text: data.text, blessing: data.id, minus: data.minus, extra: data.extra, at: performance.now() } });
            if (data.after) showAftermath({ ability: data.name, after: data.after }, MOMENT_SHOW_MS); // (Cutting Words, 20 Nov)
        }
        // A puff (17 Nov, the user's): a cloud of vapour in the flavour's colour (Martha's: this fight's flavour).
        else update({ ability: { name: data.who ?? 'Keepsake', ability: data.name, text: data.text, keepsake: data.id, vapour: data.who?.endsWith('Elf Bar') ? (data.flavour ?? data.id) : undefined, at: performance.now() } });
    });
});

// After the round's last roll has played out. Not when the round ended a Tavern Crawl fight or
// the run (ends): the fight summary (or the run-over screen) comes up instead.
socket.on('roundResult', (data: { message: string; ends?: boolean; results?: RoundResultRow[]; reveal?: { score: number; busted: boolean } }) => {
    // (The fight's last round shows its summary instead; a hand that was hidden still says what it was, 20 Nov.)
    if (data.ends) { if (data.reveal) showToast('Round result', data.message, 'result', RESULT_SHOW_MS); return; }
    // A multiplayer table: a card with everyone's score (the user's call, 4 Nov).
    if (data.results) {
        const results = data.results;
        enqueueMoment(() => {
            const at = performance.now();
            update({ roundResult: { rows: results, at } });
            setTimeout(() => { if (snapshot.roundResult?.at === at) update({ roundResult: null }); }, TABLE_RESULT_SHOW_MS);
        }, RESULT_GAP_MS, () => 0, TABLE_RESULT_SHOW_MS);
        return;
    }
    // (At a multiplayer table the cards' hearts tell it: no words, but the same pause.)
    enqueueMoment(() => {
        if (!multiplayerTable()) showToast('Round result', data.message, 'result', RESULT_SHOW_MS);
        // A hand that was hidden (a fog bank, Jaguar's Cloak): its score on his nameplate while the result shows.
        if (data.reveal) {
            const at = performance.now();
            update({ revealed: { ...data.reveal, at } });
            // (It stays until the next hand's first throw, 20 Nov, the user's: what you scored against.)
            setTimeout(() => { if (snapshot.revealed?.at === at) update({ revealed: null }); }, 20000);
        }
    }, RESULT_GAP_MS, () => 0, RESULT_SHOW_MS);
});

socket.on('fightSaved', (data: { save: string; name: string; next: string; place: string; purse: number }) => {
    actions.saveAndLeave(data.save, { name: data.name, next: data.next, place: data.place, purse: data.purse });
});

socket.on('displayMessage', (data: { text: string }) => {
    if (data.text && !quietTable() && !multiplayerTable()) showToast('', data.text, 'info', 2600);
});

// A reaction: at a multiplayer table it rises from the sender's nameplate (no words there, the user's
// call, 3 Nov); elsewhere (the Molar's) a small toast as before.
let reactionKey = 0;
export const REACTION_MS = 2200;
socket.on('receiveReaction', (data: { name: string; emoji: string; id?: string }) => {
    const labels: Record<string, string> = { hood: '😈', swords: '⚔️', shield: '🛡️', skull: '💀' };
    const emoji = labels[data.emoji] ?? data.emoji;
    if (!multiplayerTable() || !data.id) { showToast(data.name, emoji, 'info', 1800); return; }
    const key = ++reactionKey;
    // (at most a handful in the air at once)
    update({ reactions: [...snapshot.reactions.slice(-5), { key, playerId: data.id, emoji }] });
    setTimeout(() => update({ reactions: snapshot.reactions.filter(r => r.key !== key) }), REACTION_MS);
});

socket.on('offerKeepsakes', (data: Omit<Extract<Modal, { type: 'keepsakes' }>, 'type'>) => {
    playSound('winner');
    update({ modal: { type: 'keepsakes', ...data } });
});

socket.on('gameOver', (data: { message: string; tavern?: TavernSummary; winnerId?: string | null }) => {
    if (data.tavern && data.tavern.won) {
        // The crawl won (21 Nov, the user's): the Salty Swallow comes home at dawn first (Finale in Hud), once the last
        // round's moments have gone; then the victory screen and its fanfare (actions.endFinale).
        const summary = data.tavern;
        enqueueMoment(() => update({ finale: { at: performance.now(), summary } }), 0, () => momentGoneAt, 0);
    } else if (data.tavern) {
        playSound('aww');
        update({ modal: { type: 'tavernOver', summary: data.tavern } });
    } else {
        // (After the last round's result card has been read.)
        enqueueMoment(() => {
            if (data.winnerId && data.winnerId === snapshot.myId) playSound('multiplayerVictory'); // you won the table (the user's clip, 4 Nov)
            update({ modal: { type: 'gameOver', message: data.message } });
        }, 0, () => momentGoneAt, 0);
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
// Every die kept by your own taps, the hand not yet fixed: End Turn does that (4 Nov; until then a
// die kept this throw can go back). Worked out here too, so a tap still on its way shows it at once.
export function handComplete(turn: TurnView) {
    return turn.hasRolled && !turn.finalized && !turn.dice.some(d => d.status === 'active');
}

export function canPutBack(turn: TurnView, status: string) {
    return turn.hasRolled && (status === 'permanentlyLocked' || ((turn.finalized || handComplete(turn)) && status === 'lockedThisTurn'));
}

// Your dice (20 Nov, the user's): one of the Tavern Crawl opponents' painted sets, once you've beaten them; the
// server checks (settleDice). Kept per device; null is the ivory dice.
export function readDiceChoice(): string | null { try { return localStorage.getItem('tavernDice'); } catch { return null; } }
export function saveDiceChoice(id: string | null) { try { if (id) localStorage.setItem('tavernDice', id); else localStorage.removeItem('tavernDice'); } catch { /* not kept */ } }
// Which opponents a name has beaten, in any run (their ids), for the start screen's dice picker.
export function beatenList(name: string): Promise<string[]> {
    return new Promise(resolve => {
        const done = setTimeout(() => resolve([]), 6000);
        socket.emit('beatenList', { name }, (ids: unknown) => { clearTimeout(done); resolve(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []); });
    });
}

export const actions = {
    join(name: string, avatar: string, tableCode: string, lives = 3) {
        let roomCode = tableCode.trim().toUpperCase();
        if (roomCode === 'TAVERN') roomCode = newCrawlCode();
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
    // The Salty Swallow's sailing scene is over (or skipped): Klarg's entrance card is under it.
    endSail() { if (snapshot.sailAt) update({ sailAt: 0 }); },
    // The homecoming is over (or skipped): the victory screen, with the user's Victory fanfare (since 18 Nov).
    endFinale() {
        const f = snapshot.finale;
        if (!f) return;
        playSound('crawlVictory');
        update({ finale: null, modal: { type: 'tavernOver', summary: f.summary } });
    },
    // Skipper Bren's welcome is done: "Climb aboard", and the ship sets sail.
    boardShip() { if (snapshot.sailAt) update({ sailAt: performance.now(), sailStage: 'sail' }); },
    // The opponent's entrance card is tapped away: on with the fight.
    dismissIntro() {
        if (!snapshot.introShowing) return;
        update({ introShowing: false });
        if (!queueHeld) return;
        queueHeld = false;
        socket.emit('introDone');
        const next = performance.now() + INTRO_LEAVE_MS;
        momentFreeAt = Math.max(momentFreeAt, next);
        momentGoneAt = Math.max(momentGoneAt, next);
        if (!taskRunning) runNext();
        // (A turn that reached the browser before the card went up.)
        if (!snapshot.turn && !taskRunning && serverTurn && serverTurn.playerId === snapshot.state?.currentTurnId) applyTurn(serverTurn);
    },
    roll() {
        const { turn, isMyTurn, rolling } = snapshot;
        if (!turn || !isMyTurn || rolling) return;
        startMusic();
        if (snapshot.gildPick) update({ gildPick: false });
        if (turn.finalized || handComplete(turn)) {
            update({ endingTurn: true });
            socket.emit('endTurn');
        } else if (turn.canRoll) {
            socket.emit('rollDice');
        }
    },
    toggleDie(dieId: number) {
        const { turn, isMyTurn, rolling, putBackSlot } = snapshot;
        // The Gilded Die: the next tap on a loose die throws it again, for gold.
        if (turn && isMyTurn && !rolling && snapshot.gildPick) {
            const loose = turn.dice.find(d => d.id === dieId);
            if (loose && loose.status === 'active') {
                update({ gildPick: false });
                playSound('click');
                socket.emit('gildDie', dieId);
            }
            return;
        }
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
        playSound('potionSelect');
        socket.emit('buyThonic', id);
    },
    leaveShop() {
        actions.moveOn();
    },
    // A saved Tavern Crawl carries on at a fresh table (the save is used up).
    resume(saved: SavedRun, avatar: string) {
        resumingFrom = saved;
        writeSavedRun(null);
        continuing = true;
        const roomCode = newCrawlCode();
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
    // A boss's keepsake at the invitation: take it (naming one of yours to leave behind when your
    // pockets are full) or leave it.
    claimDrop(take: boolean, giveUp?: string) {
        if (take) playSound('itemPickup'); else playSound('click');
        socket.emit('claimDrop', take, giveUp);
    },
    saveAndLeave(save: string, info: Omit<SavedRun, 'save' | 'at'>) {
        writeSavedRun({ save, ...info, at: Date.now() });
        actions.leave();
    },
    // The menu's Save (14 Nov, the user's): the server seals the run as the current fight began (between
    // fights, as the next one will begin); it's kept on this device and the table is left ('fightSaved').
    saveFight() {
        playSound('click');
        socket.emit('saveFight');
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
    buyKeepsake(id: string, giveUp?: string) {
        playSound('itemPickup');
        socket.emit('buyKeepsake', id, giveUp);
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
    // Johnny Elf Bar: an Elf Bar for the shelf.
    buyElfBar(id: string) {
        playSound('potionSelect');
        socket.emit('buyElfBar', id);
    },
    // The Bard: a song for the next fight (null: walk away).
    bardPick(id: string | null) {
        if (id) playChime(); else playSound('click');
        socket.emit('bardPick', id);
    },
    // Yvesil: hear your omen (false: walk away).
    yvesilPick(ask: boolean) {
        if (ask) playChime(); else playSound('click');
        socket.emit('yvesilPick', ask);
    },
    // Jorvash: a refreshment for the next fight (null: walk away).
    jorvashPick(id: string | null) {
        if (id) playChime(); else playSound('click');
        socket.emit('jorvashPick', id);
    },
    // The Cult of Kram: swear fealty, or refuse.
    kram(action: 'swear' | 'refuse') {
        playSound('click');
        socket.emit('kram', action);
    },
    // The Bard's Inspiring Song: your first throw of the fight, thrown again.
    inspiringSong() {
        socket.emit('inspiringSong');
    },
    // Mystery Flavour: one puff a fight, working as this fight's flavour does.
    puffMystery() {
        socket.emit('puffMystery');
    },
    strangerPick(id: string | null) {
        playSound(id ? 'itemPickup' : 'click');
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
    // The Gilded Die (17 Nov): pay, then tap the loose die to throw again.
    startGild() {
        update({ gildPick: true });
    },
    cancelGild() {
        if (snapshot.gildPick) update({ gildPick: false });
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
// The intro film's lesson (Intro.tsx), played on the real table with the real dice: a 2 found and
// kept, a 4, then four 6s. No socket is involved: it runs before you've sat down, and leaves the table as it was.
// (The trailer, Trailer.tsx, plays its own throws: `devil` brings the three 6s' moment as they land,
// `slow` the slow motion of a last throw, `cheer` the yay of a perfect hand.)
export interface FilmSpec { dice: number[][]; keep: number[]; seed: number; perfect?: boolean; devil?: boolean; slow?: boolean; cheer?: boolean }
export interface FilmThrow { dice: { id: number; value: number }[]; keep: number[]; track: RollTrack; pace: Pace; ms: number; perfect?: boolean; devil?: boolean; cheer?: boolean }
const filmTurn = (dice: Die[]): TurnView => ({ key: 'film', playerId: 'film', dice, rollCount: 1, locksThisRoll: 0, hasRolled: true, blurActive: false, suspense: 'none', callout: null, finalized: false, outcome: null, canRoll: false });
const FILM_THROWS: FilmSpec[] = [
    { dice: [[0, 3], [1, 2], [2, 5], [3, 1], [4, 6], [5, 3]], keep: [1], seed: 240 },
    { dice: [[0, 5], [2, 1], [3, 4], [4, 3], [5, 2]], keep: [3], seed: 24 },
    { dice: [[0, 6], [2, 6], [4, 6], [5, 6]], keep: [0, 2, 4, 5], seed: 2424, perfect: true }
];
// The film's throw in the air: lands it (now: its keep too, without the beat).
let filmLanding: ((now?: boolean) => void) | null = null;
export const film = {
    begin() { filmLanding = null; update({ filmPause: true }); },
    // Pre-simulated before the film starts (each throw takes a moment to work out), each played a
    // little faster if it would run past `longest` seconds.
    prepare(longest: number, throws: FilmSpec[] = FILM_THROWS): FilmThrow[] {
        return throws.map(({ dice, keep, seed, perfect, devil, slow, cheer }) => {
            const track = simulateRoll(dice.map(d => d[0]), dice.map(d => d[1]), seed);
            const speed = Math.max(1, track.frames / 60 / longest);
            const pace: Pace = slow ? suspensePace(track, speed) : { speed };
            return { dice: dice.map(([id, value]) => ({ id, value })), keep, track, pace, ms: paceSeconds(pace, track.frames) * 1000, perfect, devil, cheer };
        });
    },
    showTable() {
        resetTrayForNewTurn();
        screenInsets.bottom = Math.max(70, innerHeight * 0.1);
        // (On a computer's screen the table rises to just under the black bar and the words, for bigger
        // dice; a phone on its side has no height to spare for the words over it.)
        if (innerWidth > innerHeight && innerHeight > 500) screenInsets.top = Math.min(innerHeight * 0.085, 70) + 46;
        update({ filmPause: false, turn: filmTurn([0, 1, 2, 3, 4, 5].map(id => ({ id, value: 0, status: 'active' }))) });
    },
    hideTable() { update({ filmPause: true }); },
    // The table again as it was left (the trailer comes back to it for the last throw).
    showAgain() { update({ filmPause: false }); },
    playThrow(one: FilmThrow) {
        // A throw still in the air lands now, kept dice and all (11 Nov: the trailer's next throw began as
        // the 2 was landing, and the 2 never showed; a slow phone's late timers could do the same).
        filmLanding?.(true);
        table.roll = { track: one.track, startedAt: performance.now(), speed: 1, pace: one.pace, hidden: new Set() };
        update({ rolling: true });
        playDiceImpacts(one.track.impacts, one.pace);
        const land = (now = false) => {
            if (filmLanding !== land) return;
            filmLanding = null;
            if (!snapshot.turn || snapshot.turn.key !== 'film' || table.roll?.track !== one.track) return;
            table.roll = null;
            one.dice.forEach((d, i) => {
                const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
                readFrame(one.track, one.track.frames - 1, i, pose.position, pose.quaternion);
                table.rest.set(d.id, pose);
            });
            const shown = (keeping: boolean) => filmTurn(snapshot.turn!.dice.map(d => {
                const thrown = one.dice.find(t => t.id === d.id);
                return { ...d, value: thrown ? thrown.value : d.value, status: keeping && one.keep.includes(d.id) ? 'permanentlyLocked' as const : d.status };
            }));
            update({ rolling: false, turn: shown(false) });
            if (one.devil) {
                table.devilAt = performance.now();
                playSound('devil');
                update({ devil: { at: performance.now(), who: null } });
            }
            // A beat to see the faces, then what's wanted goes to its plate (at once when the next throw is coming).
            const keep = () => {
                if (snapshot.turn?.key !== 'film') return;
                const turn = shown(true);
                recordLockOrder(turn);
                update({ turn });
                // (The camera leans in as on any perfect hand. Not its gold light here: it paled the green pips.)
                if (one.perfect) update({ celebration: { kind: 'perfect24', at: performance.now(), who: null } });
                if (one.cheer) playSound('yay');
            };
            if (now) keep(); else setTimeout(keep, 90);
        };
        filmLanding = land;
        setTimeout(land, one.ms + 30);
    },
    end() {
        filmLanding = null;
        table.roll = null;
        resetTrayForNewTurn();
        screenInsets.bottom = 0;
        screenInsets.top = 0;
        update({ filmPause: false, turn: null, rolling: false, celebration: null, devil: null });
    }
};

export const preview = {
    // e.g. ability('Keepsake', 'Shield', { keepsake: 'bentCopper', text: 'Shield protects a life.' })
    // (hold: keep it up that much longer, to look at a still of it)
    ability(name: string, ability: string, more: Partial<AbilityMoment> = {}, hold = 0) { if (more.hit || SHAKING_ABILITIES.has(ability)) shakeScreen(250, !!more.hit); update({ ability: { name, ability, text: '', ...more, at: performance.now() + hold } }); },
    // The aftermath ribbon alone, e.g. aftermath('Astral Flood', 'Brodor heals a heart and takes one of yours.'),
    // or Jaguar's bottle with aftermath('Smooth Talker', '...', 'healing') (a Thonic on your shelf to fly from).
    aftermath(ability: string, after: string, thonic?: string, delay = 0) { showAftermath({ ability, after, thonic }, delay); },
    intro() { update({ introAt: performance.now(), introShowing: true }); },
    floodWave() { showFloodWave(); },
    // The homecoming after Jaguar, then the victory screen (with a made-up champion's summary).
    finale() { update({ finale: { at: performance.now(), summary: { won: true, name: 'Tester', defeated: 15, encounters: [], fellTo: null, points: 5000, gold: 120, breakdown: { fights: 0, hearts: 0, perfect: 0, reached: 0, champion: 2000, gold: 0, purse: 120, events: 0, spent: 0 }, stats: { encountersDefeated: 15, livesLost: 0, keepsakesActivated: 0, perfect24s: 0 }, keepsakes: [] } } }); },
    // The Salty Swallow sets sail (its scene alone; hold: freeze it that many ms in, for stills).
    sail(stage: 'dock' | 'sail' | 'portal' = 'sail') { update({ sailAt: performance.now(), sailStage: stage }); },
    // Aboard: a change of sea's moment, e.g. sea('starboard', 'calm'); hold keeps it up that much longer.
    sea(id: SeaState['id'] = 'starboard', from: string | null = 'calm', hold = 0, face = 0) {
        const names = { calm: 'Calm seas', starboard: 'Listing to starboard', port: 'Listing to port', rogue: 'Heavy seas', squall: 'Squall', fog: 'Fog bank', becalmed: 'Becalmed' };
        const faces: SeaState['id'][] = ['port', 'squall', 'rogue', 'fog', 'calm', 'starboard'];
        const landed = face || faces.indexOf(id) + 1;
        showSea({ id, name: names[id], text: '', shift: SEA_SHIFTS[id], from, face: landed, faces, changed: id !== from }, hold);
    },
    // Heavy seas: a rogue wave takes die `dieId` over the rail (its moment, and the die's ride off the table).
    wave(dieId = 3, hold = 0) { showWave({ dieId, value: 0, playerId: snapshot.myId ?? '', name: '' }, hold); },
    // A multiplayer round result card, held up until the next call (null ends it).
    roundResult(rows: RoundResultRow[] | null) { update({ roundResult: rows ? { rows, at: performance.now() } : null }); },
    // A reaction rising from a player's nameplate (a multiplayer table), e.g. react(id, '🍻').
    react(playerId: string, emoji: string) { update({ reactions: [...snapshot.reactions, { key: ++reactionKey, playerId, emoji }] }); },
    // The line over the table after a throw (e.g. callout('17 points')); kind and playerId put a
    // multiplayer callout on that player's nameplate (callout('', '#4fc3f7', 'didntBite', id)).
    callout(text: string, color = '#9ccc65', kind = 'result', playerId = '') { update({ callout: { text, color, key: String(performance.now()), kind, playerId } }); },
    celebrate(kind: CelebrationKind, who: string | null = null) { if (kind !== 'perfect4') table.celebrateAt = performance.now(); update({ celebration: { kind, at: performance.now(), who } }); },
    // (hold: keep it up that much longer, to look at a still of it)
    devil(who: string | null = null, hold = 0) { table.devilAt = performance.now(); update({ devil: { at: performance.now() + hold, who } }); },
    // Every die, yours too, shows an opponent's own dice (an id from OPPONENT_DICE), to look at a set
    // on the felt without waiting for their turn; null ends it.
    dice(id: string | null) { table.diceSet = id; }
};

resetTrayForNewTurn();

// Back in your seat after a refresh (the socket rejoins the table when it connects).
const savedSeat = readSeat();
if (savedSeat) snapshot = { ...snapshot, joined: true, roomLabel: roomLabel(savedSeat.roomCode), roomCode: savedSeat.roomCode };
