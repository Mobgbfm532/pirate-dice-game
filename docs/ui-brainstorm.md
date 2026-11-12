# The game's interface: brainstorm (12 Nov)

The user asked: "are there any improvements to UI we could make? buttons, the hearts etc?" Nothing here
is built yet; mark ideas **Built** as they land.

## Where it stands

Seen in a Tavern Crawl fight (Vaelin) on an upright phone, 384x780, 12 Nov:

- **Hearts** are text, "♥♥♥", small, on both nameplates. A lost heart disappears, so 2 of 3 doesn't read
  at a glance. (They do crack and heal when one changes: `Hearts` in Hud.)
- **Roll Dice**, after a throw and before a keep, is a muddy grey-purple: it reads as broken rather than
  "waiting for you". Why it's waiting is only in the faint hint under it.
- **The header buttons** (back, music, sound) are faint grey circles over the opponent's face; the
  crossed-out music and sound icons are hard to read.
- **Your strip:** the purse is a tiny coin and a number; the two empty Thonic slots are the biggest
  things on the row (dark boxes with dashed bottles).
- **Scores** show "—" before there is one; "Turn score 0" floats alone on the right.
- **Ability marks** (✦) on the opponent's nameplate are nearly invisible.
- **The turn marker** (a little die on your avatar's corner) looks pasted on.

## Ideas

Recommended first, roughly by how much each helps for the work.

1. **Painted hearts that show what's lost.** **Built 12 Nov** (CSS: a heart shape masked over a glossy red, lost ones dark, all rimmed in gold by a drop-shadow on `.hearts`; new look only). Every heart of the fight drawn, full or empty: a red
   heart in a gold rim, an empty one dark with its rim (so ♥♥♡ is 2 of 3), bigger on both nameplates.
   The crack and heal moments stay. As SVG or CSS first; a painted heart from the user later if wanted.
2. **Roll Dice that says why it waits.** **Built 12 Nov:** `mode` in the controls (`ready` glows slowly, `waiting` is parchment reading "Keep a die" / "Keep 2 dice" / "Keep 1 more", `rolling` dims, `end` green); the general tip under it ("Tap dice to keep them...") is gone, the Squall's and Becalmed's stay. Its states, each clear: ready (wax red, a soft pulse), waiting
   for a keep (the button reads "Keep a die" in parchment and dark ink, not greyed), rolling (dimmed,
   dice icon turning), End Turn (green, as now). The faint hint under it can then go, giving the table
   a little room.
3. **Brass header buttons.** **Built 12 Nov:** brass coins with drawn icons in dark ink (`HeaderIcon` in Hud: back, music, sound; the league's cup and the ⚙ keep their emoji), off dimmed with a red slash; in the same corners. Back, music and sound as small brass coins like the Legends plaque, with
   clear icons and an "off" look (dimmed with a slash in red), up in the corners clear of the bust's
   face.
4. **A tidier strip under the table.** **Built 12 Nov:** the purse a leather pouch with a drawn gold coin; empty Thonic slots slim (22 px) and faint; the turn score on a small brass-rimmed plaque. It stays where it was rather than moving into your chip: that would change the phone footer's height, which the camera fits the table to.
   - The purse as a coin pouch with its gold on it, easy to read.
   - Empty Thonic slots small and quiet (a faint outline), so filled ones stand out; when the shelf is
     empty, one small slot with "Thom's" on it.
   - The turn score inside your chip, beside your hearts, instead of floating alone.
5. **Scores: nothing until there is one.** No "—"; the score appears (and pops, as the finished one
   does) when it's there.
6. **Ability marks that read.** The ✦ marks as small glowing gems in the ability's colour, dark when
   spent, with a faint ring, so "two left" can be seen.
7. **The turn marker as a glow.** Whose turn it is shown by the nameplate glowing gold (it already does
   for the opponent) and a small label "Your turn", not a die on the avatar.
8. **One button family.** Every button already shares one mould; check the remaining odd ones (the
   between-fights scenes' "Next", Thom's "Buy", the run-over screen) use it, with the same press.

## Suggested first step

1 and 2 together (the hearts and Roll Dice), then 3 and 4. All are look only: no rules change.
