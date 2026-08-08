# EXPERIMENTS

Card mechanics that were tried, measured, and kept or thrown out.

The bar for keeping a design: it lands inside the 42–58% corridor on the metric
that actually measures it (see PROGRESS.md), it can be explained in eight words
on the card face, and it creates a decision rather than a calculation.

**Accepted experiments are not dealt by default.** `createMatch` draws from the
base 30 (`CARDS`); the accepted cards live in `ALL_CARDS` and have to be asked
for. The reason is measured, not cautious — see "The set is not the sum of its
cards" at the bottom.

---

## Accepted — 6 of 9 tried

Values and readings below are **as they stand now**, after the row rule changed
to "closest to 11" (D-21) and every one of these was re-tuned against it. Where
the number a card was originally accepted at differs, it is in the last column,
because the reasoning further down this file was written against those.

| card | effect | metric | reads | was |
|---|---|---|---|---|
| Одинокий волк / Lone Wolf | `lonerBonus 5` — stronger the fewer cards you took | adjusted | 51.1% | 6, 52.4% |
| Последний рубеж / Last Stand | +2 while you are behind on HP | adjusted | 47.2% | +4, 53.9% |
| Осколок эгиды / Aegis Mote | Shield 2 on a 1-power body | match | 48.9% | shield 4, 48.0% |
| Вестник пепла / Ash Herald | 2 direct damage, and peek at the next row | match | 51.4% | — |
| Каскад искр / Ember Cascade | +3 per other Spark card | adjusted | 47.8% | — |
| Ночной ужас / Night Terror | opponent loses 2 power | adjusted | 52.7% | 3, 53.5% |

Every reading is the mean of four independent 2500-match seeds, and every card
is in band on **each** of them individually.

### What each one was actually testing

**Lone Wolf** — the question D-07 left open. The rejected "+N if you picked
second" card was unplayable because its payoff was visible only from the seat
that was already behind, so the first picker spent an early pick denying a card
that was worth 1 to them. `lonerBonus` rewards the same seat *without keying on
the seat*: it scales with how few cards you have taken, which is a fact about
your own board rather than about the pick order. That difference is the whole
result — 52.4% against the earlier card's 18%.

Started at `amount 7`, which read 57.8% and took the opening pick of 77% of the
rows it appeared in. At 6 it is 52.4% and 60% priority.

**Last Stand** — the `behind` condition, which had been implemented and tested
since the first iteration but never used by a shipped card. It is a comeback
effect, and comeback effects were the ones I expected to read low for the same
reason Oracle Coin did. It does not: 53.9%. The difference from the `pickedSecond`
card is that HP-behind is a slow, match-level state rather than a per-row seat,
so both players can see it coming and both can plan around it.

**Aegis Mote** — a direct test of a finding from the base set: shield measured
as worth almost nothing on Bulwark, and the hypothesis was that this was about
the *body*, not the effect. Shield only pays out when you lose a row, and
Bulwark's 8-power body rarely loses. So: the same effect on a 1-power body that
expects to lose.

The result was a genuine surprise and it fixed the metric rather than the card
(see below). At 48.0% on match win-rate the card is fine, and the hypothesis was
right — shield does need a losing body.

**Ash Herald** — two cross-row effects on one card, to check that the
classification holds for a card with a mixed payoff. It does.

**Ember Cascade** — the tag axis rather than the faction axis. Spark spans Fire
and Machine, so this rewards a cluster the *colour of the board does not show* —
you have to have read the cards. At 48.0% it is fine but quiet (average power
1.6): with only five Spark cards in the set the synergy rarely assembles. It is
kept as a proof that tags work as a second axis, not because it is exciting.

**Night Terror** — twice Nightmare's weaken on a third of the body, to find the
ceiling on `weaken`. `weaken 4` read 58.0% with 62% priority: removing 4 power
from the opponent is worth more than adding 4 to yourself, because it can flip a
row you were losing *and* it cannot be denied by the opponent taking it first —
they would only be denying themselves. At 3 it reads 53.5%.

---

## Rejected — 3

### «+N, если ты пикал вторым» — rejected, and it taught the most

A card that pays out only for the player holding the two-card seat, intended as
self-balancing catch-up.

