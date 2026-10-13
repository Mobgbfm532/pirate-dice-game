# Art direction: the candlelit storybook tavern

A warm, hand-painted fantasy tavern, as if a well-loved board game had come to life.
Chunky shapes, soft painted textures, exaggerated proportions, gentle humour. Cosy rather
than gritty: the player should feel they've pulled up a chair by the fire, not walked
into a dungeon.

**Why this style**

- **It suits the cast.** An orc who "never bites", a gunslinging Hangman, Brodor's
  Sunglasses and a Trap Card are jokes, and a playful painted style lets them land.
  Photo-realism would fight them.
- **It suits AI image tools.** Painted textures and character busts come out
  consistent across many generations; photoreal materials drift and look uncanny.
- **It suits phones.** Painted detail lives in the textures, not in geometry or
  lighting, so it stays cheap to render.

## Palette

| Role | Colour | Hex |
|---|---|---|
| Room shadow | Smoky umber | `#120a05` |
| Table wood | Honey oak | `#7a4a22` |
| Rail wood | Dark walnut | `#3a210f` |
| Felt | Bottle green | `#1f5a34` |
| Brass (slots, trim) | Warm brass | `#c9973a` |
| Dice | Aged ivory | `#f3e6c8` |
| Pips | Ink black | `#231a14` |
| Required pips (2 and 4) | Wax-seal red | `#b71c1c` |
| Candlelight | Ember orange | `#ff9e40` |
| Magic (Rokr's blur) | Midnight blue + star gold | `#1c3d6e` / `#ffd54f` |

Light comes from candles and a fireplace: warm key light, deep warm shadows, a little
cool blue only for magic. No pure white and no pure black anywhere.

## Shape language

- Rounded, slightly oversized forms: dice with soft bevels, fat rails, chunky brass.
- Wear and history: nicks in the wood, a burn ring from a tankard, worn felt where
  dice usually land.
- Characters are busts with big readable silhouettes and one strong prop each
  (Hangman's revolver, Jaguar's cloak, Rokr's star chart).

## Asset list for the 3D table

Textures are square, seamless where marked, painted with **flat even lighting and no
baked shadows** (the game lights them). Generate at 2048 and downscale to 1024 for phones.

| Asset | Size | Notes |
|---|---|---|
| Felt | 1024², seamless | Bottle-green baize, faint worn patches |
| Table wood | 1024², seamless | Honey oak planks, nicks, one tankard ring |
| Rail wood | 1024², seamless | Dark walnut with fine grain |
| Brass slot plates | 512², transparent PNG | Two plates engraved "2" and "4", one plain |
| Dice faces | 6 × 256², or one 3×2 sheet | Aged ivory, inked pips; 2 and 4 in wax-seal red |
| Backdrop | 2048×1024 | Blurred tavern interior behind the table: fireplace, shelves, lanterns |
| Character busts | 512², transparent PNG | Molar, Klarg, Rokr, Hangman, Jaguar, plus player avatars, in one matching style |
| UI parchment | 1024², seamless | For panels and dialogs |

## Prompt pack

Use the same **style line** at the end of every prompt so the set stays consistent.

> **Style line:** *hand-painted stylized fantasy game art, warm storybook look, soft
> brush texture, rich but muted colours, chunky proportions*

**Felt (seamless)**
> Top-down seamless tileable texture of bottle-green billiard baize felt, faint worn
> patches, fine fibre texture, flat even lighting, no shadows, no objects. *+ style line*

**Table wood (seamless)**
> Top-down seamless tileable texture of honey oak tavern table planks, small nicks and
> scratches, one faint tankard ring stain, flat even lighting, no shadows. *+ style line*

**Rail wood (seamless)**
> Seamless tileable texture of dark polished walnut wood grain, fine straight grain,
> flat even lighting, no shadows. *+ style line*

**Brass slot plates**
> Three square brass plaques on a transparent background, slightly worn and rounded,
> the first engraved with a bold red numeral "2", the second with a bold red numeral "4",
> the third plain, viewed straight on, flat lighting. *+ style line*

**Dice faces**
> A 3 by 2 sprite sheet of six square die faces on aged ivory, showing 1 to 6 pips in
> standard layouts, pips painted in ink black except the 2 and 4 faces whose pips are
> wax-seal red, viewed straight on, flat lighting, no shadows. *+ style line*

**Backdrop**
> Wide interior view of a cosy fantasy tavern at night seen from a seat at a gaming
> table, roaring stone fireplace, shelves of bottles, hanging lanterns, out of focus,
> warm candlelight, empty foreground. *+ style line*

**Character bust (template)**
> Head-and-shoulders portrait of [CHARACTER], three-quarter view, looking at the viewer
> with [EXPRESSION], holding [PROP], transparent background, warm rim light from a
> fireplace. *+ style line*

| Character | Description | Expression | Prop |
|---|---|---|---|
| The Molar | Big friendly orc tavern keeper with one huge gold tooth | wide toothy grin | a dice cup |
| Klarg | Hulking bugbear paladin in dented armour | sly smirk | one stolen die held up |
| Rokr | Elderly star-reader with constellations on her robe | serene, knowing | a glowing star chart |
| The Hangman | Lean gunslinger in a wide-brimmed hat and duster | cold squint | a revolver and an ace of spades |
| Jaguar Cantona | Charming rogue with a jaguar-pelt cloak and sunglasses | effortless smile | a goblet of wine |

## Process

1. **Generate the felt, table wood and dice first** and drop them into the prototype.
   They're most of what's on screen, so they set the look.
2. **Check it on a phone in candlelight** before making anything else. Adjust the
   style line until three different prompts come out looking like one game.
3. **Then the backdrop and characters**, reusing the same style line and a reference
   image from step 1 if the tool supports it.
4. **Keep the source images** in an `art/` folder outside `public/`, and export
   compressed copies for the game, so originals can be reprocessed later.
