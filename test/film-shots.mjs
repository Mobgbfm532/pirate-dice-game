// Stills of the intro film (not a test), sound off, in headless Chrome against the dev client.
//
//   node test/film-shots.mjs <out-dir> [sizes=384x780@2,1280x720@1] [stills=1.6,3,8] [live=18.8,21,24.2]
//
// stills: held moments of the paintings and words (times by the music's clock). live: shot while the
// film runs, for the real dice. Files: <out-dir>/<w>x<h>-t<time>.jpg.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const outDir = process.argv[2] ?? 'previews/intro';
const list = (v, d) => (v ?? d).split(',').filter(Boolean).map(Number);
const stills = list(args.stills, '3,8,10.8,13.5,16,26.5,28,28.8');
const live = list(args.live, '19,21.2,23.6,24.3');
const sizes = (args.sizes ?? '384x780@2,844x390@2,1280x720@1').split(',').map(s => {
    const [wh, dpr] = s.split('@');
    const [w, h] = wh.split('x').map(Number);
    return { w, h, dpr: Number(dpr ?? 1) };
});
const LEAD = 0.4;
const wait = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
const port = 9333 + Math.floor(Math.random() * 400);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'film-'))}`,
    args.gpu === '1' ? '--use-angle=d3d11' : '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--hide-scrollbars', 'about:blank'
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
        const shot = async name => {
            const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
            writeFileSync(join(outDir, `${w}x${h}-${name}.jpg`), Buffer.from(data, 'base64'));
        };
        const startFilm = async () => {
            await s('Page.navigate', { url: 'http://localhost:5173/next/' });
            await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__game && [...document.querySelectorAll('button')].some(b => b.textContent === 'Watch the intro')) { clearInterval(t); r(); } }, 100); })`);
            await wait(800);
            await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Watch the intro').click()`);
            await evaluate(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.film-black')) { clearInterval(t); r(); } }, 20); })`);
            return Date.now();
        };
        await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 768 });
        await s('Page.enable');
        await s('Page.addScriptToEvaluateOnNewDocument', {
            source: `try { ${args.sound === '1' ? '' : "localStorage.tavernMuted = '1';"} ${args.quality ? `localStorage.tavernQuality = JSON.stringify({ level: '${args.quality}', auto: false });` : ''} } catch {}
                window.__sources = []; const real = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__sources.push(Math.round(this.buffer ? this.buffer.duration : 0)); return real.apply(this, a); };
                window.__errors = []; addEventListener('error', e => __errors.push(e.message)); addEventListener('unhandledrejection', e => __errors.push(String(e.reason)));
                HTMLMediaElement.prototype.play = () => Promise.resolve();`
        });
        if (args.crawl) {
            // crawl=skip|full: a device's first Tavern Crawl, the film and then the table.
            await s('Page.navigate', { url: 'http://localhost:5173/next/' });
            await evaluate(`new Promise(r => { const t = setInterval(() => { if (window.__game) { clearInterval(t); r(); } }, 100); })`);
            await evaluate(`localStorage.removeItem('tavernIntroSeen')`);
            await s('Page.navigate', { url: 'http://localhost:5173/next/?x=' + Date.now() });
            await wait(2500);
            await evaluate(`localStorage.removeItem('tavernIntroSeen'); location.reload()`);
            await wait(2500);
            await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Tavern Crawl').click()`);
            await wait(1500);
            console.log('film up:', await evaluate(`!!document.querySelector('.film-black')`), 'seen:', await evaluate(`localStorage.tavernIntroSeen`), 'joined:', await evaluate(`window.__game.store.get().joined`));
            if (args.crawl === 'skip') await evaluate(`document.querySelector('.film-skip').click()`);
            else await wait(29500);
            await wait(900);
            console.log('after: film', await evaluate(`!!document.querySelector('.film')`), 'curtain', await evaluate(`!!document.querySelector('.film-curtain')`), 'joined', await evaluate(`window.__game.store.get().joined`), 'state', await evaluate(`!!window.__game.store.get().state`), 'turn', await evaluate(`window.__game.store.get().turn?.key ?? null`), 'filmPause', await evaluate(`window.__game.store.get().filmPause`));
            await shot('crawl-' + args.crawl + '-a');
            await wait(1500);
            await shot('crawl-' + args.crawl + '-b');
            await cdp.send('Target.closeTarget', { targetId });
            continue;
        }
        if (args.sound === '1') {
            // The sound's wiring, with Chrome itself muted (--mute-audio): what started, and any errors.
            await s('Page.navigate', { url: 'http://localhost:5173/next/' });
            await wait(3000);
            const box = await evaluate(`(() => { const r = [...document.querySelectorAll('button')].find(b => b.textContent === 'Watch the intro').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
            for (const type of ['mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
            await wait(4000);
            console.log('sources started (seconds long):', await evaluate(`JSON.stringify(__sources)`), 'errors:', await evaluate(`JSON.stringify(__errors)`));
            await evaluate(`document.querySelector('.film-skip').click()`);
            await wait(500);
            console.log('after skip: film', await evaluate(`!!document.querySelector('.film')`), 'start screen', await evaluate(`!!document.querySelector('.join')`), 'errors:', await evaluate(`JSON.stringify(__errors)`));
            await cdp.send('Target.closeTarget', { targetId });
            continue;
        }
        if (args.start === '1') {
            await s('Page.navigate', { url: 'http://localhost:5173/next/' });
            await wait(2500);
            await shot('start');
        }
        if (args.box === '1') {
            // The start screen's tick box: what a new device shows, then that it decides.
            const open = async () => { await s('Page.navigate', { url: 'http://localhost:5173/next/?x=' + Date.now() }); await wait(2200); };
            const ticked = () => evaluate(`document.querySelector('.intro-check input').checked`);
            const crawl = async () => { await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Tavern Crawl').click()`); await wait(900); return { film: await evaluate(`!!document.querySelector('.film')`), joined: await evaluate(`window.__game.store.get().joined`) }; };
            await open();
            await evaluate(`['tavernIntroSeen', 'tavernIntroOn'].forEach(k => localStorage.removeItem(k)); sessionStorage.clear()`);
            await open();
            console.log('new device: ticked', await ticked());
            await shot('box');
            console.log('  crawl:', JSON.stringify(await crawl()));
            await evaluate(`document.querySelector('.film-skip').click(); sessionStorage.clear()`);
            await open();
            console.log('seen, never chosen: ticked', await ticked());
            await evaluate(`document.querySelector('.intro-check input').click()`);
            await wait(100);
            console.log('ticked by hand:', await ticked(), 'saved', await evaluate(`localStorage.tavernIntroOn`));
            await open();
            console.log('after reload: ticked', await ticked());
            console.log('  crawl:', JSON.stringify(await crawl()));
            await evaluate(`document.querySelector('.film-skip').click(); sessionStorage.clear()`);
            await open();
            console.log('still ticked after watching:', await ticked());
            await evaluate(`document.querySelector('.intro-check input').click()`);
            await wait(100);
            await open();
            console.log('unticked: ticked', await ticked());
            console.log('  crawl:', JSON.stringify(await crawl()));
            await cdp.send('Target.closeTarget', { targetId });
            continue;
        }
        if (args.dieframes) {
            // dieframes=10,30,50: the opening die held at those frames of its throw.
            await startFilm();
            for (const f of args.dieframes.split(',').map(Number)) {
                await evaluate(`clearInterval(window.__hold); window.__hold = setInterval(() => { window.__dieClock.at = performance.now() - ${f} / 60 * 1000; }, 5)`);
                await wait(250);
                await shot(`t${f}`);
            }
            await cdp.send('Target.closeTarget', { targetId });
            continue;
        }
        if (live.length) {
            const started = await startFilm();
            for (const t of live) {
                await wait(Math.max(0, started + (t + LEAD) * 1000 - Date.now()));
                await shot(`t${t}`);
                console.log(`${w}x${h} live ${t}: shot ${((Date.now() - started) / 1000 - LEAD).toFixed(2)}`);
            }
        }
        if (stills.length) {
            await startFilm();
            for (const t of stills) {
                await evaluate(`window.__filmSeek(${t})`);
                await wait(120);
                await shot(`t${t}`);
            }
        }
        await cdp.send('Target.closeTarget', { targetId });
    }
    cdp.close();
} finally {
    chrome.kill();
}
