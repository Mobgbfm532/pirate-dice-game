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
// Saved Tavern Crawl runs already opened (20 Nov, no save scumming): a save opens once, even after a restart.
const USED_SAVES_PATH = path.join(__dirname, 'used-saves.json');
// Which opponent ended each player's lost crawls, counted (24 Nov: their nemesis on the leaderboard).
const FALLEN_PATH = path.join(__dirname, 'fallen.json');
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
    let used = readJson(USED_SAVES_PATH, []);
    let fallen = readJson(FALLEN_PATH, {}); // player key -> opponent id -> times
    return {
        kind: 'files',
        ready: Promise.resolve(),
        async loadLeaderboard() { return readJson(LEADERBOARD_PATH, []); },
        // The server passes the whole board (each name's best, already sorted).
        async saveLeaderboard(board) { writeJson(LEADERBOARD_PATH, board); },
        async loadMet(name) { return met[playerKey(name)] || []; },
        // Everyone's (player key -> ids), for the leaderboard's furthest reached.
        async loadAllMet() { return JSON.parse(JSON.stringify(met)); },
        async loadFallen() { return JSON.parse(JSON.stringify(fallen)); },
        async addFallen(name, who) {
            let row = fallen[playerKey(name)] = fallen[playerKey(name)] || {};
            row[who] = (row[who] || 0) + 1;
            writeJson(FALLEN_PATH, fallen);
        },
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
        },
        async loadUsedSaves() { return used.slice(); },
        async addUsedSave(id) { used.push(id); writeJson(USED_SAVES_PATH, used); }
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
        ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS runs INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS total_points BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS fallen (
            player TEXT NOT NULL,
            who TEXT NOT NULL,
            times INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (player, who)
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
        CREATE TABLE IF NOT EXISTS used_saves (
            id TEXT PRIMARY KEY,
            at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
    ready.catch(error => console.warn('Could not set up the database:', error.message));
    const query = async (sql, values) => { await ready; return pool.query(sql, values); };
    return {
        kind: 'postgres',
        ready,
        async loadLeaderboard() {
            // (every name: the server works out the top 20, and each name's runs for its average, 22 Nov)
            let { rows } = await query('SELECT name, points, gold, runs, total_points, wins FROM leaderboard ORDER BY points DESC');
            return rows.map(r => ({ name: r.name, points: r.points, gold: r.gold, runs: Number(r.runs) || 0, total: Number(r.total_points) || 0, wins: Number(r.wins) || 0 }));
        },
        // Each name keeps its best run (a lower score never replaces a higher one), and since 22 Nov every run
        // is counted with its points, for the average. A line saved before then starts its count from its best.
        // (The points go in twice, $2 and $4: one parameter for both an INTEGER and a BIGINT column is refused by Postgres,
        // "inconsistent types deduced for parameter", which pg-mem lets through. Every save failed so from 22 to 23 Nov.)
        async saveLeaderboard(board, entry) {
            if (!entry) return;
            await query(`
                INSERT INTO leaderboard (name, points, gold, runs, total_points, wins) VALUES ($1, $2, $3, 1, $4, $5)
                ON CONFLICT (name) DO UPDATE SET
                    wins = leaderboard.wins + EXCLUDED.wins,
                    runs = CASE WHEN leaderboard.runs = 0 THEN 2 ELSE leaderboard.runs + 1 END,
                    total_points = CASE WHEN leaderboard.runs = 0 THEN leaderboard.points ELSE leaderboard.total_points END + EXCLUDED.points,
                    gold = CASE WHEN leaderboard.points < EXCLUDED.points THEN EXCLUDED.gold ELSE leaderboard.gold END,
                    points = CASE WHEN leaderboard.points < EXCLUDED.points THEN EXCLUDED.points ELSE leaderboard.points END,
                    updated_at = now()`, [entry.name, entry.points, entry.gold, entry.points, entry.won ? 1 : 0]);
        },
        async loadMet(name) {
            let { rows } = await query('SELECT who FROM met WHERE player = $1', [playerKey(name)]);
            return rows.map(r => r.who);
        },
        async loadAllMet() {
            let { rows } = await query('SELECT player, who FROM met');
            let all = {};
            rows.forEach(r => { (all[r.player] = all[r.player] || []).push(r.who); });
            return all;
        },
        async loadFallen() {
            let { rows } = await query('SELECT player, who, times FROM fallen');
            let all = {};
            rows.forEach(r => { (all[r.player] = all[r.player] || {})[r.who] = Number(r.times) || 0; });
            return all;
        },
        async addFallen(name, who) {
            await query(`
                INSERT INTO fallen (player, who, times) VALUES ($1, $2, 1)
                ON CONFLICT (player, who) DO UPDATE SET times = fallen.times + 1`, [playerKey(name), who]);
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
        },
        async loadUsedSaves() {
            let { rows } = await query('SELECT id FROM used_saves');
            return rows.map(r => r.id);
        },
        async addUsedSave(id) {
            await query('INSERT INTO used_saves (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
        }
    };
}

const store = process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : fileStore();

module.exports = { store, playerKey, postgresStore };
