const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const Rules = require('./shared/rules');
const Strategy = require('./shared/strategy');
const BALANCE = require('./shared/balance');

const BOT_ID = 'BOT_MOLAR';

// Scales every server-side delay (bot thinking time, roll animations). Tests set this low.
const TIME_SCALE = Number(process.env.GAME_TIME_SCALE) || 1;
const delay = msValue => Math.round(msValue * TIME_SCALE);

const rollFace = () => crypto.randomInt(1, 7);

// Phones drop their connection when the screen locks or the app is switched. A table with
// nobody connected is kept this long so players can come back to it, and the player whose
// turn it is gets this long to reconnect before their turn counts as dust.
const EMPTY_TABLE_GRACE_MS = 120000;
const TURN_RECONNECT_GRACE_MS = 30000;

const AVATARS = ['Devil', 'Vaelin', 'Rokr', 'The Hangman', 'Klarg', 'Jaguar Cantona'];
const PLAYER_REACTIONS = ['😀', '😂', '😮', '😎', '😭', '🧔 Early Ross'];

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
// The 3D client prototype (client/), once built with `npm run build:client`.
app.use('/next', express.static(path.join(__dirname, 'client', 'dist')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/leaderboard', (req, res) => {
    res.json(tavernLeaderboard);
});

let rooms = {};

// The Tavern Crawl's leaderboard: each name's best run by points (since 23 Oct; it was gold), with
// the gold that run ended with. It starts empty (no made-up names) and lives in leaderboard.json
// (not in git). An older entry with only gold counts that gold as its points.
const LEADERBOARD_PATH = path.join(__dirname, 'leaderboard.json');

function normalizeLeaderboard(entries) {
    let bestByName = new Map();
    entries.forEach(entry => {
        let name = String(entry.name || '').trim().substring(0, 20);
        let points = Math.max(0, parseInt(entry.points ?? entry.gold, 10) || 0);
        let gold = Math.max(0, parseInt(entry.gold, 10) || 0);
        if (!name) return;
        let existing = bestByName.get(name);
        if (!existing || points > existing.points) bestByName.set(name, { name, points, gold });
    });
    return Array.from(bestByName.values()).sort((a, b) => b.points - a.points).slice(0, 20);
}

function loadTavernLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_PATH)) {
            let parsed = JSON.parse(fs.readFileSync(LEADERBOARD_PATH, 'utf8'));
            return normalizeLeaderboard(parsed);
        }
    } catch (error) {
        console.warn('Could not load leaderboard:', error.message);
    }
    return [];
}

let tavernLeaderboard = loadTavernLeaderboard();

function saveTavernLeaderboard() {
    if (process.env.LEADERBOARD_READONLY) return;
    try {
        fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(tavernLeaderboard, null, 2));
    } catch (error) {
        console.warn('Could not save leaderboard:', error.message);
    }
}

function submitTavernLeaderboardScore(name, points, gold) {
    tavernLeaderboard = normalizeLeaderboard([...tavernLeaderboard, { name, points, gold }]);
    saveTavernLeaderboard();
    return tavernLeaderboard;
}

// The opponents, in the order you meet them: the Ghoul and Gourd (a qualifier: the bouncer, then
// the high-roller table), the Yawning Portal (five more, Brodor the boss), then the final aboard
// the Salty Swallow (Klarg's crew). `place` is a key of PLACES. A boss drops a keepsake (`drops`)
// and sends you on to the next place (the invitation). McGrath is the Molar renamed and keeps
// his id ('molar'): he plays simply, as a teacher.
const TAVERN_ENCOUNTERS = [
    {
        id: 'molar',
        place: 'ghoulAndGourd',
        name: 'Sperm McGrath',
        avatar: '🦷',
        lives: BALANCE.opponentLives.molar,
        ability: null,
        intro: "Sperm McGrath, the Ghoul and Gourd's bouncer, lets no one into the tournament who doesn't know the house game: find a 2, find a 4, then chase 24."
    },
    {
        id: 'frak',
        place: 'ghoulAndGourd',
        name: 'Frak',
        avatar: '🦑',
        lives: BALANCE.opponentLives.frak,
        ability: 'mindWhip',
        intro: 'Frak, a repugnant ne’er-do-well, slimes into place. Mind Whip: on your first throw he makes you keep one of your dice, at random.'
    },
    {
        id: 'danhausen',
        place: 'ghoulAndGourd',
        name: 'Danhausen',
        avatar: '🧛',
        lives: BALANCE.opponentLives.danhausen,
        ability: 'cursed',
        intro: 'Danhausen: Very Nice, Very Evil and Mayor of Waterdeep? You are Cursed: for a round, the lowest valid score wins.'
    },
    {
        id: 'duke',
        place: 'ghoulAndGourd',
        name: 'Duke Morrigan',
        avatar: '😈',
        lives: BALANCE.opponentLives.duke,
        ability: 'devil',
        intro: 'Duke Morrigan, noble, roguish and scion of Avernus. Sympathy for the Devil: his roll comes up three 6s.'
    },
    {
        id: 'martha',
        place: 'ghoulAndGourd',
        name: 'Martha Mystery',
        avatar: '🎭',
        lives: BALANCE.opponentLives.martha,
        ability: 'disguises',
        boss: true, // beating her wins her mask and the invitation to the Yawning Portal
        drops: 'marthasMask',
        intro: 'Martha? Mystery? Who knows? Twice a fight she takes the face of Frak, Danhausen or the Duke, and plays their trick.'
    },
    {
        id: 'sylvester',
        place: 'yawningPortal',
        name: 'Sylvester Stonefist',
        avatar: '👊',
        lives: BALANCE.opponentLives.sylvester,
        ability: 'suckerPunch',
        intro: 'Sylvester Stonefist, a brawling monk, never hits you from the front. Back of the Head: as you keep your last die, he knocks your best die loose and you roll it again.'
    },
    {
        id: 'vaelin',
        place: 'yawningPortal',
        name: 'Vaelin Inkhand',
        avatar: '🖋️',
        lives: BALANCE.opponentLives.vaelin,
        ability: 'inkfire',
        intro: 'Vaelin Inkhand, wizard of the inky flame. Inkfire Brand: for a round he burns the 6 into the table, and your dice that land on it roll again.'
    },
    {
        id: 'stason',
        place: 'yawningPortal',
        name: 'Stason Jatham',
        avatar: '🤺',
        lives: BALANCE.opponentLives.stason,
        ability: 'flourish',
        intro: 'Stason Jatham rushes in, rapier first. Flourish: for one whole turn, each of his dice rolls twice and he keeps the better.'
    },
    {
        id: 'ridgeler',
        place: 'yawningPortal',
        name: 'The Ridgeler',
        avatar: '🐉',
        lives: BALANCE.opponentLives.ridgeler,
        ability: 'divineSmite',
        intro: 'The Ridgeler, dragonborn paladin, and Beakbreaker, his warhammer. Divine Smite: for a round, if he wins it, you lose two hearts.'
    },
    {
        id: 'brodor',
        place: 'yawningPortal',
        name: 'Brodor',
        avatar: '🕶️',
        lives: BALANCE.opponentLives.brodor,
        ability: 'astralFlood',
        boss: true, // beating him wins his Sunglasses, and word comes of the Salty Swallow
        drops: 'brodorsSunglasses',
        intro: "Brodor, wrestling champion, cleric, and the Yawning Portal's champion. Astral Flood: once he has lost a life, he floods the table with light and heals one."
    },
    {
        id: 'klarg',
        place: 'saltySwallow',
        name: 'Klarg',
        avatar: '🐻',
        lives: BALANCE.opponentLives.klarg,
        ability: 'reachAround',
        // Since 25 Oct (the final tier): twice a fight he waits for a 2 or 4 you still need,
        // snatches it and keeps it for his own hand (it starts his next turn already kept).
        keepsStolen: true,
        intro: 'Klarg, bugbear paladin and sworn enemy of Kram. Twice a fight his Reach Around snatches a 2 or 4 you need, and he keeps it for his own hand.'
    },
    {
        id: 'rokr',
        place: 'saltySwallow',
        name: 'Rokr',
        avatar: '✨',
        lives: BALANCE.opponentLives.rokr,
        ability: 'writtenInStars',
        intro: 'Rokr reads the dice in the stars. Written in the Stars: for a whole turn the stars mark two faces before each throw, and dice that land on them cannot be kept.'
    },
    {
        id: 'hangman',
        place: 'saltySwallow',
        name: 'The Hangman',
        avatar: '🤠',
        lives: BALANCE.opponentLives.hangman,
        ability: 'deadEye',
        abilities: ['deadEye', 'deadeye24'], // Dead Eye, and his Ace kept for his last stand
        intro: 'The Hangman and The Ace of Spades, his revolver. Dead Eye: once a fight he shoots your best die as you finish and it rolls again. At one life, one shot can turn his own 16 or higher into a perfect 24.'
    },
    {
        id: 'jaguar',
        place: 'saltySwallow',
        name: 'Jaguar Cantona',
        avatar: '😎',
        lives: BALANCE.opponentLives.jaguar,
        ability: 'jaguarPhases',
        intro: 'Jaguar Cantona has the smile, the cloak, and an extra life. Smooth Talk: he talks your Thonics off your shelf and drinks them. At two lives, The Cloak. At his last, All In.'
    }
];

const TAVERN_KEEPSAKES = [
    // `from`: offered only from that place on (the Shield and the Loaded Die from the Yawning
    // Portal, the user's call, 30 Oct).
    {
        id: 'bentCopper',
        name: 'Shield',
        text: 'Once per encounter, the first life you would lose is ignored.',
        from: 'yawningPortal'
    },
    {
        id: 'luckySeat',
        name: 'Trap Card',
        text: 'Once per encounter, your first tied round counts as safe for you and a loss for the opponent.'
    },
    {
        id: 'velvetCushion',
        name: 'Velvet Cushion',
        text: 'Once per encounter, losing by exactly 1 point becomes a tie instead.'
    },
    {
        id: 'loadedDie',
        name: 'Loaded Die',
        text: "One of your dice lands only on a 2 or a 4 until you've kept both; after that, only on 4, 5 or 6.",
        from: 'yawningPortal'
    },
    {
        id: 'potionBelt',
        name: 'Potion Belt',
        text: 'Your shelf holds one more Thonic. Comes with a Healing Thonic.'
    },
    {
        id: 'loyaltyCard',
        name: "Thom's Loyalty Card",
        text: "Thom's cart is always one of the spots, and your first Thonic each visit is free."
    },
    // 30 Oct, the user's picks.
    {
        id: 'misersPurse',
        name: "Miser's Purse",
        text: 'Each win pays 1 more gold for every 10 in your purse.'
    },
    {
        id: 'gamblersCharm',
        name: "Gambler's Charm",
        text: 'When only one die is left to throw, it is thrown twice and you keep the better.'
    },
    {
        id: 'bottomlessFlask',
        name: 'Bottomless Flask',
        text: 'The first Thonic you drink each fight has a 1 in 2 chance of staying on your shelf.'
    }
];
const KEEPSAKE_NUMBERS = BALANCE.keepsakes;
// You carry at most this many keepsakes (the user's call, 30 Oct): with full pockets Thom's back
// shelf won't sell, the Stranger stays away, and a boss's keepsake means leaving one behind.
const MAX_KEEPSAKES = BALANCE.maxKeepsakes || 5;
const pocketsFull = room => room.tavernRun.keepsakes.length >= MAX_KEEPSAKES;

// Martha's mask: dropped by Martha Mystery (never offered by the Stranger). Once a fight, before
// you roll, you wear one of her disguises for the round (the wearMask handler).
const MARTHAS_MASK = {
    id: 'marthasMask',
    name: "Martha's Mask",
    text: "Once a fight, before you roll: Danhausen's Curse (lowest valid score wins the round) or the Duke's Devil (three 6s for you)."
};
// Brodor's Sunglasses: dropped by Brodor (never offered by the Stranger or Thom). A finished 23
// restores a heart too, like a 24 (performEndTurn).
const BRODORS_SUNGLASSES = {
    id: 'brodorsSunglasses',
    name: "Brodor's Sunglasses",
    text: 'A finished 23 restores a heart, like a 24.'
};
// What each boss drops (TAVERN_ENCOUNTERS `drops`).
const BOSS_DROPS = { marthasMask: MARTHAS_MASK, brodorsSunglasses: BRODORS_SUNGLASSES };
const LOADED_DIE = 0; // the die the Loaded Die keepsake loads (marked on the table)

// Thom's Thonics: potions bought from Thom between fights and kept on a shelf (up to
// SHELF_SIZE) until drunk. `drink` = tapped by the player on their own turn (when exactly
// depends on the Thonic: see the drinkThonic handler); Last Gasp works by itself.
const THONICS = {
    healing: { id: 'healing', name: 'Healing Thonic', text: '+1 heart, up to your maximum. Drink it before you roll.', price: BALANCE.thonicPrices.healing, drink: true },
    lastGasp: { id: 'lastGasp', name: 'Last Gasp Thonic', text: 'Works by itself: a round that would take your last heart leaves you on 1.', price: BALANCE.thonicPrices.lastGasp, drink: false },
    fizzy: { id: 'fizzy', name: 'Fizzy Thomic', text: 'After a roll: your 1s roll again, once.', price: BALANCE.thonicPrices.fizzy, drink: true },
    secondThoughts: { id: 'secondThoughts', name: 'Second Thoughts Thonic', text: 'Put back a die you kept, then roll it again.', price: BALANCE.thonicPrices.secondThoughts, drink: true },
    steady: { id: 'steady', name: 'Steady Thonic', text: "This turn, a missing 2 or 4 doesn't dust you: your dice score as they lie.", price: BALANCE.thonicPrices.steady, drink: true },
    clearEye: { id: 'clearEye', name: 'Clear-Eye Thonic', text: "Cancels the opponent's next ability, whenever it comes.", price: BALANCE.thonicPrices.clearEye, drink: true },
    // Elf Bars (28 Oct, the user's): magic vapes from Johnny Elf Bar, one of Frak's street
    // urchins. They sit on the shelf like Thonics, but each has ELF_BAR_PUFFS puffs, at most one
    // a fight (run.puffs, run.puffed); the last puff empties it. No side effects (the user's call).
    purpleHaze: { id: 'purpleHaze', name: 'Purple Haze Elf Bar', text: 'After a throw showing a 1, while you still need a 2 or a 4: that 1 becomes it.', price: BALANCE.elfBarPrices.purpleHaze, drink: true, elf: true },
    cottonCandyCloud: { id: 'cottonCandyCloud', name: 'Cotton Candy Cloud Elf Bar', text: "On your turn, while your opponent is still to throw: they play this round without seeing your score.", price: BALANCE.elfBarPrices.cottonCandyCloud, drink: true, elf: true },
    lemonLevitation: { id: 'lemonLevitation', name: 'Lemon Levitation Elf Bar', text: 'After a throw: throw again without keeping a die.', price: BALANCE.elfBarPrices.lemonLevitation, drink: true, elf: true },
    watermelonHindsight: { id: 'watermelonHindsight', name: 'Watermelon Hindsight Elf Bar', text: 'Undo your last throw: those dice are thrown again.', price: BALANCE.elfBarPrices.watermelonHindsight, drink: true, elf: true }
};
const ELF_BARS = Object.keys(THONICS).filter(id => THONICS[id].elf);
const ELF_BAR_PUFFS = BALANCE.elfBarPuffs || 3;
const SHELF_SIZE = BALANCE.shelfSize;
const SHOP_SIZE = BALANCE.shopSize; // Thonics on Thom's cart per visit: Healing, plus two others at random

// The places in the run: what Thom sells there and the spots between fights. (Each opponent
// names its place.) The hot tub is only at the Ghoul and Gourd (the user's call, 21 Oct); the
// ship's own spots and events are still to workshop.
// The Dice Den is out of every place for now (the user, 28 Oct); its code stays.
const PLACES = {
    ghoulAndGourd: {
        name: 'The Ghoul and Gourd',
        thomStock: ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'],
        // Between fights two of these catch your eye, and you go to one, unless the pickpocket,
        // the Hooded Stranger or one of the place's own events finds you first (startInterlude).
        spots: ['thom', 'shrine', 'hotTub', 'elfKid'],
        events: ['darren'] // Darren Snakehands is the barman here
    },
    yawningPortal: {
        name: 'The Yawning Portal',
        thomStock: ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'],
        // The hot tub is the Ghoul and Gourd's (the user's call, 21 Oct); the Bard and the Cult of
        // Kram are the Yawning Portal's own (28 Oct).
        spots: ['thom', 'shrine', 'bard', 'elfKid'],
        events: ['kram']
    },
    // A ship docked after the Yawning Portal: Klarg's crew, top-tier players.
    saltySwallow: {
        name: 'The Salty Swallow',
        thomStock: ['healing', 'lastGasp', 'fizzy', 'secondThoughts', 'steady', 'clearEye'],
        spots: ['thom', 'shrine', 'elfKid'],
        events: []
    }
};

// Where the run is now (between fights: where the next fight is).
function placeOf(room) {
    let index = Math.min(room.tavernRun.encounterIndex, TAVERN_ENCOUNTERS.length - 1);
    return PLACES[TAVERN_ENCOUNTERS[index].place];
}

// Between fights, one event: now and then a pickpocket or the Hooded Stranger finds you, else
// two spots in the room catch your eye and you choose one. Gold during a run goes into the purse as it is won, and the purse
// is the final score. The numbers live in shared/balance.js.
const INTERLUDE = BALANCE.interlude;
const GOLD = BALANCE.gold;
const POINTS = BALANCE.points;
const goldText = Rules.formatGold;

