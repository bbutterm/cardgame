import { useState } from 'react';
import type { BotLevel } from '@delezh/bot';
import { useBotMatch } from '../game/useBotMatch.js';
import { MatchScreen } from './MatchScreen.js';
import { ResultScreen } from './ResultScreen.js';

/**
 * Wires the bot controller to the match UI. The result screen only appears once
 * the battle animation for the final row has been dismissed, so a match never
 * cuts away mid-reveal.
 */
export function BotMatchScreen({ level, onHome }: { level: BotLevel; onHome: () => void }) {
  const [round, setRound] = useState(0);
  const controller = useBotMatch({ level });

  if (controller.state?.phase === 'gameOver' && !controller.battle) {
    return (
      <ResultScreen
        state={controller.state}
        me={controller.me}
        ratingDelta={null}
        unranked
        rematchPending={false}
        onRematch={() => {
          controller.rematch?.();
          setRound((value) => value + 1);
        }}
        onHome={onHome}
        key={round}
      />
    );
  }

  return <MatchScreen controller={controller} onExit={onHome} />;
}
