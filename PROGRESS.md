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
| 9 | single-player campaign (added after the night) | **done** |

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
  *(Superseded in iteration 9 — see D-21. The row now goes to whoever is
  closest to 11 without exceeding it, and damage is capped at 5.)*
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

---

## Iteration 5 — campaign

Eight opponents, roughly twenty minutes, offline. Built as data:
`packages/cards/src/campaign.ts` is a list of (card pool, bot level, optional
config), and `createMatch` already accepted all three. The only engine addition
was `hp: [player, opponent]`, because the `startHp` / `secondPickerHpBonus` pair
can describe a fair match with seat compensation and cannot describe a handicap.

### D-17 — the ramp is carried by the card pool, not the bot level

This was measured, and it was not what I expected. Sweeping all 8 pools against
all 3 bot levels:

- **A pure-vanilla pool is a coin flip at every bot level, to the decimal.**
  Encounter 1 reads 50.0% against `normal` and 50.0% against `hard`. Row power
  is a plain sum, so "take the biggest number" is exactly optimal for both
  sides — the deal decides the match and neither player ever does.
- **One synergy card in eight turns a 60% matchup into 83%. Two turn it into 95%.**
  Adding Shadow Broker alone to a flat pool moved it from 50.0% to 87.5%.

So skill in this game lives almost entirely in cards whose value differs from
their printed number, and the fine lever is *dilution*: adding plain bodies
around a synergy card moves a matchup smoothly, where the three bot levels only
jump (easy → normal costs a good player ~15 points, normal → hard another ~25).

That is also why every campaign pool is 8–12 cards. Beyond that an encounter
stops having a face, and a row is five cards regardless.

### What the tuning pass fixed

The first draft's curve was, for a good player: 60 / **99** / 91 / 87 / 91 / 56 /
48 / **29**. Encounters 2–5 were unloseable, 7–8 were walls, and it inverted
three times. After tuning, at 1500 mirrored matches per arm:

| model | curve | shape |
|---|---|---|
| strong player (`hard` bot in the human seat) | 82 / 81 / 80 / 72 / 65 / 58 / 58 / 51 | monotonic |
| average player (`normal` bot) | 83 / 76 / 71 / 48 / 50 / 49 / 49 / 39 | one inversion, pyre → thief |

Only the strong-player curve is a tuning target, and it is monotonic. The
average-player curve is measured but cannot be flattened past encounter 4: a
`normal` bot against a `normal` bot is a mirror match, so it sits at 48–50%
whatever the pool holds, and the residual +1.4-point inversion at pyre → thief
is that floor, not a design error. What the second row is actually for is the
shape of its ends — an average player clears the first three (83 / 76 / 71) and
is under water on the finale (39%), which is the ramp the campaign promises.

Two recurring causes, both worth remembering:

**A card that is strictly the best pick deletes the encounter.** Bulwark — 8
power *and* a shield — opened 86% of the rows it appeared in the Assembler
fight and 93–96% in the tempo fight. Neither encounter's lesson could happen
because the only decision was "take the 8". It is now in no campaign pool, which
is a symptom of open item 2 (Bulwark and Warlord play identically) rather than a
fix for it.

**A synergy card with no partner is a lie.** The first draft of the finale kept
Pack Leader in a pool with no other Beast: it played 2.0 power against a printed
2, i.e. its text could never fire. Assembler read 2.1 and Wildfire 3.0 for the
same reason. The report script prints printed-vs-played power precisely because
this is invisible in the data and obvious in the numbers.

### D-18 — encounter 1 takes a handicap rather than a harder pool

Its own lesson removes every decision (see D-17), so its win rate cannot be
tuned by its pool: 7 vanilla cards reads 60%, 12 reads 60%, 8 reads 62%. And 62%
is too swingy for a first fight — better than a third of players would lose the
first game they ever play.

The two available fixes were a handicap, or adding a card with rules text. The
second would make the encounter's own blurb ("Только цифры" / "Numbers only")
false, so: the Cub starts on 8 HP, and the card says so. This is the only
encounter where the twist exists to fix a number rather than to be interesting,
which is worth being honest about.

