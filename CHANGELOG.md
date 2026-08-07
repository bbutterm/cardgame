# Changelog

All notable changes to «Дележ» / Split Draft.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Monorepo scaffold: pnpm workspaces, TypeScript strict across all packages.
- `@delezh/engine` — deterministic, UI-free game core. Seeded RNG, pre-generated
  rows, immutable `applyAction`, event log for animation, ELO.
- `@delezh/cards` — 30-card starter set as pure data (12 vanilla, 10 synergy,
  4 tempo, 4 control) plus a data-driven effect language the engine interprets.
- `@delezh/bot` — three difficulty levels and a balance simulator with a
  seat-adjusted per-card win rate.
- `pnpm sim` (per-card balance report) and `pnpm balance` (config sweep grids).
- 79 tests: one per effect kind, full match flows, bot-vs-bot integration at
  every level pairing, and a balance regression asserting the 42–58% corridor.

### Balance
- Starting HP 20 → 11, with +2 for the player who picks second in row 1.
- Costless cards capped at 4 power; everything above buys a drawback.
- All 7 synergy payoffs raised — they averaged less power than a vanilla 3.
- Oracle Coin's "+N if you picked second" replaced with a heal; the effect
  punished both players (see PROGRESS.md D-07).
- Result: 0 of 30 cards outside 42–58%, first-picker win rate 50.6%.

### Fixed
- Bot valued denial at the card's worth to itself rather than to the opponent,
  overpaying to deny tempo cards the opponent could not afford.
