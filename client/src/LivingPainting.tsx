import { useEffect, useRef } from 'react';

// A living painting (since 24 Oct, the devil's three 6s): the user's picture drawn through a small
// WebGL shader so parts of it move. Its mask (`<name>-mask.webp`, made by process-art.mjs's
// livingMask) says which: red the flames, wide and soft, so they sway out into the clear
// background; blue the flames themselves, for their flicker; green the glowing pips and eyes.
// On top: a heat shimmer, a slow breath, and a glint in each eye. Without WebGL it is the
// plain picture.

const BASE = import.meta.env.BASE_URL;

// Loaded once, ahead of the moment, so the first one isn't blank.
const images = new Map<string, Promise<[HTMLImageElement, HTMLImageElement]>>();
function load(name: string) {
    let p = images.get(name);
    if (!p) {
        const one = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
        p = Promise.all([one(`${BASE}art/${name}.webp`), one(`${BASE}art/${name}-mask.webp`)]);
        images.set(name, p);
    }
    return p;
}
export function preloadPainting(name: string) { load(name).catch(() => { /* drawn plain instead */ }); }

const VERTEX = `
attribute vec2 pos;
varying vec2 uv;
void main() { uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5); gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D picture, mask;
uniform float t;
uniform vec2 eyes[2];
uniform float aspect;
varying vec2 uv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 s = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), s.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), s.x), s.y);
}

void main() {
    // A slow breath: the picture swells a touch around her chest.
    vec2 q = (uv - vec2(0.5, 0.62)) / (1.0 + 0.012 * sin(t * 4.2)) + vec2(0.5, 0.62);
    float wide = texture2D(mask, q).r;
    // Flames: sampled from lower down along scrolling noise, so they lick upward and sway.
    vec2 flow = vec2(noise(q * vec2(7.0, 4.0) + vec2(0.0, t * 2.6)) - 0.5,
                     noise(q * vec2(5.0, 3.0) + vec2(3.7, t * 3.4)) - 0.25);
    // Heat over everything: a shimmer far smaller than the flames'.
    vec2 heat = vec2(noise(q * 18.0 + vec2(t * 5.0, 0.0)) - 0.5, noise(q * 18.0 + vec2(0.0, t * 5.0)) - 0.5);
    vec2 s = q + flow * vec2(0.035, 0.05) * wide + heat * 0.0035;
    vec4 c = texture2D(picture, s);
    vec3 m = texture2D(mask, s).rgb;
    // The flames' own flicker: brighter and yellower in moving tongues.
    float lick = noise(s * vec2(10.0, 6.0) + vec2(0.0, t * 6.0));
    c.rgb *= 1.0 + m.b * (lick - 0.35) * 0.6;
    c.rgb += m.b * vec3(0.25, 0.12, 0.0) * smoothstep(0.55, 0.9, lick);
    // The green pips (and eyes) pulse with light.
    float pulse = 0.55 + 0.45 * sin(t * 10.0);
    c.rgb += m.g * vec3(0.25, 1.0, 0.35) * pulse * 0.55;
    // A glint in each eye, once, as she arrives: a small four-pointed star.
    float glint = smoothstep(0.35, 0.55, t) * (1.0 - smoothstep(0.65, 1.0, t));
    for (int i = 0; i < 2; i++) {
        vec2 d = (uv - eyes[i]) * vec2(aspect, 1.0);
        float star = 0.0006 / (abs(d.x * d.y) * 40.0 + dot(d, d) * 2.0 + 0.0004);
        c.rgb += vec3(0.85, 1.0, 0.85) * min(star, 1.5) * glint;
        c.a = max(c.a, min(star, 1.0) * glint);
    }
    gl_FragColor = vec4(c.rgb, c.a);
}`;

interface Props {
    name: string;                 // the picture in public/art (and its -mask)
    eyes: [[number, number], [number, number]]; // where the eyes are, 0-1 across and down
    className?: string;
}

export function LivingPainting({ name, eyes, className }: Props) {
    const holder = useRef<HTMLSpanElement>(null);
    const fallback = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (!holder.current) return;
        // A new canvas each time it mounts: a context once given back can't be used again.
        const el = document.createElement('canvas');
        if (className) el.className = className;
        el.setAttribute('aria-hidden', 'true');
        holder.current.appendChild(el);
        let frame = 0, gone = false;
        const gl = el.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
        const plain = () => { el.style.display = 'none'; if (fallback.current) fallback.current.style.display = ''; };
        el.style.visibility = 'hidden'; // until its first frame is drawn
        if (!gl) { plain(); return; }

        load(name).then(([picture, mask]) => {
            if (gone) return;
            el.width = picture.naturalWidth;
            el.height = picture.naturalHeight;
            gl.viewport(0, 0, el.width, el.height);
            const shader = (type: number, src: string) => {
                const s = gl.createShader(type)!;
                gl.shaderSource(s, src);
                gl.compileShader(s);
                return s;
            };
            const program = gl.createProgram()!;
            gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { plain(); return; }
            gl.useProgram(program);

            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const pos = gl.getAttribLocation(program, 'pos');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            [picture, mask].forEach((img, i) => {
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            });
            gl.uniform1i(gl.getUniformLocation(program, 'picture'), 0);
            gl.uniform1i(gl.getUniformLocation(program, 'mask'), 1);
            gl.uniform2fv(gl.getUniformLocation(program, 'eyes'), eyes.flat());
            gl.uniform1f(gl.getUniformLocation(program, 'aspect'), el.width / el.height);
            const time = gl.getUniformLocation(program, 't');

            const start = performance.now();
            const draw = (now: number) => {
                if (gone) return;
                gl.uniform1f(time, (now - start) / 1000);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                el.style.visibility = '';
                frame = requestAnimationFrame(draw);
            };
            frame = requestAnimationFrame(draw);
        }).catch(plain);

        return () => {
            gone = true;
            cancelAnimationFrame(frame);
            // Give the context back at once: browsers allow only a handful at a time.
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
            el.remove();
        };
    }, [name, eyes, className]);

    return (
        <>
            {/* (display: contents, so the canvas is placed as if it sat here itself) */}
            <span ref={holder} style={{ display: 'contents' }} />
            <img ref={fallback} className={className} src={`${BASE}art/${name}.webp`} alt="" style={{ display: 'none' }} />
        </>
    );
}
