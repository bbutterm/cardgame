# PROGRESS

Working log for «Дележ» / Split Draft. Newest iteration last. Every design
decision that cost more than a minute of thought is recorded here with the
reason, so a later change can tell whether it is undoing something deliberate.

---

## Plan

| # | Item | State |
|---|------|-------|
| 1 | engine + cards + tests + balance simulator | **done** |
| 2 | client: bot match end-to-end on mobile | in progress |
| 3 | procedural SVG cards, neo-brutalist theme, battle animation | pending |
| 4 | server: rooms by code, online 1v1, reconnect | pending |
| 5 | matchmaking + ELO + leaderboard | pending |
| 6 | i18n polish, in-match emotes, rematch | pending |
| 7 | sounds, touch gestures, tutorial | pending |
| 8 | experimental mechanics | pending |

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
