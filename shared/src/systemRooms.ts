import { Placement, RoomMask } from './furniture';
import { RoomTheme } from './constants';
import { MAIN_LOBBY, mainLobbyLayout } from './lobby';
import { HARBOR, harborLayout, harborMask } from './harbor';
import { LOVE_ROOM } from './loveMeter';
import { loveLayout } from './loveRoom';
import { ROCKET_LAB, rocketLabLayout } from './rocketLab';
import { SUNSET_COVE, sunsetCoveLayout, sunsetCoveMask } from './sunsetCove';
import { DREAM_SUITE, dreamSuiteLayout } from './dreamSuite';
import { WONDER_DOME, wonderDomeLayout } from './wonderDome';
import { GAME_DEN, gameDenLayout } from './gameDen';
import { CASINO, casinoLayout } from './casino';

export interface SystemRoom {
  slug: string;
  name: string;
  category: string;
  theme: RoomTheme;
  size: number;
  mask: () => RoomMask;
  layout: () => Placement[];
  /** showcase room: badge in the room browser, listed first */
  featured?: boolean;
}

/** Rooms the app owns. Seeded at boot, never editable by players, always listed first. */
export const SYSTEM_ROOMS: SystemRoom[] = [
  { ...MAIN_LOBBY, mask: () => null, layout: mainLobbyLayout },
  { ...HARBOR, mask: harborMask, layout: harborLayout },
  { ...LOVE_ROOM, mask: () => null, layout: loveLayout },
  { ...ROCKET_LAB, mask: () => null, layout: rocketLabLayout },
  { ...SUNSET_COVE, mask: sunsetCoveMask, layout: sunsetCoveLayout },
  { ...DREAM_SUITE, mask: () => null, layout: dreamSuiteLayout },
  { ...WONDER_DOME, mask: () => null, layout: wonderDomeLayout },
  { ...GAME_DEN, mask: () => null, layout: gameDenLayout },
  { ...CASINO, mask: () => null, layout: casinoLayout },
];

export function isSystemRoom(slug: string): boolean {
  return SYSTEM_ROOMS.some((r) => r.slug === slug);
}
