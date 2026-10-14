import { useSyncExternalStore } from 'react';
import { BOT_ID, store } from './game';
import { PORTRAITS, type Portrait } from './portraits';

// The tavern behind the table, and the current opponent sitting across from you.
// It is drawn underneath the transparent 3D canvas, so the table covers whatever is
// below the table's far edge (the "horizon", measured each frame by the camera).

const BACKDROP_FLOOR = 0.77; // how far down the backdrop image its own foreground table starts
const BACKDROP_ASPECT = 1408 / 768;
const HEADER_SPACE = 58; // keep the opponent's head clear of the turn line at the top

let last = '';

// Called by the camera rig every frame with the far edge's height on screen (px).
export function layoutBackdrop(horizon: number, width: number) {
    // Scale the room so its floor meets our table, and always cover the full width.
    const height = Math.max(horizon / BACKDROP_FLOOR, width / BACKDROP_ASPECT);
    const roomWidth = height * BACKDROP_ASPECT;
    const top = horizon - height * BACKDROP_FLOOR;
    const left = width / 2 - roomWidth * 0.45;
    // About 80% of the bust shows above the table; the rest is hidden behind it.
    const bustHeight = Math.max(0, Math.min((horizon - HEADER_SPACE) / 0.8, 460));

    const key = [horizon, height, top, left, bustHeight].map(v => Math.round(v)).join(',');
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

// The bot opponent at this table, if any: The Molar in solo games, the current
// encounter in a Tavern Crawl.
export function opponentName(): string | null {
    const { state } = store.get();
    if (!state || !state.players[BOT_ID]) return null;
    if (state.mode === 'tavern-crawl' && state.tavernRun) return state.tavernRun.enemy.name;
    return state.players[BOT_ID].name;
}

// Who sits across the table: the bot opponent, or at a multiplayer table whoever is
// rolling (unless it's you). Only characters with a painted bust can sit there.
export function acrossTheTable(): { key: string; portrait: Portrait; isBot: boolean } | null {
    const { state, myId, joined } = store.get();
    if (!joined || !state) return null;
    const bot = opponentName();
    if (bot) return PORTRAITS[bot]?.bust ? { key: bot, portrait: PORTRAITS[bot], isBot: true } : null;
    const id = state.currentTurnId;
    if (!id || id === myId || !state.players[id]) return null;
    const avatar = state.players[id].avatar;
    return PORTRAITS[avatar]?.bust ? { key: id, portrait: PORTRAITS[avatar], isBot: false } : null;
}

export function Backdrop() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const across = acrossTheTable();
    const portrait = across?.portrait ?? null;
    const name = across?.key;
    // A bot brightens on its turn; a player across the table is always the one rolling.
    const theirTurn = across ? (!across.isBot || snap.state?.currentTurnId === BOT_ID) : false;

    return (
        <div className="backdrop" aria-hidden="true">
            <div className="tavern-room" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}art/tavern.webp")` }} />
            {portrait?.bust && (
                <img key={name} className={`opponent ${theirTurn ? 'active' : ''}`} src={portrait.src} alt="" />
            )}
        </div>
    );
}
