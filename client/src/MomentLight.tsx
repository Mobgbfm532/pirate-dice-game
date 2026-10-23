import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { store, table, type AbilityMoment } from './game';

// The look preview's big moments as light (option 1, step F, 23 Oct): they light the room itself,
// timed with their banners (as the moment shows on screen), not only the screen. A coloured light
// over the table (a beam from above for the Smite), and the same light washing over the tavern
// painting and the opponent (Room reads `roomWash`). It swells in fast and fades over a few seconds.

interface Kind {
    color: string;
    light: number;   // the light over the table (0: none)
    beam?: number;   // a spotlight straight down onto the table instead
    wash: number;    // how strongly the painting and the opponent take the colour
    sky?: number;    // a soft fill over everything (Astral Flood's wash of light)
    ms: number;      // how long it takes to fade
    shimmer?: boolean;
}
// Tuned 23 Oct from frozen-clock before/after shots: the room carries the colour, while the light on
// the dice stays gentle, so red 1s, green 6s and black pips still read.
const KINDS: Record<string, Kind> = {
    devil: { color: '#ff2a14', light: 35, wash: 0.55, ms: 2600 },          // the Duke's Devil (and the mask's)
    ink: { color: '#9b4dff', light: 50, wash: 0.45, ms: 2600 },           // Vaelin's Inkfire
    smite: { color: '#ffd36b', light: 0, beam: 30, wash: 0.45, ms: 2800 }, // the Ridgeler's Smite: a beam onto the table
    flood: { color: '#fff2cc', light: 40, wash: 0.75, sky: 1.6, ms: 2800 }, // Brodor's Astral Flood: a white-gold wash
    keepsake: { color: '#ffc94d', light: 45, wash: 0.5, ms: 2200 },       // a keepsake working
    shield: { color: '#6ab7ff', light: 22, wash: 0.5, ms: 2400, shimmer: true }, // the Shield
    perfect: { color: '#ffd54f', light: 95, wash: 0.5, ms: 2600 },        // a perfect 24: bright enough to bloom
    sixes: { color: '#ff2a14', light: 30, wash: 0.35, ms: 1400 }          // three 6s land (the devil effect)
};

function kindOf(m: AbilityMoment): string | null {
    if (m.cancelled) return null; // a Clear-Eye stopped it: none of its effect
    if (m.keepsake === 'bentCopper') return 'shield';
    if (m.name === 'Keepsake') return 'keepsake';
    switch (m.ability) {
        case 'Sympathy for the Devil': return 'devil';
        case 'Inkfire Brand': return 'ink';
        case 'Divine Smite': return 'smite';
        case 'Astral Flood': return 'flood';
        default: return null;
    }
}

// What the room behind takes from the moment this frame: a colour (already scaled by strength).
export const roomWash = new THREE.Color(0, 0, 0);

const lit = new THREE.Color();
export function MomentLights() {
    const point = useRef<THREE.PointLight>(null);
    const beam = useRef<THREE.SpotLight>(null);
    const sky = useRef<THREE.HemisphereLight>(null);
    const seen = useRef({ at: 0, perfect: 0, sixes: 0 });
    const active = useRef<{ kind: Kind; at: number } | null>(null);

    useFrame(() => {
        const now = performance.now();
        const s = seen.current;
        const start = (kind: string, at: number) => { active.current = { kind: KINDS[kind], at }; };
        const moment = store.get().ability;
        if (moment && moment.at !== s.at) {
            s.at = moment.at;
            const kind = kindOf(moment);
            if (kind) start(kind, moment.at);
        }
        if (table.celebrateAt !== s.perfect) { s.perfect = table.celebrateAt; if (s.perfect) start('perfect', s.perfect); }
        if (table.devilAt !== s.sixes) { s.sixes = table.devilAt; if (s.sixes) start('sixes', s.sixes); }

        const a = active.current;
        let strength = 0;
        if (a) {
            const t = now - a.at;
            strength = t < 180 ? t / 180 : Math.pow(Math.max(0, 1 - (t - 180) / (a.kind.ms - 180)), 1.5);
            if (a.kind.shimmer) strength *= 0.8 + 0.2 * Math.sin(t / 1000 * 5);
            if (strength <= 0) active.current = null;
        }
        const kind = a?.kind;
        lit.set(kind?.color ?? '#000000');
        if (point.current) { point.current.color.copy(lit); point.current.intensity = (kind?.light ?? 0) * strength; }
        if (beam.current) { beam.current.color.copy(lit); beam.current.intensity = (kind?.beam ?? 0) * strength; }
        if (sky.current) { sky.current.color.copy(lit); sky.current.intensity = (kind?.sky ?? 0) * strength; }
        roomWash.copy(lit).multiplyScalar((kind?.wash ?? 0) * strength);
    });

    return (
        <>
            <pointLight ref={point} position={[0, 4.5, 0.3]} distance={16} decay={1.3} intensity={0} />
            <spotLight ref={beam} position={[0, 9, -0.6]} angle={0.45} penumbra={0.9} distance={20} decay={1.2} intensity={0} /> {/* (aimed at the table's middle: its target stays at the origin) */}
            <hemisphereLight ref={sky} args={['#ffffff', '#000000', 0]} />
        </>
    );
}
