# EXPERIMENTS

Card mechanics that were tried, measured, and kept or thrown out.

The bar for keeping a design: it lands inside the 42–58% corridor on the metric
that actually measures it (see PROGRESS.md), it can be explained in eight words
on the card face, and it creates a decision rather than a calculation.

---

## Rejected from the base set

### «+N, если ты пикал вторым» — rejected

A card that pays out only for the player holding the two-card seat, intended as
self-balancing catch-up.

Measured at 18% on the seat-adjusted metric — by a wide margin the worst card
ever tested here. Buffing it from +5 to +7 made it *worse* (39.8% → 34.9% match
win rate), which is what gave the reason away.

The effect is only live for the second picker, so the first picker sees a card
that is worth 1 power to them and 8 to the opponent. Correct play is to spend an
early pick denying it and then hold a dead card for the rest of the row. It made
the opening pick of every row it appeared in worse for *both* players.

Kept in the engine as the `pickedSecond` condition, with tests. Any future use
has to avoid the asymmetry — the payoff cannot be visible only from the seat
that is already behind.

