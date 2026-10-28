import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flame } from './look';
import { settings, tuning } from './tuning';

// The look preview's living air (option 1, step E, 23 Oct): what moves in the room besides the
// dice. Dust drifting in the candlelight over the table (3D, DustMotes); and, on the paintings
// behind (ScreenAir, driven by Room each frame so it sits exactly on them): embers rising from
// the tavern's fire (more, and redder, in the Devil's round), and each opponent's own: smoke from
// Frak's cigar, Vaelin's black flame, the Ridgeler's glowing hammer (PORTRAITS[..].air). A light
// shaft (SceneAir.shaft) is ready for a backdrop with windows; the tavern has none (one from its
// back opening couldn't be seen). The lanterns' breathing is in Room's shader (step B).

// ---- Where things are in the paintings (fractions of the image, from the top left) ----

export interface PaintedAir {
    // Smoke rising from a point: its colour, how dark it lays over the painting (normal blend) or
    // how it glows (additive), puffs a second, and how wide the source is.
    smoke?: { at: [number, number]; color: [number, number, number]; alpha: number; rate: number; spread?: number; rise?: number; glowing?: boolean };
    // A soft glow that pulses with the flame: radius as a fraction of the picture's height. `dark`
    // lays it over the painting as a shadow instead of adding light (Vaelin's black aura, 28 Oct).
    glow?: { at: [number, number]; color: [number, number, number]; radius: number; strength: number; pulse?: number; dark?: boolean };
}
export interface SceneAir {
    fire?: [number, number];           // embers rise from here
    fireWidth?: number;                // across the room's width
    shaft?: { from: [number, number]; to: [number, number]; width: number; color: [number, number, number]; strength: number };
}

// ---- A batch of soft quads in the screen plane (particles and glows) ----

