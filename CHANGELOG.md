# Changelog

All notable changes to «Дележ» / Split Draft.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

**Core**
- Monorepo: pnpm workspaces, TypeScript strict across five packages.
- `@delezh/engine` — deterministic, UI-free game core. Seeded RNG, pre-generated
  rows, immutable `applyAction`, an event log for animation, and ELO.
- `@delezh/cards` — card data as pure data, plus the effect language the engine
  interprets. Adding a card needs no engine change.
- `@delezh/bot` — three difficulty levels sharing one evaluator; `hard` rolls the
  row out through the real engine, so tempo effects are modelled exactly.
- `@delezh/protocol` — the socket contract, shared by client and server.

**Client**
- React 19 + Vite, portrait-first, 98KB gzipped. No web font, no animation
  library, no router.
- Installable PWA that plays the bot fully offline — engine, bot and card data
  all ship in the bundle.
- Procedural SVG card art seeded from the card id: six composition families in
  one flat style, with an `art` slot that swaps in real illustrations without
  touching a line of rendering code.
- Battle replayed from the engine's `RoundResult`, so a player can see *why* a
  row was lost, card by card.
- Running row power for both sides, and a preview of what a candidate pick would
  make it.
- Two-step picking with double-tap and swipe-up shortcuts; long-press reads a
  card in full.
- Synthesised WebAudio sound, haptics, ru/en with zero hardcoded UI strings.

**Campaign**
- Eight single-player opponents, roughly twenty minutes, offline, no account.
  Each fight makes one idea the only thing on the table by narrowing the pool to
  it. Entirely data (`packages/cards/src/campaign.ts`): an encounter is a card
  pool, a bot level, and optional config overrides, all of which `createMatch`
  already took. The one engine addition was `hp: [player, opponent]`, since the
  existing `startHp` / `secondPickerHpBonus` pair can express seat compensation
  but not a handicap.
- Progress in `localStorage`, unlocking strictly in order, with the gate reading
  the previous encounter's id rather than a count.
- Clearing all eight unlocks the extended card set (the six experimental cards)
  as an off-by-default toggle, in free bot matches only — online and the
  campaign always deal from the base 30.

**Server**
- Serves the built client from the same process and port, so `pnpm build` then
  `pnpm start` is the whole deployment contract. The client opens its socket
  with a bare `io()` and fetches `/api/leaderboard` with no configurable backend
  URL, so same-origin is the only shape it knows — previously the only way to
  run it in production was a reverse proxy stitching two processes together.
  SPA fallback, hashed assets cached immutably, `index.html` and `sw.js` never;
  a missing bundle logs "API only" rather than failing to start.
- `Dockerfile` for hosts that want an image instead of a build command.
- Authoritative Socket.io. Clients send intent, never state; every action is
  re-validated and every snapshot filtered through `viewFor()`.
- Room codes, quick-match queue, ELO behind a repository interface, 30s
  reconnect grace that holds the seat open.
- One process-wide tick drives every deadline.

**Tooling**
- `pnpm sim` — per-card balance report; `pnpm balance` — config and pool sweeps.
- `packages/bot/scripts/campaign.ts` — per-encounter report: win rate against
  both a strong and an average player model, rows, knockout rate, distinct cards
  dealt, and printed-vs-played power per card (which is how a synergy card with
  no partner in its pool gets caught).
- 170+ tests: one per effect kind, engine edge cases, bot-vs-bot at every level
  pairing, a balance regression on the 42–58% corridor, end-to-end online play
  over real sockets, every campaign encounter played to a finish, and dictionary
  integrity.

### Balance
- Starting HP 20 → 11, with +2 for the player who picks second in row 1. At 20,
  0% of matches ended by knockout and the HP bar was decorative.
- Costless cards capped at 4 power; above that a card always buys a drawback.
- All synergy payoffs raised — they averaged less power than a vanilla 3, so
  committing to a faction was strictly worse than taking the biggest number.
- Result: 0 of 30 cards outside 42–58% across 30,000 matches on six seeds;
  first-picker win rate 49.8–51.5%.
- Experimental pass: 9 designs tried, 6 kept, in `ALL_CARDS` as opt-in content.
  Measured at 4000 matches: base 30 puts the first picker on 49.5%, all 37 on
  52.9% — in band, which is what makes the extended set safe to hand out.

### Security
- `viewFor` blanked future rows but shipped the seed they are generated from,
  making row hiding cosmetic and Seer worthless.
- `/api/leaderboard` published player ids, which are the entire authentication
  story — the endpoint was handing out the top accounts.
- Emote forwarded arbitrary text that the client renders through its unknown-key
  fallback; now whitelisted in the shared protocol.
- No rate limiting anywhere: one socket could fill the player table by looping
  `identify` with random ids.
- `rematch` mid-match reseeded a live board, an exit from a losing ranked game.
- Socket.io ran with `cors: { origin: true }`, which reflects whatever asks and
  let any page on the internet open a socket. Now that the client is served from
  the same origin, cross-origin sockets have no legitimate case and are refused.

### Fixed
- Reconnect: a lingering old socket's `disconnect` wiped the seat its own
  replacement had just reclaimed, then forfeited a connected player.
- A forfeit scored the match but left the board in `draft`, freezing the winner's
  screen.
- The pick timer was hidden during the battle animation while the server's clock
  kept running, silently burning the player's next turn.
- `excludeSelf` excluded by object identity; two copies of a card deleted each
  other from their own count.
- The PWA was blank on every offline reload — the hashed bundle was never
  precached, and even once it was, `Vary` prevented it matching.
- `pnpm build` produced a server that could not start.
- Bot valued denial at a card's worth to itself rather than to the opponent.
- Card names rendered at ~10px, where Chromium's hinting drops the breve off "Й".
