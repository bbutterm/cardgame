# Дележ · Split Draft

Онлайн-дуэль 1 на 1 для мобильного браузера. Одно правило: **бери карту из ряда**.

A 1v1 draft duel for mobile browsers. One rule for the player: *take a card from the row*.

---

## The game in thirty seconds

Five cards go on the table. You and your opponent take turns picking them —
so one of you gets three and the other gets two. When the row is empty, both
sides fight automatically: power is summed, the weaker side loses HP. Five rows,
then whoever has more HP wins.

Every pick is the same question: **make my side stronger, or take the card they
need?**

The depth is in the cards, not the rules:

| kind | example | what it does |
|---|---|---|
| vanilla | Колосс · 4 | just a number |
| synergy | Теневой маклер | +3 per other Shadow card in your row |
| tempo | Полководец · 8 | huge, but you skip your next pick |
| control | Герольд | you pick first in the next row |

A card's rules text is capped at eight words, and a costless card never exceeds
4 power — if the number is big, there is small print.

---

## Running it

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the server on **:8787** and the client on **:5173**. The Vite
dev server binds to all interfaces, so to play on an actual phone open
`http://<your-machine-ip>:5173` on the same wifi.

Playing against the bot needs no server at all — the engine and the bot are in
the client bundle, and the app is an installable PWA that works offline.

| command | what it does |
|---|---|
| `pnpm dev` | server + client, hot reload |
| `pnpm test` | full test suite (engine, effects, bot, balance regression) |
| `pnpm typecheck` | strict typecheck across every package |
| `pnpm build` | production client bundle + compiled server |
| `pnpm sim --matches 3000` | per-card balance report |
| `pnpm balance --grid fine` | sweep match config (HP, compensation, rules) |

Server environment: `PORT` (default 8787), `RATINGS_PATH` (default
`./data/ratings.json`, or `:memory:` to keep nothing).

---

## Campaign

Eight opponents, roughly twenty minutes, offline, no account. Each fight makes
one idea the only thing on the table:

| # | opponent | what it teaches |
|---|---|---|
| 1 | Волчонок / The Cub | raw numbers — the pool is pure vanilla, no rules text at all |
| 2 | Вожак стаи / Pack Leader | faction synergy |
| 3 | Мастер-сборщик / The Assembler | counting, not adding |
| 4 | Пиромант / The Pyromancer | per-card scaling |
| 5 | Тихий вор / The Quiet Thief | denial and weaken |
| 6 | Гонец / The Courier | urgency — three rows, seven HP |
| 7 | Тяжеловес / The Heavyweight | tempo costs |
| 8 | Архивариус / The Archivist | everything, on a handicap |

The whole thing is **data**, in `packages/cards/src/campaign.ts`. An encounter is
a card pool, a bot level, and optional config overrides — all of which
`createMatch` already accepted. Adding or reordering fights needs no code:

```ts
{
  id: 'frost',
  name: { ru: 'Ледяной страж', en: 'Frost Warden' },
  blurb: { ru: 'Щиты держат ряд', en: 'Shields hold the row' },
  twist: { ru: '', en: '' },        // non-empty only when the rules change
  difficulty: 'normal',            // which bot you face
  pool: ['bulwark', 'aegis-mote', 'cog', 'iron-drone', 'siege-core', 'wanderer'],
  rounds: 5,                        // optional
  hp: [11, 13],                     // optional, [you, them] — the only handicap lever
}
```

Progress lives in `localStorage`, not on the server: the campaign is
single-player, moves no rating, and has to work on a plane. Encounters unlock
strictly in order.

Tests enforce the same discipline the cards get — every pool has at least six
distinct cards, blurbs stay under eight words in both locales, a `twist` string
exists exactly when the encounter changes the rules, difficulty never goes
backwards, and every encounter is played to a finish with its own pool.

---

## Structure