Measured at 18% on the seat-adjusted metric — by a wide margin the worst card
ever tested here. Buffing it from +5 to +7 made it *worse* (39.8% → 34.9% match
win rate), which is what gave the reason away.

The effect is only live for the second picker, so the first picker sees a card
that is worth 1 power to them and 8 to the opponent. Correct play is to spend an
early pick denying it and then hold a dead card for the rest of the row. It made
the opening pick of every row it appeared in worse for *both* players.

The `pickedSecond` condition stays in the engine, with tests. Lone Wolf is what
the design was reaching for.

### Могильный прилив / Grave Tide — rejected on design, not only on numbers

Shadow, 1 power, `+1 per opponent card` — the only card that reads the other
side of the table.

The numbers were borderline: 56.5% on one seed, 59.7% on another, out of band on
a third. At `+2 per` it was 64.8%. It could probably have been shaved into the
corridor at power 0.

I threw it out anyway, because the design is wrong for this game. A card that
gets stronger the more cards your opponent has *pays you for losing the draft*.
The central tension is "improve my side or take what they need", and a card
whose value rises as you fall behind on cards flattens exactly that. Shaving the
number until the metric stopped complaining would have kept a card that quietly
argues against the rest of the game.

> **Note.** Everything from here down was written before the row rule changed,
> and the *reasoning* still holds — but any "reads N%" in it is a pre-`closest`
> measurement. Night Terror's entry in particular describes a ceiling that has
> since moved down by one: weaken got strictly better when it stopped being able
> to rescue a busted opponent (D-22).

### Мусорщик / Salvager — rejected as redundant

A second Mirror Idol (`mirrorStrongest`) in Machine rather than Neutral, to test
whether the effect's balance came from the card or from being colourless.

It read 48.3%, comfortably in band — and it plays exactly like Mirror Idol. The
answer to the question was "the effect is fine either way", which is worth
knowing and not worth a card slot. Rejected for adding a second copy of an
existing decision rather than a new one.

It then shipped anyway: the verdict was written here and the card was never
taken back out of `EXPERIMENTAL_CARDS`. That was invisible for as long as the
experimental set was dev-only, and it stopped being invisible the moment
finishing the campaign started handing the set to players. A test now reads the
two counts in this file's headers and asserts the shipping array matches, so the
next rejection cannot leak the same way.

---

## What the experiments changed about the *measurement*

**Shield was being scored by a metric that cannot see it.** Aegis Mote read
30.3% on the adjusted row win-rate, which would have condemned it. But shield
can never win a row — it only reduces what losing one costs. A pure shield card
is by construction on a body that expects to lose, so its row win-rate is
guaranteed low regardless of whether the effect is any good.

`shield` moved into the cross-row bucket alongside `burn` and `heal`, which had
been classified that way from the start for exactly the same reason. It should
have been there all along; the base set never noticed because its only shield
card also carries `skipNextPick`, which already put it in the right bucket. On
match win-rate Aegis Mote reads 48.0%.

**Quickstep is the one card neither metric can settle, and it is worth saying so
rather than picking the flattering number.** It reads 49–52% adjusted and 55–59%
on match win-rate, and both are confounded, in opposite directions:

- The adjusted metric controls for *which pick index* a card was taken at.
  Quickstep's entire effect is to hand you an extra pick index. Controlling for
  the thing the card does subtracts away the card's value — seat index is a
  mediator here, not a confounder.
- Match win-rate over-counts it for the Oracle Coin reason in reverse: a 0-power
  card is only worth taking when the double pick converts, so it is selected
  into favourable positions and inherits their win rate.

Its raw row win-rate is 49.1% against a field mean of 55.7% — the side holding it
does *worse* in the row it is played in. Something in the 50–55% range is the
honest answer, and the card stays as it is. Settling it properly needs a
counterfactual harness — re-simulating from the decision point with the
next-best pick instead — which is the obvious next thing to build.

## The set is not the sum of its cards

Every accepted experiment sits inside the corridor individually. Adding all of
them to the pool still moves the first-picker win rate from **49.8% to 52.5%**
(3000 matches each, `pnpm balance --grid pool`), because most of them reward the
three-card seat.

That is why they are opt-in. It is also the strongest argument in this file for
measuring the pool and not just the cards: six fair cards can make an unfair
match, and no per-card corridor would ever have caught it.
