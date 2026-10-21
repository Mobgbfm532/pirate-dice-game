// For testing in a browser only, never deployed: the game server on :3002 (or PORT) plus a
// small control port on :3003 (or CONTROL_PORT, this machine only) that sets up Tavern
// Crawl situations without playing whole fights. It applies to every Tavern Crawl table.
//
//   npm run dev:test-server                  (TAVERN_START_ENCOUNTER=5 starts at Sylvester, 10 at Klarg, etc.)
//   curl "http://localhost:3003/shop?purse=200"     Thom's cart opens with 200 gold (add
//        &stock=healing,fizzy,steady to choose what's on it; default: the longest names)
//   curl "http://localhost:3003/lives?n=1"          the player's hearts
//   curl "http://localhost:3003/foe?lives=1"        the opponent's lives
//   curl "http://localhost:3003/surge?id=twin"      a hot tub surge on this fight
//   curl "http://localhost:3003/shelf?ids=healing,lastGasp"
//   curl "http://localhost:3003/purse?n=150"
//   curl "http://localhost:3003/fight?n=2"           a fight against opponent 2 (Danhausen), ability ready
//   curl "http://localhost:3003/won?hearts=2"        the fight is won: the gold summary, then the event
//   curl "http://localhost:3003/invitation"          Martha beaten: the invitation to the Yawning Portal
//   curl "http://localhost:3003/invitation?boss=brodor"   Brodor beaten: on to the Salty Swallow
//   curl "http://localhost:3003/keepsakes?ids=loadedDie,potionBelt,loyaltyCard"
//   curl "http://localhost:3003/between?spots=thom,shrine"   between fights, two spots
//        (&pickpocket=1 for the thief instead; &stage=stranger for the Hooded Stranger; &stage=shrine|diceDen|hotTub to go straight to a spot; &stage=darren for Darren Snakehands)
//
// Point the dev client at it: GAME_SERVER=http://localhost:3002 (see CLAUDE.md).
process.env.LEADERBOARD_READONLY = '1';
const http = require('http');
const server = require('../server');

const PORT = Number(process.env.PORT) || 3002;
const CONTROL_PORT = Number(process.env.CONTROL_PORT) || 3003;
server.start(PORT);

const tavernTables = () => Object.entries(server.rooms).filter(([, r]) => r.mode === 'tavern-crawl');
const human = r => Object.values(r.players).find(p => p.id !== 'BOT_MOLAR');

const COMMANDS = {
    '/shop': (r, q) => {
        r.tavernRun.shop = { stock: (q.get('stock') || 'healing,secondThoughts,clearEye').split(',').filter(Boolean) };
        r.tavernRun.purse = Number(q.get('purse') || 200);
        r.roundPlayers = [];
    },
    '/lives': (r, q) => { const p = human(r); if (p) p.lives = Number(q.get('n')); },
    // The opponent's lives (n=1: the next round you win ends the fight).
    '/foe': (r, q) => { if (r.players.BOT_MOLAR) r.players.BOT_MOLAR.lives = Number(q.get('lives') || 1); },
    '/shelf': (r, q) => { r.tavernRun.shelf = (q.get('ids') || '').split(',').filter(Boolean); },
    // The hot tub's surge on this fight (id: noOnes, twin, lucky, scalding, soggy).
    '/surge': (r, q) => { r.tavernRun.tubSurge = q.get('id') || 'twin'; },
    '/purse': (r, q) => { r.tavernRun.purse = Number(q.get('n')); },
    // A fight against opponent n (0 McGrath ... 4 Martha, 5 Sylvester ... 9 Brodor, 10 Klarg ... 13 Jaguar), its ability ready from round 1.
    '/fight': (r, q, code) => { r.tavernRun.encounterIndex = Number(q.get('n')); r.tavernRun.interlude = null; r.tavernRun.shop = null; server.resetTavernEncounter(code); r.tavernRun.abilityRound = 1; r.tavernRun.abilityUsed = {}; server.beginTavernRound(code, r); },
    // A fight just won (the current opponent, &hearts=2 left): its gold summary, then the event between fights.
    '/won': (r, q) => {
        const run = r.tavernRun, place = run.encounterIndex + 1, left = Number(q.get('hearts') || 2);
        const enemy = server.TAVERN_ENCOUNTERS[run.encounterIndex], next = server.TAVERN_ENCOUNTERS[place] || enemy;
        const gold = { win: 100 * place, hearts: 25 * left, heartsLeft: left, perHeart: 25, perPlace: 100 };
        run.purse += gold.win + gold.hearts;
        run.encounterIndex = Math.min(place, server.TAVERN_ENCOUNTERS.length - 1);
        server.startInterlude(r, { defeated: enemy.name, nextEnemy: next.name, place, gold, at: Date.now() });
        r.roundPlayers = [];
    },
    // A boss just beaten (boss=martha, the default, or brodor): their keepsake and the invitation on.
    '/invitation': (r, q) => {
        const boss = server.TAVERN_ENCOUNTERS.findIndex(e => e.id === (q.get('boss') || 'martha'));
        const run = r.tavernRun, drop = server.BOSS_DROPS[server.TAVERN_ENCOUNTERS[boss].drops];
        run.encounterIndex = boss + 1;
        run.keepsakes = [...run.keepsakes.filter(k => k.id !== drop.id), drop];
        run.lastWin = { defeated: server.TAVERN_ENCOUNTERS[boss].name, nextEnemy: server.TAVERN_ENCOUNTERS[boss + 1].name, place: boss + 1, drop, gold: { win: 100 * (boss + 1), hearts: 50 } };
        run.interlude = server.invitation(r, (human(r) || {}).name || 'Tester');
        r.roundPlayers = [];
    },
    // The keepsakes you carry (ids: bentCopper, luckySeat, velvetCushion, loadedDie, potionBelt, loyaltyCard, marthasMask, brodorsSunglasses).
    '/keepsakes': (r, q) => { r.tavernRun.keepsakes = (q.get('ids') || '').split(',').filter(Boolean).map(id => ({ id, name: id, text: '' })); },
    '/between': (r, q) => {
        const run = r.tavernRun;
        const spots = (q.get('spots') || 'thom,diceDen').split(',');
        const stage = q.get('stage');
        run.lastWin = run.lastWin || { defeated: 'The Molar', nextEnemy: 'Klarg', gold: { win: 100, hearts: 75 } };
        if (q.get('purse')) run.purse = Number(q.get('purse'));
        if (q.get('pickpocket')) run.interlude = { stage: 'pickpocket', steal: Math.max(1, Math.floor(run.purse / 4)), catchOn: 4 };
        else if (stage === 'shrine' || stage === 'hotTub') run.interlude = { stage };
        else if (stage === 'darren') run.interlude = { stage, smashOn: 2, giftOn: 4 };
        else if (stage === 'diceDen') run.interlude = { stage, bets: [50, 100], bet: null, throws: [] };
        else if (stage === 'stranger') run.interlude = server.strangerOffer(r);
        else run.interlude = { stage: 'choose', spots };
        run.shop = null;
        r.roundPlayers = [];
    }
};

http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const command = COMMANDS[url.pathname];
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!command) {
        res.statusCode = 404;
        res.end(`Commands: ${Object.keys(COMMANDS).join(', ')}\n`);
        return;
    }
    const tables = tavernTables();
    tables.forEach(([code, r]) => { command(r, url.searchParams, code); server.emitState(code); });
    res.end(`ok: ${tables.length} Tavern Crawl table(s)\n`);
}).listen(CONTROL_PORT, '127.0.0.1', () => console.log(`Test controls on http://localhost:${CONTROL_PORT}`));
