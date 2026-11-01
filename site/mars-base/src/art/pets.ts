import type { PetLine } from '@kit/economy';

const ink = 'stroke="var(--mb-cut)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const fills: Record<string, string> = {
  'paint.rover.copper': '#db8353', 'paint.rover.jade': '#73cbb7',
  'paint.dragon.amber': '#efb25d', 'paint.dragon.silver': '#c8d8e7',
};

/** Six-part silhouettes with a shared paper edge. Only the HTML wrapper moves at rest. */
export function petSvg(line: PetLine, stage: 1 | 2 | 3, mood = 'calm', paint?: string | null): string {
  const primary = fills[paint ?? ''] ?? (line === 'rover' ? '#8fb7c7' : '#e9ab77');
  const eye = mood === 'sleepy' ? '<path d="M70 82 q7 6 14 0 M106 82 q7 6 14 0" fill="none" stroke="var(--mb-cut)" stroke-width="3"/>'
    : '<ellipse cx="77" cy="80" rx="5" ry="8" fill="var(--mb-cut)"/><ellipse cx="113" cy="80" rx="5" ry="8" fill="var(--mb-cut)"/><circle cx="79" cy="77" r="2" fill="white"/><circle cx="115" cy="77" r="2" fill="white"/>';
  if (line === 'rover') {
    return `<svg viewBox="0 0 190 180" role="img" aria-label="探路者，第${stage}阶段">
      <ellipse cx="95" cy="164" rx="62" ry="9" fill="var(--mb-shadow)"/>
      <path d="M61 133 Q44 133 40 146 L57 151 Q65 147 69 139 M129 139 Q136 147 145 151 L160 146 Q155 132 136 133" fill="${primary}" ${ink}/>
      <path d="M58 112 Q54 88 70 77 L120 77 Q136 88 132 112 L121 150 Q95 161 69 150Z" fill="${primary}" ${ink}/>
      <path d="M71 119 Q95 131 119 119 L114 142 Q95 150 76 142Z" fill="var(--mb-paper)" ${ink}/>
      <path d="M51 68 Q49 36 78 31 L112 31 Q141 36 139 68 L134 100 Q95 115 56 100Z" fill="${primary}" ${ink}/>
      <path d="M57 67 Q95 54 133 67 L130 92 Q95 102 60 92Z" fill="var(--mb-paper)" ${ink}/>
      <path d="M50 54 L34 47 L36 78 L55 78 M140 54 L156 47 L154 78 L135 78" fill="var(--mb-steel)" ${ink}/>
      <path d="M95 31 V17" fill="none" ${ink}/><circle cx="95" cy="14" r="6" fill="var(--mb-led)" ${ink}/>
      ${eye}<path d="M88 93 Q95 ${mood === 'happy' ? 105 : 99} 102 93" fill="none" stroke="var(--mb-cut)" stroke-width="2"/>
      ${stage >= 2 ? '<path d="M54 117 l-15 8 12 12 M136 117 l15 8-12 12" fill="var(--mb-gold)" stroke="var(--mb-cut)" stroke-width="3"/>' : ''}
      ${stage >= 3 ? '<path d="M72 38 L55 20 L79 28 M118 38 l17-18-24 8" fill="var(--mb-gold)" stroke="var(--mb-cut)" stroke-width="3"/><path d="M83 133 h24" stroke="var(--mb-jade)" stroke-width="5"/>' : ''}
    </svg>`;
  }
  return `<svg viewBox="0 0 190 180" role="img" aria-label="晶脊龙，第${stage}阶段">
    <ellipse cx="95" cy="164" rx="65" ry="9" fill="var(--mb-shadow)"/>
    <path d="M130 126 Q160 116 168 91 Q175 123 155 144 Q143 151 126 143" fill="${primary}" ${ink}/>
    <path d="M62 107 Q52 90 44 77 L43 114 Q47 135 66 140 M128 107 Q138 90 146 77 L147 114 Q143 135 124 140" fill="var(--mb-jade)" ${ink}/>
    <path d="M55 120 Q58 83 96 78 Q134 83 137 120 Q135 155 95 157 Q55 155 55 120Z" fill="${primary}" ${ink}/>
    <path d="M68 123 Q95 136 122 123 L116 147 Q95 155 74 147Z" fill="var(--mb-paper)" ${ink}/>
    <path d="M48 71 Q45 37 73 28 Q96 19 120 28 Q145 38 142 71 Q142 107 95 110 Q48 107 48 71Z" fill="${primary}" ${ink}/>
    <path d="M56 50 L48 17 L75 31 M134 50 L142 17 L115 31" fill="var(--mb-gold)" ${ink}/>
    <path d="M85 25 l10-18 10 18" fill="var(--mb-jade)" ${ink}/>
    ${eye}<path d="M88 96 Q95 ${mood === 'happy' ? 106 : 100} 102 96" fill="none" stroke="var(--mb-cut)" stroke-width="2"/>
    ${stage >= 2 ? '<path d="M67 23 l-7-18 20 16 M123 23 l7-18-20 16" fill="var(--mb-jade)" stroke="var(--mb-cut)" stroke-width="3"/>' : ''}
    ${stage >= 3 ? '<path d="M95 7 l8-7 6 24 M105 25 l13-17 5 25 M79 25 L67 9 64 32" fill="var(--mb-gem)" stroke="var(--mb-cut)" stroke-width="3"/>' : ''}
  </svg>`;
}

