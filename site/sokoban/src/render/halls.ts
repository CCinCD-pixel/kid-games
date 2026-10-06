/**
 * 货运厅 scene kits (spec §6.2b): one tile renderer, parameterised per route. The floor pair must stay
 * the gated values (palette.test.ts); wall tops are deep (L* 11–30).
 */
import type { Hall } from '../data';

export type Decal = 'hazard' | 'vent' | 'porthole' | 'brush' | 'plate' | 'grille' | 'stripe' | 'pipe' | 'wood' | 'oldplate';

export interface HallKit {
  id: Hall;
  name: string;
  floorA: string;
  floorB: string;
  seam: string;
  bolt: string;
  wallTop: string;
  /** a slightly lighter rim on the wall top (paper layer feel) */
  wallTopHi: string;
  /** decals by hash bucket: <15 → [0], 15–22 → [1], 22–30 → [2] */
  decals: [Decal, Decal, Decal];
  /** backdrop key */
  sky: 'earth' | 'moon' | 'mars' | 'classic';
  /** hazard stripe colours next to pads */
  hazard: [string, string];
}

export const HALLS: Record<Hall, HallKit> = {
  tiangong: {
    id: 'tiangong', name: '天宫厅',
    floorA: '#FBF3E3', floorB: '#F4E7CD', seam: '#E8D5B1', bolt: '#D2B88B',
    wallTop: '#26346E', wallTopHi: '#35468C',
    decals: ['hazard', 'vent', 'porthole'], sky: 'earth', hazard: ['#F6B934', '#261C30'],
  },
  moon: {
    id: 'moon', name: '月宫厅',
    floorA: '#EEF0F4', floorB: '#E3E6EE', seam: '#D3D8E2', bolt: '#B8BFCC',
    wallTop: '#1F4A6E', wallTopHi: '#2C5C85',
    decals: ['brush', 'porthole', 'plate'], sky: 'moon', hazard: ['#F6B934', '#261C30'],
  },
  mars: {
    id: 'mars', name: '火星厅',
    floorA: '#FBEEE6', floorB: '#F4E0D3', seam: '#EACBB7', bolt: '#D6A88D',
    wallTop: '#3B2A4F', wallTopHi: '#4E3A66',
    decals: ['grille', 'stripe', 'pipe'], sky: 'mars', hazard: ['#EB6A3C', '#261C30'],
  },
  classic: {
    id: 'classic', name: '经典厅',
    floorA: '#FBF3E3', floorB: '#F4E7CD', seam: '#E8D5B1', bolt: '#D2B88B',
    wallTop: '#4B3F58', wallTopHi: '#5E5070',
    decals: ['wood', 'oldplate', 'vent'], sky: 'classic', hazard: ['#F6B934', '#261C30'],
  },
};
