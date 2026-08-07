# PROGRESS

Working log for «Дележ» / Split Draft. Newest iteration last. Every design
decision that cost more than a minute of thought is recorded here with the
reason, so a later change can tell whether it is undoing something deliberate.

---

## Plan

| # | Item | State |
|---|------|-------|
| 1 | engine + cards + tests + balance simulator | **done** |
| 2 | client: bot match end-to-end on mobile | **done** |
| 3 | procedural SVG cards, neo-brutalist theme, battle animation | **done** |
| 4 | server: rooms by code, online 1v1, reconnect | **done** |
| 5 | matchmaking + ELO + leaderboard | **done** |
| 6 | i18n polish, in-match emotes, rematch | **done** |
| 7 | sounds, touch gestures, tutorial | **done** |
| 8 | experimental mechanics | **done** |

---

## Iteration 1 — engine, cards, balance

### What shipped

`packages/engine` (pure, zero UI/network deps), `packages/cards` (pure data),
`packages/bot` (three levels + simulator), 79 tests.

The engine is a single `applyAction(state, player, action) -> {state, events}`
function over an immutable state. Everything is derived from one seed string,
which is what lets the server be authoritative, the client preview locally, and
the simulator reproduce any match exactly.

### Rules as implemented

- 5 rows × 5 cards, drafted alternately, so each row splits 3/2.
- First pick alternates every row. Control cards can override it.
- Row power is summed, the lower side takes the difference as damage.
- 11 HP, and **13 for whoever picks second in row 1**.
- Match ends after 5 rows or when someone hits 0. Ties break on rows won.

### Decisions

**D-01 — Synergies count only the current row, never the whole match.**
Cross-row accumulation was the first instinct and it is wrong for this game: by
row 4 a player would have to audit 10+ cards to know what their next pick is
worth, on a 360px screen, against a 20-second timer. Row scope keeps every
decision fully visible on screen. Denial still matters because the pieces you
are denying are right there in the same row.

**D-02 — 25 cards is an odd number, so someone always drafts 13.**
Alternating the first pick over 5 rows gives the row-1 first picker 13 cards and
the other 12. Compensation is HP, not a rules change. Swept `secondPickerHpBonus`
across `startHp` 8–20 (`pnpm balance --grid fine`): **+2 lands the first-picker
win rate on 49–51% at every HP level**, +1 leaves it at 56–58%, +3 overshoots to
41–43%. The compensation is a constant, independent of HP, which is exactly what
you would expect if it is paying for the one extra card.

**D-03 — First-picker rule is `alternate`.**
`fixed` gives the first picker 91% (one player gets 3 cards every single row).
`loser` (rubber band) can be tuned to ~46% but flattens the game: average final
margin drops from 3.7 to 3.2 because leads get erased mechanically rather than
played out. `alternate` is also the only one of the three that fits on one line
of a tutorial. All three remain in `MatchConfig` for future experiments.

**D-04 — Starting HP is 11/13.**
HP was 20 in the first draft, and matches never used it: average loser finished
at 12 of 22 and **0% of matches ended by knockout**. The bar was decorative. At
11/13 the loser finishes around 3–4 HP, ~15% of matches end early, and the bar
reads as a real resource. Fairness is unaffected (D-02).

**D-05 — A costless card tops out at 4 power.**
This fell out of the data rather than being designed in. A vanilla 6 sat at 68%
adjusted win rate; making it common (weight 9, 3 copies per pool) barely moved
it. A vanilla 5 sat at 56–58%, and when it was the *only* 5 left it became the
opening pick of 70% of the rows it appeared in. Anything above 4 now buys
something — a tempo debt, a shield, pick order. It is also a rule a player can
learn from the cards alone: big number means small print.

**D-06 — 20s pick timer and "match ≤ 7 minutes" do not both hold in the worst
case.** 25 picks × 20s is 8m20s. The timer is an AFK backstop, not the expected
pace; at a realistic 6s per pick plus battle animations a match is about 4
minutes. Kept the 20s from the spec and asserted the realistic figure in the
tests instead of quietly shortening the timer. If real telemetry ever shows
players using the full timer, the lever is the timer, not the row count.

