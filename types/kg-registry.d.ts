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
  }
  const entries: HubEntry[];
  export default entries;
}