// What something costs this time: its first price, and half as much again (BALANCE.priceRise)
// for each one already bought this run (the user's call, 23 Oct: the Shrine, the hot tub and each
// kind of Thonic cost more every purchase). bought: counts by id ('healing', 'shrine', 'hotTub').
function risingPrice(run, id, base) {
    let times = (run.bought && run.bought[id]) || 0;
    return Math.ceil(base * (1 + (BALANCE.priceRise || 0) * times));
}
function noteBought(run, id) {
    run.bought = run.bought || {};
    run.bought[id] = (run.bought[id] || 0) + 1;
}
const thonicPrice = (run, id) => risingPrice(run, id, THONICS[id].price);
const shrinePrice = run => risingPrice(run, 'shrine', INTERLUDE.shrinePrice || 0);
const hotTubPrice = run => risingPrice(run, 'hotTub', INTERLUDE.hotTubPrice || 0);
const bardPrice = run => risingPrice(run, 'bard', INTERLUDE.bardPrice || 0);

// The Wild Magic Hot Tub's surges (weights in shared/balance.js). The dice ones work on
// HOT_TUB_DIE, on the player's turns, for the next fight (tavernRun.tubSurge).
const HOT_TUB_DIE = INTERLUDE.hotTubDie;
const HOT_TUB_SURGES = {
    noOnes: { name: 'Bubbly Die', text: 'One of your dice never rolls a 1 next fight.', good: true },
    twin: { name: 'Double Bubble', text: 'One of your dice rolls twice and keeps the better next fight.', good: true },
    lucky: { name: 'Lucky Splash', text: 'One of your dice only rolls 4, 5 or 6 next fight.', good: true },
    scalding: { name: 'Scalding Die', text: 'One of your dice always lands on a 6 next fight.', good: true },
    soggy: { name: 'Soggy Die', text: 'One of your dice never rolls a 6 next fight.', good: false },
    pruney: { name: 'Pruney Fingers', text: 'You start the next fight a heart short.', good: false }
};
function pickHotTubSurge() {
    let weights = Object.entries(INTERLUDE.hotTubSurges).filter(([id]) => HOT_TUB_SURGES[id]);
    let roll = crypto.randomInt(0, weights.reduce((a, [, w]) => a + w, 0));
    for (let [id, w] of weights) { if (roll < w) return id; roll -= w; }
    return weights[0][0];
}

// What Thom has on his cart this visit: always Healing, plus others picked at random.
function pickThomStock(place) {
    let others = place.thomStock.filter(id => id !== 'healing');
    for (let i = others.length - 1; i > 0; i--) {
        let j = crypto.randomInt(0, i + 1);
        [others[i], others[j]] = [others[j], others[i]];
    }
    return ['healing', ...others.slice(0, SHOP_SIZE - 1)];
}

// The shelf, one slot more with the Potion Belt.
function shelfSizeOf(room) {
    return SHELF_SIZE + (hasKeepsake(room, 'potionBelt') ? KEEPSAKE_NUMBERS.beltSlots : 0);
}

// How the dice land on this turn: the Loaded Die only rolls loadedDieLow or more; in Vaelin's
// Inkfire round your dice that land on 6 roll again; Stason's Flourish rolls his twice.
function rollFaceFor(room, turn) {
    if (room.mode !== 'tavern-crawl') return rollFace;
    // The rolls that lost, this throw (Double Bubble, Flourish): sent with diceRolled as ghosts.
    turn.ghosts = [];
    if (turn.playerId === BOT_ID) return turn.flourish ? flourishFace(turn) : rollFace;
    let face = playerFace(room, turn);
    if (!hasKeepsake(room, 'gamblersCharm')) return face;
    // The Gambler's Charm: the last die left to throw is thrown twice, and you keep the better (a
    // 2 or 4 you still need, else the higher; in a cursed round the lower). The other rises as a ghost.
    return d => {
        if (!d || turn.dice.filter(x => x.status === Rules.STATUS.ACTIVE).length !== 1) return face(d);
        let kept = turn.dice.filter(x => x.status === Rules.STATUS.LOCKED).map(x => x.value);
        let a = face(d), b = face(d);
        let cursed = !!room.tavernRun.roundEffect && room.tavernRun.roundEffect.kind === 'curse';
        let pick = cursed ? Math.min(a, b) : Math.max(a, b);
        for (let need of [2, 4]) if (!kept.includes(need) && (a === need || b === need)) { pick = need; break; }
        let lost = pick === a ? b : a;
        if (lost !== pick) turn.ghosts.push({ die: d.id, kept: pick, lost, kind: 'plain' });
        return pick;
    };
}

// How your dice land (before the Gambler's Charm): the Loaded Die, the hot tub's surge, Vaelin's
// Inkfire, fealty to Kram.
function playerFace(room, turn) {
    let loaded = hasKeepsake(room, 'loadedDie');
    let surge = room.tavernRun.tubSurge;
    let effect = room.tavernRun.roundEffect;
    let ink = !!effect && effect.kind === 'ink';
    let kram = !!room.tavernRun.kram; // sworn to Kram: your dice never land on 1
    if (!loaded && !surge && !ink && !kram) return rollFace;
    // The Loaded Die (reworked 30 Oct): a 2 or a 4 until you've kept both, then 4, 5 or 6.
    let loadedFace = () => {
        let kept = turn.dice.filter(x => x.status === Rules.STATUS.LOCKED).map(x => x.value);
        let needed = [2, 4].filter(n => !kept.includes(n));
        return needed.length ? needed[crypto.randomInt(0, needed.length)] : crypto.randomInt(KEEPSAKE_NUMBERS.loadedDieLow, 7);
    };
    let plain = d => (loaded && d && d.id === LOADED_DIE ? loadedFace() : kram ? crypto.randomInt(2, 7) : rollFace());
    let base = ink ? d => { let v; do v = plain(d); while (v === 6); return v; } : plain;
    if (!surge) return base;
    return d => {
        if (!d || d.id !== HOT_TUB_DIE) return base(d);
        if (surge === 'noOnes') return crypto.randomInt(2, 7);
        if (surge === 'soggy') return crypto.randomInt(kram ? 2 : 1, 6);
        if (surge === 'lucky') return crypto.randomInt(4, 7);
        if (surge === 'scalding') return 6;
        if (surge === 'twin') {
            // The better of two: a 2 or 4 still needed, else the higher.
            let kept = turn.dice.filter(x => x.status === Rules.STATUS.LOCKED).map(x => x.value);
            let a = base(d), b = base(d);
            // In a cursed round (the lowest valid score wins) the better is the lower.
            let cursed = room.tavernRun.roundEffect && room.tavernRun.roundEffect.kind === 'curse';
            let pick = cursed ? Math.min(a, b) : Math.max(a, b);
            for (let need of [2, 4]) if (!kept.includes(need) && (a === need || b === need)) { pick = need; break; }
            let lost = pick === a ? b : a;
            if (lost !== pick) turn.ghosts.push({ die: d.id, kept: pick, lost, kind: 'tub' });
            return pick;
        }
        return base(d);
    };
}

// Stason's Flourish: for his whole turn each die rolls twice and he keeps the better (a 2 or 4
// he still needs, else the higher).
function flourishFace(turn) {
    return d => {
        let kept = turn.dice.filter(x => x.status === Rules.STATUS.LOCKED).map(x => x.value);
        let a = rollFace(), b = rollFace();
        let pick = Math.max(a, b);
        for (let need of [2, 4]) if (!kept.includes(need) && (a === need || b === need)) { pick = need; break; }
        // The other roll rises from the die as a ghost (like Double Bubble's; the user's call, 21 Oct).
        let lost = pick === a ? b : a;
        if (d && lost !== pick && turn.ghosts) turn.ghosts.push({ die: d.id, kept: pick, lost, kind: 'plain' });
        return pick;
    };
}

const thonicView = id => ({ id, name: THONICS[id].name, text: THONICS[id].text, price: THONICS[id].price, drink: THONICS[id].drink, ...(THONICS[id].elf ? { elf: true } : {}) });
// On the shelf, an Elf Bar also shows its puffs left and whether it was puffed this fight.
const shelfView = run => id => (THONICS[id].elf ? { ...thonicView(id), puffs: (run.puffs && run.puffs[id]) || ELF_BAR_PUFFS, puffed: !!(run.puffed && run.puffed[id]) } : thonicView(id));

function getRoomState(roomCode) {
    let room = rooms[roomCode];
    if (!room) return {};

    return {
        players: room.players,
        playerOrder: room.playerOrder,
        roundPlayers: room.roundPlayers,
        currentTurnId: room.roundPlayers[room.currentTurnIndex],
        isTieBreaker: room.isTieBreaker,
        roundNumber: room.roundNumber,
        startingLives: room.startingLives,
        mode: room.mode || 'classic',
        tavernRun: getTavernRunState(room)
    };
}

function getTavernRunState(room) {
    if (!room || room.mode !== 'tavern-crawl') return null;
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    // Who sits across the table: the current opponent, or, between fights, the one just beaten
    // (enemy is already the next one then). Browsers draw the table from this.
    let bot = room.players[BOT_ID];
    let seatedIndex = bot ? TAVERN_ENCOUNTERS.findIndex(e => e.name === bot.name) : -1;
    let seated = seatedIndex >= 0 ? { ...TAVERN_ENCOUNTERS[seatedIndex], number: seatedIndex + 1 } : { ...encounter, number: room.tavernRun.encounterIndex + 1 };
    return {
        encounterNumber: room.tavernRun.encounterIndex + 1,
        seated,
        totalEncounters: TAVERN_ENCOUNTERS.length,
        place: placeOf(room).name,
        enemy: encounter,
        roundEffect: room.tavernRun.roundEffect || null, // this round's Curse, Devil or Mind Whip (see beginTavernRound)
        devilCap: BALANCE.devilCap,
        maskReady: hasKeepsake(room, 'marthasMask') && !room.tavernRun.encounterKeepsakeUses.marthasMask,
        keepsakes: room.tavernRun.keepsakes,
        pendingKeepsakeChoices: room.tavernRun.pendingKeepsakeChoices,
        purse: room.tavernRun.purse,
        shelf: room.tavernRun.shelf.map(shelfView(room.tavernRun)),
        shelfSize: shelfSizeOf(room),
        shop: room.tavernRun.shop ? { stock: room.tavernRun.shop.stock.map(id => ({ ...thonicView(id), price: thonicPrice(room.tavernRun, id) })), free: !!room.tavernRun.shop.free, first: !!room.tavernRun.shop.first, keepsakes: (room.tavernRun.shop.keepsakes || []).map(keepsakeForSale) } : null,
        prices: { shrine: shrinePrice(room.tavernRun), hotTub: hotTubPrice(room.tavernRun), bard: bardPrice(room.tavernRun), elfBars: Object.fromEntries(ELF_BARS.map(id => [id, thonicPrice(room.tavernRun, id)])) },
        cloud: !!room.tavernRun.cloud,
        maxKeepsakes: MAX_KEEPSAKES, // Cotton Candy Cloud: the opponent can't see your score this round
        // The Bard's song for this fight: Inspiring Song ('ready' until your first throw, 'now' while
        // that throw can be thrown again) or Cutting Words (until it lands); nextSong: bought for the next.
        bard: {
            song: room.tavernRun.song === 'ready' ? 'ready' : room.tavernRun.song && room.turn && room.tavernRun.song === room.turn.key && room.turn.rollCount === 1 ? 'now' : null,
            words: !!room.tavernRun.cuttingWords,
            nextSong: room.tavernRun.nextFightSong || null
        },
        // Sworn to Kram: this fight (now) and how many more after it (more).
        kram: { now: !!room.tavernRun.kram, more: room.tavernRun.kramFights || 0 },
        thomMet: !!room.tavernRun.thomMet, // you've been to Thom's cart this run
        interlude: room.tavernRun.interlude,
        lastWin: room.tavernRun.lastWin,
        nextFightHearts: room.tavernRun.nextFightHearts,
        ladysGrace: !!room.tavernRun.ladysGrace,
        // The hot tub's surge on one of your dice, this fight (tubSurge) or the next (nextSurge).
        tubSurge: room.tavernRun.tubSurge ? { id: room.tavernRun.tubSurge, die: HOT_TUB_DIE, ...HOT_TUB_SURGES[room.tavernRun.tubSurge] } : null,
        nextSurge: room.tavernRun.nextFightSurge || null,
        abilityUsed: room.tavernRun.abilityUsed,
        abilityMax: seated.ability ? BALANCE.abilityUses[seated.ability] : 0, // uses a fight (the seated opponent's)
        jaguarPhase: room.tavernRun.jaguarPhase || null, // Jaguar's: 'talk', 'cloak' or 'allIn'
        clearEye: !!room.tavernRun.clearEyeArmed, // a Clear-Eye is waiting for the next ability
        abilityLeft: !!encounterAbilityLeft(room),
        abilityRound: room.tavernRun.abilityRound,
        encounterRound: room.tavernRun.encounterRound,
        encounterKeepsakeUses: room.tavernRun.encounterKeepsakeUses,
        stats: room.tavernRun.stats,
        runComplete: room.tavernRun.runComplete
    };
}

// ---- Turns ----
// The server owns the dice. Browsers ask to roll, lock or end; the server decides
// what happens and broadcasts the result, so every screen shows the same board.

function isBotRoom(roomCode) {
    return roomCode.startsWith('COMP') || roomCode.startsWith('TVRN');
}

function getTurnKey(room) {
    let id = room.roundPlayers[room.currentTurnIndex];
    if (!id || !room.players[id]) return null;
    return `${room.turnEpoch}:${room.roundNumber}:${room.currentTurnIndex}:${id}`;
}

// A classic table needs two players; a tavern table pauses while a keepsake is chosen.
function isTurnPlayable(roomCode) {
    let room = rooms[roomCode];
    if (!room || !room.turn || room.turn.ended) return false;
    if (room.mode === 'tavern-crawl' && (room.tavernRun.pendingKeepsakeChoices || room.tavernRun.shop || room.tavernRun.interlude)) return false;
    return isBotRoom(roomCode) || room.playerOrder.length >= 2;
}

// Starts a fresh turn whenever the current player changes.
function syncTurn(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;
    let key = getTurnKey(room);
    if (!key) { room.turn = null; return; }
    if (room.turn && room.turn.key === key) return;

    room.turn = Rules.createTurn(room.roundPlayers[room.currentTurnIndex]);
    room.turn.key = key;
    room.turn.busyUntil = 0;
    room.turn.ended = false;
    if (room.mode === 'tavern-crawl' && room.turn.playerId === BOT_ID) {
        let run = room.tavernRun;
        // Klarg starts his turn with the die he snatched from you, already kept.
        if (run.klargHand) {
            Object.assign(room.turn.dice[0], { value: run.klargHand, status: Rules.STATUS.LOCKED });
            room.turn.klargDie = 0;
            run.klargHand = null;
        }
        if (run.jaguarPhase === 'cloak') room.turn.cloaked = true;
    }
    if (room.turn.playerId === BOT_ID && isTurnPlayable(roomCode)) {
        botLater(roomCode, key, Math.max(1000, Math.round(momentsLeft(room) / TIME_SCALE) + 300), () => runBotRoll(roomCode));
    }
}

function emitTurn(roomCode, event = null) {
    let room = rooms[roomCode];
    if (!room) return;
    io.to(roomCode).emit('turnState', { turn: Rules.viewTurn(room.turn), event });
}

function emitState(roomCode) {
    syncTurn(roomCode);
    io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
    emitTurn(roomCode);
}

function sendBotReaction(roomCode, emoji, times = 3) {
    let room = rooms[roomCode];
    if (!room || room.mode === 'tavern-crawl') return;
    for (let i = 0; i < times; i++) {
        setTimeout(() => io.to(roomCode).emit('receiveReaction', { name: 'The Molar', emoji }), delay(i * 300));
    }
}

