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
| The 1 pip | Wax-seal red | `#a3201c` |
| The 6 pips | Felt green | `#2e7d32` |
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
| Dice faces | 6 × 256², or one 3×2 sheet | Aged ivory, inked pips; the 1 in wax-seal red, the 6 in green |
| Backdrop | 2048×1024 | Blurred tavern interior behind the table: fireplace, shelves, lanterns |
| Character busts | 512², transparent PNG | Every opponent, Thom, the characters between fights, plus player avatars, in one matching style (see Status) |
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

**UI parchment (seamless)**
> Top-down seamless tileable texture of aged parchment paper, warm cream and light tan,
> faint fibres, soft uneven mottling, a few very faint tea stains, evenly light across the
> whole image so dark text stays readable, flat even lighting, no shadows, no text, no
> writing, no torn or burnt edges, no border. *+ style line*

**Brass slot plates**
> 1 *+ style line*

**Dice faces**
> A 3 by 2 sprite sheet of six square die faces on aged ivory, showing 1 to 6 pips in
> standard layouts, pips painted in ink black except the single pip of the 1 in wax-seal
> red and the six pips of the 6 in green, viewed straight on, flat lighting, no shadows.
> *+ style line*

**Backdrop**
> Wide interior view of a cosy fantasy tavern at night seen from a seat at a gaming
> table, roaring stone fireplace, shelves of bottles, hanging lanterns, out of focus,
> warm candlelight, empty foreground. *+ style line*

**Character bust (template)**
> Head-and-shoulders portrait of [CHARACTER], three-quarter view, looking at the viewer
> with [EXPRESSION], holding [PROP], warm rim light from a fireplace, on a plain flat
> solid magenta background, no checkerboard. *+ style line*

| Character | Description | Expression | Prop |
|---|---|---|---|
| The Molar | Big friendly orc tavern keeper with one huge gold tooth | wide toothy grin | a dice cup |
| Klarg | Hulking bugbear paladin in dented armour | sly smirk | one stolen die held up |
| Rokr | Elderly star-reader with constellations on her robe | serene, knowing | a glowing star chart |
| The Hangman | Lean gunslinger in a wide-brimmed hat and duster | cold squint | his revolver, The Ace of Spades |
| Jaguar Cantona | Charming rogue with a jaguar-pelt cloak and sunglasses | effortless smile | a goblet of wine |
| Thom (shopkeeper) | Cheerful travelling potion seller, weathered face, bushy sideburns, patched travelling coat, a leather bandolier of small corked bottles | a salesman's wink and a broad grin | a small bubbling bottle of glowing green tonic |
| Sperm McGrath | Grizzled grey-haired bouncer, scarred, short grey beard, open-collared embroidered shirt, a coil of rope at his hip | stern scowl | arms folded on a wooden club |
| Frak | Portly half-elf sorcerer with pointed ears, balding with sideburns, purple rune-stitched vest over blue sleeves | sly smirk | a smoking cigar |
| Danhausen | Wiry showman in white face paint with black markings, small curled horns, a high-collared black cape, white gloves | huge manic grin | a small purple gourd |
| Duke Morrigan | Elegant purple-skinned tiefling with big curled ram's horns, a purple high-collared coat over a yellow shirt | sly smile | none (head and shoulders) |
| Martha Mystery | Red-haired tavern regular in an apron over a brown jumper | knowing half-smile | an ornate brass vape, purple smoke curling round her |
| Martha in disguise (x3) | Martha as above, holding up another opponent's face as a mask with cut-out eye holes: Frak, Danhausen or Duke Morrigan | sly, knowing | the mask, held in both hands beside her face |
| Brodor | Huge bearded wrestler in a straw cowboy hat and gold sunglasses, a fringed yellow tank top | big laughing grin | a Slim Jim |

Thom's prompt also adds *no text, no lettering*: the shop screen prints "Thom's Thonics" itself.

## Status