### Known open items

- **Sprint and Heavyweight are statistically tied** (58% vs 58%; they swap at a
  second sample size). The pool lever is not smooth there — swapping one 1-power
  filler in Heavyweight moves it 58 → 53 → 44 — so there is no 56% available.
  Both are in band and not inverted, but the ladder is flat across those two.
- **The finale ends by knockout 45% of the time** against 9% for a normal match.
  The twist promises a short sharp fight and delivers one, but that is a large
  variance jump for the last thing a player sees.
- **Quickstep splits the two player models violently** — in the finale pool it
  drops an average player from 40% to 27% while leaving a good one untouched.
  The sharpest instance yet of the measurement problem in D-14, and the reason
  it is not in the finale.
---

## Iteration 6 — the campaign's reward, and what it exposed

Finishing all eight encounters now unlocks the **extended card set** — the
accepted experiments — as an off-by-default toggle in Settings, applying to free
bot matches only. Online and the campaign keep dealing the base 30. Verified in
a browser at 360px: 12 deals with the toggle off drew 25 distinct cards, all
base; 12 with it on drew 28 including Aegis Mote, Ember Cascade and Mirror Idol.

The unlock is re-derived from progress on every read rather than latched at
completion. That is what makes "start over" put the extra cards away with it,
and it means a hand-edited `delezh.extendedSet` flag grants nothing on its own.

### D-19 — a rejected card was holding the experimental set together

Building the reward meant looking at the experimental set as *shipping content*
for the first time, and it did not survive the look. `EXPERIMENTS.md` records
nine designs: six accepted, three rejected. `EXPERIMENTAL_CARDS` held seven.
Salvager — rejected there in writing as "a second copy of an existing decision
rather than a new one" — had never been taken back out of the array.

That was harmless while the set was dev-only. It stopped being harmless the
moment finishing the campaign started handing the set to players, so Salvager is
now actually gone, and a test reads the two counts out of `EXPERIMENTS.md` and
asserts the shipping array matches. The record of a verdict is worth nothing if
the code can quietly disagree with it.

Removing it cost 1.4 points. At 4000 matches (`pnpm balance --grid pool`):

| pool | first-picker | knockouts |
|---|---|---|
| base (30) | 49.5% | 8.7% |
| all, with Salvager (37) | 52.9% | 12.8% |
| all, without Salvager (36) | 54.3% | 10.5% |

A card rejected for being a redundant *decision* was doing real work as a
*body* — one more thing competing for the 25 pool slots, diluting the cards that
drift. D-16 again, from the other side: the set is not the sum of its cards, and
that cuts both ways.

It was kept out anyway. All 36 cards are individually inside 42–58% (measured,
4000 matches); the strict 46–54% seat bound still holds on the base 30, which is
the only set that decides a rating; and the extended set is opt-in, offline and
unranked, where a seat advantage the player never chooses is invisible. Keeping
a card the design record calls redundant, purely as ballast, would have bought
one point at the cost of the record meaning anything.

The regression test's bound moved to 58% with its reasoning written down: 800
matches resolve a win rate to about ±2 points, so a 54% assertion at that sample
size fails on seed choice alone. The tight number is measured, not asserted.

### Also fixed

- **The default nickname was Russian for everyone.** It is generated once, at
  first launch, written to storage, and shown on the leaderboard — so an English
  player was permanently «Быстрый Дрон». Now drawn from a per-locale word list
  (`detectLocale` moved out of the React provider so a plain storage helper can
  use it). It stays fixed once written: a later language switch does not rename
  someone behind their back.
- `pnpm balance` listed every grid except `pool` in its unknown-grid error — the
  one that swaps decks, and the one this iteration needed.

---

## Iteration 7 — deployable by connecting the repository

The goal was "point a host at the repo and it works". It did not, and the reason
was one line of client code: the socket is opened with a bare `io()` and the
leaderboard is fetched from `/api/leaderboard`, both same-origin, with no
configurable backend URL anywhere. In `pnpm dev` the Vite proxy supplies that
origin. In production nothing did — the server answered `/api/*` and 404'd
everything else, so a deploy needed a reverse proxy in front of two processes to
recreate what the dev server was doing for free.