**D-07 — Dropped the "+N if you picked second" card from the base set.**
`pickedSecond` is implemented and tested, but the one card using it scored 18%
on the seat-adjusted metric. The reason is instructive: the effect is only live
for the two-card seat, so the first picker spends an early pick denying it and
then holds a 1-power card for the rest of the row. It made the opening pick of
every row it appeared in worse for both players. The effect stays in the engine
for the experimental pass (task 8); the base-set slot became a heal card.

### Measuring card balance — and getting it wrong twice

The corridor is 42–58% win rate per card. Which win rate turned out to be the
whole problem.

1. **Match win rate** (did the player holding it win the match) is biased for
   any card whose value depends on the holder's position. A card only taken from
   the losing seat inherits that seat's win rate however strong it is.
2. **Row win rate** (did its side win that row) is worse. It mostly measures
   *when* a card gets taken: the opening pick of a row belongs to the three-card
   side, which wins that row ~90% of the time, so every high-priority card
   scored 95%+ regardless of strength.
3. **Seat-adjusted row win rate** — each pick compared against the empirical win
   rate of all picks made at the same index within a row, deltas averaged. This
   removes the pick-order confound and ranks cards by actual strength.

Even (3) is wrong for one class of card. Void Titan wins the row it lands in
almost every time and pays for it in the *next* row: 64% adjusted, 46% match.
The two metrics bracket the truth. So the corridor is applied per card to
whichever rate actually measures it:

- effects resolving inside the row (power, synergy, weaken, shield, mirror)
  → **seat-adjusted row win rate**
- effects paying out elsewhere (tempo, pick order, information, direct HP)
  → **match win rate**

`isCrossRow()` in `simulate.ts` does the classification and the regression test
asserts the split, so a new effect kind has to declare which side it is on.

### Balance results

3000 matches, hard vs hard, mirrored seeds (`pnpm sim --matches 3000`):

| metric | value |
|---|---|
| first-picker win rate | **50.6%** (target 46–54%) |
| draws | 2.2% |
| average rows played | 4.96 of 5 |
| average picks per match | 24.9 |
| winner / loser final HP | 7.3 / 4.3 |
| **cards outside 42–58%** | **0 of 30** |

Widest cards: Night Blade 56.9%, Ember 45.0%. Confirmed on a second independent
seed.

### Changes the simulation forced

| card | before | after | why |
|---|---|---|---|
| Pyre Giant | 6 power, weight 3 | 4 power, weight 6 | 68% adjusted; the whole row was "who got it" |
| Siege Core, Colossus | 5 power | 4 power | 56–58%, and Colossus opened 70% of its rows |
| Quickstep | 1 power | 0 power | flipping the 3/2 split is worth more than a point |
| Nightmare | 3 power | 2 power | 58% |
| Bulwark | 5 power, shield 3 | 7 power, shield 3 | 42%; shield only pays out when you lose, and only up to the margin |
| Oracle Coin | +4 if picked second | 2 power, heal 2 | D-07 |
| Mirror Idol | 0 power | 1 power | 45% |
| all 7 synergy payoffs | +1/+2/+3/+4 | +2/+3/+4/+6 | every synergy card averaged *less* power than a vanilla 3, so committing to a faction was strictly worse than taking the biggest number |

That last row was the most useful finding of the iteration: the tags were
decorative until the payoffs went up.

### Bot

Three levels, all sharing one evaluator:

- **easy** reads the printed number and nothing else.
- **normal** scores marginal row power including synergies, plus a deny term.
- **hard** applies each candidate to the *real engine* and rolls the rest of the
  row out greedily. Tempo effects are therefore modelled exactly rather than
  estimated — and it finds lines the heuristic misses: in the tempo test it
  opens with a 3-power vanilla to bait the opponent into taking the 4-power one,
  then takes the 7-power tempo card and wins the row 10–6 instead of 8–8.

