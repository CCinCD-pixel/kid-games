import { h } from '@kit/ui';
const INK = '#4b3f58',
  GOLD = '#f2b740',
  TEAL = '#148a7a',
  BLUE = '#8594d6',
  PAPER = '#fffaf0';
const person = (x: number, y: number, color = TEAL) =>
  `<g transform="translate(${x} ${y})"><circle cy="-34" r="13" fill="#e8b990"/><path d="M-15-15Q0-23 15-15L18 24H-18Z" fill="${color}"/><path d="M-9 25-16 50M9 25 16 50M-16-10-32 8M16-10 34 0"/></g>`;
const rabbit = `<path d="M73 77Q38 19 56 16Q71 10 84 63Q85 5 101 15Q115 25 96 77" fill="${PAPER}"/><ellipse cx="91" cy="105" rx="45" ry="37" fill="${PAPER}"/><circle cx="115" cy="98" r="4" fill="${INK}"/><path d="m128 108 7 4-8 4M78 138l-20 9M111 138l18 9"/>`;
const horse = `<path d="M39 82h61l9-40 30 8-5 31-20 5-3 45H46Z" fill="#c99a69"/><path d="m111 43-4-16 18 18M48 99 30 87l-12 13M53 128v27m46-27v27"/><circle cx="127" cy="60" r="3" fill="${INK}"/>`;
function drawing(id: string): string {
  switch (id) {
    case 'ditu':
      return `<path d="m24 44 42-15 48 16 41-15v105l-41 15-48-16-42 16Z" fill="${PAPER}"/><path d="M66 29v105m48-89v105M39 112l12-25 21 9 17-31 33 19 17-25" stroke="${TEAL}" stroke-dasharray="5 7"/><circle cx="137" cy="58" r="8" fill="${GOLD}"/>`;
    case 'bi':
      return `<g transform="rotate(35 90 90)"><path d="M78 30h24v105l-12 25-12-25Z" fill="${GOLD}"/><path d="M78 132h24M90 136v16M78 48h24"/></g>`;
    case 'mo':
      return `<rect x="33" y="67" width="73" height="84" rx="12" fill="${INK}"/><rect x="45" y="48" width="49" height="20" rx="4" fill="${TEAL}"/><rect x="46" y="88" width="47" height="37" rx="3" fill="${PAPER}"/><path d="M56 100h27m-27 12h27M126 37l14 4-12 85-15-3Z" fill="#c99a69"/><path d="m113 123 15 3-15 34-6-12Z" fill="${INK}"/>`;
    case 'laba':
      return `<path d="m29 84 93-34v81L29 99Z" fill="${GOLD}"/><path d="M122 50q28 7 28 41t-28 40" fill="#df9a1c"/><path d="M51 104v35h20v-27" fill="${TEAL}"/><path d="M156 61l10-9m-7 39h14m-17 30 10 10"/>`;
    case 'pipa':
      return `<path d="M82 28h16l-1 62q37 18 34 48-2 32-40 32-40 0-40-32 0-30 32-48Z" fill="#c99a69"/><path d="M88 28v113m7-113v113M78 47h24m-25 9h25M76 66h27m-32 68h40"/><circle cx="92" cy="118" r="8" fill="${INK}"/>`;
    case 'labi':
      return [GOLD, TEAL, BLUE, '#e4513d']
        .map(
          (c, i) =>
            `<g transform="translate(${35 + i * 30} 25)"><path d="m0 25 4-12h12l4 12v110H0Z" fill="${c}"/><path d="M0 36h20m-20 80h20"/></g>`,
        )
        .join('');
    case 'mabu':
      return `<path d="M18 130h145" stroke="#b0956a" stroke-width="9"/><path d="m47 101 63-9 27 28-79 15-22-13Z" fill="${BLUE}"/><path d="m45 115 72-9m-58 19 71-10" stroke="${PAPER}"/><path d="m81 39 17-10 25 42-8 24-29-1-15-17 7-12 19 15-10-24Z" fill="#e8b990"/><path d="m25 93 14-4m-10 16 14-2m96-20 13-4" stroke="${TEAL}"/>`;
    case 'bu':
      return `<path d="m32 49 91-14 30 96-102 20-25-77Z" fill="${TEAL}"/><path d="m45 64 82-11M48 83l84-11M53 101l85-12M59 119l84-11" stroke="${PAPER}"/><path d="M34 143h110"/>`;
    case 'nitu':
      return `<path d="M25 124q18-39 40-31 26-51 49 1 28-10 42 30v19H25Z" fill="#b0956a"/><path d="m87 91 4-47m0 16q-33 1-32-22 29-5 32 22m1-7q30 0 31-25-27-3-31 25" fill="${TEAL}"/>`;
    case 'muma':
      return horse + `<path d="M24 149q66 36 132-3" stroke-width="10" stroke="#b9780f"/>`;
    case 'ma':
      return horse;
    case 'pubu':
      return `<path d="M16 39h52v45l-14 16-6 46H16Zm148 0h-52v45l14 16 6 46h32Z" fill="#b0956a"/><path d="M67 34h46l5 105H62Z" fill="#b7dbea"/><path d="M77 49v71m14-74v93m12-93v78" stroke="${PAPER}"/><ellipse cx="89" cy="145" rx="65" ry="14" fill="#b7dbea"/>`;
    case 'futi':
      return `<path d="m24 130 101-91h34v22h-24l-97 91H24Z" fill="${BLUE}"/><path d="m18 109 102-92h45M27 151v-36m123-50V27M43 128h22v-21h23V86h23V65"/>`;
    case 'lv':
      return (
        horse.replace('#c99a69', '#988ca5') +
        `<path d="m108 45-6-26 12-3 11 28m2 3 7-27 12 5-10 24" fill="#988ca5"/>`
      );
    case 'nose':
      return `<path d="M83 40q1 47-15 68-15 28 4 28 12-18 22 0 32 6 28-21-27-36-25-75" fill="#e8b990"/><path d="M71 132q20 14 46-1"/>`;
    case 'po':
      return `<circle cx="91" cy="62" r="34" fill="#e8b990"/><path d="M59 49q30-55 64 0m-65 7h29v17H58Zm34 0h29v17H92ZM73 109q20-14 40 0l20 46H49Z" fill="${BLUE}"/><path d="M87 64h5m-15 22q15 9 28 0"/>`;
    case 'nv':
      return person(91, 91, BLUE) + `<path d="m76 57-13 22m38-22 14 22"/>`;
    case 'tu':
      return rabbit;
    case 'li':
      return `<path d="M83 32h16v30q2 17 21 31 41 41 12 62-37 24-74 1-26-20 8-59 18-20 17-35Z" fill="${GOLD}"/><path d="M96 48q35 2 36-25-31-7-36 25" fill="${TEAL}"/>`;
    case 'eight-pears':
      return Array.from(
        { length: 8 },
        (_, i) =>
          `<g transform="translate(${22 + (i % 4) * 37} ${36 + Math.floor(i / 4) * 67})"><path d="M7 3h9v16q28 23 10 35Q-1 63-7 40q1-15 14-21Z" fill="${GOLD}"/></g>`,
      ).join('');
    case 'mi':
      return (
        `<path d="M27 104h125q-5 51-62 51-57 0-63-51Z" fill="${BLUE}"/>` +
        Array.from(
          { length: 13 },
          (_, i) =>
            `<ellipse cx="${43 + (i % 5) * 24}" cy="${99 - Math.floor(i / 5) * 13}" rx="13" ry="7" fill="${PAPER}" transform="rotate(${i % 2 ? 20 : -20} ${43 + (i % 5) * 24} ${99 - Math.floor(i / 5) * 13})"/>`,
        ).join('')
      );
    case 'baba':
      return person(90, 90, TEAL) + `<path d="M78 49q12-16 25 0" stroke-width="9"/>`;
    case 'mama':
      return person(90, 90, BLUE) + `<path d="M74 53q-2-24 16-24 24 2 19 40" stroke-width="9"/>`;
    case 'didi':
      return `<g transform="translate(20 25) scale(.8)">${person(90, 90, GOLD)}</g>`;
    case 'ba-target':
      return `<circle cx="90" cy="81" r="58" fill="${PAPER}"/><circle cx="90" cy="81" r="38" fill="${BLUE}"/><circle cx="90" cy="81" r="17" fill="${GOLD}"/><path d="M90 139v24m0-80 57-53m-6 3 6-3-2 9"/>`;
    case 'ti':
      return (
        person(65, 84) +
        `<circle cx="140" cy="133" r="21" fill="${PAPER}"/><path d="M73 109 118 128m-36-18-9 38m47-43 18 8-7 17m27-4-9 15"/>`
      );
    case 'pu':
      return `<path d="M134 28h35v124h-35m35-102h-22m22 25h-22m22 50h-22" stroke="#b0956a"/><circle cx="104" cy="67" r="13" fill="#e8b990"/><path d="m57 82 20-17 23 22-13 20Z" fill="${TEAL}"/><path d="m62 85-24-17-16 4m46 27-21 17-24-4m67-29 27 15 17 1m-46-3 25 17 22-7"/><circle cx="149" cy="103" r="16" fill="${GOLD}"/><path d="m144 95 9-1 5 8-6 8-9-4Zm-113-50 19 3m-31 10 17 2M19 151h131"/>`;
    case 'la':
      return `<circle cx="48" cy="48" r="13" fill="#e8b990"/><circle cx="132" cy="48" r="13" fill="#e8b990"/><path d="m31 74 26-8 11 44-30 1Z" fill="${TEAL}"/><path d="m123 66 25 8-7 37-30-1Z" fill="${BLUE}"/><path d="m57 76 30 15 7-1 29-14M38 110l-17 44m35-44 19 38m36-38-18 38m36-38 25 44"/><path d="m82 88 8 7 10-7" stroke-width="7"/>`;
    case 'ba':
      return `<circle cx="48" cy="44" r="12" fill="#e8b990"/><path d="m31 69 25-7 20 35-28 12Z" fill="${TEAL}"/><path d="m56 76 33 20 9 18m-50-7-23 40m39-42 20 41M20 157h140"/><path d="m98 114 26 8-28 33Z" fill="${GOLD}"/><path d="m103 118-2-23m2 17 15-21m-16 21-14-17" stroke="${TEAL}"/><path d="m138 81 12-8m-6 23 14-1"/>`;
    case 'pa':
      return (
        `<path d="M45 30v133m69-133v133M45 46h69m-69 26h69m-69 26h69m-69 26h69m-69 26h69" stroke="#b0956a" stroke-width="8"/>` +
        `<g transform="translate(42 -3) scale(.8)">${person(90, 90)}</g>`
      );
    case 'mo-action':
      return `<circle cx="49" cy="49" r="14" fill="#e8b990"/><path d="M35 45h27v11H35Z" fill="${BLUE}"/><path d="m32 78 29-7 5 39H34Z" fill="${TEAL}"/><path d="m60 80 32 5 25 2m-81 24-9 43m34-43 11 43"/><g transform="translate(40 8) scale(.9)">${person(104, 84, GOLD)}</g><path d="m112 84 8-4m-8 7 8 1" stroke-width="5"/>`;
    case 'milu':
      return `<path d="m24 163 40-43 25 8 54-77M65 120l-29-36m52 43 46 33M142 51l-20-11m20 11 12-16" stroke="#b0956a" stroke-width="12"/><g transform="translate(0 22) scale(.72)">${person(100, 84, GOLD)}</g><path d="M89 21q-6-14 9-16 17 0 12 13-9 5-9 12m0 10v1" stroke="${TEAL}"/>`;
    case 'lu':
      return `<path d="m26 165 54-144h26l49 144Z" fill="#a5a3a4"/><path d="M92 37v20m0 18v22m0 19v27" stroke="${PAPER}" stroke-width="7"/><path d="M18 165h144M67 40l-17 6m74 9 17 6" stroke="${TEAL}"/>`;
    case 'lifa':
      return `<circle cx="91" cy="68" r="29" fill="#e8b990"/><path d="M60 64q2-43 38-31 28 4 23 34" stroke-width="12"/><path d="M54 105h75l18 54H36Z" fill="${PAPER}"/><circle cx="32" cy="51" r="9"/><circle cx="35" cy="76" r="9"/><path d="m39 56 35 28M42 72l32-32m51 0 26 4m-27 5 26 4m-27 5 26 4"/><path d="m124 35 27 4v31" stroke="${TEAL}"/>`;
    case 'dabo':
      return person(90, 90, BLUE) + `<path d="M75 43q16-14 30 1m-29 2h30M77 79q13 9 25-1"/>`;
    case 'didi-milu':
      return drawing('milu');
    case 'dabo-papati':
      return drawing('pa');
    case 'rabbit-carrot':
      return `<g transform="translate(-12 -8) scale(.8)">${rabbit}</g><path d="m124 111 35 16-36 38Z" fill="${GOLD}"/><path d="m134 119 4-25m0 23 18-14" fill="${TEAL}"/>`;
    default:
      return `<path d="M31 48h117v104H31Z" fill="${PAPER}"/><path d="m43 137 30-39 20 19 17-28 27 48" fill="${TEAL}"/><circle cx="63" cy="70" r="12" fill="${GOLD}"/>`;
  }
}
export function illustration(id: string, label = ''): HTMLElement {
  const el = h('div', { class: 'illustration', role: 'img', 'aria-label': label });
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" aria-hidden="true"><g stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" fill="none">${drawing(id)}</g></svg>`;
  return el;
}
export function radio(): HTMLElement {
  const el = h('div', { class: 'radio-art', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 420 300"><path d="m267 84 40-62" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><rect x="43" y="83" width="334" height="190" rx="32" fill="#df9a1c"/><rect x="34" y="72" width="334" height="190" rx="32" fill="${GOLD}" stroke="${INK}" stroke-width="5"/><rect x="61" y="95" width="184" height="144" rx="20" fill="${PAPER}" stroke="${INK}" stroke-width="4"/>${Array.from({ length: 7 }, (_, i) => `<path d="M${81 + i * 23} 115v104" stroke="#d2b88b" stroke-width="7" stroke-linecap="round"/>`).join('')}<rect x="262" y="101" width="82" height="39" rx="8" fill="${INK}"/><path d="M272 121h63m-50-9v17m14-17v17m14-17v17" stroke="${PAPER}" stroke-width="3"/><circle cx="303" cy="185" r="28" fill="${TEAL}" stroke="${INK}" stroke-width="4"/><path d="m305 166 9 17" stroke="${PAPER}" stroke-width="6" stroke-linecap="round"/><circle cx="274" cy="236" r="5" fill="${TEAL}"/><path d="M64 273v7m278-7v7" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><g stroke="${GOLD}" stroke-width="5" fill="none" stroke-linecap="round"><path d="M34 43Q8 22 27 4m9 32Q23 23 36 13M358 36q25-16 37 4m-32 5q13-8 20 3"/></g></svg>`;
  return el;
}