So the server now serves the built client itself, from the same port. `pnpm
build && pnpm start` is the entire contract, `PORT` comes from the environment,
and bot, campaign, online and leaderboard all work off one process.

`packages/server/src/static.ts` is hand-rolled rather than express or sirv: a
single-page app with one hashed asset directory is about sixty lines of
conditions, and the server had no other reason to carry a framework. The two
decisions inside it that are not obvious:

- **Hashed assets are immutable, everything else is `no-cache`.** Names under
  `/assets/` carry a content hash so they can be cached for a year, but
  `index.html` and `sw.js` must be revalidated — cache either one and a deploy
  never reaches a browser that already visited.
- **A miss under `/assets/` is a 404, not the SPA shell.** The fallback is right
  for client routes and wrong here: a stale `index.html` asking for a bundle
  this deploy no longer has would receive HTML where it expects JavaScript, and
  fail with a syntax error instead of a clean miss the service worker can handle.

Path traversal is guarded even though `new URL()` has already resolved `..` and
`%2e%2e` out of the pathname before the handler sees it. The guard is two lines
and the cost of being wrong about that is arbitrary file read.

### What it exposed

**CORS was `origin: true`**, which does not mean "same origin" — it reflects
whatever `Origin` the request carried, so any page on the internet could open a
socket to the server. It was defensible while the client was served from a
different port; it is not defensible now, and it is `origin: false`.

**The bundle did not describe itself.** `node dist/server.js` decides ESM vs
CommonJS from the nearest `package.json`, which in the repository is the server
package. An image that copies only `dist/` has no such file above it, so Node
fell back to reparsing and warned on every boot. `bundle.mjs` now writes
`dist/package.json` with `{"type":"module"}`, which makes the directory correct
wherever it is copied.

### Verified

Clean rebuild, then `pnpm start` on a host-assigned port, then two browser
contexts at 360px: room created, code joined, both players dealt a five-card row
with the timer running. Static serving has its own tests against a fixture
directory (so the suite does not need a client build first) covering content
types, cache headers, SPA fallback, the `/assets/` 404, four traversal attempts,
and starting with no client bundle at all.