function applyTavernRollAbilities(roomCode, room, turn) {
    if (room.mode !== 'tavern-crawl') return [];
    let run = room.tavernRun;
    let encounter = TAVERN_ENCOUNTERS[run.encounterIndex];
    let moves = [];
    let effect = run.roundEffect;
    let mine = turn.playerId !== BOT_ID;
    let active = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE);
    // (Three 6s the Devil ability forces: its own moment has just played, so no "Devil's titties" after it.)
    let sixes = () => { shuffled(active).slice(0, 3).forEach(d => { d.value = 6; }); turn.abilitySixes = true; };

    // The Duke's Sympathy for the Devil (or Martha in his face): it waits until he has kept a 2
    // and a 4 with three dice still to throw; that throw comes up three 6s, and the player can't
    // score above devilCap this round (capped when the round is judged if they played first).
    let kept = turn.dice.filter(d => d.status !== Rules.STATUS.ACTIVE && d.status !== Rules.STATUS.STOLEN).map(d => d.value);
    // (Not in a round the player's mask already claimed.)
    if (!mine && run.pendingDevil && !run.roundEffect && kept.includes(2) && kept.includes(4) && active.length >= 3) {
        let as = run.pendingDevil.as;
        run.pendingDevil = null;
        if (fireTavernAbility(roomCode, room, encounter, encounter.ability)) {
            sixes();
            run.roundEffect = { kind: 'devil', by: 'opponent', ability: 'devil', as, landed: true };
            moves.push(...disguiseMoves(room, run.roundEffect));
            moves.push(roundEffectMove(room, run.roundEffect, ROUND_EFFECT_TEXT.devil.opponent));
        }
    }

    // Martha's mask: the player's Devil comes up three 6s on the next throw after it's worn
    // (before the first roll, or mid-turn with three or more dice to throw).
    if (mine && effect && effect.kind === 'devil' && effect.by === 'player' && !effect.landed && active.length >= 3) {
        effect.landed = true;
        sixes();
    }
    // Klarg (since 25 Oct): he waits for a throw showing a 2 or 4 you still need, snatches it and
    // keeps it for his own hand (syncTurn puts it in his next turn).
    if (mine && encounter && encounter.keepsStolen && FINAL_SHIP.klargWaits) {
        let keptNow = turn.dice.filter(d => d.status !== Rules.STATUS.ACTIVE && d.status !== Rules.STATUS.STOLEN).map(d => d.value);
        let inPlayNow = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE);
        let showing = inPlayNow.some(d => (d.value === 2 && !keptNow.includes(2)) || (d.value === 4 && !keptNow.includes(4)));
        if (showing && inPlayNow.length >= 2 && fireTavernAbility(roomCode, room, encounter, 'reachAround')) {
            let stolen = Rules.stealHighestActiveDie(turn);
            if (stolen) {
                run.klargHand = stolen.value;
                moves.push({ name: encounter.name, ability: Rules.ABILITY_NAMES.reachAround, text: `Klarg snatches your ${stolen.value} and keeps it for his own hand.` });
            }
        }
    }
    // Rokr's Written in the Stars: this throw's marked faces bind the dice that land on them (they
    // can't be kept this throw); if every die in play is bound, the throw is free. The next
    // throw's marks are drawn at once, so they show before you roll.
    if (mine && turn.stars) {
        turn.marks = turn.nextMarks || twoFaces();
        let inPlayNow = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE);
        let bound = inPlayNow.filter(d => turn.marks.includes(d.value));
        turn.boundIds = bound.map(d => d.id);
        if (bound.length && bound.length === inPlayNow.length) turn.freeRoll = true;
        turn.nextMarks = twoFaces();
    }
    if (turn.rollCount !== 1 || !mine) return moves;

    // Frak's Mind Whip: he makes the player keep one of their dice, at random (Rules.mindWhip).
    // Spent only now, as it lands, so his mark flashes with it (not as the round began).
    if (run.pendingMind && !run.roundEffect && active.length > 1) {
        let as = run.pendingMind.as;
        run.pendingMind = null;
        if (fireTavernAbility(roomCode, room, encounter, encounter.ability)) {
            run.roundEffect = { kind: 'mind', by: 'opponent', ability: 'mindWhip', as, landed: true };
            let die = Rules.mindWhip(turn, n => crypto.randomInt(0, n));
            moves.push(...disguiseMoves(room, run.roundEffect));
            if (die) moves.push(roundEffectMove(room, run.roundEffect, 'He keeps one of your dice for you. You may keep others too.'));
        }
    }

    let inPlay = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).length;
    if (inPlay > 1 && !(encounter.keepsStolen && FINAL_SHIP.klargWaits) && fireTavernAbility(roomCode, room, encounter, 'reachAround')) {
        Rules.stealHighestActiveDie(turn);
        moves.push({ name: encounter.name, ability: Rules.ABILITY_NAMES.reachAround, text: 'Klarg uses Reach Around and steals one die.' });
    }
    if (fireTavernAbility(roomCode, room, encounter, 'constellationBlur')) {
        turn.blurActive = true;
        moves.push({ name: encounter.name, ability: Rules.ABILITY_NAMES.constellationBlur, text: 'Rokr blurs the dice with constellations.' });
    }
    return moves;
}

// Stason's Flourish, as his turn's first throw begins: the whole turn, each die rolls twice
// (flourishFace). Returns the move to show, or null.
function startFlourish(roomCode, room, turn) {
    if (room.mode !== 'tavern-crawl' || turn.playerId !== BOT_ID || turn.rollCount !== 0) return null;
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    if (!fireTavernAbility(roomCode, room, encounter, 'flourish')) return null;
    turn.flourish = true;
    return { name: encounter.name, ability: Rules.ABILITY_NAMES.flourish, text: 'This turn every die he throws rolls twice, and he keeps the better.' };
}

// Rokr's Written in the Stars, as your turn's first throw begins: the whole turn, two faces are
// marked before each throw (applyTavernRollAbilities). Returns the move to show, or null.
function startStars(roomCode, room, turn) {
    if (room.mode !== 'tavern-crawl' || turn.playerId === BOT_ID || turn.rollCount !== 0) return null;
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    if (!fireTavernAbility(roomCode, room, encounter, 'writtenInStars')) return null;
    turn.stars = true;
    turn.nextMarks = twoFaces();
    return { name: encounter.name, ability: Rules.ABILITY_NAMES.writtenInStars, text: `This turn the stars mark two faces before every throw. Dice that land on them can't be kept. First: ${turn.nextMarks.join(' and ')}.` };
}

// Sylvester's Back of the Head (id suckerPunch, as in the simulator): as you keep your last die
// on a hand that counts, he knocks your best kept die loose and you roll it again
// (Rules.putBackDie). The event 'punched' tells browsers to drop taps they're still showing.
// Returns true if he did.
function suckerPunch(roomCode, room) {
    let turn = room.turn;
    if (room.mode !== 'tavern-crawl' || !turn || turn.playerId === BOT_ID || !turn.finalized || turn.outcome.busted) return false;
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    if (!fireTavernAbility(roomCode, room, encounter, 'suckerPunch')) return false;
    let die = Rules.bestKeptDie(turn);
    Rules.putBackDie(turn, die.id, { mustRoll: true }); // it has to be rolled, not kept again
    emitTurn(roomCode, { type: 'punched', die: die.id });
    sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES.suckerPunch, text: `A punch to the back of the head knocks your ${die.value} loose. Roll it again.` });
    return true;
}

// A die kept: the server's answer to everyone, after Sylvester has had his chance.
function emitKept(roomCode, result) {
    let room = rooms[roomCode];
    if (result.finalizedNow && suckerPunch(roomCode, room)) return;
    emitTurn(roomCode, result.finalizedNow ? { type: 'finalized', outcome: room.turn.outcome } : { type: 'toggle' });
}

// Returns the roll's animation length in ms, or 0 if the roll wasn't allowed.
// Dice thrown again mid-turn (Fizzy, the Bard's Inspiring Song): they tumble like any roll, once
// the moments ahead of them have gone (only those dice are thrown).
function throwAgain(roomCode, room, turn, rerolled) {
    let animationMs = 500;
    let lead = momentsLeft(room), key = turn.key;
    turn.busyUntil = Date.now() + lead + delay(animationMs);
    let thrown = { turn: Rules.viewTurn(turn), preRollCallout: null, suspense: Rules.SUSPENSE.NONE, devil: false, animationMs, throwSeed: crypto.randomInt(0, 2 ** 31), rerolled, ghosts: turn.ghosts && turn.ghosts.length ? turn.ghosts : undefined };
    setTimeout(() => {
        if (rooms[roomCode] === room && room.turn && room.turn.key === key) io.to(roomCode).emit('diceRolled', thrown);
    }, lead);
}

// The Bard's songs (a spot at the Yawning Portal), each for the next fight.
const BARD_SONGS = [
    { id: 'cuttingWords', name: 'Cutting Words', text: `Your opponent's first hand that counts next fight scores ${INTERLUDE.cuttingWords ?? 3} less.` },
    { id: 'inspiringSong', name: 'Inspiring Song', text: 'Your first throw of the next fight: throw it again if you don\'t like it.' }
];

function performRoll(roomCode) {
    let room = rooms[roomCode];
    if (!isTurnPlayable(roomCode)) return 0;
    let turn = room.turn;
    if (Date.now() < turn.busyUntil) return 0;

    let signatureMoves = [];
    let preRollCallout = null;
    room.rollMoments = []; // moments raised while the dice are thrown wait until they land
    let flourish = Rules.canRoll(turn) ? startFlourish(roomCode, room, turn) : null;
    let stars = Rules.canRoll(turn) ? startStars(roomCode, room, turn) : null;
    // The Bard's Inspiring Song waits for your first throw of the fight; after it, it's gone.
    let run = room.mode === 'tavern-crawl' ? room.tavernRun : null;
    let firstThrow = run && turn.playerId !== BOT_ID && run.song === 'ready' && !turn.hasRolled;
    // (Watermelon Hindsight throws these again.)
    let thrownNow = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).map(d => d.id);
    let songGone = run && turn.playerId !== BOT_ID && run.song && run.song !== 'ready' && Rules.canRoll(turn);
    if (songGone) run.song = null;
    let result = Rules.rollTurn(turn, {
        rollFace: rollFaceFor(room, turn),
        onRolled: t => {
            preRollCallout = t.callout;
            signatureMoves = applyTavernRollAbilities(roomCode, room, t);
        }
    });
    let moments = room.rollMoments;
    room.rollMoments = null;
    if (!result) return 0;
    if (firstThrow) run.song = turn.key;
    turn.lastThrown = thrownNow;
    // (The strip's song lights up, or goes out: the browsers hear of it.)
    if (firstThrow || songGone) emitState(roomCode);
    if (flourish) signatureMoves.unshift(flourish);
    if (stars) signatureMoves.unshift(stars);
    // The abilities this throw brings play first, banner and effect, and the dice are thrown once
    // they (and anything still on screen, like the round's result) have gone. Only Klarg waits
    // for the dice: his hand takes one that has landed.
    let afterLanding = signatureMoves.filter(move => move.ability === Rules.ABILITY_NAMES.reachAround);
    let first = [...signatureMoves.filter(move => !afterLanding.includes(move)).map(move => ['signatureMove', move]), ...moments];
    first.forEach(([event, data]) => sendMoment(roomCode, event, data));
    if (first.length) io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
    let lead = momentsLeft(room);

    // Browsers show the pre-roll announcement while the dice tumble, then the final board.
    let animationMs = result.suspense !== Rules.SUSPENSE.NONE ? 2000 : 500;
    turn.busyUntil = Date.now() + lead + delay(animationMs);
    let key = turn.key;
    // throwSeed lets every screen simulate the identical tumble (the values are already decided).
    let abilitySixes = !!turn.abilitySixes;
    turn.abilitySixes = false;
    let thrown = { turn: Rules.viewTurn(turn), preRollCallout, suspense: result.suspense, devil: result.devil && !abilitySixes, animationMs, throwSeed: crypto.randomInt(0, 2 ** 31), ghosts: turn.ghosts && turn.ghosts.length ? turn.ghosts : undefined };
    let afterMoments = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());
    afterMoments(lead, () => {
        if (rooms[roomCode] !== room || !room.turn || room.turn.key !== key) return;
        io.to(roomCode).emit('diceRolled', thrown);
    });
    // (In the bot's and the game's own time from here: the lead in unscaled ms.)
    let leadMs = Math.round(lead / TIME_SCALE);

    if (result.devil && isBotRoom(roomCode)) botLater(roomCode, key, leadMs + animationMs, () => sendBotReaction(roomCode, 'hood'));
    if (afterLanding.length) {
        setTimeout(() => {
            if (!rooms[roomCode]) return;
            afterLanding.forEach(move => sendMoment(roomCode, 'signatureMove', move));
            io.to(roomCode).emit('gameStateUpdate', getRoomState(roomCode));
        }, lead + delay(animationMs));
    }

    // The last die has nothing to choose: once it lands it goes into its slot by itself.
    // The player still presses End Turn.
    let stillActive = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE);
    if (stillActive.length === 1) {
        let lastDieId = stillActive[0].id;
        setTimeout(() => {
            if (rooms[roomCode] !== room || !room.turn || room.turn.key !== key) return;
            let result = Rules.toggleDie(room.turn, lastDieId);
            if (result) emitKept(roomCode, result);
        }, lead + delay(animationMs));
    }
    return leadMs + animationMs;
}

function performToggle(roomCode, dieId) {
    let room = rooms[roomCode];
    if (!isTurnPlayable(roomCode)) return;
    let turn = room.turn;
    if (Date.now() < turn.busyUntil) return;

    let result = Rules.toggleDie(turn, dieId);
    if (!result) return;
    emitKept(roomCode, result);
}

function performEndTurn(roomCode) {
    let room = rooms[roomCode];
    if (!isTurnPlayable(roomCode) || !room.turn.finalized) return;
    room.turn.ended = true;

    let currentId = room.roundPlayers[room.currentTurnIndex];
    let { score, busted } = room.turn.outcome;
    if (room.turn.steady && busted) { busted = false; score = Rules.scoreDice(room.turn.dice).score; } // Steady Thonic: the dice score as they lie
    // Jaguar drank the Steady he talked off your shelf: his dust scores as it lies.
    if (room.mode === 'tavern-crawl' && currentId === BOT_ID && busted && room.tavernRun.jaguarSteady) {
        room.tavernRun.jaguarSteady = false;
        busted = false;
        score = Rules.scoreDice(room.turn.dice).score;
    }
    room.players[currentId].score = score;
    room.players[currentId].busted = busted;

    if (room.mode === 'tavern-crawl') {
        let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
        let effect = room.tavernRun.roundEffect;
        let cursed = !!effect && effect.kind === 'curse';
        if (BALANCE.devilCap != null && effect && effect.kind === 'devil' && (effect.by === 'player') === (currentId === BOT_ID) && !busted && score > BALANCE.devilCap) {
            score = BALANCE.devilCap;
            room.players[currentId].score = score;
        }
        if (currentId === BOT_ID && !cursed && room.players[currentId].lives <= 1 && !busted && score >= 16 && score < 24 && fireTavernAbility(roomCode, room, encounter, 'deadeye24')) {
            room.players[currentId].score = 24;
            sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: 'The Ace of Spades', text: 'The Hangman fires The Ace of Spades. Perfect 24.' });
            io.to(roomCode).emit('displayMessage', { text: 'The Hangman fires The Ace of Spades.', color: "#ffd54f" });
        }
        // The Bard's Cutting Words: the opponent's first hand that counts this fight loses some
        // points (not in a cursed round, where a lower score would help them).
        if (currentId === BOT_ID && !cursed && !busted && room.players[BOT_ID].score > 0 && room.tavernRun.cuttingWords) {
            room.tavernRun.cuttingWords = false;
            let off = INTERLUDE.cuttingWords ?? 3;
            let was = room.players[BOT_ID].score;
            score = room.players[BOT_ID].score = Math.max(0, was - off);
            sendMoment(roomCode, 'keepsakeActivated', { id: 'cuttingWords', name: 'Cutting Words', text: `${encounter.name}'s ${was} becomes ${score}.`, who: 'The Bard' });
        }

        // The Hangman's Dead Eye: he shoots your best scoring die (not the 2 and 4 you need) and it
        // rolls again (FINAL_SHIP.deadEyeRerolls; otherwise it goes to a 1).
        if (currentId !== BOT_ID && !cursed && !busted && score > 0 && fireTavernAbility(roomCode, room, encounter, 'deadEye')) {
            let shot = scoringDice(room.turn).sort((a, b) => b.value - a.value)[0];
            if (shot) {
                let was = shot.value;
                shot.value = FINAL_SHIP.deadEyeRerolls ? rollFace() : 1;
                score = Rules.scoreDice(room.turn.dice).score;
                room.turn.outcome = { ...room.turn.outcome, score };
                room.players[currentId].score = score;
                sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES.deadEye, text: `The Hangman shoots your ${was}. It rolls again: ${shot.value}.`, die: shot.id, from: was, to: shot.value });
                emitTurn(roomCode, { type: 'shot', die: shot.id });
            }
        }
        // Jaguar, when your shelf was empty: he talks 3 off your finished hand instead.
        if (currentId !== BOT_ID && !cursed && !busted && score > 0 && room.tavernRun.talkThree) {
            room.tavernRun.talkThree = false;
            let off = FINAL_SHIP.talkThreeWhenEmpty ?? 3;
            score = Math.max(0, score - off);
            room.players[currentId].score = score;
            sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES.jaguarPhases, text: `Jaguar smiles. Smooth Talk knocks ${off} from your finished hand.` });
        }

        if (currentId !== BOT_ID && !cursed && !busted && score > 0 && fireTavernAbility(roomCode, room, encounter, 'smoothTalk')) {
            room.players[currentId].score = Math.max(0, score - 3);
            sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: 'Smooth Talk', text: 'Jaguar smiles and worsens your finished hand.' });
            io.to(roomCode).emit('displayMessage', { text: 'Jaguar smiles. Smooth Talk knocks 3 from your finished hand.', color: "#ffb74d" });
        }

        if (currentId !== BOT_ID && room.players[currentId].score === 24 && room.tavernRun.stats) {
            room.tavernRun.stats.perfect24s++;
            room.tavernRun.stats.perfectGold += GOLD.perfect24;
            room.tavernRun.purse += GOLD.perfect24;
        }
    }

    // A 24 restores a life, up to what the player started with (a Tavern Crawl opponent: up to
    // their own lives for the fight). An opponent's 24 must be rolled: the Hangman's Ace of
    // Spades makes one that doesn't heal him (`score` is the hand before the Ace).
    let maxLives = room.mode === 'tavern-crawl' && currentId === BOT_ID ? TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].lives : room.startingLives;
    let natural = currentId !== BOT_ID || score === 24;
    // Brodor's Sunglasses: your finished 23 heals too.
    let shades = currentId !== BOT_ID && room.players[currentId].score === 23 && !busted && hasKeepsake(room, BRODORS_SUNGLASSES.id);
    if (natural && (room.players[currentId].score === 24 || shades) && room.players[currentId].lives < maxLives) {
        room.players[currentId].lives = Math.min(maxLives, room.players[currentId].lives + 1);
        if (shades) emitKeepsakeActivated(roomCode, room, BRODORS_SUNGLASSES.id, 'A 23 restores a heart.');
        io.to(roomCode).emit('displayMessage', { text: '+1 Life Restored!', color: "#aed581" });
    }

    advanceTurn(roomCode);
}