One bug the tests caught: the deny term priced a card at what it was worth *to
the bot*, not what it was worth *to the opponent*, so the bot would "deny" a
tempo bomb the opponent could not have afforded anyway. Deny now includes the
opponent's tempo cost.

Hard beats easy about 70% of the time.

---

## Iteration 2 — client, art, server

### What shipped

A playable game. `pnpm dev` brings up the server on :8787 and the client on
:5173; a match against the bot needs neither.

Client: React 19 + Vite, portrait-first, PWA. **95KB gzipped.** No web font (a
display face would be the single largest asset and the game must open on a cold
mobile connection), no animation library (CSS keyframes cover every effect
here), no router (six screens and one state machine).

Server: authoritative Socket.io. Clients send intent, never state.

### Decisions

**D-08 — Two-step picking.** Tap selects, a confirm bar slides up, TAKE commits.
Double-tap and swipe-up are shortcuts for players who have learned the game. A
single-tap-to-pick would be one interaction cheaper and occasionally
catastrophic: the pick is irreversible, the timer is 20s, and a thumb travelling
across a five-card grid brushes cards it did not mean to.

**D-09 — Taken slots keep their footprint.** An emptied slot becomes a dashed
ghost rather than collapsing. Reflowing the row under a thumb that is already
moving is the worst failure mode a touch layout has, and it costs nothing to
avoid.

**D-10 — Both taken-card strips reserve height even when empty.** Same reason:
the five open cards land in exactly the same place in every row of every match.

**D-11 — Sound is synthesised, not sampled.** Eight effects from a WebAudio
oscillator with an exponential decay. Sample files would outweigh the entire
rest of the bundle for a set of blips a synth does well. The context is created
lazily on the first gesture, because mobile browsers refuse otherwise.

**D-12 — The client renders the server's snapshot and nothing else.** Picking
disables the button immediately, but the board does not move until the server's
update arrives, so a rejected action can never leave a phantom card on screen.
Snapshots carry a monotonic `seq` and out-of-order ones are dropped.

**D-13 — One process-wide tick, not per-room timers.** Pick timeouts, reconnect
grace and room sweeping all run off a single 500ms interval. Per-room
`setTimeout`s leak every time a room ends through a path that forgot to clear
them, and a card game has several such paths (forfeit, disconnect, rematch).

### Two defects the screenshots caught

Both were invisible in code review and obvious the moment the app was rendered
at 360px and looked at.

**The board was grey for half the match.** `dimmed` was applied to every open
card while the opponent was thinking. Faction colour is the primary signal a
player reads when scanning a row, and it was being drained away exactly when
they had time to study the board. Whose turn it is comes from the banner and the
timer; the cards do not need to say it too.

**Russian card names lost their diacritics.** ЗЕРКАЛЬНЫЙ rendered as
ЗЕРКАЛЬНЫИ — the breve on Й simply absent, which reads as a spelling mistake
rather than as small text. Ruled out font weight, `letter-spacing`,
`text-transform` and the line clamp one at a time; the cause was size. At the
~10px the names were rendering, Chromium's hinting drops the mark entirely.
Names are now 12px and sentence case (all-caps Cyrillic is harder to scan at
card sizes and costs ~10% more width). This is a floor, not a preference — it is
noted in the CSS so it does not get "optimised" back down.

### Verification

Playwright, 320 / 360 / 430px portrait: a full match plays to a result, no
horizontal overflow at any width, no console errors. Two real browsers against
`pnpm dev`: room code, join, emote relay, 25 picks, 10 battle overlays, opposite
results on the two screens.

Server: 12 end-to-end tests over real sockets — off-turn picks refused, future
rows absent from the payload rather than merely hidden, quick-match ELO equal
and opposite, seat reclaimed on reconnect, forfeit after the grace period,
hostile input survived.

One test-harness bug worth recording, because it looked like a server bug: the
match driver waited for player A's snapshot and then read player B's board.
The server pushes to the two sockets independently, so B could still believe a
card was available. The fix was in the test, not the server.

