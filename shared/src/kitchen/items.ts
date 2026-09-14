import { PlateItem, PotItem } from './types';

export const emptyPot = (): PotItem => ({ kind: 'pot', contents: [], cook: 0, over: 0, burnt: false });
export const emptyPlate = (): PlateItem => ({ kind: 'plate', soup: null, parts: [] });
