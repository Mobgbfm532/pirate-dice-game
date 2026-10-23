import { BOT_ID, store } from './game';
import { PORTRAITS, type Portrait } from './portraits';
import type { SceneAir } from './Air';

// The tavern behind the table, and the current opponent sitting across from you: where they go
// on screen and who sits there. They are drawn inside the 3D scene (Room.tsx) since 23 Oct, in
// the same places they had as page layers; the table covers whatever is below its far edge (the
// "horizon", measured each frame by the camera).

// The scenes behind the table. floor: how far down the image its own foreground table starts
// (our table covers from there); aspect: width / height; center: the point of the image that
// sits behind the opponent (on a phone only a slice around it shows).
// air: the look preview's living air in this picture (Air.tsx): where its fire is, its light shaft.
export interface Scene { file: string; floor: number; aspect: number; center: number; air?: SceneAir }
const TAVERN: Scene = {
    file: 'tavern.webp', floor: 0.77, aspect: 1408 / 768, center: 0.45,
    air: {
        fire: [0.215, 0.53], fireWidth: 0.05 // (the top of the flames: embers show only once clear of them)
    }
};
// Outside the Ghoul and Gourd: the bouncer's fight, by the front door.
const OUTSIDE: Scene = { file: 'ghoul-gourd-outside.webp', floor: 0.75, aspect: 1376 / 768, center: 0.6 };
const SCENES: Record<string, Scene> = { 'Sperm McGrath': OUTSIDE };

export function currentScene(): Scene {
    const name = opponentName();
    return (name && SCENES[name]) || TAVERN;
}

const HEADER_SPACE = 58; // keep the opponent's head clear of the turn line at the top

let last = '';
let steadyBust = 0;

// The latest layout in screen px (rounded, as the page layers had it), for the 3D room.
export const backdropLayout = { horizon: 0, roomLeft: 0, roomTop: 0, roomWidth: 0, roomHeight: 0, bustHeight: 0, tableX: 0 };

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

    Object.assign(backdropLayout, {
        horizon: Math.round(horizon), roomLeft: Math.round(left), roomTop: Math.round(top),
        roomWidth: Math.round(roomWidth), roomHeight: Math.round(height), bustHeight: Math.round(bustHeight)
    });
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
    backdropLayout.tableX = Math.round(tableCenterX);
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

// Martha in disguise: while she plays Frak's, Danhausen's or the Duke's trick (the round's effect
// is hers, `as` whose face), her picture is the one holding up that face (the user's paintings,
// 21 Oct): 'Martha as Frak' and so on in PORTRAITS. Otherwise the opponent's own name.
export function opponentPortraitKey(name: string): string {
    const effect = store.get().state?.tavernRun?.roundEffect;
    const disguised = name === 'Martha Mystery' && effect?.by === 'opponent' && effect.as ? `Martha as ${effect.as}` : null;
    return disguised && PORTRAITS[disguised] ? disguised : name;
}

// Who sits across the table: only a bot opponent (The Molar, or the current Tavern Crawl
// encounter). At a multiplayer table nobody does; the players' nameplates show whose turn it is.
// Only characters with a painted bust can sit there.
export function acrossTheTable(): { key: string; portrait: Portrait; isBot: boolean } | null {
    const { state, joined } = store.get();
    if (!joined || !state) return null;
    const bot = opponentName();
    const key = bot && opponentPortraitKey(bot);
    return key && PORTRAITS[key]?.bust ? { key, portrait: PORTRAITS[key], isBot: true } : null;
}

// What sits under the 3D canvas now: only the room's dark colour, until the scene has drawn.
export function Backdrop() {
    return <div className="backdrop" aria-hidden="true" />;
}
