// Screenshots of the 3D table for before/after comparisons (not a test). Drives a headless Chrome
// over the DevTools protocol against the dev client (vite on :5173, proxying the dev test server
// on :3002 with its controls on :3003), sound off, and saves PNGs.
//
//   node test/shots.mjs <out-dir> [look=classic|next] [fight=1] [roll=1] [sizes=384x780@2.625,844x390@2.625,1280x800@1]
//
// Each size gets a fresh page that joins a Tavern Crawl, then a fight against opponent `fight`
// (0 McGrath ... 13 Jaguar); roll=1 throws once, so the dice lie on the felt. seed=42 (the
// default) makes the server's draws repeat from the fight on: the same throw every time. Files:
// <out-dir>/<look>-<fight>[-roll][-<moment>]-<w>x<h>.png. moment=devil|ink|smite|flood|keepsake|shield|perfect
// plays that moment (as its banner would) and shoots it at its brightest.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const outDir = process.argv[2] ?? 'previews';
const look = args.look ?? 'classic';
const fight = args.fight ?? '1';
const roll = args.roll === '1';
const seed = args.seed ?? '42';
const moment = args.moment;
const MOMENTS = {
    devil: `preview.ability('Duke Morrigan', 'Sympathy for the Devil')`,
    ink: `preview.ability('Vaelin Inkhand', 'Inkfire Brand')`,
    smite: `preview.ability('The Ridgeler', 'Divine Smite')`,
    flood: `preview.ability('Brodor', 'Astral Flood')`,
    keepsake: `preview.ability('Keepsake', 'Trap Card', { keepsake: 'luckySeat' })`,
    shield: `preview.ability('Keepsake', 'Shield', { keepsake: 'bentCopper' })`,
    perfect: `table.celebrateAt = performance.now()`
};
const sizes = (args.sizes ?? '384x780@2.625,844x390@2.625,1280x800@1').split(',').map(s => {
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
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shots-'))}`,
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
        setTimeout(() => pending.has(n) && (pending.delete(n), reject(new Error(`${method} timed out`))), 30000);
        ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
    return { ready, send, close: () => ws.close() };
}

try {
    const { webSocketDebuggerUrl } = await connect();
    const cdp = session(webSocketDebuggerUrl);
    await cdp.ready;
    for (const { w, h, dpr } of sizes) {
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const s = (m, p) => cdp.send(m, p, sessionId);
        const evaluate = async expr => (await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
        await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
        await s('Page.enable');
        await s('Page.addScriptToEvaluateOnNewDocument', {
            source: `try { localStorage.tavernMuted = '1'; localStorage.tavernWinSeen = 'x'; localStorage.tavernLook = ${JSON.stringify(look)}; } catch {}
                HTMLMediaElement.prototype.play = () => Promise.resolve();`
        });
        await s('Page.navigate', { url: CLIENT });
        // Wait for the game to load, join, and wait until the table is there.
        await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__game) { clearInterval(t); r(); } }, 100); })`);
        await wait(1000);
        await evaluate(`window.__game.actions.join('Tester', 'Rokr', 'TAVERN')`);
        await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__game.store.get().state?.tavernRun) { clearInterval(t); r(); } }, 100); })`);
        await wait(1500);
        await fetch(`${CONTROLS}/seed?n=${seed}`);
        await fetch(`${CONTROLS}/fight?n=${fight}`);
        await wait(6000); // the entrance and the intro card settle
        if (roll) {
            await evaluate(`window.__game.actions.roll()`);
            // The throw lands and any moment it raises (an ability, its banner) has come and gone,
            // then a little longer for fades: shots of the same throw then match whatever the
            // page's speed (a fresh dev server is slow at first).
            await wait(1500);
            await evaluate(`new Promise(r => { const t = setInterval(() => {
                const s = window.__game.store.get();
                const quiet = !s.ability || performance.now() - s.ability.at > 4000; // its banner shows 3.6 s
                if (s.isMyTurn && !s.rolling && quiet && !s.modal && !window.__game.table.roll) { clearInterval(t); r(); }
            }, 100); })`);
            await wait(4000);
        }
        if (moment) {
            await evaluate(`(({ preview, table }) => { ${MOMENTS[moment]}; })(window.__game)`);
            await wait(700); // near its brightest (a slow page needs the time to draw the moment)
        }
        const { data } = await s('Page.captureScreenshot', { format: 'png' });
        const file = join(outDir, `${look}-${fight}${roll ? '-roll' : ''}${moment ? `-${moment}` : ''}-${w}x${h}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(file);
        await cdp.send('Target.closeTarget', { targetId });
    }
    cdp.close();
} finally {
    await fetch(`${CONTROLS}/seed`).catch(() => {});
    chrome.kill();
}
