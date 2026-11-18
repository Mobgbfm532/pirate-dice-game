# Telling the player what an ability did (brainstorm, 18 Nov)

The user, 18 Nov: "Can we workshop a way to let the player know what certain abilities have done? Like Brodor's
ability and Jag's Smooth Talker. His ability kind of overlays the potion drinking animation. A banner that tells the
player what happens may be more appropriate."

## The problem

Since 28 Oct an ability's screen shows only its name. For abilities whose effect is on the dice (Mind Whip, Inkfire,
Vexing Rapier) the table shows what happened. For the ones that change hearts, Thonics or a score, nothing does:

- **Astral Flood** (Brodor): he heals a heart and takes one of yours. The banner says "Astral Flood"; the hearts change
  under the wave. Easy to miss which heart moved where.
- **Smooth Talker** (Jaguar), with Thonics: he takes one from your shelf and drinks it. The moment carries `thonic`, so
  it plays like your own Thonic being drunk (the bottle pops and tips): it reads as *you* drinking it.
- **Smooth Talker**, empty shelf, and **Penitent Stare**: your score drops at the round's end ("20 → 16" is shown, but briefly).
- **Divine Smite** landing (two hearts), **All In**, the **Shield** catching one of them.

The server already sends a plain sentence with every one of these (`text` on `signatureMove`, e.g. "He demands your
Healing Thonic and drinks it and heals a heart."). The client just doesn't show it any more.

## Ideas

1. **The aftermath ribbon** (recommended). After the ability's moment has gone, a parchment ribbon in a brass rim
   slides down under the header (or across the top of the felt on a phone) for about 3 s: the ability's painted icon,
   then one line in plain words. "Brodor heals a heart and takes one of yours." "Jaguar drinks your Healing Thonic: he
   heals a heart." "Penitent Stare: your 20 becomes 16." Built from the game's own parchment and brass. Only for the
   abilities whose result isn't on the dice (a list, so Mind Whip etc. stay as they are). It goes through the moment
   queue, so it never lands on top of the next throw. Tap to dismiss.
2. **Point at what changed.** Alongside the ribbon: the hearts that moved get a small tag ("+1" on his nameplate, the
   crack on yours with "Astral Flood" under it for a second).
3. **Jaguar's Thonic, his own moment.** Instead of the potion-drinking animation, your bottle lifts off *your* shelf,
   flies across to Jaguar's nameplate and is gone with a glug (his ability's colours, not the Thonic's moment). Then
   the ribbon says which one and what it did. This fixes the "it looks like I drank it" problem.
4. **Bring back the old line under the name** on the ability screen (removed 28 Oct). Simple, but it's on screen only
   1.85 s, before the effect, and the user wanted those screens clean.
5. **A fight log.** A tap on the opponent's ✦ marks shows what each ability did this fight. Useful as a back-up for
   anyone who missed it; not a substitute for 1.

**Built (18 Nov, the user's "Yes build both"): 1 and 3.** `after` on the server's `signatureMove` (Astral Flood, Smooth Talker both kinds, Penitent Stare, Divine Smite landing, the Ace), `showAftermath` in game.ts, `AftermathRibbon` in Hud (`.aftermath-ribbon`, `.stolen-bottle`); dev: `preview.aftermath(ability, line, thonic?)`. All In isn't in it (the round result says two hearts). The lines are the drafts below, in the game now, for the user to rewrite.

**Claude's recommendation:** 1 + 3 (the ribbon for every heart/Thonic/score ability, and Jaguar's bottle flying to
him), 2 if the ribbon alone isn't clear enough on a phone.

## Lines the ribbon shows (Claude's drafts, in the game since 18 Nov, for the user to rewrite)

- Astral Flood: "Brodor heals a heart and takes one of yours." / with the Shield: "Brodor heals a heart. Your Shield of Fuckery holds yours."; on your last heart: "Brodor heals a heart."
- Smooth Talker (Thonic): "Jaguar takes your [Thonic] and drinks it[: he heals a heart / : his dust this round scores as it lies]."
- Smooth Talker (empty shelf): "Jaguar talks your [20] down to [17]."
- Penitent Stare: "The Hangman's stare: your [20] becomes [16]."
- Divine Smite landing: "Divine Smite: you lose two hearts." / "Divine Smite: two hearts. Your Shield of Fuckery catches one."
- The Ace of Spades: "The Hangman fires the Ace of Spades: his [18] becomes a perfect 24."
- All In (a round lost): "All In: two hearts lost."
