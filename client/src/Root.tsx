import { Suspense, lazy } from 'react';
import { Landing } from './ui/Landing';
import { routeFromPath } from './router';

/**
 * Route split. The landing page stays tiny and paints at once; the game (Pixi,
 * rooms, every in-game sheet) only downloads for /play and /r/:slug.
 */
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));

export function Root() {
  if (routeFromPath().kind === 'landing') return <Landing />;
  return (
    <Suspense
      fallback={
        <div className="boot">
          <span className="boot__mark" />
          <span>loading your world…</span>
        </div>
      }
    >
      <App />
    </Suspense>
  );
}
