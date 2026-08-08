import { useMemo, useState } from 'react';
import type { BotLevel } from '@delezh/bot';
import { ALL_CARDS, encounterPool, type Encounter } from '@delezh/cards';
import { useBotMatch } from '../game/useBotMatch.js';
import { markCleared } from '../campaign.js';
import { MatchScreen } from './MatchScreen.js';
import { ResultScreen } from './ResultScreen.js';

export interface BotMatchScreenProps {
  level: BotLevel;
  /** Set for a campaign fight; a free match against the bot leaves it out. */
  encounter?: Encounter;
  onHome: () => void;
  /** Called once, when a campaign encounter is beaten. */
  onCleared?: (encounter: Encounter) => void;
}

/**
 * Wires the bot controller to the match UI. The result screen only appears once
 * the battle animation for the final row has been dismissed, so a match never
 * cuts away mid-reveal.
 *
 * A campaign encounter is the same match with a narrower pool and its own
 * config — the engine takes both as arguments, so there is no separate mode
 * here, only different data.
 */
export function BotMatchScreen({ level, encounter, onHome, onCleared }: BotMatchScreenProps) {
  const [round, setRound] = useState(0);
  const [recorded, setRecorded] = useState(false);

  // Memoised on the encounter id: a new array identity every render would
  // restart the match on every state change.
  const cards = useMemo(
    () => (encounter ? encounterPool(encounter, ALL_CARDS) : undefined),
    [encounter],
  );
  const config = useMemo(
    () => (encounter?.rounds !== undefined ? { rounds: encounter.rounds } : undefined),
    [encounter],
  );

  const controller = useBotMatch({ level, cards, config, hp: encounter?.hp });

  const over = controller.state && controller.status === 'over' && !controller.battle;
  const won = controller.state?.winner === controller.me;

  // Recorded on the result screen rather than at game over, so a player who
  // closes the app mid-animation still gets the credit.
  if (over && won && encounter && !recorded) {
    markCleared(encounter.id);
    setRecorded(true);
    onCleared?.(encounter);
  }

  if (over && controller.state) {
    return (
      <ResultScreen
        state={controller.state}
        me={controller.me}
        ratingDelta={null}
        unranked
        rematchPending={false}
        onRematch={() => {
          controller.rematch();
          setRecorded(false);
          setRound((value) => value + 1);
        }}
        onHome={onHome}
        key={round}
      />
    );
  }

  return <MatchScreen controller={controller} onExit={onHome} />;
}