```
packages/
  engine/    pure game logic — no UI, no network, no I/O
  cards/     card data, the effect language, and the campaign — all data
  bot/       AI opponent (3 levels) and the balance simulator
  protocol/  the socket contract, shared by client and server
  server/    Socket.io: rooms, matchmaking, ELO, reconnect
  client/    React + Vite, mobile-first, PWA, ru/en
```

The important boundary is `engine`. It is a pure function of
`(state, action) -> (state, events)` over a seeded RNG, with no dependency on
anything above it. That is what lets the **same code** run three ways: the
server uses it as the authority, the client uses it to play the bot offline,
and the simulator uses it to run thousands of matches for balance.

The client is never trusted online. It sends intent (`pick`, `emote`), and every
action is re-validated against the server's own copy of the match. Each player's
snapshot is filtered through `viewFor()`, so a row you have not earned sight of
is not in the payload at all — not merely hidden in the UI.

---

## Adding a card

Add one record to `packages/cards/src/cards.ts`. No engine change, ever.

```ts
{
  id: 'frost-wolf',
  name: { ru: 'Морозный волк', en: 'Frost Wolf' },
  text: { ru: '+3, если рядом Зверь', en: '+3 if you have a Beast' },
  power: 2,
  faction: 'beast',            // beast | fire | shadow | machine | neutral
  rarity: 'common',            // drives the border treatment
  tags: ['hunter'],            // synergy keys beyond faction
  weight: 6,                   // relative chance of entering a match pool
  maxCopies: 2,                // cap per 25-card pool
  effects: [
    { kind: 'powerIf', amount: 3,
      cond: { type: 'count', counter: { scope: 'self', faction: 'beast', excludeSelf: true } } },
  ],
}
```

The effect language lives in `packages/cards/src/types.ts`. Available kinds:
`powerIf`, `powerPer`, `weaken`, `shield`, `heal`, `burn`, `skipNextPick`,
`extraPick`, `firstPickerSelf`, `revealNextRow`, `mirrorStrongest`,
`lonerBonus`.

Then check it:

```bash
pnpm test                    # data integrity + the 42-58% corridor regression
pnpm sim --matches 3000      # where does it actually land?
```

The tests enforce the rules that keep cards readable: eight words of text per
locale, rules text may only quote numbers the card actually has, and vanilla
cards must have no text while cards with effects must have some.

**Adding a new effect *kind*** does require an engine change — implement it in
`packages/engine/src/battle.ts` (resolves during the fight) or
`applyPickEffects` in `match.ts` (fires when the card is taken). Add it to
`EFFECT_KINDS` and to one of the lists in `packages/engine/test/covered.ts`;
a test fails if an effect kind has no test.

---

## Replacing the art

Every illustration is generated from the card's id — the id seeds an RNG which
picks one of six composition families and fills it in. Deterministic, no assets,
no artist.

To drop in real art, give the card an `art` field:

```ts
{ id: 'frost-wolf', art: '/img/frost-wolf.webp', /* ... */ }
```

`<CardArt>` renders an `<img>` instead of the generated SVG. Nothing else
changes — no component takes a different shape, no layout moves. You can migrate
one card at a time.

To restyle the generated art instead, edit `packages/client/src/art/procedural.tsx`:
`FACTION_PALETTES` controls colour, and `COMPOSITIONS` is the list of generators.

---

## Balance

All numbers in `packages/engine/src/config.ts` and the card data are the output
of simulation, not taste. Current state (3000 matches, hard vs hard, mirrored
seeds):

- first-picker win rate **50.6%** (target 46–54%)
- **0 of 30** cards outside the 42–58% corridor
- ~15% of matches end by knockout rather than on points

Read `PROGRESS.md` before changing a number — in particular the section on how
a card's win rate is measured, which is subtler than it looks and took three
attempts to get right.

---

## Documents

- `PROGRESS.md` — working log: what was built, what the simulations said, and
  why each decision went the way it did
- `CHANGELOG.md` — release-facing summary
- `EXPERIMENTS.md` — card mechanics that were tried, and which were rejected