const vertexShader = /* glsl */`
attribute vec4 tint;
varying vec2 vUv;
varying vec4 vTint;
void main() {
    vUv = uv;
    vTint = tint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// soft: 0 a round glow with a bright middle, 1 a smoke puff (flatter, ragged with the time).
// shaft: a beam (bright along its middle, fading to both sides and to its far end).
const fragmentShader = /* glsl */`
uniform float soft, shaft, sharpness;
varying vec2 vUv;
varying vec4 vTint;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
    float a;
    if (shaft > 0.5) {
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        a = smoothstep(0.0, 1.0, across) * smoothstep(1.0, 0.15, vUv.y) * smoothstep(0.0, 0.08, vUv.y);
    } else {
        float d = length(vUv - 0.5) * 2.0;
        a = soft > 0.5 ? smoothstep(1.0, 0.2, d) * (0.75 + 0.25 * sin(vUv.x * 9.0 + vUv.y * 7.0)) : pow(max(0.0, 1.0 - d), sharpness);
    }
    a *= vTint.a;
    gl_FragColor = vec4(toLinear(vTint.rgb) * a, a);
}`;

class QuadBatch {
    mesh: THREE.Mesh;
    private positions: Float32Array;
    private tints: Float32Array;
    private count = 0;
    constructor(readonly capacity: number, additive: boolean, soft: boolean, shaft = false, renderOrder = -2, sharpness = 2.2) {
        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(capacity * 4 * 3);
        this.tints = new Float32Array(capacity * 4 * 4);
        const uvs = new Float32Array(capacity * 4 * 2);
        const index: number[] = [];
        for (let i = 0; i < capacity; i++) {
            uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
            const v = i * 4;
            index.push(v, v + 1, v + 2, v, v + 2, v + 3);
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('tint', new THREE.BufferAttribute(this.tints, 4).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(index);
        const material = new THREE.ShaderMaterial({
            vertexShader, fragmentShader,
            uniforms: { soft: { value: soft ? 1 : 0 }, shaft: { value: shaft ? 1 : 0 }, sharpness: { value: sharpness } },
            // Drawn with the room, before the table (which covers them), whatever the distance.
            depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor, blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
            blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = renderOrder;
        this.mesh.raycast = () => {};
    }
    begin() { this.count = 0; }
    // A quad at screen px (cx, cy), w x h px, turned by angle, in the plane `map` turns px into.
    add(map: ScreenMap, cx: number, cy: number, w: number, h: number, color: [number, number, number], alpha: number, angle = 0) {
        if (this.count >= this.capacity || alpha <= 0.002) return;
        const c = Math.cos(angle), s = Math.sin(angle);
        const corners = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]; // uv (0,0) at the bottom left
        corners.forEach(([u, v], k) => {
            const px = cx + (u * w) * c - (-v * h) * s, py = cy + (u * w) * s + (-v * h) * c;
            this.positions.set([map.x0 + px * map.sx, map.y0 + py * map.sy, -map.depth], (this.count * 4 + k) * 3);
            this.tints.set([color[0], color[1], color[2], alpha], (this.count * 4 + k) * 4);
        });
        this.count++;
    }
    end() {
        const g = this.mesh.geometry;
        g.setDrawRange(0, this.count * 6);
        g.attributes.position.needsUpdate = true;
        g.attributes.tint.needsUpdate = true;
        this.mesh.visible = this.count > 0;
    }
}

export interface ScreenMap { x0: number; y0: number; sx: number; sy: number; depth: number }

interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; grow: number; color: [number, number, number]; alpha: number; seed: number }

// What Room tells the air each frame (screen px).
export interface AirFrame {
    map: ScreenMap;
    dt: number;           // seconds since the last frame
    room: { left: number; top: number; width: number; height: number; air?: SceneAir } | null;
    horizon: number;      // the table's far edge: nothing from the room shows below it anyway
    bust: { left: number; top: number; width: number; height: number; opacity: number; air?: PaintedAir; key: string } | null;
    devil: boolean;       // the Devil's round: more embers, redder
}

export class ScreenAir {
    group = new THREE.Group();
    private glowing = new QuadBatch(160, true, false, false, -2.5, 4.5); // embers: small bright sparks (behind the opponent)
    private beams = new QuadBatch(2, true, false, true, -2.6);        // the light shaft (on the room)
    private puffs = new QuadBatch(90, false, true, false, -0.6);      // smoke over the opponent
    private lights = new QuadBatch(40, true, false, false, -0.5);     // glowing smoke, glows
    private embers: Particle[] = [];
    private smoke: Particle[] = [];
    private emberDue = 0;
    private smokeDue = 0;
    private bustKey = '';

    constructor() {
        [this.beams, this.glowing, this.puffs, this.lights].forEach(b => this.group.add(b.mesh));
    }

    update(f: AirFrame) {
        const now = performance.now() / 1000;
        const fl = flame(now);
        const dt = Math.min(0.1, f.dt);
        [this.glowing, this.beams, this.puffs, this.lights].forEach(b => b.begin());

        // The room: embers from its fire, its shaft of light.
        const room = f.room;
        if (room && room.air) {
            const scale = room.height / 700;
            if (room.air.fire) {
                const [u, v] = room.air.fire;
                const rate = (f.devil ? 26 : 7) * tuning.air * settings().particles;
                this.emberDue += dt * rate;
                while (this.emberDue >= 1) {
                    this.emberDue -= 1;
                    const spread = (room.air.fireWidth ?? 0.05) * room.width;
                    this.embers.push({
                        x: room.left + u * room.width + (Math.random() - 0.5) * spread, y: room.top + v * room.height,
                        vx: (Math.random() - 0.5) * 16 * scale, vy: -(28 + Math.random() * 30) * scale,
                        age: 0, life: 2 + Math.random() * 2.2, size: (3 + Math.random() * 3) * Math.max(0.8, scale), grow: 0,
                        // (Brighter than paint can be, so the finish's glow catches them.)
                        color: f.devil ? [1.8, 0.5 + Math.random() * 0.3, 0.2] : [1.8, 1 + Math.random() * 0.4, 0.4], alpha: 1, seed: Math.random() * 10
                    });
                }
            }
            const s = room.air.shaft;
            if (s) {
                const ax = room.left + s.from[0] * room.width, ay = room.top + s.from[1] * room.height;
                const bx = room.left + s.to[0] * room.width, by = room.top + s.to[1] * room.height;
                const len = Math.hypot(bx - ax, by - ay);
                // Turned so the quad's top (uv.y 0, the bright end) is at the source.
                const angle = Math.atan2(ax - bx, by - ay);
                this.beams.add(f.map, (ax + bx) / 2, (ay + by) / 2, s.width * room.width, len, s.color, s.strength * (0.85 + 0.15 * Math.sin(now * 0.7)), angle);
            }
        }
        this.embers = this.embers.filter(p => (p.age += dt) < p.life);
        for (const p of this.embers) {
            p.x += (p.vx + Math.sin(now * 3 + p.seed) * 12) * dt;
            p.y += p.vy * dt;
            if (p.y > f.horizon) continue;
            const t = p.age / p.life;
            const twinkle = 0.6 + 0.4 * Math.sin(now * 17 + p.seed * 5);
            this.glowing.add(f.map, p.x, p.y, p.size * 2.4, p.size * 2.4, p.color, p.alpha * Math.pow(1 - t, 0.6) * Math.min(1, p.age * 6) * twinkle);
        }

        // The opponent's own: smoke from a point, a glow.
        const bust = f.bust;
        if (!bust || bust.key !== this.bustKey) { this.smoke = []; this.bustKey = bust ? bust.key : ''; }
        if (bust && bust.air) {
            const scale = bust.height / 420;
            const at = ([u, v]: [number, number]) => [bust.left + u * bust.width, bust.top + v * bust.height];
            const sm = bust.air.smoke;
            if (sm) {
                this.smokeDue += dt * sm.rate * Math.min(1, tuning.air);
                while (this.smokeDue >= 1) {
                    this.smokeDue -= 1;
                    const [x, y] = at(sm.at);
                    const spread = (sm.spread ?? 0.01) * bust.width;
                    this.smoke.push({
                        x: x + (Math.random() - 0.5) * spread, y,
                        vx: (Math.random() - 0.5) * 6 * scale, vy: -(sm.rise ?? 22) * (0.8 + Math.random() * 0.4) * scale,
                        age: 0, life: 2.6 + Math.random() * 1.6, size: 7 * scale, grow: 18 * scale,
                        color: sm.color, alpha: sm.alpha, seed: Math.random() * 10
                    });
                }
            }
            const g = bust.air.glow;
            if (g) {
                const [x, y] = at(g.at);
                const r = g.radius * bust.height * 2;
                // A slow swell with the flame, not a throb (the user's call, 23 Oct).
                const pulse = 1 + (g.pulse ?? 0.15) * (fl - 1) * 6;
                (g.dark ? this.puffs : this.lights).add(f.map, x, y, r, r, g.color, g.strength * pulse * bust.opacity);
            }
        }
        this.smoke = this.smoke.filter(p => (p.age += dt) < p.life);
        const glowingSmoke = !!bust?.air?.smoke?.glowing;
        for (const p of this.smoke) {
            p.x += (p.vx + Math.sin(now * 1.3 + p.seed) * 9) * dt;
            p.y += p.vy * dt;
            const t = p.age / p.life;
            const size = p.size + p.grow * t;
            const a = p.alpha * Math.min(1, p.age * 2.5) * (1 - t) * (bust ? bust.opacity : 0) * Math.max(1, tuning.air);
            (glowingSmoke ? this.lights : this.puffs).add(f.map, p.x, p.y, size, size * 1.15, p.color, a, p.seed + t * 0.8);
        }
        [this.glowing, this.beams, this.puffs, this.lights].forEach(b => b.end());
    }
}

// ---- Dust in the candlelight, over the table (3D) ----

const DUST = 44;
const CANDLE = new THREE.Vector3(3.5, 3, -3.5);
const dustVertex = /* glsl */`
attribute float seed;
uniform float time, scale, flicker, amount;
uniform vec3 candle;
varying float vLight;
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Brighter near the candle and in the fire's light from the left; each mote turns, so it
    // glints now and then.
    float near = 1.0 / (1.0 + 0.09 * dot(position - candle, position - candle));
    float glint = 0.55 + 0.45 * sin(time * (0.8 + fract(seed * 7.1)) + seed * 13.0);
    vLight = (0.12 + 0.9 * near * flicker + 0.1 * smoothstep(1.0, -5.0, position.x)) * glint;
    gl_PointSize = (1.6 + 2.0 * fract(seed * 3.7)) * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
}`;
const dustFragment = /* glsl */`
uniform float amount;
varying float vLight;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.0) * vLight * 0.9 * amount;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, a);
}`;

export function DustMotes() {
    const points = useRef<THREE.Points>(null);
    const { geometry, material, motes } = useMemo(() => {
        const motes = Array.from({ length: DUST }, () => ({
            p: new THREE.Vector3((Math.random() - 0.5) * 10, 0.3 + Math.random() * 3.2, -4 + Math.random() * 6.5),
            v: new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.06),
            seed: Math.random() * 10
        }));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(motes.map(m => m.seed)), 1));
        const material = new THREE.ShaderMaterial({
            vertexShader: dustVertex, fragmentShader: dustFragment,
            uniforms: { time: { value: 0 }, scale: { value: 300 }, flicker: { value: 1 }, amount: { value: 1 }, candle: { value: CANDLE } },
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
        });
        return { geometry, material, motes };
    }, []);

    useFrame(({ size, gl }, delta) => {
        const t = performance.now() / 1000;
        const dt = Math.min(0.1, delta);
        const pos = geometry.attributes.position as THREE.BufferAttribute;
        motes.forEach((m, i) => {
            // A slow wander that never settles: the drift turns gently over time.
            m.v.x += Math.sin(t * 0.3 + m.seed) * 0.002;
            m.v.z += Math.cos(t * 0.27 + m.seed * 1.7) * 0.002;
            m.v.y += Math.sin(t * 0.21 + m.seed * 2.3) * 0.001;
            m.v.clampLength(0, 0.12);
            m.p.addScaledVector(m.v, dt);
            if (m.p.x < -5) m.p.x += 10; else if (m.p.x > 5) m.p.x -= 10;
            if (m.p.z < -4) m.p.z += 6.5; else if (m.p.z > 2.5) m.p.z -= 6.5;
            if (m.p.y < 0.3) m.p.y = 3.4; else if (m.p.y > 3.5) m.p.y = 0.4;
            pos.setXYZ(i, m.p.x, m.p.y, m.p.z);
        });
        pos.needsUpdate = true;
        material.uniforms.time.value = t;
        material.uniforms.flicker.value = flame(t);
        material.uniforms.amount.value = tuning.dust;
        geometry.setDrawRange(0, Math.round(DUST * settings().particles));
        // Point size in device pixels at one unit away, so motes keep their size on any screen.
        material.uniforms.scale.value = size.height * gl.getPixelRatio() * 0.012;
    });

    return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