The Dockerfile is the one artifact I could not verify — no Docker daemon in this
environment. Its layout was reproduced by hand instead: `socket.io` installed
standalone with npm (5.9 MB, the bundle's only external dependency), `dist/`
copied beside it, started exactly as `CMD` does. That runs and serves. The parts
I could not exercise are the two `COPY --from=build` lines and the base image.

### Still true before this faces the public

`identify` trusts a raw player id, and that is the whole authentication story —
anyone who learns another player's id can claim their rating. It has been an
open item since iteration 4; making the thing one click from deployable is what
turns it from theoretical into scheduled.

---

## Iteration 8 — how much is the rule worth?

The design feedback was "it comes down to whoever has the bigger sum, that's
dull". It is correct about the rule and wrong about the game, and the difference
matters.

### D-20 — the depth is all in the cards; the rule contributes nothing

Two measurements, both on a pool of **nothing but vanilla cards**, so that the
cards cannot answer for the rule:

| matchup | strong player wins |
|---|---|
| `hard` vs `normal`, vanilla only | **50.0%** |
| `hard` vs `normal`, full 30-card set | 73.9% |

Fifty point zero. Two competent players on printed numbers alone, and skill is
worth *nothing* — "take the biggest number" is not a heuristic under this rule,
it is the optimal strategy, so there is nothing left to be better at. The full
set rescues it to 73.9%, which means the thirty cards are carrying the entire
game on their back. That is fragile in a specific way: every future card has to
do the work the rule is not doing, which is why D-17 found that one synergy card
turns a 60% matchup into 83%. It is not that the card is strong. It is that
without it there is a vacuum.

### The probe

`packages/bot/scripts/depth.ts` asks the question directly: a **greedy** player
who always takes the biggest printed number, against the `hard` bot. If greedy
holds up, the rule has no depth, by definition.

Two candidate rules are implemented behind `MatchConfig.rowRule`, defaulting to
`sum`, alongside `firstPickerRule`'s existing three modes. Nothing reaches a
player until one is chosen.

- **`closest`** — closest to `rowTarget` without going over; over scores zero.
  A big number becomes a liability, and the three-card seat pays for its extra
  card by being forced to take it.
- **`lanes`** — cards line up in the order they were taken and fight the card
  opposite; the row goes to whoever wins more positions, and an unopposed
  position counts as won. *When* you take a card starts mattering, not only
  which.

### Results, 1200 matches per arm, mirrored seeds

Vanilla only — what the rule is worth by itself:

| rule | greedy wins | first seat |
|---|---|---|
| `sum` (shipped) | **50.0%** | 72.0% |
| `lanes` | 37.0% | 62.7% |
| `closest` to 9 | 5.2% | 42.8% |
| `closest` to 11 | 24.5% | 71.4% |
| `closest` to 12 | 50.0% | 72.0% |

Read the seat column against `sum`'s own 72%, not against 50% — the +2 HP
compensation was tuned on the full set and is nowhere near enough on a vanilla
pool. Two things fall out of this table. `closest` to 12 is identical to `sum`
to the decimal, which is the mechanism confirming itself: a target nobody
reaches is not a target. And the target is a **fairness dial** — it crosses from
favouring the three-card seat to favouring the two-card seat between 9 and 10,
which is a job the HP bonus is currently doing.

Full 30-card set — what would actually ship:

| rule | greedy wins | first seat | rows | busts |
|---|---|---|---|---|
| `sum` (shipped) | 16.0% | 50.2% | 4.88 | — |
| `lanes` | 9.2% | 38.6% | 5.00 | — |
| `closest` to 11 | 8.1% | 49.1% | 4.30 | 11.5% |
| `closest` to 10 | 5.1% | 46.5% | 4.12 | 17.5% |

`closest` to 11 is the surprise: it doubles the punishment for greedy play and
lands on 49.1% seat fairness *with the existing HP compensation untouched*.
`lanes` punishes greedy hardest and keeps matches at the full five rows, but
hands the second seat a 61% edge that would need re-tuning.

### Not adopted

Both stay off. Changing the rule invalidates the balance of all 30 cards (every
number was tuned against a sum), the bot's heuristic (`normal` and `easy` score
a row by total, which under `closest` steers into a bust), the tutorial, and the
row-total preview in the UI. That is a re-run of iterations 1 and 8, not a
tweak — and which rule the game *should* have is a design decision, not a
measurement. The measurement only says the current one is not pulling its weight.

---

## Iteration 9 — the rule now carries its own weight

D-20 measured that it did not. This changed it.

### D-21 — "closest to 11 without going over", damage capped at 5

Swept every candidate against five targets at once (`pnpm rules`), 1500 matches
per cell, mirrored seeds. The decisive column is **greedy on vanilla only**: a
player who always takes the biggest printed number, against the rollout bot, on
a pool with no cards to prop the rule up.

| rule | greedy | seat | ramp | rows | ko |
|---|---|---|---|---|---|
| `sum` (old) | **50.0%** | 49.4% | 76.2% | 4.98 | 10% |
| `lanes` | 38–45% | 34–49% | ~90% | 4.9–5.0 | 0–35% |
| `closest` 11, cap 5 | **22.6%** | 48.8% | 93.2% | 4.95 | 15% |

`lanes` was dropped on its own numbers: still shallow at 38–45%, and every
damage multiplier that fixed its seat skew pushed knockouts to 35%.

Two findings worth keeping:

**The target is a fairness dial.** Sweeping `rowTarget` against
`secondPickerHpBonus`, seat advantage crosses from the three-card side to the
two-card side between 9 and 10 — the three-card seat is forced to take one more
card, which is the seat with the most ways to overshoot. The HP bonus moves it
about 6 points per point. At target 11 the existing +2 lands on 48.8%, so the
compensation tuned in iteration 1 did not have to move at all.

**Target 10 is deeper and worse.** It puts greedy on 7.4% and ends 23% of
matches by knockout. A beginner taking big numbers losing 93% of the time
against the strongest bot is a beating rather than a lesson, and shorter matches
make it feel worse. 11 keeps the game teachable while still more than halving
what greed is worth.

