import { useSyncExternalStore } from 'react';
import { BOT_ID, store } from './game';
import { PORTRAITS, type Portrait } from './portraits';

// The tavern behind the table, and the current opponent sitting across from you.
// It is drawn underneath the transparent 3D canvas, so the table covers whatever is
// below the table's far edge (the "horizon", measured each frame by the camera).

// The scenes behind the table. floor: how far down the image its own foreground table starts
// (our table covers from there); aspect: width / height; center: the point of the image that
// sits behind the opponent (on a phone only a slice around it shows).
interface Scene { file: string; floor: number; aspect: number; center: number }
const TAVERN: Scene = { file: 'tavern.webp', floor: 0.77, aspect: 1408 / 768, center: 0.45 };
// Outside the Ghoul and Gourd: the bouncer's fight, by the front door.
const OUTSIDE: Scene = { file: 'ghoul-gourd-outside.webp', floor: 0.75, aspect: 1376 / 768, center: 0.6 };
const SCENES: Record<string, Scene> = { 'Sperm McGrath': OUTSIDE };

function currentScene(): Scene {
    const name = opponentName();
    return (name && SCENES[name]) || TAVERN;
}

const HEADER_SPACE = 58; // keep the opponent's head clear of the turn line at the top

let last = '';
let steadyBust = 0;

// Called by the camera rig every frame with the far edge's height on screen (px). leaning: the
// camera is leaning in on a suspense roll; the opponent keeps their size (only moves with the
// table's edge) rather than shrinking as the edge rises.
export function layoutBackdrop(horizon: number, width: number, leaning = false) {
    // Scale the room so its floor meets our table, and always cover the full width.
    const scene = currentScene();
    const height = Math.max(horizon / scene.floor, width / scene.aspect);
    const roomWidth = height * scene.aspect;
    const top = horizon - height * scene.floor;
    const left = Math.min(0, Math.max(width - roomWidth, width / 2 - roomWidth * scene.center));
    // About 80% of the bust shows above the table; the rest is hidden behind it.
    // A Tavern Crawl has no turn banner at the top, so the opponent may rise nearly to the top edge
    // (the header's buttons sit in the corners).
    const headerSpace = store.get().state?.mode === 'tavern-crawl' ? 10 : HEADER_SPACE;
    let bustHeight = Math.max(0, Math.min((horizon - headerSpace) / 0.8, 460));
    if (leaning && steadyBust > 0) bustHeight = steadyBust;
    else steadyBust = bustHeight;

    const key = [horizon, height, top, left, bustHeight].map(v => Math.round(v)).join(',') + scene.file;
    if (key === last) return;
    last = key;
    const css = document.documentElement.style;
    css.setProperty('--horizon', `${Math.round(horizon)}px`);
    css.setProperty('--room-w', `${Math.round(roomWidth)}px`);
    css.setProperty('--room-h', `${Math.round(height)}px`);
    css.setProperty('--room-top', `${Math.round(top)}px`);
    css.setProperty('--room-left', `${Math.round(left)}px`);
    css.setProperty('--bust-h', `${Math.round(bustHeight)}px`);
}

// Where the table is on screen: the right-hand end of the slot rail (so wide screens can put
// the Roll button right beside it) and the table's centre line (where the opponent sits).
let lastAnchor = '';
export function setRailAnchor(x: number, y: number, tableCenterX: number) {
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(tableCenterX)}`;
    if (key === lastAnchor) return;
    lastAnchor = key;
    const css = document.documentElement.style;
    css.setProperty('--rail-right', `${Math.round(x)}px`);
    css.setProperty('--rail-y', `${Math.round(y)}px`);
    css.setProperty('--table-x', `${Math.round(tableCenterX)}px`);
}

// The bot opponent at this table, if any: The Molar in solo games, the current
// encounter in a Tavern Crawl.
// Between fights (the scenes are up) nobody sits there; the next opponent makes an entrance.
export function opponentName(): string | null {
    const { state, betweenShown } = store.get();
    if (!state || !state.players[BOT_ID]) return null;
    if (state.mode === 'tavern-crawl' && state.tavernRun) return betweenShown ? null : (state.tavernRun.seated ?? state.tavernRun.enemy).name;
    return state.players[BOT_ID].name;
}

// Who sits across the table: only a bot opponent (The Molar, or the current Tavern Crawl
// encounter). At a multiplayer table nobody does; the players' nameplates show whose turn it is.
// Only characters with a painted bust can sit there.
export function acrossTheTable(): { key: string; portrait: Portrait; isBot: boolean } | null {
    const { state, joined } = store.get();
    if (!joined || !state) return null;
    const bot = opponentName();
    return bot && PORTRAITS[bot]?.bust ? { key: bot, portrait: PORTRAITS[bot], isBot: true } : null;
}

export function Backdrop() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const across = acrossTheTable();
    const portrait = across?.portrait ?? null;
    const name = across?.key;
    // The bot brightens on its turn.
    const theirTurn = !!across && snap.state?.currentTurnId === BOT_ID;

    return (
        <div className="backdrop" aria-hidden="true">
            <div className="tavern-room" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/${currentScene().file}")` }} />
            {portrait?.bust && (
                <img key={name} className={`opponent ${theirTurn ? 'active' : ''}`} src={portrait.src} alt=""
                    style={portrait.seat ? { height: `calc(var(--bust-h, 0px) * ${portrait.seat})` } : undefined} />
            )}
        </div>
    );
}
