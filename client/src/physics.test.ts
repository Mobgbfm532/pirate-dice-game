import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { paceFrame, paceSeconds, readFrame, simulateRoll, suspensePace, trackDuration } from './physics';
import { faceNormal, faceUpQuaternion, valueFacingUp } from './layout';

describe('simulateRoll', () => {
    it('always lands every die flat on the value the server chose', () => {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        for (let roll = 0; roll < 30; roll++) {
            const targets = [1, 2, 3, 4, 5, 6].map(() => 1 + Math.floor(Math.random() * 6));
            const track = simulateRoll([0, 1, 2, 3, 4, 5], targets);
            targets.forEach((target, i) => {
                readFrame(track, track.frames - 1, i, pos, quat);
                expect(valueFacingUp(quat)).toBe(target);
                expect(faceNormal(target).clone().applyQuaternion(quat).y).toBeGreaterThan(0.97); // lying flat
                expect(pos.y).toBeLessThan(0.55);
            });
            expect(trackDuration(track)).toBeLessThanOrEqual(4.55);
        }
    });

    it('handles a single die (the last-die suspense roll)', () => {
        const track = simulateRoll([5], [6]);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        readFrame(track, track.frames - 1, 0, pos, quat);
        expect(valueFacingUp(quat)).toBe(6);
    });
});

describe('impact sounds', () => {
    it('a throw records its knocks: dice hit the felt, and each other or the rail', () => {
        const track = simulateRoll([0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], 777);
        expect(track.impacts.length).toBeGreaterThan(5);
        expect(track.impacts.some(i => i.kind === 'felt')).toBe(true);
        expect(track.impacts.every(i => i.frame >= 0 && i.frame <= track.frames && i.strength > 0)).toBe(true);
    });
});

describe('seeded throws', () => {
    it('the same seed gives the identical tumble on every screen', () => {
        const a = simulateRoll([0, 2, 5], [6, 1, 4], 12345);
        const b = simulateRoll([0, 2, 5], [6, 1, 4], 12345);
        expect(a.frames).toBe(b.frames);
        expect(Array.from(a.data)).toEqual(Array.from(b.data));
    });

    it('different seeds give different throws', () => {
        const a = simulateRoll([0, 1], [3, 3], 1);
        const b = simulateRoll([0, 1], [3, 3], 2);
        expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
    });
});

describe('faceUpQuaternion', () => {
    it('puts the requested value on top', () => {
        for (let v = 1; v <= 6; v++) expect(valueFacingUp(faceUpQuaternion(v, 0.3))).toBe(v);
    });

    it('plays the last bounce of a suspense roll slower, and its clock runs both ways', () => {
        const track = simulateRoll([0, 1, 2], [2, 4, 6], 42);
        const plain = { speed: 0.55 }, slow = suspensePace(track, 0.55);
        expect(slow.slow!.to).toBeGreaterThan(slow.slow!.from);
        // Longer overall, the same before the slow stretch.
        expect(paceSeconds(slow, track.frames)).toBeGreaterThan(paceSeconds(plain, track.frames));
        expect(paceSeconds(slow, slow.slow!.from)).toBeCloseTo(paceSeconds(plain, slow.slow!.from));
        for (let f = 0; f < track.frames; f += 7) expect(paceFrame(slow, paceSeconds(slow, f))).toBeCloseTo(f, 6);
        // The cup sits at the end the dice are thrown from.
        expect(Math.abs(track.cup.x)).toBeGreaterThan(2);
    });
});
