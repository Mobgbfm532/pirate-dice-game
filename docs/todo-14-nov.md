# To do, 14 Nov (the user's notes, 13 Nov evening)

Five things the user saw playing the ship (the Klarg test server, `dev-test-server-klarg`). All five
were done on 14 Nov (not yet committed or pushed); what was done follows each.

1. **Klarg's cut-outs are blurry round the edges**, the bust and the Reach Around painting (both
   cut with `cutOutFlat` on 13 Nov, `fade: { left: 140 }` and `fade: { left: 90, right: 40, bottom: 60 }`
   in process-art.mjs). Look at the edges at full size: the despill or the fades may be too soft, or
   the paintings came in at a lower resolution than they look (both 1192x896).
   - **Done:** the resolution was fine (1032x720 and 1187x867 out of 1192x896). The paintings are soft and
     their outline fades into the magenta; the cut kept that ring of half-and-half pixels, which despill
     turned into a muddy rim. Now the outline is trimmed 2 px (`choke`), the result sharpened a little
     (`sharpen: 0.8`), and the fades are shorter (bust left 70; Reach Around left 50, right and bottom 24,
     so the die at the bottom no longer fades out). Before/after: `previews/klarg-edges/cmp-*.png`.
2. **All the dice look awful on the Salty Swallow.** Find out why there and not ashore: the ship's
   lighting and backdrop (the gun deck at sea), the opponents' painted dice (all ten new sets went in
   on 13 Nov), or the sea's lean. Compare the same set ashore and aboard, then propose a fix.
   - **Found:** nothing in the table's light changes aboard. It was the ship opponents' dice: the face
     cleaning of 3 Nov redraws each face as one even colour and each pip as a flat disc. That suited the
     plain ashore sets, but the ship's sets *are* their texture (Klarg's wood grain and carved pips, Áéd's
     scales, Jaguar's rosettes, Rokr's swirling pips, the Hangman's black wood), so they came out as flat
     blocks of colour (`previews/shipdice/sheets.png`: your painting left, the game's right). Also seen:
     against Áéd, Heightened Dice shows six ghost dice at once for 2.2 s, which crowds the felt.
   - **Done (a proposal to judge on the phone):** the five ship sets keep the painting's fine texture and
     their painted pips; only the painting's broad lighting is still taken out (`TEXTURED` in
     process-art.mjs; Jaguar's texture at 60%, as his rosettes crowded his pips). `previews/shipdice/sheets-after.png`.
3. **Jaguar's Smooth Talk took 3 off the user's score with Thonics on the shelf.** Note: since 9 Nov
   (the user's rule) he takes a Healing only when he's down on hearts, so with only Healings on the
   shelf and his hearts full he talks 3 off your hand instead. That may be what happened (the test
   servers start with three Healings). Ask whether he should take a Healing anyway when there's
   nothing else. Also the user wants it **only at the end of the round** (not telegraphed before),
   like the Hangman's Penitent Stare since 10 Nov.
   - **Done (the user's answers, 14 Nov):** after a round he loses a heart, as the next round begins he
     demands one of your Thonics and drinks it (a Healing first, which heals him, else a Steady, else any
     other; never an Elf Bar). With no Thonic left he talks you into scoring 3 less at a round's end, only
     when that saves him. `jaguarDemandsThonic` and `smoothTalkAtEnd` in server.js; three tests.
4. **When hands are hidden (a fog bank, Jaguar's Cloak), show the opponent's score at the end of the
   round.** The round result (and the nameplate) should reveal what they got once both hands are
   done (`fogMask` in getRoomState; the Cloak's `turn.cloaked`).
   - **Done:** the round's result opens with "The Hangman: 23." and his nameplate shows the score while
     the result is up (`reveal` on `roundResult`, `revealed` in the client's store). His dice in the slots
     still show "?" until the next round. A test.
5. **Kept dice fill the slots that aren't the 2 and the 4**, so with all six kept they look as if they
   overlap. Use the 2 and 4 slots for the 2 and the 4 (slot placement by lock order in Dice.tsx,
   `slotPosition` in layout.ts).
   - **Done:** this happened with hidden dice (fog, the Cloak, Starry Form: no face known, so none could
     go to the 2's or 4's slot) and dust hands. A fifth and sixth die now take the 2's and 4's slots while
     those are empty (`assignSlots` in rules.ts); a real 2 and 4 still go there first. Two client tests.
