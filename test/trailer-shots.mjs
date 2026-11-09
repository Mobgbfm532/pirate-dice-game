// Stills of the trailer (not a test): node test/trailer-shots.mjs <dir> [client=http://localhost:5173/next/] [at=2.5,7.6,...]
// Silent, headless, at an upright phone's size. Needs a dev client (it reads the dev-only trailer clock).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'previews/trailer';
const args = Object.fromEntries(process.argv.slice(3).map(a => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const CLIENT = args.client ?? 'http://localhost:5173/next/';
const TIMES = (args.at ?? '2.5,7.6,9.9,12.4,13.0,14.3,16.5,19.0,21.0,23.0,24.6,26.2,26.9,28.0,29.4,31.5').split(',').map(Number);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
const port = 9333 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'trailer-'))}`,
    '--use-angle=d3d11', '--mute-audio', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
    await s('Emulation.setDeviceMetricsOverride', { width: 384, height: 780, deviceScaleFactor: 2, mobile: true });
    await s('Page.enable');
    await s('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.tavernMuted = '1'; } catch {} HTMLMediaElement.prototype.play = () => Promise.resolve();` });
    await s('Page.navigate', { url: CLIENT + '?trailer' });
    await evaluate(`new Promise(r => { const t = setInterval(() => { const b = document.querySelector('.tr-start'); if (b) { clearInterval(t); b.click(); r(); } }, 100); })`);
    const log = [];
    for (const at of TIMES) {
        const info = await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__trailerAt && __trailerAt() >= ${at}) { clearInterval(t);
            r(__trailerAt().toFixed(2) + ' ' + [...document.querySelectorAll('.tr-words')].map(e => e.textContent + '@' + Math.round(e.getBoundingClientRect().top)).join(' | ') + (document.querySelector('.devil-sixes') ? ' DEVIL' : '') + (document.querySelector('.celebration') ? ' PERFECT' : '')); } }, 10); })`);
        const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
        const name = `t${String(at).replace('.', '_')}.jpg`;
        writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
        log.push(`${name}: ${info}`);
        console.log(log.at(-1));
    }
} finally { chrome.kill(); }