const art: Record<string, string> = {
  'back.dusk': '<circle cx="48" cy="23" r="11" fill="var(--mb-sun)"/><path d="M5 51 L22 30 L37 41 L53 27 L69 49Z" fill="var(--mb-far)"/>',
  'ground.steel': '<path d="M5 20 H69 M5 39 H69 M22 2 V58 M49 2 V58" fill="none" stroke="var(--mb-steel)" stroke-width="6"/>',
  'floor.nest': '<ellipse cx="36" cy="43" rx="30" ry="15" fill="var(--mb-dust)"/><path d="M11 40 Q36 20 61 40" fill="none" stroke="var(--mb-paper)" stroke-width="7"/>',
  'floor.crate': '<path d="M12 22 H60 V57 H12Z" fill="var(--mb-dust)"/><path d="M12 22 L60 57 M60 22 L12 57" fill="none" stroke="var(--mb-paper)" stroke-width="4"/>',
  'wall.poster': '<path d="M13 5 H59 V59 H13Z" fill="var(--mb-paper)"/><path d="M36 14 Q51 30 36 47 Q21 30 36 14Z" fill="var(--mb-mars)"/><circle cx="36" cy="28" r="5" fill="var(--mb-glow)"/>',
  'ceil.lamp': '<path d="M36 3 V25 M17 25 H55 L47 47 H25Z" fill="var(--mb-gold)"/><ellipse cx="36" cy="53" rx="15" ry="5" fill="var(--mb-glow)"/>',
  'wall.starmap': '<path d="M7 8 H65 V56 H7Z" fill="var(--mb-dark)"/><path d="M16 40 L29 23 L43 34 L56 17" fill="none" stroke="var(--mb-glow)" stroke-width="2"/><circle cx="29" cy="23" r="3" fill="var(--mb-glow)"/><circle cx="56" cy="17" r="3" fill="var(--mb-glow)"/>',
  'floor.beacon': '<path d="M25 53 L30 17 H42 L47 53Z" fill="var(--mb-steel)"/><circle cx="36" cy="17" r="8" fill="var(--mb-led)"/><path d="M15 53 H57" stroke="var(--mb-cut)" stroke-width="4"/>',
  'ceil.comet': '<path d="M8 13 Q26 17 39 39" fill="none" stroke="var(--mb-jade)" stroke-width="8"/><path d="M43 33 l9 7-9 7-8-7z" fill="var(--mb-gold)"/>',
  'feature.telescope': '<path d="M24 46 L49 17 L59 26 L35 53Z" fill="var(--mb-steel)"/><circle cx="54" cy="22" r="8" fill="var(--mb-jade)"/><path d="M36 43 V57 M24 57 H48" stroke="var(--mb-cut)" stroke-width="4"/>',
  'back.stars': '<path d="M5 5 H67 V59 H5Z" fill="var(--mb-dark)"/><circle cx="14" cy="15" r="2" fill="var(--mb-glow)"/><circle cx="45" cy="23" r="3" fill="var(--mb-glow)"/><path d="M26 35 l4-8 4 8 8 4-8 4-4 8-4-8-8-4z" fill="var(--mb-paper)"/>',
  'ground.deck': '<path d="M4 18 H68 V58 H4Z" fill="var(--mb-steel)"/><path d="M4 31 H68 M4 45 H68 M20 18 V58 M51 18 V58" stroke="var(--mb-cut)" stroke-width="2"/>',
  'wall.crystallamp': '<path d="M16 18 H56 V49 H16Z" fill="var(--mb-paper)"/><path d="M36 10 l16 23-16 25-16-25z" fill="var(--mb-gem)"/>',
  'floor.crystals': '<path d="M8 57 L22 22 L30 57 M27 57 L42 12 L56 57 M48 57 L59 31 L68 57" fill="var(--mb-gem)"/>',
  'ceil.stalactite': '<path d="M7 7 H65 L53 44 L43 24 L31 59 L19 31Z" fill="var(--mb-jade)"/>',
  'feature.crystalL': '<path d="M5 56 L23 18 L33 56 M25 56 L45 5 L64 56Z" fill="var(--mb-gem)"/><path d="M45 5 V56" stroke="var(--mb-paper)" stroke-width="2"/>',
  'back.cave': '<path d="M4 58 V7 H68 V58 L56 40 L45 49 L31 30 L18 52Z" fill="var(--mb-dark)"/><path d="M26 34 L35 17 L43 33" fill="var(--mb-gem)"/>',
  'ground.crystal': '<path d="M4 24 H68 V58 H4Z" fill="var(--mb-steel)"/><path d="M5 50 L21 29 L36 42 L53 25 L67 38" fill="none" stroke="var(--mb-gem)" stroke-width="4"/>',
  'wall.tools': '<path d="M7 9 H65 V58 H7Z" fill="var(--mb-dust)"/><path d="M21 18 V48 M21 24 l-7-6 M21 24 l7-6 M48 18 V48 M41 43 H55" stroke="var(--mb-cut)" stroke-width="5"/>',
  'floor.gear': '<circle cx="36" cy="36" r="25" fill="var(--mb-steel)" stroke="var(--mb-cut)" stroke-width="5" stroke-dasharray="6 5"/><circle cx="36" cy="36" r="9" fill="var(--mb-paper)"/>',
  'ceil.gearmobile': '<path d="M36 4 V24 M14 24 H58 M22 24 V35 M50 24 V35" fill="none" stroke="var(--mb-cut)" stroke-width="3"/><circle cx="22" cy="45" r="10" fill="var(--mb-gold)"/><circle cx="50" cy="45" r="10" fill="var(--mb-steel)"/>',
  'feature.arm': '<path d="M8 56 H34 V47 H22 V36 L37 25 L50 36 L61 19" fill="none" stroke="var(--mb-steel)" stroke-width="11"/><path d="M54 18 L66 12 M61 19 L67 29" stroke="var(--mb-cut)" stroke-width="4"/>',
  'back.workshop': '<path d="M5 7 H67 V57 H5Z" fill="var(--mb-dust)"/><path d="M10 35 H62 M22 12 V31 M37 12 V31 M52 12 V31" stroke="var(--mb-cut)" stroke-width="4"/><circle cx="22" cy="46" r="5" fill="var(--mb-gold)"/>',
  'ground.belt': '<path d="M5 23 H67 V55 H5Z" fill="var(--mb-steel)"/><circle cx="18" cy="40" r="8" fill="var(--mb-dark)"/><circle cx="54" cy="40" r="8" fill="var(--mb-dark)"/><path d="M18 31 H54 M18 49 H54" stroke="var(--mb-gold)" stroke-width="4"/>',
};

export function decorSvg(id: string): string {
  return `<svg viewBox="0 0 72 64" aria-hidden="true"><g stroke="var(--mb-cut)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${art[id] ?? '<circle cx="36" cy="32" r="22" fill="var(--mb-jade)"/>'}</g></svg>`;
}