| Asset | Status | File |
|---|---|---|
| Table wood | Done | `art/table-planks.jpg` → `textures/table-planks.webp` (first version kept as `art/table-wood-v1.webp`) |
| Rail wood | Done | `art/rail-walnut.jpg` → `textures/rail-walnut.webp` (tray rails and slot rail) |
| UI parchment | Done | `art/parchment.jpg` → `art/parchment.webp` (dialogs; covers each panel, not tiled) |
| Felt | Done | `client/public/textures/felt.webp` |
| Dice faces | Done | `client/public/textures/dice-faces.jpg` (face positions in `client/src/textures.ts`) |
| Brass slot plates | Done | `art/slot-plates.jpg` → `plate-2/4/blank.webp` |
| Backdrop | Done | `art/tavern-backdrop.jpg` → `tavern.webp` |
| Backdrop: the Yawning Portal | Done (26 Oct) | `art/yawning-portal-backdrop.jpg` → `yawning-portal.webp` (1584×672), the hall with its well; the Portal's five fights and its scenes |
| Ability paintings (Mind Whip, You are Cursed, Sympathy for the Devil, Disguises; since 26 Oct evening also Back of the Head, Inkfire Brand, Flourish, Astral Flood, Reach Around, Written in the Stars; since 27 Oct Jaguar's Smooth Talk and The Cloak; since 28 Oct the Ridgeler's Divine Smite) | Done (26-28 Oct) | `art/ability-<id>.jpg` → `ability-<id>.webp` (900 tall, cut out); `ABILITY_ART` in `client/src/Hud.tsx`. Back of the Head keeps its flying die (`minPiece`) and a little of its streaks (`trails`); Inkfire's black flame goes see-through at its tips (`smokeBox`, `smokeMinBlue`); Flourish's cream swirls are see-through (`trails`) with `holes` inside the loops; Astral Flood's aura fades at its edge (`soften`) with `holes` between the ribbons. Smooth Talk (27 Oct) keeps its gold sparkle swirls and the potion's red glow see-through (two `trails`, `tolerance: 30`, tiny sparkles kept by a low `minPiece`); The Cloak keeps its smoky wisps and the cloak's thin edge see-through (`trails`), `holes` between the folds and the arm, and fades out where the painting crops the cloak (`fade`, new 27 Oct: { left, right, top, bottom } px). Divine Smite (28 Oct) keeps the hammer's gold flame bright and see-through (`glow`, new 28 Oct: inside its boxes the flame keeps its own warm colours and turns see-through by how bright it is; leftover pink there goes), `holes` between his raised arm, head, spikes and the handle, and fades where the painting crops him (`fade`). Still wanted: Dead Eye, the Ace of Spades, All In (subjects in the prompt pack's ability table) |
| Backdrop: outside the Ghoul and Gourd | Done | `art/ghoul-gourd-outside.jpg` → `ghoul-gourd-outside.webp` (1376×768), Sperm McGrath's fight; `SCENES` in `client/src/Backdrop.tsx` |
| Opponent busts | Done | Molar, Klarg, Rokr, Hangman, Jaguar: `art/bust-*.jpg` → `*.webp` |
| Jaguar Cantona, second painting | Done (27 Oct) | `art/bust-jaguar.jpg` (flat magenta, `cutOutFlat` with `holes` in two hair gaps and `fade: { right: 140 }`: his teal-and-gold cloak runs off the painting's right edge, so it fades out instead of ending in a straight line) → `jaguar.webp` (969×720); the first painting (a checkerboard) kept as `art/bust-jaguar-v1.jpg`. Same pose and head size as the first, so no `seat`; round frames at zoom 2 |
| Sperm McGrath (Ghoul and Gourd bouncer) | Done | `art/bust-mcgrath.jpg` (flat magenta, `cutOutFlat`) → `mcgrath.webp` |
| Frak (half-elf sorcerer) | Done; smoke cut out 23 Oct | `art/bust-frak.jpg` (flat magenta, `cutOutFlat` with `noSmoke`: the painted cigar smoke is taken out, over the background and over his vest, because the game draws its own moving smoke from the tip; `ONLY=frak npm --prefix client run art` redoes just him) → `frak.webp` |
| Danhausen | Done | `art/bust-danhausen.jpg` (flat magenta, `cutOutFlat`) → `danhausen.webp`; `seat: 1.6` behind the table (he shows more body) |
| Duke Morrigan | Done | `art/bust-duke.jpg` (flat magenta, `cutOutFlat` with a low `tolerance` so his purple coat and skin stay, and `holes` for the background inside his curled horn) → `duke.webp` |
| Martha Mystery | Done | `art/bust-martha.jpg` (flat magenta, `cutOutFlat` with `smokeBox` + `smokeColour: 'own'`: her vape smoke stays purple and see-through) → `martha.webp`; `seat: 1.15` |
| Martha's disguises | Done, 21 Oct | `art/bust-martha-frak.jpg`, `bust-martha-danhausen.jpg`, `bust-martha-duke.jpg` (flat magenta, `cutOutFlat` with `holes` seeds for the mask's eye holes and the gap under her wrist; the Duke's with `tolerance: 30` so the purple mask stays) → `martha-frak.webp`, `martha-danhausen.webp`, `martha-duke.webp`; `PORTRAITS` 'Martha as Frak' / 'Martha as Danhausen' / 'Martha as Duke Morrigan', `seat: 1.15` like her own bust |
| Brodor | Done, 21 Oct; new painting 26 Oct | `art/bust-brodor.jpg` (fists in gold gloves and ribbons; flat raspberry, `cutOutFlat` with `holes` between the ribbons) → `brodor.webp` (696x720); `seat: 1.3`, round frame centred on [52, 31] at zoom 1.7. The first painting (with the Slim Jim) is kept as `art/bust-brodor-v1.webp` |
| Player avatars Devil, Vaelin | Not planned for now | Still the classic game's portraits |
| Klarg's hand (Reach Around) | Wanted, optional | A furry bugbear hand reaching down, transparent; for now the stolen die just flies off to his side of the table |
| Keepsake pictures | Wanted, optional | One small painting per keepsake: Shield, Velvet Cushion, Trap Card, Thom's Loyalty Card, Potion Belt, Loaded Die, Martha's mask Brodor's Sunglasses. The Stranger's offer, Thom's back shelf and the strip use emoji until then (`KEEPSAKE_ICONS` in `client/src/Hud.tsx`) |
| Thom bust (Thom's Thonics shop) | Done | `art/bust-thom.jpg` (flat magenta, cut out by `cutOutFlat`) → `thom.webp`; the shop is a full-screen scene with him in it |
| The Ace of Spades (the Hangman's revolver) | Wanted, optional | His named revolver, for the moment he fires it; a CSS muzzle flash and bullet hole for now |
| Spots between fights | Done | Hooded Stranger `art/bust-stranger.jpg` → `stranger.webp`, Dice Den hustler `art/bust-dicer.jpg` → `dicer.webp`, Pickpocket `art/bust-pickpocket.jpg` → `pickpocket.webp` (flat magenta, `cutOutFlat`); Shrine to the Lady (goddess of sailors) `art/shrine.jpg` → `shrine.webp`, a scene, not cut out. Framing in a round frame: `SPOT_PORTRAITS` in `client/src/portraits.ts` |
| The Wild Magic Hot Tub (a spot) | Done | `art/hot-tub.jpg` → `hot-tub.webp` (raspberry background, `cutOutFlat`); a wide painting, sized by width in its scene |
| Darren Snakehands (the Ghoul and Gourd's barman, an event) | Done | `art/bust-darren.jpg` → `darren.webp` |
| The Yawning Portal's new opponents | Done for four, 20 Oct | The Ridgeler `bust-ridgeler.jpg` (a smoke box keeps the hammer's glow clean), Vaelin Inkhand `bust-vaelin-inkhand.jpg` (a smoke box for his black flame), Stason Jatham `bust-stason.jpg`, Sylvester Stonefist `bust-sylvester.jpg`; registered in `PORTRAITS`, in the game since 21 Oct. Brodor: see his own row |
| Backdrop: the Salty Swallow | Done (26 Oct) | `art/salty-swallow-backdrop.jpg` → `salty-swallow.webp` (1584×672), the gun deck; the ship's four fights and its scenes between fights |

## Processing art

Originals live in `art/` and are never edited. `npm run art` (in `client/`) turns them
into game files in `client/public/art`: it removes painted checkerboard "transparency",
trims and resizes busts, and splits the slot plates. Per-image fixes (firelight corners,
patches boxed in by a hand) are listed at the bottom of `client/scripts/process-art.mjs`.

**Ask for a flat background.** Most AI tools can't make real transparency and paint a
checkerboard instead, which takes per-image cleanup. Ending character and plate prompts
with *"on a plain flat solid magenta background, no checkerboard"* makes cut-outs
automatic.

## Process

1. **Generate the felt, table wood and dice first** and drop them into the prototype.
   They're most of what's on screen, so they set the look.
2. **Check it on a phone in candlelight** before making anything else. Adjust the
   style line until three different prompts come out looking like one game.
3. **Then the backdrop and characters**, reusing the same style line and a reference
   image from step 1 if the tool supports it.
4. **Keep the source images** in an `art/` folder outside `public/`, and export
   compressed copies for the game, so originals can be reprocessed later.
