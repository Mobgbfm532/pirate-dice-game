// Typed access to shared/rules.js, the same rules file the server runs.
// It is a UMD script, so importing it for its side effect sets self.GameRules.
import '../../shared/rules.js';

export type DieStatus = 'active' | 'lockedThisTurn' | 'permanentlyLocked' | 'stolen';
export type Suspense = 'none' | 'survival' | 'perfect';

export interface Die {
    id: number;
    value: number; // 0 = not rolled yet, or hidden by Rokr's blur
    status: DieStatus;
    hidden?: boolean;
}

export interface TurnOutcome {
    busted: boolean;
    score: number;
    suspense: Suspense;
    rollCount: number;
}

// Rules.viewTurn(): what the server lets players see of the current turn.
export interface TurnView {
    key: string;
    playerId: string;
    dice: Die[];
    rollCount: number;
    locksThisRoll: number;
    hasRolled: boolean;
    blurActive: boolean;
    suspense: Suspense;
    callout: string | null;
    finalized: boolean;
    outcome: TurnOutcome | null;
    canRoll: boolean;
}

interface GameRulesApi {
    PERFECT_SCORE: number;
    ABILITY_NAMES: Record<string, string>;
    getAbilityMaxUses(abilityId: string): number;
    scoreDice(dice: Die[]): { has2: boolean; has4: boolean; score: number };
}

export const Rules = (self as unknown as { GameRules: GameRulesApi }).GameRules;

export const isLocked = (d: Die) => d.status === 'lockedThisTurn' || d.status === 'permanentlyLocked';

// Where each locked die sits: the first 2 and first 4 take the "required" slots,
// the rest fill the score slots lowest first. Hidden dice always go to score slots.
export function assignSlots(dice: Die[]): Map<number, number> {
    const slots = new Map<number, number>();
    let has2 = false, has4 = false;
    const scoring: Die[] = [];
    dice.filter(isLocked).forEach(d => {
        if (!d.hidden && d.value === 2 && !has2) { has2 = true; slots.set(d.id, 0); }
        else if (!d.hidden && d.value === 4 && !has4) { has4 = true; slots.set(d.id, 1); }
        else scoring.push(d);
    });
    scoring.sort((a, b) => a.value - b.value).forEach((d, i) => slots.set(d.id, 2 + i));
    return slots;
}

const CALLOUT_TEXT: Record<string, (mine: boolean, botTurn: boolean, outcome: TurnOutcome | null) => [string, string]> = {
    earlyRoss: () => ['The Early Ross!', '#ffb74d'],
    didntBite: (mine, bot) => [bot ? 'The Molar NEVER bites' : mine ? "You didn't bite!" : "They didn't bite!", '#4fc3f7'],
    odds: () => ['What are the odds? (1/36)', '#ce93d8'],
    trouble: mine => [mine ? 'Ooh, you might be in trouble here' : 'Ooh, they might be in trouble here', '#e57373'],
    phew: () => ['Phew!', '#81c784'],
    knocking: mine => [mine ? "You're knocking at the door" : "They're knocking at the door", '#ffd54f'],
    doorOpen: () => ['The door is open!', '#b2ff59'],
    dust: () => ['DUST! Missing a 2 or a 4', '#e57373'],
    blessed: () => ['Blessed by the dice gods!', '#ffd54f'],
    perfect: () => ['Perfect 24!', '#ffd54f'],
    result: (_m, _b, outcome) => [`${outcome ? outcome.score : 0} points`, '#81c784']
};

export function calloutText(callout: string | null, mine: boolean, botTurn: boolean, outcome: TurnOutcome | null) {
    if (!callout || !CALLOUT_TEXT[callout]) return null;
    const [text, color] = CALLOUT_TEXT[callout](mine, botTurn, outcome);
    return { text, color };
}