// Moves to the next connected player, or scores the round if everyone has gone.
function advanceTurn(roomCode) {
    let room = rooms[roomCode];
    room.currentTurnIndex++;
    skipDisconnectedPlayers(room);

    if (room.currentTurnIndex >= room.roundPlayers.length) {
        evaluateRound(roomCode);
    } else {
        emitState(roomCode);
    }
}

// After the reconnect grace: if the player whose turn it is still hasn't come back and
// others are waiting on them, their turn is dust and play moves on. With nobody else
// connected there's no rush; the table just waits (and is cleared if no one returns).
function forfeitIfStillAway(roomCode, room, token) {
    if (rooms[roomCode] !== room) return;
    let id = room.roundPlayers[room.currentTurnIndex];
    let player = room.players[id];
    if (!player || player.token !== token || player.connected) return;
    if (!anyHumanConnected(room)) return;
    player.busted = true;
    player.score = 0;
    if (room.turn) room.turn.ended = true;
    advanceTurn(roomCode);
}

function skipDisconnectedPlayers(room) {
    while (room.roundPlayers[room.currentTurnIndex] && !room.players[room.roundPlayers[room.currentTurnIndex]].connected) {
        room.players[room.roundPlayers[room.currentTurnIndex]].busted = true;
        room.players[room.roundPlayers[room.currentTurnIndex]].score = 0;
        room.currentTurnIndex++;
    }
}

function anyHumanConnected(room) {
    return Object.values(room.players).some(p => p.connected && p.id !== BOT_ID);
}

// Runs `fn` after `ms` unless the room is gone or the turn has moved on. The bot doesn't
// play to an empty room: it pauses, and resumeBot picks up when someone comes back.
function botLater(roomCode, key, ms, fn) {
    let room = rooms[roomCode];
    setTimeout(() => {
        let current = rooms[roomCode];
        if (current !== room || !current.turn || current.turn.key !== key) return;
        if (!anyHumanConnected(room)) { room.botPaused = true; return; }
        fn();
    }, delay(ms));
}

// Carries on a bot turn that paused while everyone was away.
function resumeBot(roomCode) {
    let room = rooms[roomCode];
    if (!room || !room.botPaused) return;
    room.botPaused = false;
    let turn = room.turn;
    if (!turn || turn.playerId !== BOT_ID || turn.ended) return;
    if (turn.finalized) botLater(roomCode, turn.key, 1500, () => performEndTurn(roomCode));
    else if (turn.hasRolled) botLater(roomCode, turn.key, 1000, () => runBotDecision(roomCode));
    else botLater(roomCode, turn.key, 1000, () => runBotRoll(roomCode));
}

// Deletes a table once it has had nobody connected for EMPTY_TABLE_GRACE_MS.
function scheduleEmptyTableCleanup(roomCode) {
    let room = rooms[roomCode];
    if (!room || room.cleanupTimer || anyHumanConnected(room)) return;
    room.cleanupTimer = setTimeout(() => {
        room.cleanupTimer = null;
        if (rooms[roomCode] === room && !anyHumanConnected(room)) delete rooms[roomCode];
    }, delay(EMPTY_TABLE_GRACE_MS));
}

function runBotRoll(roomCode) {
    let room = rooms[roomCode];
    let key = room.turn.key;
    let animationMs = performRoll(roomCode);
    if (animationMs) botLater(roomCode, key, animationMs + 1000, () => runBotDecision(roomCode));
    // A refused roll (dice still busy) must never leave the bot stuck: think again shortly.
    else if (!room.turn.finalized) botLater(roomCode, key, 1000, () => runBotDecision(roomCode));
}

// What a Tavern Crawl opponent must beat to win the round: the player's finished score, or
// null if they dusted. undefined while the player hasn't finished (or outside a Tavern Crawl),
// so the bot plays on as usual. The opponents know your keepsakes: with Velvet Cushion still
// unused, winning by exactly 1 would only be a tie.
function getTavernScoreToBeat(room) {
    if (room.mode !== 'tavern-crawl') return undefined;
    let humanId = getHumanPlayerId(room);
    let human = humanId && room.players[humanId];
    if (!human || !room.roundPlayers.includes(humanId) || human.score === null) return undefined;
    if (room.tavernRun.cloud) return undefined; // Cotton Candy Cloud: they can't see it, and play for their best
    if (human.busted) return null;
    let cushion = hasKeepsake(room, 'velvetCushion') && !room.tavernRun.encounterKeepsakeUses.velvetCushion;
    let effect = room.tavernRun.roundEffect;
    let cursed = effect && effect.kind === 'curse';
    let score = BALANCE.devilCap != null && effect && effect.kind === 'devil' && effect.by === 'opponent' ? Math.min(human.score, BALANCE.devilCap) : human.score;
    return score + (cushion ? (cursed ? -1 : 1) : 0);
}

// True when a Tavern Crawl opponent can no longer win or tie the round, whatever the dice
// do: the player has finished, and the best this hand can still make (24 with the Hangman's
// shot ready at 16 or more) falls short, or a 2 or 4 is out of reach. `toBeat` is from
// getTavernScoreToBeat: undefined while the player is still to play (never concede then),
// null if the player dusted (any valid hand wins).
// In a cursed round they always play it out; under the player's Devil, their best counts as
// no more than the cap.
function tavernRoundLost(turn, toBeat, aceAt16, { low = false, cap = null } = {}) {
    if (toBeat === undefined || low) return false;
    let best = Rules.bestPossibleScore(turn.dice);
    if (best === null) return true;
    if (aceAt16 && best >= 16) best = 24;
    if (cap !== null) best = Math.min(best, cap);
    return toBeat !== null && best < toBeat;
}

function runBotDecision(roomCode) {
    let room = rooms[roomCode];
    let turn = room.turn;
    let key = turn.key;
    let encounter = room.mode === 'tavern-crawl' ? TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex] : null;
    let enemyId = encounter ? encounter.id : 'molar';
    let toBeat = getTavernScoreToBeat(room);
    // The Molar (solo games) and the whole Ghoul and Gourd play simply (the qualifier, where you
    // learn the game; the user's call, 21 Oct). From the Yawning Portal on, opponents play their best: Strategy works out the keep with the best
    // chance of winning the round (the Hangman counts on his revolver, The Ace of Spades, when he can fire it).
    // A cursed round is played for the fewest points; under the player's Devil the bot's
    // score counts as no more than the cap.
    let effect = room.mode === 'tavern-crawl' ? room.tavernRun.roundEffect : null;
    let round = { low: !!effect && effect.kind === 'curse', cap: effect && effect.kind === 'devil' && effect.by === 'player' ? BALANCE.devilCap ?? null : null };
    let aceAt16 = !!encounter && !round.low && abilitiesOf(encounter).includes('deadeye24') && room.players[BOT_ID].lives <= 1 && canUseTavernAbility(room, encounter, 'deadeye24') && !room.tavernRun.clearEyeArmed;
    let simple = !encounter || encounter.place === 'ghoulAndGourd';
    let toLock = simple ? Rules.planBotLocks(turn, enemyId, toBeat, { low: round.low }) : Strategy.bestKeeps(turn.dice, toBeat, { aceAt16, ...round });
    // The Duke (or Martha in his face) waiting on his Devil keeps only what he needs, so it has
    // three dice to land on (with the simple habits he used to keep 5s and 6s too, and it never fired).
    if (simple && room.mode === 'tavern-crawl' && room.tavernRun.pendingDevil) toLock = Rules.devilWaitLocks(turn);
    // A Tavern Crawl opponent who can no longer win or tie the round doesn't play it out: they
    // keep everything left at once and end the turn.
    let conceding = tavernRoundLost(turn, toBeat, aceAt16, round);
    if (conceding) toLock = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).map(d => d.id);

    // Lock the dice one after another, and only then decide what next. (Separate timers for
    // each lock and the check could fire out of order on a busy server, and a check that ran
    // before the locks found nothing to roll and stopped the bot for good.)
    let lockFrom = i => {
        if (i < toLock.length) {
            performToggle(roomCode, toLock[i]);
            botLater(roomCode, key, conceding ? 120 : 400, () => lockFrom(i + 1));
        } else {
            botLater(roomCode, key, 800, afterLocking);
        }
    };
    let afterLocking = () => {
        if (!turn.finalized) {
            // What they just had to keep may have put the round out of reach: then keep the
            // rest now rather than throw again.
            if (!conceding && tavernRoundLost(turn, toBeat, aceAt16, round)) {
                conceding = true;
                toLock = turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).map(d => d.id);
                lockFrom(0);
                return;
            }
            runBotRoll(roomCode);
            return;
        }
        let { busted, score } = turn.outcome;
        if (busted) sendBotReaction(roomCode, 'swords');
        else if (score === 24) sendBotReaction(roomCode, 'hood');
        else if (score >= 22) sendBotReaction(roomCode, 'shield');
        else if (score <= 17) sendBotReaction(roomCode, 'skull');
        botLater(roomCode, key, 1500, () => performEndTurn(roomCode));
    };
    lockFrom(0);
}

// ---- Tavern Crawl ----

function hasKeepsake(room, keepsakeId) {
    return room.mode === 'tavern-crawl' && room.tavernRun.keepsakes.some(k => k.id === keepsakeId);
}

function getKeepsake(room, keepsakeId) {
    if (!room || room.mode !== 'tavern-crawl') return null;
    return room.tavernRun.keepsakes.find(k => k.id === keepsakeId) || keepsakeById(keepsakeId) || null;
}

function emitKeepsakeActivated(roomCode, room, keepsakeId, text) {
    let keepsake = getKeepsake(room, keepsakeId);
    if (!keepsake) return;
    if (room && room.mode === 'tavern-crawl' && room.tavernRun.stats) {
        room.tavernRun.stats.keepsakesActivated++;
        room.tavernRun.encounterKeepsakeUses = room.tavernRun.encounterKeepsakeUses || {};
        room.tavernRun.encounterKeepsakeUses[keepsakeId] = true;
    }
    sendMoment(roomCode, 'keepsakeActivated', {
        id: keepsakeId,
        name: keepsake.name,
        text: text || keepsake.text
    });
}

function getAbilityUseCount(room, abilityId) {
    let used = room.tavernRun.abilityUsed[abilityId];
    if (used === true) return 1;
    return Number(used || 0);
}

function markAbilityUsed(room, abilityId) {
    room.tavernRun.abilityUsed[abilityId] = getAbilityUseCount(room, abilityId) + 1;
}

// The current opponent's ability still has uses left this fight.
function encounterAbilityLeft(room) {
    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    // (any of them: the Hangman's Ace is still to come once his Dead Eye is spent)
    return encounter && abilitiesOf(encounter).some(a => getAbilityUseCount(room, a) < BALANCE.abilityUses[a]);
}

// The opponent uses their ability: one use is spent, and it happens unless a Clear-Eye Thonic
// is waiting, which cancels it instead. Returns true if the ability goes ahead.
// A cancelled ability still shows (its banner, marked cancelled, without its effect), then the
// Clear-Eye clears it (the user's call, 21 Oct: they used to land at the same instant, often
// while the dice were still in the air).
function fireTavernAbility(roomCode, room, encounter, abilityId) {
    if (!canUseTavernAbility(room, encounter, abilityId)) return false;
    markAbilityUsed(room, abilityId);
    if (!room.tavernRun.clearEyeArmed) return true;
    room.tavernRun.clearEyeArmed = false;
    let name = Rules.ABILITY_NAMES[abilityId];
    emitMoment(roomCode, room, 'signatureMove', { name: encounter.name, ability: name, text: 'A Clear-Eye Thonic saw it coming.', cancelled: true });
    emitMoment(roomCode, room, 'thonicUsed', { id: 'clearEye', name: THONICS.clearEye.name, text: `${name} is cancelled` });
    return false;
}

// A moment for the browsers. During a roll (room.rollMoments) it is held and goes out with the
// roll's other moves, before the dice are thrown (performRoll).
function emitMoment(roomCode, room, event, data) {
    if (room.rollMoments) room.rollMoments.push([event, data]);
    else sendMoment(roomCode, event, data);
}

// What the browsers have on screen. They show one moment at a time (an ability, a keepsake, a
// Thonic, the round's result), MOMENT_GAP_MS apart, each up for its own time, and throw no dice
// until the last has gone (the user's call, 23 Oct: an ability plays in full, banner and effect,
// before the dice are thrown). The server keeps the same clock, so a throw (and the bot's next
// step) waits for it too: momentsLeft.
const MOMENT_GAP_MS = 1700, MOMENT_SHOW_MS = 1850, RESULT_GAP_MS = 1200, RESULT_SHOW_MS = 2600;
const INTRO_SHOW_MS = 4500; // an opponent's entrance (the client's INTRO_MS)
function sendMoment(roomCode, event, data) {
    let room = rooms[roomCode];
    let shown = !(event === 'roundResult' && data && data.ends); // (the end of a fight shows its summary instead)
    if (room && shown) {
        let result = event === 'roundResult';
        let start = Math.max(Date.now(), room.momentNext || 0);
        room.momentNext = start + delay(result ? RESULT_GAP_MS : MOMENT_GAP_MS);
        room.momentEnd = Math.max(room.momentEnd || 0, start + delay(result ? RESULT_SHOW_MS : MOMENT_SHOW_MS));
    }
    io.to(roomCode).emit(event, data);
}
// Real ms until the browsers' last moment has gone.
const momentsLeft = room => Math.max(0, (room.momentEnd || 0) - Date.now());

function canUseTavernAbility(room, encounter, abilityId) {
    let abilityReady = (room.tavernRun.encounterRound || 1) >= (room.tavernRun.abilityRound || 1);
    return encounter && abilitiesOf(encounter).includes(abilityId) && abilityReady && getAbilityUseCount(room, abilityId) < BALANCE.abilityUses[abilityId];
}
// An opponent's abilities: one, or (the Hangman) two.
const abilitiesOf = encounter => encounter.abilities || (encounter.ability ? [encounter.ability] : []);
// How the final tier's abilities play (shared/balance.js; set by simulation, 25 Oct).
const FINAL_SHIP = BALANCE.finalShip || {};
// Two different faces at random (Rokr's stars).
const twoFaces = () => shuffled([1, 2, 3, 4, 5, 6]).slice(0, FINAL_SHIP.starFaces || 2).sort((a, b) => a - b);
// The kept dice that score: all but one 2 and one 4.
function scoringDice(turn) {
    let saw2 = false, saw4 = false;
    return turn.dice.filter(d => d.status !== Rules.STATUS.ACTIVE && d.status !== Rules.STATUS.STOLEN).filter(d => {
        if (d.value === 2 && !saw2) { saw2 = true; return false; }
        if (d.value === 4 && !saw4) { saw4 = true; return false; }
        return true;
    });
}

// ends: this round ended a Tavern Crawl fight (or the run); the browser skips the pop-up then,
// since the fight summary (or the run-over screen) takes its place.
function emitRoundLifeResult(roomCode, room, lifeLosers, tiedPlayers = [], ends = false) {
    let message;
    let activeIds = (room.roundPlayers || []).filter(id => room.players[id]);
    // A player can lose two lives in one round (the Ridgeler's Divine Smite): named once.
    let lost = {};
    lifeLosers.forEach(id => { lost[id] = (lost[id] || 0) + 1; });
    lifeLosers = Object.keys(lost);
    let dustNames = lifeLosers
        .map(id => room.players[id] ? room.players[id].name : 'A player');
    let safeNames = activeIds
        .filter(id => !lifeLosers.includes(id))
        .map(id => room.players[id] ? room.players[id].name : 'A player');
    let resultLines = [
        dustNames.length ? `Dust: ${dustNames.join(', ')}.` : null,
        safeNames.length ? `Safe: ${safeNames.join(', ')}.` : null
    ].filter(Boolean).join('\n');

    if (lifeLosers.length > 0) {
        let names = lifeLosers
            .map(id => room.players[id] ? room.players[id].name : 'A player')
            .join(', ');
        let count = lifeLosers.length === 1 ? lost[lifeLosers[0]] : 0;
        message = `${resultLines}\n${names} lost ${count === 1 ? 'a life' : count > 1 ? `${count} lives` : 'lives'}.\nThe round is over.`;
    } else if (tiedPlayers.length > 1) {
        let names = tiedPlayers
            .map(id => room.players[id] ? room.players[id].name : 'A player')
            .join(' and ');
        message = `${resultLines}\n${names} tied.\nNo lives lost.`;
    } else {
        message = `${resultLines}\nSafe for another round.\nNo lives lost.`;
    }
    sendMoment(roomCode, 'roundResult', { message, ends });
}

function getHumanPlayerId(room) {
    return room.playerOrder.find(id => id !== BOT_ID && room.players[id]);
}

// For testing a particular opponent: TAVERN_START_ENCOUNTER=1 starts runs at Frak, 5 at
// Sylvester, 10 at Klarg, etc.
const TAVERN_START_ENCOUNTER = Math.max(0, Math.min(TAVERN_ENCOUNTERS.length - 1, parseInt(process.env.TAVERN_START_ENCOUNTER, 10) || 0));

