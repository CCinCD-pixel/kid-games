/** Build-time registry of games (vite.config.ts plugin "kg-registry", from site/<id>/game.json). */
declare module 'virtual:kg-registry' {
  export interface HubEntry {
    id: string;
    title: string;
    subtitle: string;
    place: 'base' | 'playground' | 'classic';
    order: number;
    status: 'live' | 'wip' | 'hidden';
    accent: string;
    icon: string;
    href: string;
    domains: string[];
    parentNote: string;
    /** 星港 colour theme (data-xg-game) */
    theme?: 'mars' | 'moon' | 'rabbit' | 'story' | 'lab' | 'porter' | 'chess' | 'army' | 'snake' | 'match' | 'defense';
    /** a real content drop: the hub shows NEW until the child opens the game after it appeared */
    newContent?: { id: string; label?: string };
  }
  const entries: HubEntry[];
  export default entries;
}
