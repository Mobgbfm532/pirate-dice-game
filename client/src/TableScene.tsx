import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Dice } from './Dice';
import { table } from './game';
import { REQUIRED_SLOT_X, SLOT_ROW_Z, TABLE_FAR_EDGE_Z, TRAY, slotPosition } from './layout';
import { artTexture, paintedTexture } from './textures';
import { layoutBackdrop } from './Backdrop';

const NEAR_EDGE_Z = SLOT_ROW_Z + 0.75; // front of the slot rail
const farPoint = new THREE.Vector3(0, 0, TABLE_FAR_EDGE_Z);
const nearPoint = new THREE.Vector3(0, 0, NEAR_EDGE_Z);
const projected = new THREE.Vector3();

// Frames the table on any screen shape. It solves for the camera distance and aim so the
// table's far edge sits a set way down the screen (the tavern backdrop fills the space
// above it) and the slot rail stays clear of the controls at the bottom. Portrait phones
// get a more top-down view so the dice stay big.
function CameraRig() {
    const { camera, size, scene } = useThree();
    const drift = useRef(0);
    const lookAt = useRef(new THREE.Vector3(0, 0, 0.7));

    useFrame((_, delta) => {
        const cam = camera as THREE.PerspectiveCamera;
        const aspect = size.width / size.height;
        const portrait = aspect < 0.9;
        const direction = new THREE.Vector3(0, 1, portrait ? 0.22 : 0.5).normalize();
        const top = portrait ? 0.32 : 0.33;
        const bottom = portrait ? 0.76 : 0.94;

        // On narrow screens the outer rails may crop slightly so the dice stay big enough to tap.
        const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * aspect);
        const minDistance = (portrait ? 4.05 : 4.6) / Math.tan(hHalf);

        const place = (distance: number) => {
            cam.position.copy(direction).multiplyScalar(distance).add(lookAt.current);
            cam.lookAt(lookAt.current);
            cam.updateMatrixWorld();
        };
        const screenY = (p: THREE.Vector3) => (1 - projected.copy(p).project(cam).y) / 2;

        let distance = Math.max(minDistance, cam.position.distanceTo(lookAt.current) || minDistance);
        for (let i = 0; i < 6; i++) {
            place(distance);
            const far = screenY(farPoint), near = screenY(nearPoint);
            const span = near - far;
            distance = Math.max(minDistance, distance * (span / (bottom - top)));
            lookAt.current.z += ((far + near) / 2 - (top + bottom) / 2) * ((NEAR_EDGE_Z - TABLE_FAR_EDGE_Z) / span);
        }

        // Lean in slowly while dice are in the air during a suspense roll.
        const suspense = table.roll && table.roll.speed < 1 ? 1 : 0;
        drift.current += (suspense - drift.current) * Math.min(1, delta * 2);
        place(distance * (1 - drift.current * 0.12));

        layoutBackdrop(screenY(farPoint) * size.height, size.width);

        // Fog only darkens the far end of the table, whatever the camera distance.
        if (scene.fog instanceof THREE.Fog) {
            scene.fog.near = distance * 1.15;
            scene.fog.far = distance * 2.6;
        }
    });
    return null;
}