`closest` to 12 reads *identical to `sum`* to the decimal, which is the
mechanism confirming itself: a target nobody reaches is not a target.

### D-22 — weaken could rescue a bust

Found while reading the sweep, not by a test. A side on 13 against a target of
11 is over and worth nothing; weakening it by 2 landed it on a perfect 11. The
attack healed. Busting is now decided on the row's **own** power, before the
opponent's weaken is subtracted — weaken can take a row down, never back from
the dead.

### What the rule did to the cards, for free

The side effect I did not plan. Bot pick priority, before → after:

| card | before | after |
|---|---|---|
| Bulwark (8 power + shield) | 72.0% | 34.2% |
| Warlord (8 power) | 49.4% | 26.3% |

The "strictly best card deletes the encounter" problem from iteration 5 — the
one that forced Bulwark out of every campaign pool because it opened 86–96% of
the rows it appeared in — is simply gone. An eight-power body nearly busts a row
on its own now. Nothing was done to those cards; the rule did it.

### Making the rule reach the player

A rule the simulator understands and the screen does not is a gotcha:

- The row total reads `8/11`, and a pick that would go over is struck through in
  the loss colour rather than dressed in the same green as an increase.
- The battle overlay printed `winner − loser = damage` straight off the raw
  totals, which under this rule is simply false — it ignored both the bust and
  the damage cap. It now calls `rowVerdict()` in the engine, so the screen that
  explains the resolver cannot hold a second opinion about it.
- The tutorial's demo row summed to 11, so the best a three-card side could
  reach was 9 and **the lesson could not happen in it**. It is three 4s and two
  1s now: taking every big number lands on 12 and scores nothing, which the
  player finds out by doing it rather than by reading it.
- The bot's heuristic priced each pick alone, so landing exactly on the target
  scored best and the next *forced* pick busted it. It now projects the cards it
  will still be made to take.

---

## Iteration 10 — the campaign, rebuilt for the new rule

The rule change broke it. Measured before any repair, the curve for a good
player was 82 / 83 / 83 / 86 / 75 / 69 / **99** / 49 — three inversions, and one
encounter that was not an encounter.

### What broke, and why it is instructive

**The Heavyweight was 99.0% with 86% knockouts.** Its pool was three 7-and-8
power tempo bombs plus five 4s. Under `closest` that detonates: almost every row
busts somebody, and a bust is the full capped 5 damage, so two of them decide an
11 HP match. The lesson it was built to teach — big numbers cost you a turn —
was drowned by the rule teaching a louder one.

**The Cub could not demonstrate the rule at all.** Its vanilla pool topped out
at 4+3+3 = 10, so a row *could not be overshot*. The first encounter of a game
about not going over 11 never went over 11. It also held exactly one 4, so "take
the 4" was correct every time and Stone Boar opened 95% of its rows. This is the
same defect the tutorial had (D-21) and I did not think to check for it here
until the numbers were in front of me.

### D-23 — the levers swapped places

Under `sum`, D-17 found the pool was the smooth lever and HP was the blunt one.
Under `closest` that is **reversed**, and the reversal is not a small effect:

| encounter | change | result |
|---|---|---|
| Assembler | +2 small cards | 83% → 86% |
| Assembler | +2 more | → 90% |
| Pyromancer | +2 small cards | 75% → 88%, knockouts 42% → 63% |

Diluting a pool with small cards makes it *easier* to land on 11 exactly, and
landing exactly is precisely the skill the rule rewards — so dilution hands the
better player a bigger edge, not a smaller one. It moves the wrong way, and it
moves fast.

HP, meanwhile, became smooth and predictable: **about 8 points of win rate per
point of opponent HP**, at every pool tested. The Heavyweight reads 77 / 53 / 29
/ 11% at 11 / 14 / 17 / 20 opponent HP. So the campaign now sets its coarse band
with the bot level and its fine position with HP, and six of eight encounters
carry a visible handicap. That is more handicaps than the previous version had
and it is the honest way round: the number is printed on the card the player
reads before starting.