function createTavernRun() {
    return {
        encounterIndex: TAVERN_START_ENCOUNTER,
        keepsakes: [],
        pendingKeepsakeChoices: null,
        purse: 0,          // in gold
        bought: {},        // how many of each thing were bought this run (risingPrice)
        shelf: [],
        shop: null,
        interlude: null,   // between fights: { stage, ... } (see startInterlude)
        lastWin: null,     // the fight just won: { defeated, nextEnemy, place, gold: { win, hearts, heartsLeft, perHeart, perPlace }, at }
        nextFightHearts: null, // the next fight starts on other than full hearts (the Stranger's price, the Lady's Favour)
        nextFightSurge: null, // the hot tub's dice surge for the next fight, then tubSurge during it
        tubSurge: null,
        ladysGrace: false,     // the Lady's Grace: the next dust that would cost a heart doesn't
        nextFightSong: null,   // the Bard's song for the next fight ('cuttingWords' or 'inspiringSong')
        song: null,            // Inspiring Song this fight: 'ready', then your first throw's turn key
        cuttingWords: false,   // Cutting Words this fight, until it lands
        puffs: {},             // Elf Bars on the shelf: puffs left, by id
        puffed: {},            // ...and those puffed this fight
        cloud: false,          // Cotton Candy Cloud this round
        kramFights: 0,         // sworn to Kram: fights still to come without 1s
        kram: false,           // ...and this one
        abilityUsed: {},
        abilityRound: 1,
        encounterRound: 1,
        encounterKeepsakeUses: {},
        stats: {
            encountersDefeated: 0,
            livesLost: 0,
            keepsakesActivated: 0,
            perfect24s: 0,
            heartsSpared: 0, // hearts left over all the fights won (points)
            winGold: 0,
            heartGold: 0,
            perfectGold: 0,
            spent: 0,
            eventGold: 0, // won and lost between fights (Shrine, Dice Den, Pickpocket)
            thonicsDrunk: 0
        },
        started: false,
        runComplete: false
    };
}

function getRandomAbilityRound(encounter) {
    if (!encounter || !encounter.ability) return 0;
    return Math.floor(Math.random() * 3) + 1;
}

// The run's score in points (since 23 Oct, the user's call; it was the purse): the opponents
// beaten (by their place), the hearts left at each win, how far a lost run got, and the gold left
// in the purse, converted (BALANCE.points). totalGold: the purse at the end.
function getTavernScoreSummary(room, completedRun = false) {
    let stats = room.tavernRun.stats;
    let beaten = stats.encountersDefeated;
    let fell = !completedRun && beaten < TAVERN_ENCOUNTERS.length;
    let totalGold = Math.max(0, room.tavernRun.purse);
    let breakdown = {
        fights: POINTS.perPlace * beaten * (beaten + 1) / 2, // places 1..beaten
        hearts: POINTS.perHeartLeft * (stats.heartsSpared || 0),
        perfect: POINTS.perPerfect24 * stats.perfect24s,
        reached: fell ? POINTS.reachedPerPlace * (beaten + 1) : 0,
        gold: Math.round(POINTS.perGold * totalGold),
        // and the gold side, for the record
        purse: totalGold, events: stats.eventGold, spent: stats.spent
    };
    let points = breakdown.fights + breakdown.hearts + breakdown.perfect + breakdown.reached + breakdown.gold;
    return {
        points,
        totalGold,
        breakdown,
        lines: [
            `Points: ${points}`,
            `Opponents beaten: ${breakdown.fights}`,
            `Hearts spared: ${breakdown.hearts}`,
            ...(fell ? [`How far you got: ${breakdown.reached}`] : []),
            `Gold left (${goldText(totalGold)}): ${breakdown.gold}`
        ]
    };
}

// Takes a Thonic off the shelf if the player has one. Returns it, or null.
function useThonic(room, thonicId) {
    let shelf = room.tavernRun.shelf;
    let index = shelf.indexOf(thonicId);
    if (index < 0) return null;
    shelf.splice(index, 1);
    room.tavernRun.stats.thonicsDrunk++;
    return THONICS[thonicId];
}

// What the 3D client's end-of-run screen shows: how far the run got and the gold earned.
function getTavernOverSummary(room, humanName, scoreSummary, won) {
    let index = Math.min(room.tavernRun.encounterIndex, TAVERN_ENCOUNTERS.length - 1);
    return {
        won,
        name: humanName,
        defeated: room.tavernRun.stats.encountersDefeated,
        encounters: TAVERN_ENCOUNTERS.map(e => e.name),
        fellTo: won ? null : TAVERN_ENCOUNTERS[index].name,
        points: scoreSummary.points,
        gold: scoreSummary.totalGold,
        breakdown: scoreSummary.breakdown,
        stats: room.tavernRun.stats,
        keepsakes: room.tavernRun.keepsakes.map(k => k.name)
    };
}

function pickKeepsakeChoices(room) {
    let owned = new Set(room.tavernRun.keepsakes.map(k => k.id));
    let pool = TAVERN_KEEPSAKES.filter(k => !owned.has(k.id));
    for (let i = pool.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
}

function resetTavernEncounter(roomCode, keepHumanLives = true) {
    let room = rooms[roomCode];
    if (!room || room.mode !== 'tavern-crawl') return;
    room.startingLives = BALANCE.playerHearts;

    let encounter = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    let humanId = getHumanPlayerId(room);
    room.players[BOT_ID] = {
        id: BOT_ID,
        token: 'BOT_TOKEN',
        name: encounter.name,
        avatar: encounter.avatar,
        lives: encounter.lives,
        score: null,
        busted: false,
        connected: true
    };

    if (humanId && room.players[humanId]) {
        // The Hooded Stranger's price: this one fight starts on fewer hearts.
        room.players[humanId].lives = room.tavernRun.nextFightHearts || room.startingLives;
        room.tavernRun.nextFightHearts = null;
        // The hot tub's surge lasts this one fight.
        room.tavernRun.tubSurge = room.tavernRun.nextFightSurge || null;
        room.tavernRun.nextFightSurge = null;
        // The Bard's song, for this one fight.
        let song = room.tavernRun.nextFightSong;
        room.tavernRun.nextFightSong = null;
        room.tavernRun.song = song === 'inspiringSong' ? 'ready' : null;
        room.tavernRun.cuttingWords = song === 'cuttingWords';
        // Each Elf Bar may be puffed once a fight.
        room.tavernRun.puffed = {};
        room.tavernRun.cloud = false;
        // Fealty to Kram: each fight sworn takes one off the count.
        room.tavernRun.kram = room.tavernRun.kramFights > 0;
        if (room.tavernRun.kram) room.tavernRun.kramFights--;
        room.players[humanId].score = null;
        room.players[humanId].busted = false;
        room.playerOrder = [humanId, BOT_ID];
        room.roundPlayers = [humanId, BOT_ID];
    } else {
        room.playerOrder = [BOT_ID];
        room.roundPlayers = [BOT_ID];
    }

    room.currentTurnIndex = 0;
    room.isTieBreaker = false;
    room.dealerIndex = 0;
    room.turnEpoch++;
    room.tavernRun.pendingKeepsakeChoices = null;
    room.tavernRun.abilityUsed = {};
    room.tavernRun.encounterRound = 1;
    room.tavernRun.abilityRound = getRandomAbilityRound(encounter);
    room.tavernRun.encounterKeepsakeUses = {};
    room.tavernRun.clearEyeArmed = false;
    room.tavernRun.started = true;
    // The opponent's entrance first (the name card, INTRO_SHOW_MS): the browsers learn who sits
    // down before anything else, and the round's abilities and the first throw wait until the card
    // has gone (the user's call, 23 Oct: Martha's entrance and her disguise ran together).
    let now = Date.now();
    room.momentNext = Math.max(room.momentNext || 0, now + delay(INTRO_SHOW_MS));
    room.momentEnd = Math.max(room.momentEnd || 0, now + delay(INTRO_SHOW_MS));
    emitState(roomCode);
    beginTavernRound(roomCode, room);
}

// ---- Round effects ----
// Some abilities change a whole round. They're decided as the round begins (beginTavernRound)
// and kept in tavernRun.roundEffect = { kind, by, ability, as?, landed? }:
//   mind   Mind Whip: on the player's first throw Frak makes them keep a random die (Rules.mindWhip)
//   curse  You are Cursed: the lowest valid score wins the round (dust still loses)
//   devil  Sympathy for the Devil: `by` throws three 6s first (and, if devilCap is set, the other side can't score above it)
//   ink    Vaelin's Inkfire Brand: the 6 is burned into the table; the player's dice that land on it roll again (rollFaceFor)
//   smite  The Ridgeler's Divine Smite: if he wins the round, the player loses two hearts (evaluateTavernRound)
// `by` is 'opponent', or 'player' when Martha's mask puts the disguise on you. `as`: whose face
// Martha (or the mask) wears.
const ROUND_ABILITIES = { mindWhip: 'mind', cursed: 'curse', devil: 'devil', inkfire: 'ink', divineSmite: 'smite' };
const DISGUISES = [
    { ability: 'mindWhip', as: 'Frak' },
    { ability: 'cursed', as: 'Danhausen' },
    { ability: 'devil', as: 'Duke Morrigan' }
];

function roundEffectMove(room, effect, text) {
    let humanId = getHumanPlayerId(room);
    let name = effect.by === 'player' ? (humanId ? room.players[humanId].name : 'You') : TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name;
    return { name, ability: Rules.ABILITY_NAMES[effect.ability], text, disguise: effect.as || null };
}

const ROUND_EFFECT_TEXT = {
    curse: { opponent: 'This round the lowest valid score wins.', player: 'This round the lowest valid score wins.' },
    devil: { opponent: 'Three 6s land on the table.', player: 'Three 6s for you.' },
    ink: { opponent: 'The 6 burns into the table. This round your dice that land on it roll again.' },
    smite: { opponent: 'If he wins this round, you lose two hearts.' }
};

function beginTavernRound(roomCode, room) {
    let run = room.tavernRun;
    run.roundEffect = null;
    run.pendingDevil = null;
    run.pendingMind = null;
    run.jaguarSteady = false;
    run.talkThree = false;
    run.cloud = false;
    let encounter = TAVERN_ENCOUNTERS[run.encounterIndex];
    if (!encounter || !encounter.keepsStolen) run.klargHand = null; // (a fight ended with one in his hand)
    if (!encounter || encounter.ability !== 'jaguarPhases') run.jaguarPhase = null;
    if (!encounter || !encounter.ability) return;
    if (encounter.ability === 'jaguarPhases') { beginJaguarRound(roomCode, room, encounter); return; }
    // Brodor's Astral Flood: once he has lost a life, he heals one as a round begins.
    let bot = room.players[BOT_ID];
    if (encounter.ability === 'astralFlood') {
        if (bot && bot.lives < encounter.lives && fireTavernAbility(roomCode, room, encounter, 'astralFlood')) {
            bot.lives++;
            sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES.astralFlood, text: 'He floods the table with light and heals a life.' });
        }
        return;
    }
    let disguise = encounter.ability === 'disguises' ? DISGUISES[crypto.randomInt(0, DISGUISES.length)] : null;
    let ability = disguise ? disguise.ability : encounter.ability;
    if (!ROUND_ABILITIES[ability] || !canUseTavernAbility(room, encounter, encounter.ability)) return;
    // The Devil waits for the Duke's 2 and 4, Mind Whip for the player's first throw
    // (applyTavernRollAbilities); each is spent, and shown, only then.
    if (ability === 'devil') { run.pendingDevil = { as: disguise ? disguise.as : null }; return; }
    if (ability === 'mindWhip') { run.pendingMind = { as: disguise ? disguise.as : null }; return; }
    if (!fireTavernAbility(roomCode, room, encounter, encounter.ability)) return;
    run.roundEffect = { kind: ROUND_ABILITIES[ability], by: 'opponent', ability, as: disguise ? disguise.as : null };
    disguiseMoves(room, run.roundEffect).forEach(move => sendMoment(roomCode, 'signatureMove', move));
    sendMoment(roomCode, 'signatureMove', roundEffectMove(room, run.roundEffect, ROUND_EFFECT_TEXT[run.roundEffect.kind].opponent));
}

// Jaguar Cantona, the final boss, in three phases by his lives left (since 25 Oct):
//   Smooth Talk (3+ lives): once a round, up to abilityUses.jaguarPhases a fight, he talks a Thonic
//     off your shelf and drinks it (Healing heals him, Steady counts his dust as it lies); with
//     your shelf empty he talks talkThreeWhenEmpty off your next finished hand instead.
//   The Cloak (2 lives): he throws after you (cloakThrowsSecond), his dice hidden until his hand is done.
//   All In (his last): whoever loses the round loses two hearts.
const JAGUAR_PHASE_TEXT = {
    cloak: 'Jaguar draws his cloak. He throws after you now, his dice hidden until his hand is done.',
    allIn: 'All In: whoever loses a round loses two hearts.'
};
function beginJaguarRound(roomCode, room, encounter) {
    let run = room.tavernRun;
    let bot = room.players[BOT_ID];
    if (!bot) return;
    let phase = bot.lives >= 3 ? 'talk' : bot.lives === 2 ? 'cloak' : 'allIn';
    let was = run.jaguarPhase;
    run.jaguarPhase = phase;
    if (phase === 'cloak' && FINAL_SHIP.cloakThrowsSecond !== false) {
        let humanId = room.roundPlayers.find(id => id !== BOT_ID);
        if (humanId) room.roundPlayers = [humanId, BOT_ID];
    }
    if (phase !== 'talk') {
        if (phase !== was) sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES[phase], text: JAGUAR_PHASE_TEXT[phase] });
        return;
    }
    if (!fireTavernAbility(roomCode, room, encounter, 'jaguarPhases')) return;
    let shelf = run.shelf;
    let id = (bot.lives < encounter.lives && shelf.includes('healing') && 'healing') || (shelf.includes('steady') && 'steady') || shelf.find(t => !THONICS[t].elf); // (not an Elf Bar)
    if (!id) {
        run.talkThree = true;
        sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES.jaguarPhases, text: `Your shelf is empty, so he'll talk ${FINAL_SHIP.talkThreeWhenEmpty ?? 3} off your finished hand this round.` });
        return;
    }
    shelf.splice(shelf.indexOf(id), 1);
    if (id === 'healing' && bot.lives < encounter.lives) bot.lives++;
    if (id === 'steady') run.jaguarSteady = true;
    let what = id === 'healing' ? ' and heals a life' : id === 'steady' ? ': his dust this round counts as it lies' : '';
    sendMoment(roomCode, 'signatureMove', { name: encounter.name, ability: Rules.ABILITY_NAMES.jaguarPhases, text: `He talks your ${THONICS[id].name} off your shelf and drinks it${what}.`, thonic: id });
}

// Martha's disguise shows first, then the trick she copies (the user's call, 21 Oct).
function disguiseMoves(room, effect) {
    if (!effect.as || effect.by !== 'opponent') return [];
    let martha = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex];
    return [{ name: martha.name, ability: Rules.ABILITY_NAMES.disguises, text: `She takes ${effect.as}'s face.`, disguise: effect.as }];
}

// ---- Saving after each place ----
// The run can be saved at each invitation on to the next place (after Martha, the Yawning
// Portal; after Brodor, the Salty Swallow). The save lives on the player's
// phone, sealed with SAVE_SECRET so it can't be edited; each one opens once (while the server
// runs). Without SAVE_SECRET, saves last only until the server restarts.
const SAVE_SECRET = process.env.SAVE_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SAVE_SECRET && !process.env.GAME_TIME_SCALE) console.log('SAVE_SECRET is not set: saved Tavern Crawl runs last only until the server restarts.');
const SAVE_VERSION = 2; // 2: gold a tenth of before, rising prices (23 Oct)
const openedSaves = new Set();
const keepsakeById = id => BOSS_DROPS[id] || TAVERN_KEEPSAKES.find(k => k.id === id);

