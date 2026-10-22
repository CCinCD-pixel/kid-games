// Recognizable objects for the next phonics stage; no text is needed to identify the answer.
const P = '#fffaf0',
  T = '#148a7a',
  G = '#f2b740',
  B = '#8594d6',
  I = '#4b3f58';
const head = '<circle cx="88" cy="48" r="19" fill="#e8b990"/>';
const body = head + `<path d="M63 77h50l9 48H55Z" fill="${T}"/><path d="m67 125-12 35m51-35 15 35"/>`;
const flower = `<path d="M89 90v72m0-30q-29 2-30-20 27-4 30 20m0 12q27-1 31-22-27-3-31 22" stroke="${T}"/><g fill="${G}"><ellipse cx="88" cy="53" rx="16" ry="30"/><ellipse cx="88" cy="85" rx="16" ry="30"/><ellipse cx="72" cy="69" rx="30" ry="16"/><ellipse cx="105" cy="69" rx="30" ry="16"/></g><circle cx="88" cy="69" r="14" fill="#e4513d"/>`;
const book = `<path d="M21 43q36-14 69 8 33-22 69-8v100q-37-13-69 9-33-22-69-9Z" fill="${P}"/><path d="M90 52v99M34 69l41 7m-41 17 41 7m31-24 39-7m-39 31 39-7"/>`;
export function curriculumDrawing(id: string, base: (id: string) => string): string | undefined {
  const art: Record<string, string> = {
    goose: `<ellipse cx="85" cy="123" rx="50" ry="29" fill="${P}"/><path d="M105 115V57q0-30 24-22 22 11 0 28v62" fill="${P}"/><path d="m143 46 23 10-24 7M62 152l-8 10m43-10 9 10" fill="${G}"/><circle cx="131" cy="46" r="3" fill="${I}"/>`,
    clothes: `<path d="m57 34-36 29 22 31 20-14v77h58V80l18 14 22-31-37-29-18 15H76Z" fill="${B}"/><path d="M76 35q15 29 31 0M63 131h58"/>`,
    house: `<path d="m14 80 76-59 76 59-16 15-12-9v73H42V85L29 95Z" fill="${G}"/><path d="M77 159v-47h29v47M51 88h25v23H51Z" fill="${P}"/><path d="M124 45V22h18v38" fill="${B}"/>`,
    fish: `<path d="M120 88 161 57v69l-40-27q-48 66-99-7 53-68 98-4Z" fill="${B}"/><path d="m62 43 30 8-12 19m-12 47 24 15-8 16" fill="${T}"/><circle cx="43" cy="85" r="5" fill="${I}"/><path d="M73 72q18 21-1 40"/>`,
    tower: `<path d="m87 19-44 43h88Zm-32 44v26H39v17h104V89h-16V63ZM47 107v33H28v18h124v-18h-17v-33Z" fill="${G}"/><path d="M80 158v-26h22v26M86 70v13m0 31v13"/>`,
    land: `<path d="M15 96q35-26 68-7 48-33 83 3v66H15Z" fill="#b0956a"/><path d="m17 122 148 7M36 107l7 50m54-61-8 62m48-51-8 50"/><path d="M65 77V38m0 19q-26-2-25-20 22-5 25 20m0-11q26-2 27-20-25-5-27 20" fill="${T}"/>`,
    hoof: `<path d="m56 24 8 77-18 43q17 23 62 0l-15-43 7-77" fill="#c99a69"/><path d="M48 127h58l7 21q-37 25-72-1Z" fill="${I}"/>`,
    bus: `<rect x="17" y="40" width="146" height="99" rx="17" fill="${G}"/><path d="M30 55h119v44H30Z" fill="${P}"/><path d="M58 55v44m32-44v44m30-44v80M24 114h15m103 0h14"/><circle cx="47" cy="140" r="16" fill="${I}"/><circle cx="131" cy="140" r="16" fill="${I}"/>`,
    flute: `<g transform="rotate(-35 90 90)"><rect x="20" y="78" width="140" height="24" rx="7" fill="#c99a69"/><path d="M32 78v24m112-24v24"/><g fill="${I}"><circle cx="63" cy="90" r="4"/><circle cx="82" cy="90" r="4"/><circle cx="101" cy="90" r="4"/><circle cx="121" cy="90" r="4"/></g></g>`,
    drum: `<path d="M31 67v65q58 37 118 0V67" fill="#e4513d"/><ellipse cx="90" cy="67" rx="59" ry="27" fill="${P}"/><path d="m34 80 20 57 22-45 22 57 23-57 25 40M41 25l53 29m43-36-25 38" stroke="${G}" stroke-width="7"/>`,
    cry:
      head +
      `<path d="M66 47q9-10 16-1m17-1q8-10 15-1M76 69q15-19 28 0"/><path d="m68 56-6 14q5 14 12 0Zm41 0-6 14q5 14 12 0Z" fill="#90c5e0"/><path d="M60 86h57l12 73H48Z" fill="${B}"/>`,
    river: `<path d="M69 12q85 28 14 62-83 30 32 58l23 36H29q-40-35 27-64 59-24 1-45Z" fill="#90c5e0"/><path d="m83 37 28 8M45 122l28 11m32 17 21 9" stroke="${P}"/><path d="m23 64 5-16 8 12m101 35 7-18 8 14" stroke="${T}"/>`,
    kettle: `<path d="M57 66h69l15 67q-14 27-83 10L41 96 17 78l7-14 41 32Z" fill="${B}"/><path d="M67 64q-2-61 49-42 23 9 16 52M74 55h39m-23-12v12"/><path d="M64 111h59" stroke="${P}"/>`,
    flower,
    melon: `<ellipse cx="88" cy="96" rx="65" ry="51" fill="#a3c56c"/><path d="M88 44q21-21 36-11M87 46q-31 50 0 101m-26-96q-31 48-3 88m58-87q31 43 2 87" stroke="${T}"/>`,
    pot: `<path d="M36 77h106v54q-49 39-106 0Z" fill="${B}"/><path d="M22 76h136M37 92H16v25h21m105-25h20v25h-20M42 69q43-48 93 0M80 42h21V30H80Z" fill="${P}"/>`,
    fire: `<path d="M87 17q-2 44 30 59l7-31q50 60 16 100-54 40-101-4-30-36 6-83l8 30q19-26 34-71Z" fill="#e88731"/><path d="M89 84q-7 29 19 49 10 35-29 29-40-5-17-39l9 13q8-26 18-52Z" fill="${G}"/>`,
    bittermelon: `<g transform="rotate(25 90 90)"><path d="M81 20q45 15 29 83l-24 58q-29-12-22-77Z" fill="#91bc65"/><path d="m82 41-7 12 15 9-13 14 14 12-15 13 10 14-10 13m24-81 10 10-12 12 10 12-12 13" stroke="${T}"/></g>`,
    hippo: `<ellipse cx="78" cy="105" rx="52" ry="33" fill="#a8a2bc"/><path d="M46 130v26h17v-21m28-1v22h17v-26" fill="#a8a2bc"/><ellipse cx="124" cy="100" rx="37" ry="30" fill="#a8a2bc"/><circle cx="108" cy="72" r="9" fill="#a8a2bc"/><circle cx="139" cy="74" r="9" fill="#a8a2bc"/><path d="M111 100h2m29 0h2M116 116h22"/>`,
    lotus: `<ellipse cx="91" cy="133" rx="69" ry="26" fill="${T}"/><path d="m90 134-4-41M87 95Q29 94 35 59q34 0 52 36Q50 43 88 20q34 32-1 75 22-35 57-34-5 40-57 34Z" fill="#efa4ae"/>`,
    painting: `${body}<path d="m110 83 23 12 11-25m-8 48-10 31m-3-118 42 8-8 71-42-7Z" fill="${P}"/><path d="m126 91 13-28 9 14 10-8" stroke="${B}"/><path d="m34 87 25 5 13-18"/>`,
    chicken: `<ellipse cx="84" cy="112" rx="43" ry="34" fill="${G}"/><circle cx="115" cy="65" r="24" fill="${G}"/><path d="m123 49-6-23-13 9-7-12-8 28m47 14 25 9-27 9M47 98 20 65 20 100M69 142v18m32-18v18" fill="#e4513d"/><circle cx="120" cy="61" r="4" fill="${I}"/>`,
    seven: `<path d="M50 44h83L77 150" stroke="${T}" stroke-width="15"/>`,
    flag: `<path d="M43 21v139" stroke-width="7"/><path d="M47 25q35-16 83 9v66q-42-22-83-8Z" fill="#e4513d"/><path d="m69 42 5 10 12 2-9 9 2 12-10-6-11 6 2-12-9-9 13-2Z" fill="${G}"/>`,
    chess: `<path d="M24 30h131v126H24Z" fill="#d8ba8b"/><path d="M45 31v124m23-124v124m22-124v124m22-124v124m22-124v124M24 51h131M24 74h131M24 97h131M24 121h131"/><g fill="${P}"><circle cx="45" cy="51" r="11"/><circle cx="90" cy="97" r="11"/></g><g fill="${I}"><circle cx="68" cy="74" r="11"/><circle cx="112" cy="121" r="11"/></g>`,
    shrimp: `<path d="M140 64q-42-44-88-11-56 58 36 96l34-15-15-13q-47-10-33-43 18-18 47 4Z" fill="#eeaa93"/><path d="m133 67 26-28m-30 28 21-48M47 64l30 12M40 89l31 8m-17 20 22-13m4 23 8-15m-4 22 16-4m-43-4-15 18m29-11-4 23"/><circle cx="123" cy="60" r="4" fill="${I}"/>`,
    washing: `<path d="M22 94h139l-16 61H39Z" fill="${B}"/><path d="M53 53h70l8 58-34 15-45-12Z" fill="${P}"/><path d="m32 26 24 11 21 42m64-53-25 12-17 40" stroke="#e8b990" stroke-width="15"/><path d="M52 103q35-16 79 4" stroke="${T}"/>`,
    blocks: `<path d="M24 108h44v44H24Z" fill="${G}"/><path d="M75 107h44v44H75Z" fill="${B}"/><path d="M50 59h44v43H50Z" fill="#e4513d"/><path d="m116 100 25-39 23 39Z" fill="${T}"/><path d="M120 107h44v44h-44Z" fill="${G}"/>`,
    character: `<rect x="26" y="25" width="128" height="130" fill="${P}"/><path d="M26 90h128M90 25v130" stroke-dasharray="6 8" stroke="#b0956a"/><path d="M90 35v6M51 57V45h78v12M66 67h50L87 84h9v41q0 14-20 7M55 99h71" stroke="${I}" stroke-width="7"/>`,
    chrysanthemum:
      `<path d="M90 101v61m0-24q-32 0-33-23 27-1 33 23m0 10q30-1 34-24-27-3-34 24" stroke="${T}"/>` +
      Array.from(
        { length: 12 },
        (_, n) => `<ellipse cx="90" cy="46" rx="9" ry="28" transform="rotate(${n * 30} 90 70)" fill="${G}"/>`,
      ).join('') +
      `<circle cx="90" cy="70" r="13" fill="#b97938"/>`,
    four: `<path d="M114 24 49 105h91m-20-82v135" stroke="${T}" stroke-width="15"/>`,
    silk: `<path d="M40 37h99v105H40Z" fill="${B}"/><path d="M28 38h122M28 141h122" stroke="#c99a69" stroke-width="11"/><path d="m52 48 74 82M51 77l44 50m12-79 20 23M54 50v82m20-82v82m20-82v82m20-82v82" stroke="${P}" stroke-width="2"/>`,
    purple: `<path d="M31 29h118v125H31Z" fill="#9456b0"/><path d="m49 62 22-22 29 30-25 28Zm34 45 21-21 24 24-22 22Z" fill="#c9a3d7"/>`,
    sitting: `${head}<path d="M70 77h39v40h28v18H90l-13-24" fill="${T}"/><path d="M104 134v26m35-28 9 28M53 78v54h34m-34-15H35v43m35-27v27"/>`,
    pigeon: `<ellipse cx="85" cy="114" rx="43" ry="29" fill="#aab5c3"/><circle cx="110" cy="68" r="21" fill="#aab5c3"/><path d="m126 65 26 9-26 7M45 110l-26 25 36-4m20 12-5 18m29-18 4 18" fill="${G}"/><path d="M62 101q38-12 38 26"/><circle cx="116" cy="63" r="3" fill="${I}"/>`,
    socks: `<path d="M38 25h39v77l21 25q3 30-29 30l-39-30 8-25Z" fill="${B}"/><path d="M104 25h39v78l21 25q3 30-29 30l-39-30 8-25Z" fill="${G}"/><path d="M38 46h39m27 0h39M36 106l34 12m32-12 34 12"/>`,
    book,
    tree: `<path d="M79 113h22v49H79Z" fill="#c99a69"/><path d="M89 18Q39 20 44 53 8 62 31 93 15 124 64 134q29 19 52-2 51 5 36-32 29-33-11-49 1-39-52-33Z" fill="${T}"/>`,
    sun: `<circle cx="90" cy="90" r="36" fill="${G}"/><path d="M90 15v22m0 106v22M15 90h22m106 0h22M36 36l16 16m76 76 16 16M36 144l16-16m76-76 16-16" stroke="${G}" stroke-width="8"/>`,
    bamboo: `<path d="M64 24v137m48-137v137M55 49h18m-18 37h18m-18 38h18m29-57h18m-18 38h18m-18 38h18" stroke="${T}" stroke-width="9"/><path d="M62 65Q22 62 21 38q30 3 41 27m50 19q37-4 44-33-32 4-44 33M63 118q-32-4-41-24 31-4 41 24" fill="${T}"/>`,
    tea: `<path d="M37 78h90v48q-38 41-90 0Z" fill="${P}"/><path d="M127 85q47-3 22 41h-20M28 149h118M59 23q-20 23 0 38m27-42q-20 23 0 38m27-37q-20 23 0 38" stroke="${T}"/><ellipse cx="82" cy="79" rx="45" ry="10" fill="#a3c56c"/>`,
    table: `<path d="m26 64 121-11 20 27-133 15-21-19Z" fill="#c99a69"/><path d="M33 94v66m109-76v76M56 91v51m104-61v51" stroke-width="9"/>`,
    ruler: `<g transform="rotate(-25 90 90)"><rect x="14" y="67" width="151" height="43" rx="4" fill="${G}"/><path d="M30 68v20m15-20v13m15-13v20m15-20v13m15-13v20m15-20v13m15-13v20m15-20v13m15-13v20"/></g>`,
    lion: `<path d="M42 83q-4-61 49-61 54-2 50 61 31 53-20 65-29 29-61 2-44-1-28-45Z" fill="#b97938"/><ellipse cx="90" cy="88" rx="38" ry="44" fill="${G}"/><path d="m77 99 13 8 13-8M90 108v15m-14-5q14 19 28 0"/><circle cx="75" cy="79" r="4" fill="${I}"/><circle cx="106" cy="79" r="4" fill="${I}"/>`,
  };
  if (art[id]) return art[id];
  const composites: Record<string, () => string> = {
    drumming: () =>
      `<g transform="translate(-30 0) scale(.8)">${body}</g><g transform="translate(52 57) scale(.65)">${art.drum}</g><path d="m57 72 36 34m-21-35 42 25"/>`,
    riding: () =>
      `<g transform="translate(8 30) scale(.8)">${base('ma')}</g><g transform="translate(20 -10) scale(.7)">${body}</g>`,
    driver: () =>
      `${head}<path d="M56 31h63L99 13H76Z" fill="${B}"/><path d="M50 83h79l15 73H34Z" fill="${T}"/><circle cx="91" cy="123" r="29"/><path d="M62 123h58m-29-28v55"/>`,
    eating: () =>
      `${head}<path d="M53 85h72l15 75H38Z" fill="${B}"/><path d="m114 92-9-30m-36 34 19-35"/><path d="M63 118h56q-2 36-29 35-24 0-27-35Z" fill="${P}"/>`,
    brushing: () =>
      `${head}<path d="M48 86h80l14 72H34Z" fill="${T}"/><path d="m112 89 13-25-30-6m-16 0h24" stroke="${G}" stroke-width="9"/><path d="M79 54v10m7-10v10m7-10v10" stroke="${P}"/>`,
    reading: () =>
      `<g transform="translate(0 -3)">${head}</g><path d="M50 85h78v72H50Z" fill="${B}"/><g transform="translate(8 52) scale(.9 .65)">${book}</g>`,
    sunrise: () =>
      `<path d="M22 134a68 68 0 0 1 136 0" fill="${G}"/><path d="M12 136h156M89 24v23M25 54l19 19m95-19-19 19" stroke="${G}" stroke-width="7"/><path d="M16 153h148m-125 13h105" stroke="#90c5e0"/>`,
    drinking: () =>
      `${body}<path d="m110 85 19-14-9-11m-31-7h25v26H89Z" fill="${P}"/><path d="M114 58q19-3 9 15h-9"/>`,
  };
  return composites[id]?.();
}
