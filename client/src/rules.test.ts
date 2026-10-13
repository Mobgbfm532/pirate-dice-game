import { describe, expect, it } from 'vitest';
import { assignSlots, type Die, type DieStatus } from './rules';

const die = (id: number, value: number, status: DieStatus = 'permanentlyLocked'): Die => ({ id, value, status });

describe('assignSlots', () => {
    it('puts the first 2 and 4 in the required slots', () => {
        const slots = assignSlots([die(0, 6), die(1, 2), die(2, 4), die(3, 5)], new Map([[0, 1], [1, 2], [2, 3], [3, 4]]));
        expect(slots.get(1)).toBe(0);
        expect(slots.get(2)).toBe(1);
        expect(slots.get(0)).toBe(2);
        expect(slots.get(3)).toBe(3);
    });

    it('never moves a die that is already down when another is locked', () => {
        const order = new Map([[3, 1], [5, 2]]);
        const before = assignSlots([die(3, 6), die(5, 5), die(1, 1, 'active')], order);

        // Lock a lower die later, and a second 2 with a lower id than an earlier 2.
        order.set(1, 3);
        const after = assignSlots([die(3, 6), die(5, 5), die(1, 1, 'lockedThisTurn')], order);
        expect(after.get(3)).toBe(before.get(3));
        expect(after.get(5)).toBe(before.get(5));
        expect(after.get(1)).toBe(4);
    });

    it('keeps the earlier 2 in the required slot when a later 2 has a lower id', () => {
        const order = new Map([[4, 1], [0, 2]]);
        const slots = assignSlots([die(0, 2, 'lockedThisTurn'), die(4, 2)], order);
        expect(slots.get(4)).toBe(0);
        expect(slots.get(0)).toBe(2);
    });

    it('sends hidden dice to scoring slots', () => {
        const slots = assignSlots([{ id: 0, value: 0, status: 'lockedThisTurn', hidden: true }], new Map([[0, 1]]));
        expect(slots.get(0)).toBe(2);
    });
});
