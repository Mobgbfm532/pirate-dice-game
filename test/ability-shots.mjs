// Plays an opponent's ability for real and photographs its moment (not a test). Like shots.mjs:
// a headless Chrome against the dev client (vite on :5173, the dev test server on :3002 with its
// controls on :3003), sound off. For each ability it starts a Tavern Crawl, puts you in that
// opponent's fight with the ability ready, plays your turns simply (roll, keep a die, end the
// turn) until the moment really comes from the server, holds its animations at `at` ms and saves
// a PNG per size. It reports the moment's text, whether it was the real thing (or, after
// `wait` seconds, a stand-in from preview.ability), and whether the ability's painting stays
// above the slot rail (it must not cover the dice or the rail for its few seconds).
//
//   node test/ability-shots.mjs <out-dir> [only=mindWhip,cursed] [sizes=384x780@2,844x390@2] [at=900] [wait=60]
//
// Works while the browser pane is hidden (the pane pauses animation; headless Chrome doesn't).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The abilities with paintings so far: their opponent's fight (0 McGrath ... 13 Jaguar) and banner.
const ABILITIES = {
    mindWhip: { fight: 1, name: 'Mind Whip', who: 'Frak' },
    cursed: { fight: 2, name: 'You are Cursed', who: 'Danhausen' },
    devil: { fight: 3, name: 'Sympathy for the Devil', who: 'Duke Morrigan' },
    disguises: { fight: 4, name: 'Disguises', who: 'Martha Mystery' },
    stars: { fight: 11, name: 'Written in the Stars', who: 'Rokr' },
    deadEye: { fight: 12, name: 'Dead Eye', who: 'The Hangman' }
};
const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const outDir = process.argv[2] ?? 'previews/abilities';
const only = args.only ? args.only.split(',') : Object.keys(ABILITIES).slice(0, 4);
const at = Number(args.at ?? 900);
const waitSeconds = Number(args.wait ?? 60);
const sizes = (args.sizes ?? '384x780@2,844x390@2').split(',').map(s => {
    const [wh, dpr] = s.split('@');
    const [w, h] = wh.split('x').map(Number);
    return { w, h, dpr: Number(dpr ?? 1) };
});
const CLIENT = args.client ?? 'http://localhost:5173/next/';
const CONTROLS = args.controls ?? 'http://localhost:3003';
const CHROME = args.chrome ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(outDir, { recursive: true });
const port = 9333 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'abil-'))}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

async function connect() {
    for (let i = 0; i < 50; i++) {
        try { return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await wait(200); }
    }
    throw new Error('Chrome did not start');
}
function session(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
    };
    const ready = new Promise(r => { ws.onopen = r; });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        setTimeout(() => pending.has(n) && (pending.delete(n), reject(new Error(`${method} timed out`))), 120000);
        ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
    return { ready, send, close: () => ws.close() };
}

// In the page: play simply until the named moment arrives, then hold it at `at` ms.
const playUntil = (name, who, at, ms) => `new Promise(done => {
    const g = window.__game, t0 = performance.now();
    let real = false, last = 0;
    let before = null; // the moment on screen before it was played again
    const hold = how => {
        // Wait for the moment played again to be on the page, then hold its animations.
        const t1 = performance.now();
        const ready = () => {
            const el = document.querySelector('.ability-moment');
            if ((!el || el === before) && performance.now() - t1 < 5000) return setTimeout(ready, 30);
            freeze(how);
        };
        ready();
    };
    const freeze = how => setTimeout(() => {
        document.getAnimations().filter(a => a.effect?.target?.closest?.('.ability-moment')).forEach(a => { a.pause(); a.currentTime = ${at}; });
        const art = document.querySelector('.ability-moment .ability-art');
        const rail = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-y')) || null;
        const r = art ? art.getBoundingClientRect() : null;
        done({ how, text: g.store.get().ability?.text ?? '', art: !!art, artBottom: r ? Math.round(r.bottom) : null, railY: rail ? Math.round(rail) : null });
    }, 60);
    const step = () => {
        const s = g.store.get(), now = performance.now();
        // (Seen: played again, the same, held up for the picture; a moment leaves after 3.6 s and a
        // software-drawn page is slow to photograph.)
        if (s.ability && s.ability.ability === ${JSON.stringify(name)} && !s.ability.cancelled) { real = true; before = document.querySelector('.ability-moment'); const { at: _, ...m } = s.ability; g.preview.ability(m.name, m.ability, m, 120000); return hold('real'); }
        if (now - t0 > ${ms}) { before = document.querySelector('.ability-moment'); g.preview.ability(${JSON.stringify(who)}, ${JSON.stringify(name)}, { text: '(stand-in: it did not come up in time)' }, 120000); return hold('stand-in'); }
        // Your turn, nothing on screen: roll, keep the first die you may, or end the turn.
        const t = s.turn;
        if (s.isMyTurn && t && !s.rolling && !s.ability && now - last > 700 && !g.table.roll) {
            last = now;
            if (t.finalized) g.actions.roll(); // (the Roll button ends the turn once the hand is done)
            else if (!t.hasRolled || t.canRoll && t.locksThisRoll > 0) g.actions.roll();
            else { const d = t.dice.find(d => d.status === 'active' && !d.bound && !d.mind && !d.mustRoll); if (d) g.actions.toggleDie(d.id); }
        }
        setTimeout(step, 120);
    };
    step();
})`;

const report = [];
try {
    const { webSocketDebuggerUrl } = await connect();
    const cdp = session(webSocketDebuggerUrl);
    await cdp.ready;
    for (const key of only) {
        const ability = ABILITIES[key];
        if (!ability) { console.log(`unknown ability ${key}`); continue; }
        for (const { w, h, dpr } of sizes) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            const s = (m, p) => cdp.send(m, p, sessionId);
            const evaluate = async expr => (await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
            await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
            await s('Page.enable');
            await s('Page.addScriptToEvaluateOnNewDocument', {
                source: `try { localStorage.tavernMuted = '1'; localStorage.tavernWinSeen = 'x'; } catch {}
                    HTMLMediaElement.prototype.play = () => Promise.resolve();`
            });
            await s('Page.navigate', { url: CLIENT });
            await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__game) { clearInterval(t); r(); } }, 100); })`);
            await wait(1000);
            await evaluate(`window.__game.actions.join('Tester', 'Devil', 'TAVERN')`);
            await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__game.store.get().state?.tavernRun) { clearInterval(t); r(); } }, 100); })`);
            await wait(1500);
            await fetch(`${CONTROLS}/fight?n=${ability.fight}`);
            const seen = await evaluate(playUntil(ability.name, ability.who, at, waitSeconds * 1000));
            await wait(700); // let the held frame draw
            const onScreen = await evaluate(`!!document.querySelector('.ability-moment')`);
            const { data } = await s('Page.captureScreenshot', { format: 'png' });
            const file = join(outDir, `${key}-${w}x${h}.png`);
            writeFileSync(file, Buffer.from(data, 'base64'));
            const clear = seen.artBottom == null || seen.railY == null ? 'n/a' : seen.artBottom < seen.railY - 20 ? 'clear of the rail' : 'OVER THE RAIL';
            const line = `${key} ${w}x${h}: ${seen.how}; painting ${seen.art ? 'shown' : 'none'} (${clear})${onScreen ? '' : '; GONE before the picture'}; "${seen.text}" -> ${file}`;
            console.log(line);
            report.push(line);
            await cdp.send('Target.closeTarget', { targetId });
        }
    }
    cdp.close();
} finally {
    writeFileSync(join(outDir, 'report.txt'), report.join('\n') + '\n');
    chrome.kill();
}