---

## Iteration 3 — review, hardening, experiments

Run with four subagents working in parallel against fixed package boundaries: a
tester on the engine, a balancer on the card data, a reviewer on the diff, and a
tutorial rewrite. Their findings are summarised here; the detail is in the
commits.

### The reviewer found seven things that would have shipped

The two worst were security, and the tester and the reviewer arrived at the
first one independently from opposite directions:

**`viewFor` blanked the future rows and shipped the seed.** Every row is
generated purely from the seed, so a client holding it can call `createMatch`
and read the entire match. Row hiding was theatre and Seer was worthless. Fixed
in the engine rather than in the server, so every consumer is covered.

**The leaderboard published each player's id, and the id is the whole
authentication story** — `identify` accepts whatever it is handed. An
unauthenticated `GET /api/leaderboard` was handing out the top accounts. Rows
now carry a server-computed `isYou`.

Also: no rate limit anywhere (one socket could fill the player table by looping
`identify` with random ids); `emote` forwarded arbitrary text that the client
renders verbatim through its unknown-key fallback; `rematch` mid-match reseeded
a live board, which is an exit from a losing ranked game.

Three correctness bugs worth recording because none of them are visible in a
code read:

- **`disconnect` nulled the seat unconditionally.** A dropped phone's old socket
  lingers for up to the 25s ping timeout, so it could fire *after* the
  replacement socket had already reclaimed the seat — wiping it, starting a
  grace clock on a connected player, and forfeiting them. Reproducible on every
  StrictMode mount.
- **A forfeit scored the match but left the board in `draft`,** so the winner sat
  on a frozen screen forever.
- **The pick timer was hidden while the battle overlay was up,** but the server's
  clock does not pause for an animation. Watching the replay silently burned
  your next turn.

### D-14 — the seat metric has a mediator problem, and one card falls in it

The balancer proposed reclassifying `extraPick` from match win-rate to the
seat-adjusted rate, where Quickstep reads a comfortable 49% instead of 55–59%.

It is the wrong call, and the reason is worth writing down. The adjusted metric
controls for *which pick index* a card was taken at. Quickstep's entire effect is
to hand you an extra pick index. Controlling for the thing the card does
subtracts away the card's value — pick index is a mediator here, not a
confounder, and adjusting for a mediator removes the effect you are trying to
measure.

But match win-rate over-counts it for the Oracle Coin reason in reverse: a
0-power card is only worth taking when the double pick converts, so it is
selected into favourable positions and inherits their win rate.

Quickstep's raw row win-rate is 49.1% against a field mean of 55.7% — the side
holding it does *worse* in the row it is played in, while winning more matches.
Neither number is the truth. It is the one card the framework cannot settle, and
it is left alone and documented rather than tuned against a number that does not
mean what it says. A counterfactual harness — re-simulating from the decision
point with the next-best pick — is the obvious next thing to build.

### D-15 — shield was being judged by a metric that cannot see it

An experimental pure-shield card read **30%** on the adjusted rate. Shield can
never win a row; it only reduces what losing one costs. A card carrying it is by
construction on a body that expects to lose, so its row win-rate is guaranteed
low however good the effect is.

`shield` moved into the same bucket as `burn` and `heal`, where it always
belonged. The base set never noticed because its only shield card also carries a
tempo cost, which had already put it in the right bucket. On match win-rate the
card reads 48%.

### D-16 — the set is not the sum of its cards

Every accepted experiment sits inside the corridor individually. Adding all of
them to the pool still moves the first-picker win rate from **49.8% to 52.5%**,
because most of them reward the three-card seat.

That is why the experiments are opt-in — `createMatch` deals from the base 30 —
and it is the strongest argument yet for measuring the pool and not just the
cards. Six fair cards can make an unfair match, and no per-card corridor would
ever catch it. The regression test now checks the shipping pool and the
experimental pool separately and asserts the drift.

### Engine bug the tester found

