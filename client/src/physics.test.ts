import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFrame, simulateRoll, trackDuration } from './physics';
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
            expect(trackDuration(track)).toBeLessThanOrEqual(3.55);
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

describe('faceUpQuaternion', () => {
    it('puts the requested value on top', () => {
        for (let v = 1; v <= 6; v++) expect(valueFacingUp(faceUpQuaternion(v, 0.3))).toBe(v);
    });
});
