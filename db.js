// What the game keeps between restarts: the Tavern Crawl's leaderboard, which characters each
// player (by name) has met (3 Nov, the user's call: portraits stay a "?" until you've met them),
// and a league table of wins per name at the league tables (4 Nov: JUGS).
//
// With DATABASE_URL set (a Postgres link; on Render the Neon database's) everything lives there and
// survives deploys and sleeps. Without it (this PC, the tests) it lives in leaderboard.json and
// met.json beside the server, as the leaderboard did before; LEADERBOARD_READONLY keeps the files
// untouched (the tests). Reads happen once (the leaderboard at start, a player's meetings as they
// join); the server keeps both in memory and writes changes through here without waiting.
const fs = require('fs');
const path = require('path');

const LEADERBOARD_PATH = path.join(__dirname, 'leaderboard.json');
const MET_PATH = path.join(__dirname, 'met.json');
const LEAGUE_PATH = path.join(__dirname, 'league.json');
const readonly = () => !!process.env.LEADERBOARD_READONLY;

// A player's key: their name as typed, trimmed and in lower case ("Ann" and "ann " are the same).
const playerKey = name => String(name || '').trim().toLowerCase();

function readJson(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.warn(`Could not read ${path.basename(file)}:`, error.message);
    }
    return fallback;
}

function writeJson(file, value) {
    if (readonly()) return;
    try {
        fs.writeFileSync(file, JSON.stringify(value, null, 2));
    } catch (error) {
        console.warn(`Could not save ${path.basename(file)}:`, error.message);
    }
}

// Files: the same calls as the database, kept on disk.
function fileStore() {
    let met = readJson(MET_PATH, {});
    let league = readJson(LEAGUE_PATH, {}); // room -> player key -> { name, wins, games }
    return {
        kind: 'files',
        ready: Promise.resolve(),
        async loadLeaderboard() { return readJson(LEADERBOARD_PATH, []); },
        // The server passes the whole board (each name's best, already sorted).
        async saveLeaderboard(board) { writeJson(LEADERBOARD_PATH, board); },
        async loadMet(name) { return met[playerKey(name)] || []; },
        async addMet(name, who) {
            let key = playerKey(name);
            met[key] = [...new Set([...(met[key] || []), who])];
            writeJson(MET_PATH, met);
        },
        async loadLeague(room) { return Object.values(league[room] || {}); },
        // One finished game: everyone at the table played it; winner (a name, or null) won it.
        async addLeagueResult(room, names, winner) {
            let table = league[room] = league[room] || {};
            names.forEach(name => {
                let key = playerKey(name);
                let row = table[key] = table[key] || { name, wins: 0, games: 0 };
                row.name = name;
                row.games++;
                if (winner !== null && key === playerKey(winner)) row.wins++;
            });
            writeJson(LEAGUE_PATH, league);
        }
    };
}

// (Pool: the tests pass pg-mem's stand-in for a real database.)
function postgresStore(url, Pool = require('pg').Pool) {
    // Hosted databases (Neon) need an encrypted connection; a database on this PC doesn't.
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // The link's own sslmode (Neon's says "require") is dropped: the driver would let it replace the
    // setting here, and its meaning is about to weaken; the certificate is always checked here.
    const link = new URL(url);
    link.searchParams.delete('sslmode');
    const pool = new Pool({ connectionString: link.toString(), ssl: local ? false : { rejectUnauthorized: true }, max: 3 });
    pool.on('error', error => console.warn('Database connection error:', error.message));
    const ready = pool.query(`
        CREATE TABLE IF NOT EXISTS leaderboard (
            name TEXT PRIMARY KEY,
            points INTEGER NOT NULL,
            gold INTEGER NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS met (
            player TEXT NOT NULL,
            who TEXT NOT NULL,
            at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (player, who)
        );
        CREATE TABLE IF NOT EXISTS league (
            room TEXT NOT NULL,
            player TEXT NOT NULL,
            name TEXT NOT NULL,
            wins INTEGER NOT NULL DEFAULT 0,
            games INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (room, player)
        );
    `);
    ready.catch(error => console.warn('Could not set up the database:', error.message));
    const query = async (sql, values) => { await ready; return pool.query(sql, values); };
    return {
        kind: 'postgres',
        ready,
        async loadLeaderboard() {
            let { rows } = await query('SELECT name, points, gold FROM leaderboard ORDER BY points DESC LIMIT 20');
            return rows;
        },
        // Each name keeps its best run: a lower score never replaces a higher one.
        async saveLeaderboard(board, entry) {
            if (!entry) return;
            await query(`
                INSERT INTO leaderboard (name, points, gold) VALUES ($1, $2, $3)
                ON CONFLICT (name) DO UPDATE SET points = EXCLUDED.points, gold = EXCLUDED.gold, updated_at = now()
                WHERE leaderboard.points < EXCLUDED.points`, [entry.name, entry.points, entry.gold]);
        },
        async loadMet(name) {
            let { rows } = await query('SELECT who FROM met WHERE player = $1', [playerKey(name)]);
            return rows.map(r => r.who);
        },
        async addMet(name, who) {
            await query('INSERT INTO met (player, who) VALUES ($1, $2) ON CONFLICT DO NOTHING', [playerKey(name), who]);
        },
        async loadLeague(room) {
            let { rows } = await query('SELECT name, wins, games FROM league WHERE room = $1', [room]);
            return rows;
        },
        // One finished game: everyone at the table played it; winner (a name, or null) won it.
        async addLeagueResult(room, names, winner) {
            for (let name of names) {
                let won = winner !== null && playerKey(name) === playerKey(winner) ? 1 : 0;
                await query(`
                    INSERT INTO league (room, player, name, wins, games) VALUES ($1, $2, $3, $4, 1)
                    ON CONFLICT (room, player) DO UPDATE SET name = EXCLUDED.name, wins = league.wins + EXCLUDED.wins, games = league.games + 1, updated_at = now()`,
                    [room, playerKey(name), name, won]);
            }
        }
    };
}

const store = process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : fileStore();

module.exports = { store, playerKey, postgresStore };