`excludeSelf` excluded by `CardDef` object identity. `getCard` returns one shared
object per id, so two copies of a card on one side deleted *each other* from
their own count, and the opponent's copy counted as "self". Not reachable in a
generated match — `buildRows` forbids duplicates inside a row — but reachable
through the explicit-rows path and through any hand-built `rowPower()` call.
Fixed positionally. The tester verified the old and new card numbers reproduce
to 0.1% under the fixed engine, so no balance conclusion moved.

### Where the numbers ended up

Shipping pool, 30,000 matches across six seeds:

| metric | value |
|---|---|
| first-picker win rate | **49.8–51.5%** |
| cards outside 42–58% | **0 of 30** |
| widest card | 45.6% – 56.2% |
| regression-test margin (worst card) | 0.4 → **2.1 points** |
| matches ending by knockout | 9.1% |

`normal` vs `normal` now also holds the corridor completely (it did not before:
Bulwark read 39.4%). `easy` vs `easy` still spreads 8 cards out of band, and
that is left alone deliberately — the easy bot reads the printed number and
nothing else, so it systematically misprices every card whose text matters.
That gap *is* the skill gradient D-05 describes.

### Known open items

1. **Quickstep** — 55.5% on the conservative metric, unsettleable (D-14).
2. **Bulwark and Warlord now play identically** — same power, same tempo cost,
   and shield measured at roughly zero on a body that wins its rows. Different
   factions keep them from being literally redundant. The real fix is to move
   shield onto a card that expects to lose, which is what the experimental Aegis
   Mote tests.
3. **Ember Cascade is quiet** — 48%, but average power 1.6, because only five
   cards carry the Spark tag. Tags need more members before they carry a deck.

---

## Iteration 4 — tutorial, offline, deployability

Three things that were nominally finished and were not.

**The tutorial described the game instead of showing it.** It claimed "five
cards on the table" over a picture of three, its "what you take, they lose" step
had no opponent taking anything, and it never mentioned HP, the 3/2 split, or
the timer — so a player met the 11/13 bars and a 20-second clock having been
told about neither. Rewritten as an actual draft: five cards, a live countdown,
and an opponent who visibly takes the biggest card left with a "that one is gone
for good" callout. The fight in step 2 runs the drafted cards through the
engine's own `resolveLines`, so the sums and the HP drop are real. 3.3 seconds to
tap through; about 15 reading every line.

**The PWA was blank on every offline reload.** Two defects stacked. The service
worker precached the shell but not the hashed bundle, and caching lazily on
first fetch cannot work because the worker only starts controlling the page
after the first load has already fetched everything. Then, once precaching was
fixed, the assets still would not serve: Vite emits its module script with
`crossorigin`, so the browser sends an `Origin` header the precache fetch did
not, and a response carrying `Vary` fails to match. The cache held the file and
returned nothing. `ignoreVary` plus a by-pathname fallback.

This path is worth the trouble: the engine, the bot and the card data all ship
in the bundle, so a bot match has never needed a server. Verified with the
network genuinely cut — the app boots, the tutorial renders, and a match starts.

**`pnpm build` produced a server that could not start.** The workspace packages
resolve to their TypeScript sources — their `main` points at `src/index.ts`,
which is exactly what lets Vite and Vitest consume them with no build step — so
`tsc` emitted JS importing `.js` paths that do not exist. Now bundled with
esbuild into a single 53KB file plain Node runs, verified by starting it.

The pattern in all three: each had been *written* and none had been *run* in the
state that mattered — offline, from the build output, by someone who did not
already know the rules.

### Final state

| check | result |
|---|---|
| tests | 156 across 9 files |
| typecheck | clean, strict, all five packages |
| build | client 98KB gzipped, server 53KB bundle |
| cards outside 42–58% | 0 of 30 (shipping pool) |
| first-picker win rate | 49.8–51.5% over 30,000 matches |
| mobile | 320 / 360 / 430px, no overflow, no console errors |
| online | full match in two browsers, room codes, emotes, reconnect |
| offline | bot match playable with the network cut |

Open items are listed at the end of iteration 3.
