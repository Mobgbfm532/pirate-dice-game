// The "before" side of before/after screenshots (not a test): serves the 3D client as it is in a
// git commit (default HEAD) on its own port, frozen, while the working copy keeps changing on
// :5173. Both talk to the same dev test server (:3002), so test/shots.mjs can shoot either:
//
//   node test/shots-base.mjs [ref=HEAD] [port=5174]       (the pane's launch entry: shots-base)
//   node test/shots.mjs previews/x/before client=http://localhost:5174/next/ ...
//   node test/shots.mjs previews/x/after ...
//
// It copies client/ and shared/ from the commit into .git/shots-base (outside the working tree),
// links client/node_modules and client/public from the working copy (the art is shared), and
// runs Vite there with its own cache, so the two dev servers don't trip over each other.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const ref = args.ref ?? process.env.SHOTS_REF ?? 'HEAD';
const port = args.port ?? '5174';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(repo, '.git', 'shots-base');
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });

const commit = git('rev-parse', '--short', ref).trim();
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true });
// The commit's client and shared rules, without the art (linked below).
const tar = join(base, 'base.tar');
git('archive', '--format=tar', '-o', tar, ref, 'client/src', 'client/index.html', 'client/vite.config.ts', 'client/tsconfig.json', 'client/package.json', 'shared');
execFileSync('tar', ['-xf', 'base.tar'], { cwd: base });
rmSync(tar);
for (const dir of ['node_modules', 'public']) {
    if (!existsSync(join(base, 'client', dir))) symlinkSync(join(repo, 'client', dir), join(base, 'client', dir), 'junction');
}
// Its own dependency cache (the working copy's Vite keeps client/node_modules/.vite).
const config = join(base, 'client', 'vite.config.ts');
writeFileSync(config, readFileSync(config, 'utf8').replace("base: '/next/',", "base: '/next/',\n    cacheDir: '.vite-cache',"));

console.log(`Serving ${ref} (${commit}) on http://localhost:${port}/next/`);
const vite = spawn(process.execPath, [join(repo, 'client', 'node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort'], {
    cwd: join(base, 'client'),
    env: { GAME_SERVER: 'http://localhost:3002', ...process.env },
    stdio: 'inherit'
});
const stop = () => vite.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
vite.on('exit', code => process.exit(code ?? 0));
