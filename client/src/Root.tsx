import { Suspense, lazy } from 'react';
import { Landing } from './ui/Landing';
import { routeFromPath } from './router';

/**
 * Route split. The landing page stays tiny and paints at once; the game (Pixi,
 * rooms, every in-game sheet) only downloads for /play and /r/:slug.
 */
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
/** rankings: no game store, but still pulls the shared avatar chunk (which includes Pixi core) for avatar previews */
const Leaderboards = lazy(() => import('./ui/Leaderboards').then((m) => ({ default: m.Leaderboards })));

export function Root() {
  const route = routeFromPath();
  if (route.kind === 'landing') return <Landing />;
  if (route.kind === 'leaderboards') {
    return (
      <Suspense
        fallback={
          <div className="boot" role="status" aria-label="loading rankings">
            <img className="boot__logo" src="/leypark-logo.png" alt="Leypark" draggable={false} />
          </div>
        }
      >
        <Leaderboards />
      </Suspense>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="boot" role="status" aria-label="loading Leypark">
          <img className="boot__logo" src="/leypark-logo.png" alt="Leypark" draggable={false} />
        </div>
      }
    >
      <App />
    </Suspense>
  );
}