function sealSave(room, name) {
    let run = room.tavernRun;
    let data = {
        v: SAVE_VERSION, id: crypto.randomUUID(), at: Date.now(), name,
        encounterIndex: run.encounterIndex, keepsakes: run.keepsakes.map(k => k.id), purse: run.purse,
        shelf: run.shelf, stats: run.stats, ladysGrace: !!run.ladysGrace, lastWin: run.lastWin, bought: run.bought || {}, thomMet: !!run.thomMet,
        kramFights: (run.kramFights || 0) + (run.kram ? 1 : 0), puffs: run.puffs || {}, refusedDrops: run.refusedDrops || []
    };
    let body = Buffer.from(JSON.stringify(data)).toString('base64url');
    let sig = crypto.createHmac('sha256', SAVE_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

// The save's contents, or null if it isn't one of ours, was changed or was opened already.
function openSave(text) {
    if (typeof text !== 'string' || text.length > 20000) return null;
    let [body, sig] = text.split('.');
    if (!body || !sig) return null;
    let expected = crypto.createHmac('sha256', SAVE_SECRET).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let data;
    try { data = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
    if (!data || data.v !== SAVE_VERSION || openedSaves.has(data.id)) return null;
    if (!Number.isInteger(data.encounterIndex) || data.encounterIndex < 0 || data.encounterIndex >= TAVERN_ENCOUNTERS.length) return null;
    openedSaves.add(data.id);
    return data;
}

function restoreRun(room, data) {
    let run = room.tavernRun;
    run.encounterIndex = data.encounterIndex;
    run.keepsakes = (data.keepsakes || []).map(keepsakeById).filter(Boolean);
    run.purse = Math.max(0, Number(data.purse) || 0);
    run.shelf = (data.shelf || []).filter(id => THONICS[id]).slice(0, SHELF_SIZE + KEEPSAKE_NUMBERS.beltSlots);
    run.stats = { ...run.stats, ...(data.stats || {}) };
    run.thomMet = !!data.thomMet;
    run.bought = {};
    Object.entries(data.bought || {}).forEach(([id, n]) => { if (Number.isInteger(n) && n > 0 && n < 100) run.bought[id] = n; });
    run.ladysGrace = !!data.ladysGrace;
    run.refusedDrops = (data.refusedDrops || []).filter(id => BOSS_DROPS[id]);
    run.puffs = {};
    Object.entries(data.puffs || {}).forEach(([id, n]) => { if (THONICS[id] && THONICS[id].elf && Number.isInteger(n) && n > 0 && n <= ELF_BAR_PUFFS) run.puffs[id] = n; });
    run.kramFights = Math.min(INTERLUDE.kramFights || 0, Math.max(0, Number(data.kramFights) || 0));
    run.lastWin = data.lastWin ? { ...data.lastWin, resumed: true } : null; // its summary was shown before the save
}

// After a boss, the invitation on to the next place: their keepsake is yours (Martha's mask,
// Brodor's Sunglasses); go on now, or save and come back. `boss`: who was just beaten.
function invitation(room, name) {
    let boss = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex - 1];
    let drop = boss && BOSS_DROPS[boss.drops];
    // claim: 'open' until you take the boss's keepsake or leave it; full: taking it means giving one up.
    let claim = !drop ? null : hasKeepsake(room, drop.id) ? 'took' : (room.tavernRun.refusedDrops || []).includes(drop.id) ? 'refused' : 'open';
    return {
        stage: 'invitation', place: placeOf(room).name, from: boss ? PLACES[boss.place].name : null,
        boss: boss ? boss.name : null, drop: drop || null, claim, full: pocketsFull(room), save: sealSave(room, name)
    };
}

// ---- Between fights ----
// After a win the run pauses in `tavernRun.interlude` until the player moves on:
// Each walk is one event: the pickpocket strikes, or the Hooded Stranger finds you, or two
// spots catch your eye and you go to one of them (or neither). Then on to the next fight.
//   pickpocket  { steal, roll? }         roll one die: pickpocketCatch or more catches him,
//                                        else he gets away with `steal`; then the next fight
//   choose      { spots: [a, b] }        two spots from the place's list; Thom opens the cart
//   shrine      {}                       light a candle ('pray'): the Lady grants a blessing at random
//   diceDen     { bets, bet?, throws }   bet one of them (or decline), then the player rolls
//                                        two dice and the gambler two; a tie rolls again
//   stranger    { offers, hearts }       a random event, while he has keepsakes left: take one
//                                        (next fight on `hearts`) or turn him down
//   elfKid      { stock, puffs, bought } Johnny Elf Bar (every place): buy Elf Bars for the shelf
//   bard        { songs, price }         the Bard (Yawning Portal): pay for a song for the next fight
//   kram        { fights }               the Cult of Kram (a Yawning Portal event): swear fealty and
//                                        your dice never land on 1 for `fights` fights, or refuse
//   done        { spot, ... }            what happened, until the player moves on

function shuffled(list) {
    let out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        let j = crypto.randomInt(0, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// Keepsakes you don't have that are offered where the run is now (some only from a later place on).
function unownedKeepsakes(room) {
    let owned = new Set(room.tavernRun.keepsakes.map(k => k.id));
    let order = Object.keys(PLACES);
    let here = order.indexOf(TAVERN_ENCOUNTERS[Math.min(room.tavernRun.encounterIndex, TAVERN_ENCOUNTERS.length - 1)].place);
    return TAVERN_KEEPSAKES.filter(k => !owned.has(k.id) && (!k.from || order.indexOf(k.from) <= here));
}

// Two different spots; the Dice Den only if the purse covers its smallest bet. With Thom's
// Loyalty Card, his cart is always one of them.
function pickSpots(room) {
    let purse = room.tavernRun.purse;
    let canBet = purse >= Math.min(...INTERLUDE.diceDenBets);
    // A spot that costs more than the purse holds isn't offered (the Shrine and the hot tub cost
    // gold since 21 Oct).
    let affordable = id => (id !== 'diceDen' || canBet) && (id !== 'shrine' || purse >= shrinePrice(room.tavernRun)) && (id !== 'hotTub' || purse >= hotTubPrice(room.tavernRun)) && (id !== 'bard' || purse >= bardPrice(room.tavernRun)) && (id !== 'elfKid' || purse >= Math.min(...ELF_BARS.map(e => thonicPrice(room.tavernRun, e))));
    let spots = shuffled(placeOf(room).spots.filter(affordable)).slice(0, 2);
    if (hasKeepsake(room, 'loyaltyCard') && !spots.includes('thom')) spots[crypto.randomInt(0, 2)] = 'thom';
    return spots;
}

// Thom's back shelf (since 21 Oct): keepsakes for gold, two at random from those you don't have.
const KEEPSAKE_PRICES = BALANCE.keepsakePrices || {};
const keepsakeForSale = k => ({ ...k, price: KEEPSAKE_PRICES[k.id] });
function pickThomKeepsakes(room) {
    return shuffled(unownedKeepsakes(room).filter(k => KEEPSAKE_PRICES[k.id])).slice(0, BALANCE.thomKeepsakes || 0);
}

// The Hooded Stranger, with keepsakes you don't have yet.
function strangerOffer(room) {
    let offers = shuffled(unownedKeepsakes(room)).slice(0, INTERLUDE.strangerOffers);
    return { stage: 'stranger', offers, hearts: INTERLUDE.strangerHearts };
}

function startInterlude(room, won) {
    let run = room.tavernRun;
    run.lastWin = won;
    let steal = Math.floor(run.purse * INTERLUDE.pickpocketShare);
    if (steal > 0 && crypto.randomInt(0, 100) < INTERLUDE.pickpocketChance) {
        run.interlude = { stage: 'pickpocket', steal, catchOn: INTERLUDE.pickpocketCatch };
    } else if (!pocketsFull(room) && unownedKeepsakes(room).length > 0 && crypto.randomInt(0, 100) < INTERLUDE.strangerChance) {
        run.interlude = strangerOffer(room);
    } else if ((placeOf(room).events || []).includes('darren') && crypto.randomInt(0, 100) < INTERLUDE.darrenChance) {
        run.interlude = { stage: 'darren', smashOn: INTERLUDE.darrenSmash, giftOn: INTERLUDE.darrenGift };
    } else if ((placeOf(room).events || []).includes('kram') && !run.kram && !run.kramFights && crypto.randomInt(0, 100) < INTERLUDE.kramChance) {
        run.interlude = { stage: 'kram', fights: INTERLUDE.kramFights };
    } else {
        run.interlude = { stage: 'choose', spots: pickSpots(room) };
    }
}

// Gold won or lost between fights. The purse never goes below 0. Returns what changed.
function changePurse(run, amount) {
    let applied = Math.max(amount, -run.purse);
    run.purse += applied;
    run.stats.eventGold += applied;
    return applied;
}

// Darren Snakehands knocks into you: one die. Low, a Thonic on your shelf smashes (or you pay
// for the glass); middling, a free Thonic by way of sorry; high, a Thonic and gold.
function darrenOutcome(room, roll) {
    let run = room.tavernRun;
    let freeThonic = () => {
        if (run.shelf.length >= shelfSizeOf(room)) return { gold: changePurse(run, INTERLUDE.darrenFullShelfGold) };
        let id = shuffled(placeOf(room).thomStock)[0];
        run.shelf.push(id);
        return { thonic: thonicView(id) };
    };
    if (roll <= INTERLUDE.darrenSmash) {
        if (run.shelf.length) {
            let [smashed] = run.shelf.splice(crypto.randomInt(0, run.shelf.length), 1);
            return { outcome: 'smash', smashed: thonicView(smashed) };
        }
        return { outcome: 'smash', paid: -changePurse(run, -INTERLUDE.darrenGlass) };
    }
    if (roll <= INTERLUDE.darrenGift) return { outcome: 'gift', ...freeThonic() };
    let gift = freeThonic();
    return { outcome: 'catch', ...gift, gold: (gift.gold || 0) + changePurse(run, INTERLUDE.darrenCatchGold) };
}

// The Dice Den: one throw of two dice each. `won` is null on a tie (they throw again).
function throwDiceDen() {
    let you = [rollFace(), rollFace()], them = [rollFace(), rollFace()];
    let a = you[0] + you[1], b = them[0] + them[1];
    return { you, them, won: a === b ? null : a > b };
}

// From Thom's cart or any point between fights, on to the next fight. Walk on without
// rolling for the pickpocket and he gets away.
function moveOnToNextFight(roomCode) {
    let room = rooms[roomCode];
    let run = room.tavernRun;
    if (run.interlude && run.interlude.stage === 'pickpocket' && !run.interlude.roll) changePurse(run, -run.interlude.steal);
    run.interlude = null;
    run.shop = null;
    resetTavernEncounter(roomCode, true);
    emitState(roomCode);
}

// ---- Rounds ----

function evaluateRound(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;

    if (room.mode === 'tavern-crawl') {
        evaluateTavernRound(roomCode);
        return;
    }

    let losersThisRound = [];
    let tiedPlayers = [];

    let busted = room.roundPlayers.filter(id => room.players[id] && room.players[id].busted);
    busted.forEach(id => {
        room.players[id].lives -= 1;
        losersThisRound.push({ id, reason: 'Dust!' });
    });

    let valid = room.roundPlayers.filter(id => room.players[id] && !room.players[id].busted);
    if (valid.length > 1) {
        let minScore = Math.min(...valid.map(id => room.players[id].score));
        let lowest = valid.filter(id => room.players[id].score === minScore);

        if (lowest.length === 1) {
            room.players[lowest[0]].lives -= 1;
            losersThisRound.push({ id: lowest[0], reason: 'You had the lowest score!' });
        } else if (lowest.length > 1) {
            tiedPlayers = lowest;
        }
    }

    emitRoundLifeResult(roomCode, room, losersThisRound.map(l => l.id), tiedPlayers);

    let humanLost = losersThisRound.some(l => l.id !== BOT_ID);
    if (room.players[BOT_ID] && humanLost) {
        setTimeout(() => sendBotReaction(roomCode, '😉'), delay(1000));
    }

    room.roundPlayers.forEach(id => {
        if (room.players[id]) {
            room.players[id].score = null;
            room.players[id].busted = false;
        }
    });

    let survivors = room.playerOrder.filter(id => room.players[id] && room.players[id].lives > 0);
    if (survivors.length <= 1) {
        let winnerName = survivors.length === 1 ? room.players[survivors[0]].name : "No one";
        // Sync the final scoreboard before ending the game
        emitState(roomCode);
        io.to(roomCode).emit('gameOver', { message: `Game Over! ${winnerName} wins the table! 🏆` });
        room.roundPlayers = [];
    } else if (tiedPlayers.length > 1) {
        room.isTieBreaker = true;
        room.roundNumber++;
        room.roundPlayers = tiedPlayers;
        room.currentTurnIndex = 0;
        skipDisconnectedPlayers(room);

        emitState(roomCode);
        io.to(roomCode).emit('displayMessage', { text: `⚔️ SUDDEN DEATH TIE-BREAKER! ⚔️`, color: "#ffcc80" });

        if (room.currentTurnIndex >= room.roundPlayers.length) evaluateRound(roomCode);
    } else {
        room.isTieBreaker = false;
        room.roundNumber++;

        if (room.playerOrder.length > 0) {
            room.dealerIndex = (room.dealerIndex + 1) % room.playerOrder.length;
        }

        room.roundPlayers = [];
        for (let i = 0; i < room.playerOrder.length; i++) {
            let idx = (room.dealerIndex + i) % room.playerOrder.length;
            let playerId = room.playerOrder[idx];
            if (room.players[playerId] && room.players[playerId].lives > 0) {
                room.roundPlayers.push(playerId);
            }
        }

        room.currentTurnIndex = 0;
        skipDisconnectedPlayers(room);

        emitState(roomCode);
        if (room.currentTurnIndex >= room.roundPlayers.length && room.roundPlayers.length > 0) evaluateRound(roomCode);
    }
}

function evaluateTavernRound(roomCode) {
    let room = rooms[roomCode];
    if (!room) return;

    let humanId = getHumanPlayerId(room);
    let enemyId = BOT_ID;
    if (!humanId || !room.players[humanId] || !room.players[enemyId]) return;

    let human = room.players[humanId];
    let enemy = room.players[enemyId];
    let losersThisRound = [];
    let lifeLosersThisRound = [];
    let tiedPlayers = [];

    let roundPlayers = [humanId, enemyId].filter(id => room.players[id]);
    let busted = roundPlayers.filter(id => room.players[id].busted);
    busted.forEach(id => losersThisRound.push({ id, reason: 'Dust!' }));

    // The Devil's round: the side that didn't play it counts no more than the cap (also when
    // the mask was worn after the opponent had already played). A cursed round: the highest
    // valid score loses.
    let effect = room.tavernRun.roundEffect;
    if (BALANCE.devilCap != null && effect && effect.kind === 'devil') {
        let capped = room.players[effect.by === 'player' ? enemyId : humanId];
        if (!capped.busted) capped.score = Math.min(capped.score, BALANCE.devilCap);
    }
    let cursed = !!effect && effect.kind === 'curse';
    let valid = roundPlayers.filter(id => !room.players[id].busted);
    if (valid.length > 1) {
        let scores = valid.map(id => room.players[id].score);
        let worst = cursed ? Math.max(...scores) : Math.min(...scores);
        let losing = valid.filter(id => room.players[id].score === worst);
        if (losing.length === 1) {
            losersThisRound.push({ id: losing[0], reason: cursed ? 'Highest score in a cursed round.' : 'Lowest score at the table.' });
        } else {
            tiedPlayers = losing;
        }
    }
    room.tavernRun.roundEffect = null;

    if (losersThisRound.length === 1 && losersThisRound[0].id === humanId && !human.busted && !enemy.busted && hasKeepsake(room, 'velvetCushion') && !room.tavernRun.encounterKeepsakeUses.velvetCushion && Math.abs(human.score - enemy.score) === 1) {
        room.tavernRun.encounterKeepsakeUses.velvetCushion = true;
        losersThisRound = [];
        tiedPlayers = [humanId, enemyId];
        emitKeepsakeActivated(roomCode, room, 'velvetCushion', 'Velvet Cushion softens the loss into a tie.');
        io.to(roomCode).emit('displayMessage', { text: 'Velvet Cushion softens the loss into a tie.', color: '#ffd54f' });
    }

    if (tiedPlayers.length > 1 && hasKeepsake(room, 'luckySeat') && !room.tavernRun.encounterKeepsakeUses.luckySeat) {
        room.tavernRun.encounterKeepsakeUses.luckySeat = true;
        tiedPlayers = [];
        losersThisRound.push({ id: enemyId, reason: 'Trap Card breaks the tie your way.' });
        emitKeepsakeActivated(roomCode, room, 'luckySeat', 'Trap Card breaks the tie your way.');
        io.to(roomCode).emit('displayMessage', { text: 'Trap Card breaks the tie your way.', color: '#ffd54f' });
    }

    // The Ridgeler's Divine Smite: if he wins the round, you lose two hearts (each can still be
    // caught by the Shield, the Lady's Grace or Last Gasp).
    if (effect && effect.kind === 'smite' && losersThisRound.length === 1 && losersThisRound[0].id === humanId) {
        losersThisRound.push({ id: humanId, reason: 'Divine Smite.' });
    }
    // Jaguar's All In: the round's loser loses two hearts (each can still be caught as above).
    if (room.tavernRun.jaguarPhase === 'allIn') losersThisRound = losersThisRound.flatMap(loser => [loser, { ...loser, reason: 'All In.' }]);

    losersThisRound.forEach(loser => {
        let player = room.players[loser.id];
        if (!player) return;

        // The Lady's Grace comes before the Shield (the user's call, 21 Oct): a dust she forgives
        // leaves the Shield for later in the fight.
        if (loser.id === humanId && human.busted && room.tavernRun.ladysGrace) {
            room.tavernRun.ladysGrace = false;
            sendMoment(roomCode, 'blessingUsed', { id: 'grace', name: "The Lady's Grace", text: 'The Lady saves you from the dust' });
            return;
        }

        if (loser.id === humanId && hasKeepsake(room, 'bentCopper') && !room.tavernRun.encounterKeepsakeUses.bentCopper) {
            room.tavernRun.encounterKeepsakeUses.bentCopper = true;
            emitKeepsakeActivated(roomCode, room, 'bentCopper', 'Shield protects a life.');
            return;
        }

        if (loser.id === humanId && player.lives <= 1 && useThonic(room, 'lastGasp')) {
            sendMoment(roomCode, 'thonicUsed', { id: 'lastGasp', name: THONICS.lastGasp.name, text: 'You cling on with one heart.' });
            return;
        }

        player.lives -= 1;
        lifeLosersThisRound.push(loser.id);
        if (loser.id === humanId && room.tavernRun.stats) room.tavernRun.stats.livesLost++;
    });

    emitRoundLifeResult(roomCode, room, lifeLosersThisRound, tiedPlayers, human.lives <= 0 || enemy.lives <= 0);

    roundPlayers.forEach(id => {
        if (!room.players[id]) return;
        room.players[id].score = null;
        room.players[id].busted = false;
    });

    if (human.lives <= 0) {
        let reached = room.tavernRun.encounterIndex + 1;
        let scoreSummary = getTavernScoreSummary(room);
        room.roundPlayers = [];
        room.tavernRun.runComplete = true;
        io.emit('leaderboardUpdate', submitTavernLeaderboardScore(human.name, scoreSummary.points, scoreSummary.totalGold));
        emitState(roomCode);
        io.to(roomCode).emit('gameOver', { message: `Game Over\n\nYou reached encounter ${reached} of ${TAVERN_ENCOUNTERS.length} before falling at ${enemy.name}'s table.\n\n${scoreSummary.lines.join('\n')}\n\nWill you ever master the game?`, tavern: getTavernOverSummary(room, human.name, scoreSummary, false) });
        return;
    }

    if (enemy.lives <= 0) {
        let stats = room.tavernRun.stats;
        let winGold = GOLD.winFirst + GOLD.winStep * room.tavernRun.encounterIndex;
        let heartGold = Math.max(0, human.lives) * GOLD.perHeartLeft;
        // The Miser's Purse: 1 more gold for every 10 in the purse (before this win's gold).
        let miserGold = hasKeepsake(room, 'misersPurse') ? Math.floor(room.tavernRun.purse / 10) * (KEEPSAKE_NUMBERS.miserPerTen ?? 1) : 0;
        stats.miserGold = (stats.miserGold || 0) + miserGold;
        room.tavernRun.purse += miserGold;
        stats.encountersDefeated++;
        stats.winGold += winGold;
        stats.heartGold += heartGold;
        stats.heartsSpared = (stats.heartsSpared || 0) + Math.max(0, human.lives);
        room.tavernRun.purse += winGold + heartGold;
        room.tavernRun.encounterIndex++;
        if (room.tavernRun.encounterIndex >= TAVERN_ENCOUNTERS.length) {
            let scoreSummary = getTavernScoreSummary(room, true);
            room.roundPlayers = [];
            room.tavernRun.runComplete = true;
            io.emit('leaderboardUpdate', submitTavernLeaderboardScore(human.name, scoreSummary.points, scoreSummary.totalGold));
            emitState(roomCode);
            io.to(roomCode).emit('gameOver', { message: `${human.name} wins the final aboard the Salty Swallow! From peasant to king, every 2, 4, 24 player will know this run.\n\n${scoreSummary.lines.join('\n')}`, tavern: getTavernOverSummary(room, human.name, scoreSummary, true) });
            return;
        }

        // What the fight paid, for the summary the browser shows before the next event (at: shown once).
        let won = {
            defeated: enemy.name,
            nextEnemy: TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex].name,
            place: room.tavernRun.encounterIndex,
            gold: { win: winGold, hearts: heartGold, heartsLeft: Math.max(0, human.lives), perHeart: GOLD.perHeartLeft, ...(miserGold ? { miser: miserGold } : {}) },
            at: Date.now()
        };
        let beaten = TAVERN_ENCOUNTERS[room.tavernRun.encounterIndex - 1];
        if (beaten.boss) {
            // A boss's keepsake comes with the invitation on to the next place (no events on the way
            // there); since 30 Oct you take it or leave it there (claimDrop).
            let drop = BOSS_DROPS[beaten.drops];
            won.drop = drop || null;
            room.tavernRun.lastWin = won;
            room.tavernRun.interlude = invitation(room, human.name);
        } else {
            // Between fights: one event (see startInterlude).
            startInterlude(room, won);
        }
        room.roundPlayers = [];
        emitState(roomCode);
        io.to(roomCode).emit('offerShop', won); // the fight is won (the name is historical)
        return;
    }

    // The next round waits a moment, so what this round did (its result, the keepsakes that
    // fired) shows before the next round's ability (the user's call, 21 Oct: one thing at a time).
    let epoch = room.turnEpoch;
    setTimeout(() => {
        if (rooms[roomCode] !== room || room.turnEpoch !== epoch) return;
        let humanId = getHumanPlayerId(room); // (a reconnect in the pause gives a new id)
        if (!humanId) return;
        room.roundNumber++;
        room.tavernRun.encounterRound++;
        room.isTieBreaker = tiedPlayers.length > 1;
        // Turns alternate: the player goes first in a fight's odd rounds, the opponent in even ones.
        room.roundPlayers = room.tavernRun.encounterRound % 2 === 1 ? [humanId, enemyId] : [enemyId, humanId];
        room.currentTurnIndex = 0;
        beginTavernRound(roomCode, room);
        emitState(roomCode);
    }, delay(ROUND_PAUSE_MS));
}
const ROUND_PAUSE_MS = 2000;

// ---- Sockets ----

const asText = value => (typeof value === 'string' ? value : '');

io.on('connection', (socket) => {
    socket.emit('leaderboardUpdate', tavernLeaderboard);

    socket.on('checkRoom', (roomCode) => {
        let code = asText(roomCode).trim().toUpperCase() || "PUBLIC";
        socket.emit('roomStatus', { exists: !!rooms[code] });
    });

    socket.on('joinTavern', (data) => {
        if (!data || typeof data !== 'object') return;
        let roomCode = asText(data.roomCode).trim().toUpperCase();
        if (roomCode === "") roomCode = "PUBLIC";
        if (roomCode.length > 10) roomCode = roomCode.substring(0, 10);

        socket.roomCode = roomCode;
        socket.join(roomCode);

        let requestedLives = parseInt(data.startingLives) || 3;
        requestedLives = Math.max(1, Math.min(5, requestedLives));
        if (roomCode.startsWith("TVRN")) requestedLives = 3;

        if (!rooms[roomCode]) {
            let isTavernCrawl = roomCode.startsWith("TVRN");
            rooms[roomCode] = {
                players: {}, playerOrder: [], roundPlayers: [], currentTurnIndex: 0, isTieBreaker: false, isMusicPlaying: false, dealerIndex: 0, roundNumber: 1,
                turnEpoch: 0, turn: null,
                startingLives: requestedLives,
                mode: isTavernCrawl ? 'tavern-crawl' : 'classic',
                tavernRun: isTavernCrawl ? createTavernRun() : null
            };

            if (roomCode.startsWith("COMP")) {
                rooms[roomCode].players[BOT_ID] = {
                    id: BOT_ID, token: 'BOT_TOKEN', name: 'The Molar', avatar: '🦷', lives: requestedLives, score: null, busted: false, connected: true
                };
                rooms[roomCode].playerOrder.push(BOT_ID);
                rooms[roomCode].roundPlayers.push(BOT_ID);
            } else if (isTavernCrawl) {
                rooms[roomCode].players[BOT_ID] = {
                    id: BOT_ID, token: 'BOT_TOKEN', name: 'The Molar', avatar: '🦷', lives: 2, score: null, busted: false, connected: true
                };
                rooms[roomCode].playerOrder.push(BOT_ID);
                rooms[roomCode].roundPlayers.push(BOT_ID);
            }
        }

        let room = rooms[roomCode];
        if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }
        let finalName = asText(data.name).trim();
        if (finalName === "") finalName = "Mysterious Traveler";
        if (finalName.length > 15) finalName = finalName.substring(0, 15);
        let avatar = AVATARS.includes(data.avatar) ? data.avatar : AVATARS[0];
        let token = asText(data.token).substring(0, 64);

        let existingPlayerId = token && Object.keys(room.players).find(id => room.players[id].token === token);

        if (existingPlayerId && existingPlayerId !== BOT_ID) {
            let p = room.players[existingPlayerId];
            p.id = socket.id;
            p.avatar = avatar;
            p.name = finalName;
            p.connected = true;

            room.players[socket.id] = p;

            if (existingPlayerId !== socket.id) {
                delete room.players[existingPlayerId];
                let oldSocket = io.sockets.sockets.get(existingPlayerId);
                if (oldSocket) oldSocket.disconnect(true);
            }

            room.playerOrder = room.playerOrder.map(id => id === existingPlayerId ? socket.id : id);
            room.roundPlayers = room.roundPlayers.map(id => id === existingPlayerId ? socket.id : id);
            if (room.turn && room.turn.playerId === existingPlayerId) {
                room.turn.playerId = socket.id;
                room.turn.key = getTurnKey(room);
            }

        } else {
            room.players[socket.id] = {
                id: socket.id, token, name: finalName, avatar, lives: room.startingLives, score: null, busted: false, connected: true
            };
            room.playerOrder.push(socket.id);

            if (!room.isTieBreaker) {
                if (!room.roundPlayers.includes(socket.id)) room.roundPlayers.push(socket.id);
            }
        }

        let humanPlayers = room.playerOrder.filter(id => id !== BOT_ID && room.players[id] && room.players[id].connected);

        if (room.roundPlayers.length === 0 && humanPlayers.length > 0) {
            room.playerOrder.forEach(id => {
                if (room.players[id]) {
                    room.players[id].lives = room.startingLives;
                    room.players[id].score = null;
                    room.players[id].busted = false;
                }
            });
            room.dealerIndex = 0;
            room.roundPlayers = room.playerOrder.filter(id => room.players[id].connected);
            room.currentTurnIndex = 0;
            room.isTieBreaker = false;
            room.roundNumber = 1;
        }

        if (room.roundPlayers.length === 1 && room.roundPlayers[0] !== BOT_ID) {
            room.currentTurnIndex = 0;
        }

        // A saved run (from an invitation to the next place) carries on at a fresh table: back at the
        // invitation, with a fresh save in case they leave again.
        let fresh = room.mode === 'tavern-crawl' && !room.tavernRun.started;
        let resumed = fresh && data.resume ? openSave(data.resume) : null;
        if (fresh && data.resume && !resumed) socket.emit('resumeFailed');
        if (resumed) {
            restoreRun(room, resumed);
            room.players[socket.id].name = asText(resumed.name).substring(0, 15) || room.players[socket.id].name;
        }

        if (room.mode === 'tavern-crawl' && !room.tavernRun.started) {
            resetTavernEncounter(roomCode, false);
        }
        if (resumed) {
            room.tavernRun.interlude = invitation(room, room.players[socket.id].name);
            room.roundPlayers = [];
        }

        if (room.isMusicPlaying) socket.emit('playGlobalMusic');

        emitState(roomCode);
        resumeBot(roomCode);
    });

    socket.on('playAgain', () => {
        let room = rooms[socket.roomCode];
        if (room && room.roundPlayers.length === 0) {
            // A Tavern Crawl restarts only once the run is over (not while Thom's cart is open).
            if (room.mode === 'tavern-crawl' && !room.tavernRun.runComplete) return;
            room.turnEpoch++;
            if (room.mode === 'tavern-crawl') {
                room.playerOrder.forEach(id => {
                    if (room.players[id]) {
                        room.players[id].lives = room.startingLives;
                        room.players[id].score = null;
                        room.players[id].busted = false;
                        room.players[id].connected = true;
                    }
                });
                room.tavernRun = createTavernRun();
                room.roundNumber = 1;
                resetTavernEncounter(socket.roomCode, false);
                emitState(socket.roomCode);
                io.to(socket.roomCode).emit('triggerNewGameSplash');
                return;
            }

            room.playerOrder.forEach(id => {
                if (room.players[id]) {
                    room.players[id].lives = room.startingLives;
                    room.players[id].score = null;
                    room.players[id].busted = false;
                }
            });

            if (room.playerOrder.length > 0) {
                room.dealerIndex = (room.dealerIndex + 1) % room.playerOrder.length;
            }

            room.roundPlayers = [];
            for (let i = 0; i < room.playerOrder.length; i++) {
                let idx = (room.dealerIndex + i) % room.playerOrder.length;
                let playerId = room.playerOrder[idx];
                if (room.players[playerId] && room.players[playerId].connected) {
                    room.roundPlayers.push(playerId);
                }
            }

            room.currentTurnIndex = 0;
            room.isTieBreaker = false;
            room.roundNumber++;

            emitState(socket.roomCode);
            io.to(socket.roomCode).emit('triggerNewGameSplash');
        }
    });

    socket.on('startGlobalMusic', () => {
        let room = rooms[socket.roomCode];
        if (room && !room.isMusicPlaying) {
            room.isMusicPlaying = true;
            io.to(socket.roomCode).emit('playGlobalMusic');
        }
    });

    socket.on('sendReaction', (emoji) => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode === 'tavern-crawl' || !PLAYER_REACTIONS.includes(emoji)) return;
        let playerName = room.players[socket.id] ? room.players[socket.id].name : "Traveler";
        io.to(socket.roomCode).emit('receiveReaction', { name: playerName, emoji: emoji });
    });

    const isMyTurn = () => {
        let room = rooms[socket.roomCode];
        return !!(room && room.turn && room.turn.playerId === socket.id);
    };

    socket.on('rollDice', () => { if (isMyTurn()) performRoll(socket.roomCode); });
    socket.on('toggleDie', (dieId) => { if (isMyTurn() && Number.isInteger(dieId)) performToggle(socket.roomCode, dieId); });
    socket.on('endTurn', () => { if (isMyTurn()) performEndTurn(socket.roomCode); });

    // Thom's cart: the run's one player buys while it is open.
    const tavernPlayer = () => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode !== 'tavern-crawl' || !room.players[socket.id] || socket.id === BOT_ID) return null;
        return room;
    };

    // Martha's mask: once a fight, wear Danhausen's Curse (before you roll) or the Duke's Devil
    // (any time in your turn with three or more dice to throw: the next throw lands three 6s;
    // the user's call, 21 Oct) for the round (not in a round that already has one).
    socket.on('wearMask', (kind) => {
        let room = tavernPlayer();
        if (!room || (kind !== 'curse' && kind !== 'devil') || !isMyTurn() || !isTurnPlayable(socket.roomCode)) return;
        let run = room.tavernRun;
        let turn = room.turn;
        if (!hasKeepsake(room, MARTHAS_MASK.id) || run.encounterKeepsakeUses.marthasMask || run.roundEffect || turn.finalized || Date.now() < turn.busyUntil) return;
        if (kind === 'curse' ? turn.hasRolled : turn.dice.filter(d => d.status === Rules.STATUS.ACTIVE).length < 3) return;
        run.roundEffect = kind === 'curse'
            ? { kind, by: 'player', ability: 'cursed', as: 'Danhausen' }
            : { kind, by: 'player', ability: 'devil', as: 'Duke Morrigan' };
        emitKeepsakeActivated(socket.roomCode, room, MARTHAS_MASK.id, `You wear ${run.roundEffect.as}'s face. ${ROUND_EFFECT_TEXT[kind].player}`);
        sendMoment(socket.roomCode, 'signatureMove', roundEffectMove(room, run.roundEffect, ROUND_EFFECT_TEXT[kind].player));
        emitState(socket.roomCode);
    });

    socket.on('buyThonic', (thonicId) => {
        let room = tavernPlayer();
        if (!room || !room.tavernRun.shop) return;
        let run = room.tavernRun;
        if (typeof thonicId !== 'string' || !run.shop.stock.includes(thonicId) || !THONICS[thonicId]) return;
        let price = run.shop.free ? 0 : thonicPrice(run, thonicId);
        if (run.purse < price || run.shelf.length >= shelfSizeOf(room)) return;
        run.shop.free = false;
        noteBought(run, thonicId); // (the Loyalty Card's free one counts too)
        run.purse -= price;
        run.stats.spent += price;
        run.shelf.push(thonicId);
        emitState(socket.roomCode);
    });

    // A keepsake from Thom's back shelf. Spent gold counts with the Thonics (stats.spent).
    socket.on('buyKeepsake', (keepsakeId) => {
        let room = tavernPlayer();
        if (!room || !room.tavernRun.shop) return;
        let run = room.tavernRun;
        let shelf = run.shop.keepsakes || [];
        let keepsake = shelf.find(k => k.id === keepsakeId);
        let price = keepsake && KEEPSAKE_PRICES[keepsake.id];
        if (!keepsake || !price || run.purse < price || hasKeepsake(room, keepsake.id) || pocketsFull(room)) return;
        run.purse -= price;
        run.stats.spent += price;
        run.keepsakes.push(keepsake);
        run.shop.keepsakes = shelf.filter(k => k.id !== keepsake.id);
        // The Potion Belt comes with a Thonic, in its new slot.
        if (keepsake.id === 'potionBelt' && run.shelf.length < shelfSizeOf(room)) run.shelf.push(KEEPSAKE_NUMBERS.beltThonic);
        emitState(socket.roomCode);
    });

    // On to the next fight, from Thom's cart or any point between fights. (`leaveShop` is
    // the older name; the classic page and the tests still send it.)
    const moveOn = () => {
        let room = tavernPlayer();
        if (!room || !(room.tavernRun.shop || room.tavernRun.interlude)) return;
        moveOnToNextFight(socket.roomCode);
    };
    socket.on('leaveShop', moveOn);
    socket.on('moveOn', moveOn);

    // Between fights (see startInterlude). Each step only works at its own stage.
    const interludeAt = stage => {
        let room = tavernPlayer();
        let interlude = room && room.tavernRun.interlude;
        return interlude && interlude.stage === stage ? room : null;
    };

    // 'roll' once, to try to catch him; then 'on' to the next fight (he is the walk's one event).
    socket.on('pickpocket', (action) => {
        let room = interludeAt('pickpocket');
        if (!room) return;
        let run = room.tavernRun, interlude = run.interlude;
        if (action === 'roll' && !interlude.roll) {
            interlude.roll = rollFace();
            interlude.caught = interlude.roll >= INTERLUDE.pickpocketCatch;
            interlude.lost = interlude.caught ? 0 : -changePurse(run, -interlude.steal);
        } else if (action === 'on' && interlude.roll) {
            moveOnToNextFight(socket.roomCode);
            return;
        } else {
            return;
        }
        emitState(socket.roomCode);
    });

    // The Wild Magic Hot Tub: 'soak' once, and the wild magic surges (free).
    socket.on('hotTub', (action) => {
        let room = interludeAt('hotTub');
        if (!room || action !== 'soak') return;
        let run = room.tavernRun;
        let price = hotTubPrice(run);
        if (run.purse < price) return;
        noteBought(run, 'hotTub');
        run.purse -= price;
        run.stats.spent += price;
        let surge = pickHotTubSurge();
        if (surge === 'pruney') run.nextFightHearts = Math.max(1, (run.nextFightHearts || BALANCE.playerHearts) - 1);
        else run.nextFightSurge = surge;
        run.interlude = { stage: 'done', spot: 'hotTub', surge: { id: surge, die: HOT_TUB_DIE, ...HOT_TUB_SURGES[surge] }, hearts: surge === 'pruney' ? run.nextFightHearts : undefined };
        emitState(socket.roomCode);
    });

    // Darren Snakehands: 'roll' once; then 'on' to the next fight (he is the walk's one event).
    socket.on('darren', (action) => {
        let room = interludeAt('darren');
        if (!room) return;
        let interlude = room.tavernRun.interlude;
        if (action === 'roll' && !interlude.roll) {
            interlude.roll = rollFace();
            Object.assign(interlude, darrenOutcome(room, interlude.roll));
        } else if (action === 'on' && interlude.roll) {
            moveOnToNextFight(socket.roomCode);
            return;
        } else {
            return;
        }
        emitState(socket.roomCode);
    });

    // After a random event (the thief, the Hooded Stranger, Darren) the walk goes on: two spots
    // catch your eye (the user's call, 21 Oct; before, the event was the whole walk). 'on' at the
    // event still goes straight to the next fight.
    socket.on('lookAround', () => {
        let room = tavernPlayer();
        let interlude = room && room.tavernRun.interlude;
        if (!interlude) return;
        let finished = ((interlude.stage === 'pickpocket' || interlude.stage === 'darren') && interlude.roll)
            || (interlude.stage === 'done' && (interlude.spot === 'stranger' || interlude.spot === 'kram'));
        if (!finished) return;
        room.tavernRun.interlude = { stage: 'choose', spots: pickSpots(room), after: interlude.stage === 'done' ? interlude.spot : interlude.stage };
        emitState(socket.roomCode);
    });

    socket.on('chooseSpot', (spot) => {
        let room = interludeAt('choose');
        if (!room || typeof spot !== 'string' || !room.tavernRun.interlude.spots.includes(spot)) return;
        let run = room.tavernRun;
        if (spot === 'thom') {
            run.interlude = null;
            // Thom's Loyalty Card: the first Thonic of the visit is free.
            // first: your first visit this run (Thom greets you with "Vim, vigour, vitality!").
            run.shop = { stock: pickThomStock(placeOf(room)), free: hasKeepsake(room, 'loyaltyCard'), keepsakes: pickThomKeepsakes(room), first: !run.thomMet };
            run.thomMet = true;
        } else if (spot === 'shrine') {
            run.interlude = { stage: 'shrine' };
        } else if (spot === 'diceDen') {
            run.interlude = { stage: 'diceDen', bets: INTERLUDE.diceDenBets, bet: null, throws: [] };
        } else if (spot === 'hotTub') {
            run.interlude = { stage: 'hotTub' };
        } else if (spot === 'elfKid') {
            run.interlude = { stage: 'elfKid', stock: ELF_BARS.map(thonicView), puffs: ELF_BAR_PUFFS, bought: [] };
        } else if (spot === 'bard') {
            run.interlude = { stage: 'bard', songs: BARD_SONGS, price: bardPrice(run) };
        }
        emitState(socket.roomCode);
    });

    // The Shrine to the Lady: light a candle and she grants a blessing, at random:
    //   favour  the next fight starts with an extra heart
    //   grace   the next dust that would cost a heart doesn't (kept until it's needed)
    // Grace isn't given twice: carrying one already, it's her Favour.
    socket.on('shrinePick', (action) => {
        let room = interludeAt('shrine');
        if (!room || action !== 'pray') return;
        let run = room.tavernRun;
        let price = shrinePrice(run);
        if (run.purse < price) return;
        noteBought(run, 'shrine');
        run.purse -= price;
        run.stats.spent += price;
        let gift = INTERLUDE.shrineGifts[crypto.randomInt(0, INTERLUDE.shrineGifts.length)];
        if (gift === 'grace' && run.ladysGrace) gift = 'favour';
        // Her Favour adds to what the next fight would start on (after the Stranger's price, too).
        if (gift === 'favour') run.nextFightHearts = (run.nextFightHearts || BALANCE.playerHearts) + INTERLUDE.favourHearts;
        else run.ladysGrace = true;
        run.interlude = { stage: 'done', spot: 'shrine', gift, hearts: gift === 'favour' ? run.nextFightHearts : undefined };
        emitState(socket.roomCode);
    });

    // The Dice Den: name the bet (0 declines), then 'diceRoll' throws until someone wins.
    socket.on('diceBet', (bet) => {
        let room = interludeAt('diceDen');
        if (!room || room.tavernRun.interlude.bet) return;
        let run = room.tavernRun;
        if (bet === 0) {
            run.interlude = { stage: 'done', spot: 'diceDen', bet: 0 };
        } else {
            if (!INTERLUDE.diceDenBets.includes(bet) || run.purse < bet) return;
            run.interlude.bet = bet;
        }
        emitState(socket.roomCode);
    });

    socket.on('diceRoll', () => {
        let room = interludeAt('diceDen');
        let interlude = room && room.tavernRun.interlude;
        if (!interlude || !interlude.bet) return;
        let { you, them, won } = throwDiceDen();
        let throws = [...interlude.throws, { you, them }];
        if (won === null) {
            interlude.throws = throws;
        } else {
            changePurse(room.tavernRun, won ? interlude.bet : -interlude.bet);
            room.tavernRun.interlude = { stage: 'done', spot: 'diceDen', bet: interlude.bet, throws, won };
        }
        emitState(socket.roomCode);
    });

    socket.on('strangerPick', (keepsakeId) => {
        let room = interludeAt('stranger');
        if (!room) return;
        let run = room.tavernRun;
        if (keepsakeId === null) {
            run.interlude = { stage: 'done', spot: 'stranger', keepsake: null };
        } else {
            let keepsake = run.interlude.offers.find(k => k.id === keepsakeId);
            if (!keepsake) return;
            run.keepsakes.push(keepsake);
            // The Potion Belt comes with a Thonic, in its new slot.
            if (keepsake.id === 'potionBelt' && run.shelf.length < shelfSizeOf(room)) run.shelf.push(KEEPSAKE_NUMBERS.beltThonic);
            run.nextFightHearts = INTERLUDE.strangerHearts;
            run.interlude = { stage: 'done', spot: 'stranger', keepsake, hearts: INTERLUDE.strangerHearts };
        }
        emitState(socket.roomCode);
    });

    // A boss's keepsake, at the invitation: take it (with full pockets, naming one to leave behind)
    // or leave it. Either way the invitation (and its save) is sealed afresh.
    socket.on('claimDrop', (take, giveUp) => {
        let room = interludeAt('invitation');
        if (!room) return;
        let run = room.tavernRun, interlude = run.interlude;
        let drop = interlude.drop && BOSS_DROPS[interlude.drop.id];
        if (!drop || interlude.claim !== 'open') return;
        if (take === true) {
            if (pocketsFull(room)) {
                let index = run.keepsakes.findIndex(k => k.id === giveUp);
                if (index < 0) return;
                run.keepsakes.splice(index, 1);
            }
            run.keepsakes.push(drop);
        } else if (take === false) {
            run.refusedDrops = [...(run.refusedDrops || []), drop.id];
        } else {
            return;
        }
        run.interlude = invitation(room, room.players[socket.id].name);
        emitState(socket.roomCode);
    });

    // Johnny Elf Bar: an Elf Bar for the shelf (not one you already carry), full of puffs.
    socket.on('buyElfBar', (id) => {
        let room = interludeAt('elfKid');
        if (!room || typeof id !== 'string' || !ELF_BARS.includes(id)) return;
        let run = room.tavernRun;
        let price = thonicPrice(run, id);
        if (run.purse < price || run.shelf.length >= shelfSizeOf(room) || run.shelf.includes(id)) return;
        noteBought(run, id);
        run.purse -= price;
        run.stats.spent += price;
        run.shelf.push(id);
        run.puffs[id] = ELF_BAR_PUFFS;
        run.interlude.bought = [...(run.interlude.bought || []), id];
        emitState(socket.roomCode);
    });

    // The Bard: pay for one of his songs for the next fight (null: walk away, nothing paid).
    socket.on('bardPick', (songId) => {
        let room = interludeAt('bard');
        if (!room) return;
        let run = room.tavernRun;
        if (songId === null) {
            run.interlude = { stage: 'done', spot: 'bard', song: null };
        } else {
            let song = BARD_SONGS.find(s => s.id === songId);
            let price = bardPrice(run);
            if (!song || run.purse < price) return;
            noteBought(run, 'bard');
            run.purse -= price;
            run.stats.spent += price;
            run.nextFightSong = song.id;
            run.interlude = { stage: 'done', spot: 'bard', song };
        }
        emitState(socket.roomCode);
    });

    // The Cult of Kram: 'swear' fealty (no 1s for the next fights) or 'refuse'.
    socket.on('kram', (action) => {
        let room = interludeAt('kram');
        if (!room || (action !== 'swear' && action !== 'refuse')) return;
        let run = room.tavernRun;
        let sworn = action === 'swear';
        if (sworn) run.kramFights = INTERLUDE.kramFights;
        run.interlude = { stage: 'done', spot: 'kram', sworn, fights: INTERLUDE.kramFights };
        emitState(socket.roomCode);
    });

    // The Bard's Inspiring Song: your first throw of the fight, thrown again (before you keep a
    // die; a die Frak's Mind Whip kept for you stays kept).
    socket.on('inspiringSong', () => {
        let room = tavernPlayer();
        if (!room) return;
        let roomCode = socket.roomCode;
        let run = room.tavernRun, turn = room.turn;
        if (!isTurnPlayable(roomCode) || !isMyTurn() || Date.now() < turn.busyUntil) return;
        if (!run.song || run.song !== turn.key || turn.rollCount !== 1) return;
        let rerolled = Rules.rerollActive(turn, rollFaceFor(room, turn), turn.mindDieId);
        if (!rerolled) return;
        run.song = null;
        sendMoment(roomCode, 'keepsakeActivated', { id: 'inspiringSong', name: 'Inspiring Song', text: 'The Bard plays. Your first throw, thrown again.', who: 'The Bard' });
        throwAgain(roomCode, room, turn, rerolled);
        emitState(roomCode);
    });

    // Drinking, always on your own turn. When exactly, and what it does, depends on the
    // Thonic; anything not allowed right now changes nothing and the Thonic stays on the shelf.
    //   healing         before you roll, once you've lost a heart: +1 heart
    //   clearEye        before you roll, against an opponent with an ability left: it waits and
    //                   cancels that ability the next time it is used (this fight)
    //   fizzy           after a roll that left active 1s: those dice roll again
    //   secondThoughts  after a roll, naming a kept die (dieId): it goes back into play
    //   steady          any time in your turn: a dust hand this turn scores its dice as they lie
    socket.on('drinkThonic', (slot, dieId) => {
        let room = tavernPlayer();
        if (!room || !Number.isInteger(slot)) return;
        let roomCode = socket.roomCode;
        let run = room.tavernRun;
        let thonicId = run.shelf[slot];
        let thonic = thonicId && THONICS[thonicId];
        if (!thonic || !thonic.drink) return;
        if (!isTurnPlayable(roomCode) || !isMyTurn()) return;
        let turn = room.turn;
        if (Date.now() < turn.busyUntil) return;
        let player = room.players[socket.id];
        let encounter = TAVERN_ENCOUNTERS[run.encounterIndex];
        let text, rerolled = null;

        if (thonic.elf) {
            if (run.puffed[thonicId]) return; // once a fight
            let A = Rules.STATUS.ACTIVE;
            if (thonicId === 'purpleHaze') {
                // A 1 just thrown becomes the 2 or 4 you still need (it tumbles onto it).
                if (!turn.hasRolled || turn.finalized) return;
                let kept = turn.dice.filter(d => d.status !== A && d.status !== Rules.STATUS.STOLEN).map(d => d.value);
                let need = !kept.includes(2) ? 2 : !kept.includes(4) ? 4 : null;
                let one = turn.dice.find(d => d.status === A && d.value === 1 && !(turn.boundIds || []).includes(d.id));
                if (!need || !one) return;
                one.value = need;
                rerolled = [one.id];
                text = `A 1 becomes your ${need}`;
            } else if (thonicId === 'cottonCandyCloud') {
                let bot = room.players[BOT_ID];
                if (run.cloud || turn.finalized || !bot || !room.roundPlayers.includes(BOT_ID) || bot.score !== null) return;
                run.cloud = true;
                text = "This round your opponent can't see your score";
            } else if (thonicId === 'lemonLevitation') {
                if (!turn.hasRolled || turn.finalized || turn.locksThisRoll > 0 || turn.freeRoll) return;
                turn.freeRoll = true;
                text = 'Throw again without keeping a die';
            } else if (thonicId === 'watermelonHindsight') {
                rerolled = Rules.redoThrow(turn, turn.lastThrown, rollFaceFor(room, turn), turn.mindDieId);
                if (!rerolled) return;
                text = 'Your last throw, thrown again';
            } else {
                return;
            }
            run.puffed[thonicId] = true;
            run.puffs[thonicId] = (run.puffs[thonicId] || ELF_BAR_PUFFS) - 1;
            if (run.puffs[thonicId] <= 0) { run.shelf.splice(slot, 1); delete run.puffs[thonicId]; }
            sendMoment(roomCode, 'keepsakeActivated', { id: thonicId, name: thonic.name.replace(/ Elf Bar$/, ''), text, who: 'Elf Bar' });
            if (rerolled) throwAgain(roomCode, room, turn, rerolled);
            else emitTurn(roomCode, { type: 'toggle' });
            emitState(roomCode);
            return;
        }

        if (thonicId === 'healing') {
            if (turn.hasRolled || player.lives >= room.startingLives) return;
            player.lives += 1;
            text = '+1 heart';
        } else if (thonicId === 'clearEye') {
            if (turn.hasRolled || run.clearEyeArmed || !encounterAbilityLeft(room)) return;
            run.clearEyeArmed = true;
            text = `${encounter.name}'s next ${Rules.ABILITY_NAMES[encounter.ability]} will be cancelled`;
        } else if (thonicId === 'fizzy') {
            rerolled = Rules.rerollOnes(turn, rollFaceFor(room, turn));
            if (!rerolled) return;
            text = 'Your 1s roll again';
        } else if (thonicId === 'secondThoughts') {
            if (!Number.isInteger(dieId) || !Rules.putBackDie(turn, dieId)) return;
            text = 'A kept die goes back in play';
        } else if (thonicId === 'steady') {
            if (turn.steady) return;
            turn.steady = true;
            text = 'Dust this turn counts as 0';
        } else {
            return;
        }

        // The Bottomless Flask: the first Thonic drunk each fight may stay on the shelf.
        let refilled = false;
        if (hasKeepsake(room, 'bottomlessFlask') && !run.encounterKeepsakeUses.bottomlessFlask) {
            run.encounterKeepsakeUses.bottomlessFlask = true;
            refilled = crypto.randomInt(0, 100) < (KEEPSAKE_NUMBERS.flaskChance ?? 50);
        }
        if (!refilled) run.shelf.splice(slot, 1);
        run.stats.thonicsDrunk++;
        sendMoment(roomCode, 'thonicUsed', { id: thonicId, name: thonic.name, text });
        if (refilled) emitKeepsakeActivated(roomCode, room, 'bottomlessFlask', `Your ${thonic.name} fills up again.`);
        if (rerolled) {
            throwAgain(roomCode, room, turn, rerolled);
        } else {
            emitTurn(roomCode, { type: 'toggle' });
        }
        emitState(roomCode);
    });

    socket.on('chooseKeepsake', (keepsakeId) => {
        let room = rooms[socket.roomCode];
        if (!room || room.mode !== 'tavern-crawl' || !room.tavernRun.pendingKeepsakeChoices) return;
        let selected = room.tavernRun.pendingKeepsakeChoices.find(k => k.id === keepsakeId);
        if (!selected) return;

        room.tavernRun.keepsakes.push(selected);
        resetTavernEncounter(socket.roomCode, true);
        emitState(socket.roomCode);
        io.to(socket.roomCode).emit('displayMessage', { text: selected.name, color: "#ffd54f" });
    });

    socket.on('disconnect', () => {
        let roomCode = socket.roomCode;
        let room = roomCode && rooms[roomCode];
        if (!room) return;
        let player = room.players[socket.id];
        if (player) {
            player.connected = false;
            if (room.roundPlayers[room.currentTurnIndex] === socket.id) {
                // Their turn: give them a chance to come back before it counts as dust.
                let token = player.token;
                setTimeout(() => forfeitIfStillAway(roomCode, room, token), delay(TURN_RECONNECT_GRACE_MS));
            }
            emitState(roomCode);
        }
        scheduleEmptyTableCleanup(roomCode);
    });
});

function start(port = process.env.PORT || 3000) {
    return new Promise(resolve => {
        http.listen(port, () => {
            let actualPort = http.address().port;
            console.log(`Server is running on port ${actualPort}`);
            // The PC's address on the local network changes from time to time, so print
            // the links to open on a phone connected to the same Wi-Fi.
            Object.values(os.networkInterfaces()).flat()
                .filter(net => net && net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.'))
                .forEach(net => console.log(`On your Wi-Fi: http://${net.address}:${actualPort}/next/`));
            Strategy.warmUp(); // the opponents' best-play tables, quietly in the background
            resolve(http);
        });
    });
}

if (require.main === module) start();

module.exports = { start, http, io, rooms, emitState, getRoomState, pickSpots, startInterlude, strangerOffer, BARD_SONGS, ELF_BARS, rollFaceFor, sealSave, openSave, beginTavernRound, resetTavernEncounter, invitation, BOSS_DROPS, TAVERN_ENCOUNTERS };