The bot levels are also further apart than they were — the rule made the ramp
93% where it used to be 76% — which is what leaves a gap between "normal" and
"hard" that only HP can bridge.

### The rule fixed the problem iteration 5 could not

Bulwark was barred from every campaign pool for opening 86–96% of the rows it
appeared in. It is back in the Heavyweight, unchanged, because its pick priority
across the whole set fell from 72% to 34% on its own: an 8-power body under this
rule is not a prize, it is a commitment to finding exactly 3 more.

### Final curve, 1500 mirrored matches per arm

| # | encounter | good player | average player | knockouts | top pick |
|---|---|---|---|---|---|
| 1 | Cub | 82.8% | 81.4% | 38% | 61% |
| 2 | Pack Leader | 77.7% | 69.3% | 12% | 76% |
| 3 | Assembler | 74.9% | 57.4% | 17% | 65% |
| 4 | Pyromancer | 74.8% | 41.2% | 42% | 68% |
| 5 | Quiet Thief | 68.7% | 43.7% | 17% | 64% |
| 6 | Courier | 61.4% | 43.1% | 17% | 70% |
| 7 | Heavyweight | 52.1% | 28.1% | 4% | 77% |
| 8 | Archivist | 48.8% | 27.2% | 13% | 45% |

Monotonic for the strong-player model. The average-player column inverts once at
Pyromancer → Quiet Thief, the same structural floor as before: a `normal` bot
against a `normal` bot is a mirror match and sits near 45% whatever the pool is.

No encounter is decided by a single card any more — the worst top pick is 77%,
against 95% before.

### Left alone deliberately

The Pyromancer keeps its 42% knockout rate. The fight is *about* a scaling card
overshooting, so rows that end badly are the subject rather than a defect, and
the one attempt to calm it made both numbers worse (see the table above).

The Archivist drops Void Titan, and that is a measurement rather than a taste:
with it an average player wins 11.5% of the finale, with a plain Shade in its
place, 26.4%. A 7-power tempo bomb under `closest` costs a turn *and* most of a
row's budget, and a player who cannot price both at once is not being examined,
only executed.

### Correction to commit 0963132

Its message says "Beast Tamer and Spark Relay +4 → +3". Beast Tamer was never
touched and is still +6; the card that changed was **Pack Leader**. The commit
is already in `main` so the message stands as written — this is the correction
of record.

### D-24 — for a card that buys something, a smaller body is not a nerf

The balance pass measured Bulwark's body at 5, 6, 7, 8 and 9 power. Every value
*except* 8 measured worse — 42.3 / 41.7 / 41.8 / 45.4 / 41.9. This inverts D-05
("a costless card tops out at 4") for the other half of the set: a tempo debt is
a **flat** cost, paid in full whatever the body is, so only a big body can pay
it. Under `closest` that is in tension with the rule itself, since a big body is
also the one most likely to bust you — which is why these cards sit in a narrow
band rather than a broad one, and why Warlord came down to 7 while Bulwark keeps
the unique 8.

### Open: the bot over-prices `shield` under this rule

Not fixed, and the sign is unambiguous across four seeds:

| Bulwark | reads |
|---|---|
| shield 3 | 44.4% |
| shield 1 | 47.3% |
| no shield at all | **50.3%** |

Aegis Mote shows the same direction. A shield can never *cost* its holder HP, so
its entire price is paid in pick priority — and the evaluator appears to price
the in-row saving, which its rollout sees, against a tempo debt that lands in the
*next* row, which it does not. The card is worth more with the effect deleted
than with it, which is the definition of a mispriced effect.

Mitigated by trimming the shields to 1 and 2 rather than fixed, because the fix
belongs in `packages/bot/src/index.ts` and would need its own balance pass.
Removing Bulwark's shield outright measures best of all and is not done: it
would leave the card rules-identical to Warlord, which is a design call and not
a balance one.

---

## Iteration 11 — "it still feels like picking by stats"

Design note from the player, and three proposals with it: more synergies, and
dealing three cards at a time instead of showing the whole row. All three were
measured. The complaint is real, both proposals are wrong, and the reason they
are wrong is the useful part.

