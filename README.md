# Дележ · Split Draft

Онлайн-дуэль 1 на 1 для мобильного браузера. Одно правило: **бери карту из ряда**.

A 1v1 draft duel for mobile browsers. One rule for the player: *take a card from the row*.

---

## The game in thirty seconds

Five cards go on the table. You and your opponent take turns picking them —
so one of you gets three and the other gets two. When the row is empty, both
sides fight automatically: **the row closest to 11 without going over wins**, and
the loser drops the difference in HP. Go over 11 and your row scores nothing at
all. Five rows, then whoever has more HP wins.

That one clause is what stops the game being arithmetic. A big number is no
longer automatically a prize — the eight-power body that used to open 86% of the
rows it appeared in nearly busts a row on its own — and the seat forced to take
three cards is the seat with the most ways to overshoot.

Every pick is two questions at once: **does this fit, and can they afford to
take it instead?**

The cards add a second axis on top of that:

| kind | example | what it does |
|---|---|---|
| vanilla | Колосс · 4 | just a number |
| synergy | Теневой маклер | +3 per other Shadow card in your row |
| tempo | Полководец · 7 | big, but you skip your next pick |
| control | Герольд | you pick first in the next row |

A card's rules text is capped at eight words, and a costless card never exceeds
4 power — if the number is big, there is small print.

How much the rule itself is worth is measurable, and was measured. Put a greedy
player who always takes the biggest number against the strongest bot, on a pool
of nothing but vanilla cards, so no card can prop the rule up:

| rule | greedy wins |
|---|---|
| bigger sum wins | **50.0%** |
| closest to 11 without going over | **22.6%** |

Fifty point zero. Under a plain sum, "take the biggest number" is not a
heuristic — it is the optimal strategy, and there is nothing left to be better
at. See `pnpm rules` and the row-rule section of `PROGRESS.md`.

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
| `pnpm test` | full test suite — ~2 min, most of it the balance regression |
| `pnpm typecheck` | strict typecheck across every package |
| `pnpm build` | production client bundle + compiled server |
| `pnpm sim --matches 3000` | per-card balance report |
| `pnpm balance --grid fine` | sweep match config (HP, compensation, rules) |
| `pnpm rules` | judge a row rule against depth, fairness and pacing |
| `pnpm depth` | greedy vs the bot — is there anything to be better at? |

---

## Deploying

Two commands, one process, one port:

```bash
pnpm build     # client bundle + server bundle
pnpm start     # serves both on $PORT
```

`pnpm build` puts the client in `packages/client/dist`, and the server serves it
from there — same origin as `/api` and the socket. That is not a convenience:
the client opens its socket with a bare `io()` and fetches `/api/leaderboard`
with no configurable backend URL anywhere, so same-origin is the only shape it
knows. Point a host at this repository with those two commands and everything
works — bot, campaign, online, leaderboard.

| variable | default | notes |
|---|---|---|
| `PORT` | `8787` | hosts that assign a port are picked up automatically |
| `RATINGS_PATH` | `./data/ratings.json` | needs durable storage, or ratings reset on restart; `:memory:` to keep nothing |
| `CLIENT_DIR` | the sibling `client/dist` | only needed if the bundle is moved |

A `Dockerfile` is included for hosts that want an image rather than a build
command; it produces the same single process.

### Vercel, and other static hosts

`vercel.json` builds the client only and publishes `packages/client/dist`, so an
import needs no settings typed in. **This deploys the offline game, not the
online one.** Vercel is serverless: there is no long-lived process to hold
WebSocket connections, no shared memory for rooms, and no durable filesystem for
ratings. Bot, campaign, tutorial and the installable PWA all work; "Play online"
and the leaderboard report no connection, which is what the client already does
when the server is unreachable.

Making online work from a static host means putting the server somewhere that
runs a process (Railway, Render, Fly, a VPS) and giving the client its address —
which it currently has no way to accept, since `io()` and `/api/leaderboard` are
both hardcoded to same-origin. That is a small change and it is not made yet.

Serving the client from a CDN with the server behind it is also supported —
start the server without a client bundle and it logs `API only` rather than
failing — but then the CDN has to proxy `/api` and `/socket.io` back to it,
which is the setup the single-process arrangement exists to avoid.

**Before opening it to the public**, read the security notes at the end of
`PROGRESS.md`. In particular `identify` currently trusts a raw player id, which
is the entire authentication story: anyone who learns another player's id can
claim their rating. That is fine for a demo and not fine for a public
leaderboard.

---

## Campaign

Eight opponents, roughly twenty minutes, offline, no account. Each fight makes
one idea the only thing on the table:

| # | opponent | what it teaches | a good player wins |
|---|---|---|---|
| 1 | Волчонок / The Cub | fitting to 11 — pure vanilla, no rules text at all | 83% |
| 2 | Вожак стаи / Pack Leader | faction synergy | 78% |
| 3 | Мастер-сборщик / The Assembler | counting, not adding | 75% |
| 4 | Пиромант / The Pyromancer | a card that scales is a card that overshoots | 75% |
| 5 | Тихий вор / The Quiet Thief | denial and weaken | 69% |
| 6 | Гонец / The Courier | urgency — three rows, seven HP | 61% |
| 7 | Тяжеловес / The Heavyweight | a big card is nearly a bust by itself | 52% |
| 8 | Архивариус / The Archivist | everything, on level terms | 49% |

Measured at 1500 mirrored matches per encounter, the human seat driven by the
`hard` bot. Monotonic, which it has to be re-verified as after any card change —
`npx tsx packages/bot/scripts/campaign.ts` prints the curve and says where it
inverts.

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

Finishing all eight unlocks the **extended card set** — the six experimental
cards from `EXPERIMENTS.md` — as an off-by-default toggle in Settings. It
applies to free bot matches only; online and the campaign always deal from the
base 30, because as a *set* the experimental cards move the first-picker rate
(D-16). The unlock is re-checked on every read rather than latched, so "start
over" puts the extra cards away with it.

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
