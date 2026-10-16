// For testing in a browser only, never deployed: the game server on :3002 (or PORT) plus a
// small control port on :3003 (or CONTROL_PORT, this machine only) that sets up Tavern
// Crawl situations without playing whole fights. It applies to every Tavern Crawl table.
//
//   npm run dev:test-server                  (TAVERN_START_ENCOUNTER=1 starts at Klarg, etc.)
//   curl "http://localhost:3003/shop?purse=200"     Thom's cart opens with 200 gold (add
//        &stock=healing,fizzy,steady to choose what's on it; default: the longest names)
//   curl "http://localhost:3003/lives?n=1"          the player's hearts
//   curl "http://localhost:3003/shelf?ids=healing,lastGasp"
//   curl "http://localhost:3003/purse?n=150"
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
    '/shelf': (r, q) => { r.tavernRun.shelf = (q.get('ids') || '').split(',').filter(Boolean); },
    '/purse': (r, q) => { r.tavernRun.purse = Number(q.get('n')); }
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
    tables.forEach(([code, r]) => { command(r, url.searchParams); server.emitState(code); });
    res.end(`ok: ${tables.length} Tavern Crawl table(s)\n`);
}).listen(CONTROL_PORT, '127.0.0.1', () => console.log(`Test controls on http://localhost:${CONTROL_PORT}`));
