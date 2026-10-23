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
    mind?: boolean; // the die Frak's Mind Whip made you keep this throw (can't be tapped back)
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
    steady?: boolean; // a Steady Thonic was drunk: dust this turn counts as 0
}

interface GameRulesApi {
    PERFECT_SCORE: number;
    ABILITY_NAMES: Record<string, string>;
    getAbilityMaxUses(abilityId: string): number;
    scoreDice(dice: Die[]): { has2: boolean; has4: boolean; score: number };
    formatGold(amount: number): string;
}

export const Rules = (globalThis as unknown as { GameRules: GameRulesApi }).GameRules;

// A Tavern Crawl's money, in whole gold: "11 gold".
export const coins = (amount?: number) => Rules.formatGold(amount ?? 0);

export const isLocked = (d: Die) => d.status === 'lockedThisTurn' || d.status === 'permanentlyLocked';

// Where each locked die sits. Dice are placed in the order they were locked, so a die
// never shifts once it is down: the first 2 and first 4 take the "required" slots and
// every other die takes the next free scoring slot. Hidden dice always go to scoring slots.
export function assignSlots(dice: Die[], lockOrder: Map<number, number>): Map<number, number> {
    const slots = new Map<number, number>();
    let has2 = false, has4 = false, nextScoring = 2;
    const order = (d: Die) => lockOrder.get(d.id) ?? Infinity;
    dice.filter(isLocked).sort((a, b) => order(a) - order(b) || a.id - b.id).forEach(d => {
        if (!d.hidden && d.value === 2 && !has2) { has2 = true; slots.set(d.id, 0); }
        else if (!d.hidden && d.value === 4 && !has4) { has4 = true; slots.set(d.id, 1); }
        else slots.set(d.id, nextScoring++);
    });
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

// A perfect hand, for its celebration: a 24, or in a cursed round (the lowest valid hand wins)
// four 1s with the 2 and 4, which scores 4. A dust hand is never perfect, nor a cursed 24.
export function perfectHand(outcome: { busted: boolean; score: number }, cursed: boolean): 'perfect24' | 'perfect4' | null {
    if (outcome.busted) return null;
    if (cursed) return outcome.score === 4 ? 'perfect4' : null;
    return outcome.score === 24 ? 'perfect24' : null;
}
