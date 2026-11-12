// Stills of the start screen (not a test): node test/start-shots.mjs <dir> [client=http://localhost:5173/next/]
//   [sizes=384x780,360x640,844x390,1440x900] [query=table=ABCD] [save=1] [name=Ada] [frames=3] [every=400]
//   [click=.legends-plaque|.legends-tabs button:nth-child(2)]: taps those in turn, a still after each
// Silent and headless. For each size: the screen as it opens (after the die has landed) and, if it's
// taller than the screen, scrolled to the bottom; prints how tall it is against the screen.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'previews/start';
const args = Object.fromEntries(process.argv.slice(3).map(a => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const CLIENT = args.client ?? 'http://localhost:5173/next/';
const SIZES = (args.sizes ?? '384x780,360x640,844x390,1440x900').split(',').map(s => s.split('x').map(Number));
const FRAMES = Number(args.frames ?? 0), EVERY = Number(args.every ?? 400); // extra stills, EVERY ms apart (the living tavern's flicker)
const CLICKS = args.click ? args.click.split('|') : [];
const QUERY = args.query ? `?${args.query}` : '';
// save=1: a saved crawl waiting (its details are made up; only the start screen reads them).
const SAVE = args.save ? `localStorage.tavernSave = JSON.stringify({ name: 'Ada', next: 'Klarg', place: 'the Salty Swallow', purse: 64, token: 'x' });` : '';
// name=Ada: a name already saved on the device (the start screen then shows it as a line).
const NAME = args.name ? `localStorage.tavernName = ${JSON.stringify(args.name)};` : '';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
// (A page that never loads, e.g. the dev client stopped, gives up instead of waiting for ever.)
const giveUp = setTimeout(() => { console.log('Gave up after 2 minutes: is the dev client running?'); chrome.kill(); process.exit(1); }, 120000);
const port = 9333 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'start-'))}`,
    '--use-angle=d3d11', '--mute-audio', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
async function connect() {
    for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await wait(200); } }
    throw new Error('Chrome did not start');
}
function session(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    const ready = new Promise(r => { ws.onopen = r; });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
    return { ready, send, close: () => ws.close() };
}
try {
    const { webSocketDebuggerUrl } = await connect();
    const cdp = session(webSocketDebuggerUrl);
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async expr => (await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
    await s('Page.enable');
    await s('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.tavernMuted = '1'; ${SAVE} ${NAME} } catch {} HTMLMediaElement.prototype.play = () => Promise.resolve();` });
    for (const [width, height] of SIZES) {
        await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 1000 });
        await s('Page.navigate', { url: CLIENT + QUERY });
        await evaluate(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.panel.join') && !document.getElementById('boot')) { clearInterval(t); r(); } }, 100); })`);
        await wait(4500); // (the die lands, the panel has risen in)
        const name = `${width}x${height}`;
        const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
        writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'));
        const living = await evaluate(`(() => { const c = document.querySelector('.living-tavern'); return c ? (c.style.opacity === '1' ? 'drawn' : 'not drawn') : 'none'; })()`);
        for (let f = 1; f <= FRAMES; f++) {
            await wait(EVERY);
            const { data: more } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
            writeFileSync(join(outDir, `${name}-f${f}.jpg`), Buffer.from(more, 'base64'));
        }
        for (const [i, selector] of CLICKS.entries()) {
            const found = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (e) e.click(); return !!e; })()`);
            await wait(700);
            const { data: shot } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
            writeFileSync(join(outDir, `${name}-click${i + 1}.jpg`), Buffer.from(shot, 'base64'));
            if (!found) console.log(`${name}: nothing matched ${selector}`);
        }
        const tall = await evaluate(`(() => { const e = document.querySelector('.join-screen'); return e.scrollHeight; })()`);
        console.log(`${name}: ${tall}px tall on a ${height}px screen${tall > height ? ' (scrolls)' : ''}; living tavern ${living}`);
        if (tall > height) {
            await evaluate(`document.querySelector('.join-screen').scrollTop = 1e6`);
            await wait(300);
            const { data: low } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
            writeFileSync(join(outDir, `${name}-bottom.jpg`), Buffer.from(low, 'base64'));
        }
    }
} finally { clearTimeout(giveUp); chrome.kill(); }