function Tray() {
    // Painted textures (docs/art-direction.md). Each tiles at roughly real-world scale:
    // the felt image covers ~3 units, a table plank is about one die wide.
    const felt = useMemo(() => paintedTexture('felt.webp', 2.4, 1.4), []);
    const tabletop = useMemo(() => paintedTexture('table-wood.webp', 7), []);
    const rails = useMemo(() => paintedTexture('table-wood.webp', 2, 0.35), []);
    const slotRail = useMemo(() => paintedTexture('table-wood.webp', 1.6, 0.25), []);
    const width = TRAY.maxX - TRAY.minX;
    const depth = TRAY.maxZ - TRAY.minZ;
    const cx = (TRAY.minX + TRAY.maxX) / 2;
    const cz = (TRAY.minZ + TRAY.maxZ) / 2;
    const rail = 0.35;
    const h = 0.55;

    const railBoxes: [number, number, number, number][] = [
        [cx, TRAY.minZ - rail / 2, width + rail * 2, rail],
        [cx, TRAY.maxZ + rail / 2, width + rail * 2, rail],
        [TRAY.minX - rail / 2, cz, rail, depth],
        [TRAY.maxX + rail / 2, cz, rail, depth]
    ];

    return (
        <group>
            {/* Tabletop, ending just beyond the tray so the tavern shows behind it */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, (TABLE_FAR_EDGE_Z + 24) / 2]} receiveShadow>
                <planeGeometry args={[40, 24 - TABLE_FAR_EDGE_Z]} />
                <meshStandardMaterial map={tabletop} roughness={0.85} />
            </mesh>
            {/* Worn, lighter lip along the far edge */}
            <mesh position={[0, 0.02, TABLE_FAR_EDGE_Z + 0.06]}>
                <boxGeometry args={[40, 0.06, 0.12]} />
                <meshStandardMaterial map={rails} color="#c08a5a" roughness={0.6} />
            </mesh>
            {/* Felt */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, cz]} receiveShadow>
                <planeGeometry args={[width, depth]} />
                <meshStandardMaterial map={felt} roughness={1} />
            </mesh>
            {/* Rails */}
            {railBoxes.map(([x, z, w, d], i) => (
                <mesh key={i} position={[x, h / 2, z]} castShadow receiveShadow>
                    <boxGeometry args={[w, h, d]} />
                    <meshStandardMaterial map={rails} color="#8a6448" roughness={0.6} />
                </mesh>
            ))}
            {/* Slot rail in front of the tray */}
            <mesh position={[0.05, 0.004, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[width + 0.9, 1.25]} />
                <meshStandardMaterial map={slotRail} color="#a0785a" roughness={0.7} />
            </mesh>
            <Slots />
        </group>
    );
}

function Slots() {
    const two = useMemo(() => artTexture('plate-2.webp'), []);
    const four = useMemo(() => artTexture('plate-4.webp'), []);
    const plain = useMemo(() => artTexture('plate-blank.webp'), []);
    const scoring = [2, 3, 4, 5].map(slot => slotPosition(slot, 4));

    return (
        <group>
            {REQUIRED_SLOT_X.map((x, i) => (
                <mesh key={i} position={[x, 0.008, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[1.05, 1.05]} />
                    <meshStandardMaterial map={i === 0 ? two : four} transparent roughness={0.45} metalness={0.3} />
                </mesh>
            ))}
            {scoring.map((p, i) => (
                <mesh key={i} position={[p.x, 0.008, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[1.0, 1.0]} />
                    <meshStandardMaterial map={plain} transparent opacity={0.85} roughness={0.45} metalness={0.3} />
                </mesh>
            ))}
        </group>
    );
}

// Candle light that flickers, plus a red flash for the devil and gold for a perfect 24.
function Lights() {
    const candle = useRef<THREE.PointLight>(null);
    const flash = useRef<THREE.PointLight>(null);

    useFrame(() => {
        const t = performance.now() / 1000;
        if (candle.current) candle.current.intensity = 26 + Math.sin(t * 7.3) * 2.5 + Math.sin(t * 13.1) * 1.5;

        if (flash.current) {
            const devil = Math.max(0, 1 - (performance.now() - table.devilAt) / 1200);
            const gold = Math.max(0, 1 - (performance.now() - table.celebrateAt) / 2000);
            if (devil > gold) flash.current.color.set('#ff1a1a');
            else flash.current.color.set('#ffd54f');
            flash.current.intensity = Math.max(devil, gold) * 60;
        }
    });

    return (
        <>
            <hemisphereLight args={['#ffe0b2', '#2a160a', 0.55]} />
            <directionalLight
                position={[-4, 9, 5]}
                intensity={1.6}
                color="#ffe6c4"
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-camera-left={-6}
                shadow-camera-right={6}
                shadow-camera-top={6}
                shadow-camera-bottom={-6}
                shadow-bias={-0.0005}
            />
            <pointLight ref={candle} position={[3.5, 3, -3.5]} color="#ff9e40" distance={14} decay={1.6} />
            <pointLight ref={flash} position={[0, 3, 0]} distance={12} decay={1.4} intensity={0} />
        </>
    );
}

export function TableScene() {
    return (
        <>
            <fog attach="fog" args={['#120a05', 14, 30]} />
            <CameraRig />
            <Lights />
            <Tray />
            <Dice />
        </>
    );
}