### D-25 — the text is not the problem: it is live and it decides

`pnpm texture` plays a **stats-only** opponent — one that reads every card as
its printed number and is blind to every synergy, tempo cost and denial line —
against the `hard` bot:

| pool | stats-only wins |
|---|---|
| vanilla only (no text exists) | 24.4% |
| base 30 | **9.7%** |
| all 36 | 10.8% |
| only the cards with text | **4.1%** |

The first row is the floor: with no text in the pool at all, 24.4% is just "my
fitting heuristic is worse than a rollout". Adding the cards that *have* text
takes the same player from 24.4% to 9.7%. That fifteen points is what the text
is worth.

`pnpm liveness` asks the other half — how often the text is even *present* in
the decision in front of you. A pick counts as live when at least one card on
the table would play as something other than its printed number:

| pick in row | live |
|---|---|
| 1st | 81.1% |
| 2nd | 71.6% |
| 3rd | 66.5% |
| 4th | 44.7% |
| 5th | 25.0% |
| **overall** | **57.8%** |

So the text is live in most picks and decides most matches. More synergies would
not change either number.

### D-26 — but the picks did not get more interesting, and that is measurable

Every probe until now measured *skill expression*: how much better does the
better player do. That is a different question from whether a pick is a choice.
`pnpm decisions` scores every legal pick with the bot's own evaluator and looks
at the gap between the best and the second best:

| rule | a real choice (gap ≤1) | a preference (≤3) | one move (>3) |
|---|---|---|---|
| `sum`, the old rule | 47.4% | 41.5% | 11.1% |
| `closest to 11` | 47.6% | 42.0% | 10.5% |

**Identical.** D-21 made a pick far more *consequential* — greedy fell from 50%
to 23% — without making it any more *contested*. The player is detecting
something the win-rate metrics were blind to, and this is it.

### Why more synergies cannot fix it

Every synergy in the set — all four `powerPer` and all three `powerIf` — resolves
into "my number gets bigger". So any two options are comparable on one axis, and
on one axis one of them is simply better. That is the definition of a pick that
is executed rather than decided, and adding more cards of the same shape adds
arithmetic rather than gameplay.

A real choice needs options that are **not comparable**: one that changes the
number against one that changes the rule, the order, or what the opponent knows.

### D-27 — dealing three at a time makes it worse, on every metric

Implemented as `MatchConfig.revealCount` (with `viewFor` redacting the face-down
cards, or the mechanic would be cosmetic) and measured:

| face-up | greedy | ramp | seat | a real choice |
|---|---|---|---|---|
| 5 (shipped) | 23.1% | 95.8% | 48.8% | **47.6%** |
| 4 | 23.6% | 93.4% | 46.6% | 43.1% |
| 3 | 25.8% | 90.4% | 46.9% | 37.8% |
| 2 | 34.0% | 79.5% | 45.2% | **26.4%** |

It fails in both directions at once, which is unusual and conclusive. Skill
expression falls, as hidden information always compresses it. But the *decision*
metric falls too, and harder — which is obvious in hindsight and I did not
predict it: with fewer cards on the table there is less to choose between, so
the best of two is more often plainly best than the best of five. Hiding cards
does not make a row less solved, it makes it smaller.

Kept in the engine behind `revealCount: 0` (all face-up, unchanged) because the
measurement is worth being able to repeat, not because it is close.

### Where the gameplay actually is

The one verb the effect language has is "change a number". Adding verbs is what
would make two options incomparable. The strongest candidate under `closest`,
because it inverts what taking a card means:

    «Эта карта идёт в ряд оппонента» — you take it, they get it

Under a target you can overshoot, handing someone a card is an attack, and it is
not on the same axis as anything else in the set. Others in the same family: a
card that changes *your* target for the row, one that resolves the row on its
largest card instead of its sum, one that hides your row until the battle.

Not built. This is the design direction the measurements point at, and it is a
set-sized piece of work rather than a tuning pass.

### Known open items

- **No reward for finishing.** *(Done — see iteration 6.)*
