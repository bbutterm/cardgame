import { useCallback, useEffect, useState } from 'react';
import type { BotLevel } from '@delezh/bot';
import { HomeScreen } from './screens/HomeScreen.js';
import { BotMatchScreen } from './screens/BotMatchScreen.js';
import { TutorialScreen } from './screens/TutorialScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';
import { OnlineScreen } from './screens/OnlineScreen.js';

type Route =
  | { name: 'home' }
  | { name: 'bot'; level: BotLevel }
  | { name: 'online'; join?: string }
  | { name: 'tutorial' }
  | { name: 'leaderboard' }
  | { name: 'settings' };

const TUTORIAL_SEEN = 'delezh.tutorialSeen';

/**
 * Screen routing is a plain state machine rather than a router: there are six
 * screens, no deep links except a room invite, and shipping a routing library
 * to a phone for that would be a poor trade.
 */
export function App() {
  const [route, setRoute] = useState<Route>(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) return { name: 'online', join: room.toUpperCase() };
    if (!localStorage.getItem(TUTORIAL_SEEN)) return { name: 'tutorial' };
    return { name: 'home' };
  });

  const home = useCallback(() => setRoute({ name: 'home' }), []);

  // Android back button / browser back should leave a match, not the app.
  useEffect(() => {
    if (route.name === 'home') return;
    window.history.pushState({ screen: route.name }, '');
    const onPop = () => home();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [route.name, home]);

  switch (route.name) {
    case 'bot':
      return <BotMatchScreen level={route.level} onHome={home} />;

    case 'online':
      return <OnlineScreen joinCode={route.join} onHome={home} />;

    case 'tutorial':
      return (
        <TutorialScreen
          onDone={() => {
            localStorage.setItem(TUTORIAL_SEEN, '1');
            home();
          }}
        />
      );

    case 'leaderboard':
      return <LeaderboardScreen onBack={home} />;

    case 'settings':
      return <SettingsScreen onBack={home} />;

    case 'home':
    default:
      return (
        <HomeScreen
          onPlayBot={(level) => setRoute({ name: 'bot', level })}
          onPlayOnline={() => setRoute({ name: 'online' })}
          onTutorial={() => setRoute({ name: 'tutorial' })}
          onLeaderboard={() => setRoute({ name: 'leaderboard' })}
          onSettings={() => setRoute({ name: 'settings' })}
        />
      );
  }
}
