/**
 * `?dev=style` 风格板 (spec §6.11): every skin portrait (the same painters the match atlas uses), the crown,
 * and a dump of two match atlases (all 18 skins' heads / overlays / extras; every persona look) so a
 * reviewer can see each painted sprite at once. Dev only — never linked from the game.
 */
import { h } from '@kit/ui';
import { SKINS, buildAtlas, hex2rgb, aiBodyColor, mix, type AtlasColor } from '../render/art';
import { AI_NAMES } from '../sim/venues';
import { skinPreview } from '../screens2';

export function styleBoard(root: HTMLElement) {
  root.innerHTML = '';
  const page = h('div', { class: 'sb-style' });
  const grid = h('div', { class: 'sb-style__grid' });
  for (const sk of SKINS) grid.append(h('figure', { class: 'sb-style__card' }, skinPreview(sk.id, 170, 96), h('figcaption', null, `${sk.name} · ${sk.head}/${sk.eyes}/${sk.pattern}`)));
  page.append(h('h2', null, '皮肤 18'), grid);
  const skins: AtlasColor[] = SKINS.map((sk) => ({ key: `skin-${sk.id}`, base: hex2rgb(sk.base), accent: hex2rgb(sk.accent), pattern: sk.pattern, blush: true, skin: sk }));
  const personas: AtlasColor[] = [];
  const cols = Object.keys(AI_NAMES.palette);
  ['forager', 'hunter', 'coiler', 'scavenger', 'skittish', 'daredevil'].forEach((p, i) => { const base = aiBodyColor(cols[i % cols.length], p); personas.push({ key: `${cols[i % cols.length]}-${p}`, base, accent: mix(base, [255, 255, 255], 0.35), pattern: p }); });
  personas.push({ key: 'king', base: [246, 196, 58], accent: [255, 120, 60], pattern: 'king' }, { key: 'patrol', base: [127, 147, 181], accent: [200, 215, 240], pattern: 'patrol' });
  for (const [title, list, trail] of [['图集 A：皮肤 1–9', skins.slice(0, 9), 'meteor'], ['图集 B：皮肤 10–18', skins.slice(9), 'cloud'], ['图集 C：人格 + 物件', personas, 'lightning']] as [string, AtlasColor[], string][]) {
    const A = buildAtlas(list, 'saturn', { trail });
    const used = Math.ceil(A.count / 16) * 128;
    const cv = h('canvas', { class: 'sb-style__atlas', width: 2048, height: used }) as HTMLCanvasElement;
    const c = cv.getContext('2d')!; c.fillStyle = '#2a2f3f'; c.fillRect(0, 0, 2048, used); c.drawImage(A.canvas, 0, 0, 2048, used, 0, 0, 2048, used);
    page.append(h('h2', null, `${title}（${A.count} 格）`), cv);
  }
  root.append(page);
}
