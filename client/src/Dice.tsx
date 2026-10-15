import { useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { actions, store, table } from './game';
import { assignSlots, isLocked, type Die } from './rules';
import { readFrame } from './physics';
import { DIE_SIZE, faceUpQuaternion, slotPosition, waitingPosition } from './layout';
import { createDiceMaterials } from './textures';

const DICE_IDS = [0, 1, 2, 3, 4, 5];

// Starting positions are created once. Passing a fresh Vector3 on every render would make
// React Three Fiber snap each die back to its start whenever the HUD re-renders.
const START_POSITIONS = DICE_IDS.map(waitingPosition);

// Scratch objects reused every frame to avoid garbage.
const targetPos = new THREE.Vector3();
const targetQuat = new THREE.Quaternion();

export function Dice() {
    const snap = useSyncExternalStore(store.subscribe, store.get);
    const geometry = useMemo(() => new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, 0.13), []);
    const materials = useMemo(createDiceMaterials, []);
    const meshes = useRef<(THREE.Mesh | null)[]>([]);
    const rings = useRef<(THREE.Mesh | null)[]>([]);
    const ringGeometry = useMemo(() => new THREE.RingGeometry(0.56, 0.68, 40), []);
    // An invisible sphere just beyond each die's corners, so taps needn't be exact. A sphere
    // (unlike a box) is the same size whichever way the die has landed.
    const hitGeometry = useMemo(() => new THREE.SphereGeometry(DIE_SIZE * 0.76, 16, 12), []);

    const turn = snap.turn;
    const canTouch = !!turn && snap.isMyTurn && !snap.rolling && turn.hasRolled && !turn.finalized;

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
                    // Klarg's hand lifts the die off the table.
                    const rest = table.rest.get(die.id);
                    const t = Math.min(1, (now - (table.stolenAt.get(die.id) ?? now)) / 700);
                    if (rest) targetPos.copy(rest.position).add(new THREE.Vector3(0, t * 3, -t * 2));
                    mesh.scale.setScalar(1 - t);
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

            mesh.material = showHidden ? materials.hidden : materials.faces;

            // Gold ring under dice locked this roll (they can still be put back).
            ring.visible = die.status === 'lockedThisTurn' && mesh.visible;
            ring.position.set(mesh.position.x, 0.012, mesh.position.z);
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
        return canTouch && !!die && (die.status === 'active' || die.status === 'lockedThisTurn');
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
                </group>
            ))}
        </group>
    );
}
