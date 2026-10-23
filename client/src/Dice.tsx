import { useMemo, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { actions, canPutBack, store, table } from './game';
import { assignSlots, isLocked, type Die } from './rules';
import { readFrame } from './physics';
import { DIE_SIZE, TABLE_FAR_EDGE_Z, faceUpQuaternion, slotPosition, waitingPosition } from './layout';
import { createDiceMaterials } from './textures';
import { lookNext } from './look';

// The die the Loaded Die keepsake loads (the server's LOADED_DIE).
const LOADED_DIE = 0;

const DICE_IDS = [0, 1, 2, 3, 4, 5];

// Starting positions are created once. Passing a fresh Vector3 on every render would make
// React Three Fiber snap each die back to its start whenever the HUD re-renders.
const START_POSITIONS = DICE_IDS.map(waitingPosition);

// Scratch objects reused every frame to avoid garbage.
const targetPos = new THREE.Vector3();
const targetQuat = new THREE.Quaternion();

const STEAL_MS = 1400;

// Rokr's Constellation Blur: a little constellation hangs over each blurred die, its stars
// twinkling and joined by faint lines. Positions are around the die's top (die units).
const STAR_POINTS: [number, number][] = [[-0.42, -0.3], [-0.12, 0.38], [0.2, -0.05], [0.46, 0.34], [0.3, -0.44]];
const STAR_LINKS = [0, 1, 1, 2, 2, 3, 2, 4];

function starTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.18, 'rgba(210,225,255,0.95)');
    glow.addColorStop(0.45, 'rgba(140,170,255,0.35)');
    glow.addColorStop(1, 'rgba(120,150,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

function Constellation({ index, meshes }: { index: number; meshes: MutableRefObject<(THREE.Mesh | null)[]> }) {
    const group = useRef<THREE.Group>(null);
    const sprites = useRef<(THREE.Sprite | null)[]>([]);
    const map = useMemo(starTexture, []);
    const lines = useMemo(() => {
        const points = STAR_LINKS.map(i => new THREE.Vector3(STAR_POINTS[i][0], 0, STAR_POINTS[i][1]));
        return new THREE.BufferGeometry().setFromPoints(points);
    }, []);
    useFrame(() => {
        const g = group.current;
        const mesh = meshes.current[index];
        const die = store.get().turn?.dice.find(d => d.id === index);
        const show = !!g && !!mesh && mesh.visible && !!die?.hidden;
        if (!g) return;
        g.visible = show;
        if (!show || !mesh) return;
        g.position.set(mesh.position.x, mesh.position.y + DIE_SIZE * 0.75, mesh.position.z);
        const t = performance.now() / 1000;
        sprites.current.forEach((s, i) => {
            if (!s) return;
            const twinkle = 0.55 + 0.45 * Math.sin(t * (2.2 + i * 0.7) + index * 1.3 + i);
            s.scale.setScalar(0.34 + twinkle * 0.26);
            (s.material as THREE.SpriteMaterial).opacity = 0.5 + twinkle * 0.5;
        });
    });
    return (
        <group ref={group} visible={false}>
            <lineSegments geometry={lines}>
                <lineBasicMaterial color="#c4d4ff" transparent opacity={0.7} depthWrite={false} />
            </lineSegments>
            {STAR_POINTS.map(([x, z], i) => (
                <sprite key={i} ref={el => { sprites.current[i] = el; }} position={[x, 0, z]}>
                    <spriteMaterial map={map} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
                </sprite>
            ))}
        </group>
    );
}

// A die that rolled twice and kept the better (Double Bubble from the hot tub, Stason's
// Flourish): once the dice stop, the roll that lost rises from that die as a translucent ghost,
// face up, and fades away. One TwinGhost per possible ghost (`index` into the throw's list).
const GHOST_MS = 2200;
const ghostQuat = new THREE.Quaternion();

function TwinGhost({ index, geometry, materials, meshes }: { index: number; geometry: THREE.BufferGeometry; materials: ReturnType<typeof createDiceMaterials>; meshes: MutableRefObject<(THREE.Mesh | null)[]> }) {
    const ghosts = useSyncExternalStore(store.subscribe, () => store.get().ghosts);
    const ghost = ghosts && ghosts.dice[index] ? { ...ghosts.dice[index], at: ghosts.at } : null;
    const mesh = useRef<THREE.Mesh>(null);
    // Fresh see-through copies for each ghost (by then the painted faces have loaded): aqua for
    // the hot tub's die, plain ivory for Stason's.
    const faces = useMemo(() => (ghost?.kind === 'plain' ? materials.faces : materials.tub).map(m => {
        const copy = m.clone();
        copy.transparent = true;
        copy.depthWrite = false;
        copy.opacity = 0;
        return copy;
    }), [materials, ghosts?.at, ghost?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
    useFrame(() => {
        const g = mesh.current;
        if (!g) return;
        const t = ghost ? (performance.now() - ghost.at) / GHOST_MS : 1;
        const die = ghost ? meshes.current[ghost.die] : null;
        if (!ghost || !die || t >= 1) { g.visible = false; return; }
        g.visible = true;
        const rise = 1 - Math.pow(1 - Math.min(1, t / 0.3), 3);
        // Up and to one side, towards the middle of the table, so the kept die stays in view.
        const side = die.position.x > 0 ? -1 : 1;
        g.position.set(die.position.x + side * DIE_SIZE * 1.15 * rise, die.position.y + DIE_SIZE * (0.2 + 0.9 * rise), die.position.z);
        g.quaternion.copy(ghostQuat.copy(faceUpQuaternion(ghost.lost, 0)));
        g.scale.setScalar(0.8);
        const opacity = 0.6 * (t < 0.15 ? t / 0.15 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
        faces.forEach(f => { f.opacity = opacity; });
    });
    return <mesh ref={mesh} geometry={geometry} material={faces} visible={false} renderOrder={2} />;
}

// The look preview (step B): a soft dark patch where each die meets the table, so dice sit in
// the felt instead of floating; it fades and spreads as the die leaves the table.
function contactTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const shade = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    shade.addColorStop(0, 'rgba(0,0,0,0.85)');
    shade.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shade;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

export function Dice() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const geometry = useMemo(() => new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, 0.13), []);
    const materials = useMemo(createDiceMaterials, []);
    const meshes = useRef<(THREE.Mesh | null)[]>([]);
    const rings = useRef<(THREE.Mesh | null)[]>([]);
    const contacts = useRef<(THREE.Mesh | null)[]>([]);
    const contactMap = useMemo(() => (lookNext ? contactTexture() : null), []);
    const ringGeometry = useMemo(() => new THREE.RingGeometry(0.56, 0.68, 40), []);
    // An invisible sphere just beyond each die's corners, so taps needn't be exact. A sphere
    // (unlike a box) is the same size whichever way the die has landed.
    const hitGeometry = useMemo(() => new THREE.SphereGeometry(DIE_SIZE * 0.76, 16, 12), []);

    const turn = snap.turn;
    // The Loaded Die keepsake: one of the player's dice (LOADED_DIE) is gold on their turns.
    const loadedId = turn && turn.playerId !== 'BOT_MOLAR' && snap.state?.tavernRun?.keepsakes.some(k => k.id === 'loadedDie') ? LOADED_DIE : -1;
    // The Wild Magic Hot Tub: the die its surge works on is aqua on the player's turns.
    const surge = snap.state?.tavernRun?.tubSurge;
    const tubId = turn && turn.playerId !== 'BOT_MOLAR' && surge && surge.id !== 'pruney' ? surge.die : -1;
    const putBack = snap.putBackSlot !== null; // picking a kept die for Second Thoughts
    const canTouch = !!turn && snap.isMyTurn && !snap.rolling && turn.hasRolled && (!turn.finalized || putBack);

    useFrame((_, delta) => {
        const now = performance.now();
        const dice: Die[] = turn ? turn.dice : DICE_IDS.map(id => ({ id, value: 0, status: 'active' }));
        const slots = assignSlots(dice, table.lockOrder);
        const scoringCount = dice.filter(isLocked).length - [...slots.values()].filter(s => s < 2).length;
        const ease = 1 - Math.exp(-delta * 12);
        const roll = table.roll;

        dice.forEach(die => {
            const mesh = meshes.current[die.id];
            const ring = rings.current[die.id];
            if (!mesh || !ring) return;

            const trackIndex = roll ? roll.track.dieIds.indexOf(die.id) : -1;
            let showHidden = die.hidden || die.value === 0;
            mesh.visible = true;
            mesh.scale.setScalar(1);

            if (roll && trackIndex >= 0) {
                // Mid-throw: play the pre-simulated physics.
                const frame = Math.floor(((now - roll.startedAt) / 1000) * 60 * roll.speed);
                readFrame(roll.track, frame, trackIndex, mesh.position, mesh.quaternion);
                showHidden = roll.hidden.has(die.id);
            } else {
                if (die.status === 'stolen') {
                    // Klarg reaches over: the die is plucked up off the felt, hangs there a
                    // moment, then is swept back across the table to his side and gone.
                    const rest = table.rest.get(die.id);
                    const t = Math.min(1, Math.max(0, now - (table.stolenAt.get(die.id) ?? now)) / STEAL_MS);
                    const lift = Math.min(1, t / 0.3);
                    const sweep = Math.max(0, (t - 0.45) / 0.55);
                    const eased = sweep * sweep;
                    if (rest) {
                        targetPos.set(
                            rest.position.x * (1 - eased),
                            rest.position.y + lift * 1.6 + eased * 1.2,
                            rest.position.z + (TABLE_FAR_EDGE_Z - 1.5 - rest.position.z) * eased
                        );
                        mesh.position.copy(targetPos);
                    }
                    mesh.rotateY(delta * (2 + sweep * 10));
                    mesh.scale.setScalar(1 - eased * 0.7);
                    mesh.visible = t < 1;
                    targetQuat.copy(mesh.quaternion);
                } else if (isLocked(die)) {
                    const slot = slots.get(die.id) ?? 2;
                    targetPos.copy(slotPosition(slot, scoringCount));
                    if (die.status === 'lockedThisTurn') targetPos.y += 0.08;
                    if (showHidden) targetQuat.copy(mesh.quaternion);
                    else targetQuat.copy(faceUpQuaternion(die.value, (die.id - 2.5) * 0.05));
                } else {
                    const rest = table.rest.get(die.id);
                    targetPos.copy(rest ? rest.position : waitingPosition(die.id));
                    targetQuat.copy(rest ? rest.quaternion : new THREE.Quaternion());
                }
                mesh.position.lerp(targetPos, ease);
                mesh.quaternion.slerp(targetQuat, ease);
            }

            mesh.material = showHidden ? materials.hidden : die.mind ? materials.mind : die.id === tubId ? materials.tub : die.id === loadedId ? materials.loaded : materials.faces;

            // Gold ring under dice locked this roll (they can still be put back), and under the
            // dice a Second Thoughts Thonic could put back while one is being chosen.
            ring.visible = mesh.visible && (putBack && turn ? canPutBack(turn, die.status) : die.status === 'lockedThisTurn');
            ring.position.set(mesh.position.x, 0.012, mesh.position.z);

            const contact = contacts.current[die.id];
            if (contact) {
                const height = Math.max(0, mesh.position.y - DIE_SIZE / 2);
                const near = Math.max(0, 1 - height / 1.4);
                contact.visible = mesh.visible && near > 0;
                contact.position.set(mesh.position.x, 0.01, mesh.position.z);
                contact.scale.setScalar(mesh.scale.x * (1 + height * 0.5));
                (contact.material as THREE.MeshBasicMaterial).opacity = 0.75 * near * near;
            }
        });
    });

    // Taps count on touch-down: a "click" is cancelled if the finger moves even slightly,
    // which made tapping dice on phones unreliable.
    const onTap = (id: number) => (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        actions.toggleDie(id);
    };

    const tappable = (id: number) => {
        const die = turn?.dice.find(d => d.id === id);
        if (putBack) return canTouch && !!die && !!turn && canPutBack(turn, die.status);
        return canTouch && !!die && !die.mind && (die.status === 'active' || die.status === 'lockedThisTurn');
    };

    return (
        <group>
            {DICE_IDS.map(id => (
                <group key={id}>
                    <mesh
                        ref={el => { meshes.current[id] = el; }}
                        geometry={geometry}
                        material={materials.faces}
                        position={START_POSITIONS[id]}
                        castShadow
                        receiveShadow
                    >
                        <mesh
                            geometry={hitGeometry}
                            onPointerDown={onTap(id)}
                            onPointerOver={() => { if (tappable(id)) document.body.style.cursor = 'pointer'; }}
                            onPointerOut={() => { document.body.style.cursor = ''; }}
                        >
                            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                        </mesh>
                    </mesh>
                    <mesh ref={el => { rings.current[id] = el; }} geometry={ringGeometry} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                        <meshBasicMaterial color="#ffd54f" transparent opacity={0.85} />
                    </mesh>
                    {contactMap && (
                        <mesh ref={el => { contacts.current[id] = el; }} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={1}>
                            <planeGeometry args={[DIE_SIZE * 1.45, DIE_SIZE * 1.45]} />
                            <meshBasicMaterial map={contactMap} transparent depthWrite={false} toneMapped={false} />
                        </mesh>
                    )}
                    <Constellation index={id} meshes={meshes} />
                </group>
            ))}
            {[0, 1, 2, 3, 4, 5].map(i => <TwinGhost key={i} index={i} geometry={geometry} materials={materials} meshes={meshes} />)}
        </group>
    );
}
