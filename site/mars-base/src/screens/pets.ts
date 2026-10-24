import catalog from '../../../../content/star-pets/economy.json';
import { decor, foods, type PetLine } from '@kit/economy';
import { confetti, icon } from '@kit/ui';
import { decorSvg, petSvg } from '../art/pets';
import { decorUnlocked } from '../pets/unlock';
import { lineText } from '../voice/lines';
import type { App } from './app';

type Decor = (typeof decor)[number];
type Kind = Decor['kind'];
type Tab = 'food' | 'room' | 'wear' | 'paint' | 'light' | 'festival';
interface Slot { id: string; kind: Kind; x: number; y: number }
const SLOTS: Slot[] = [
  { id: 'back0', kind: 'back', x: 50, y: 20 }, { id: 'ground0', kind: 'ground', x: 50, y: 88 },
  { id: 'ceil0', kind: 'ceil', x: 20, y: 12 }, { id: 'ceil1', kind: 'ceil', x: 80, y: 12 },
  { id: 'wall0', kind: 'wall', x: 16, y: 34 }, { id: 'wall1', kind: 'wall', x: 38, y: 31 }, { id: 'wall2', kind: 'wall', x: 62, y: 31 }, { id: 'wall3', kind: 'wall', x: 84, y: 34 },
  { id: 'floor0', kind: 'floor', x: 12, y: 70 }, { id: 'floor1', kind: 'floor', x: 30, y: 68 }, { id: 'floor2', kind: 'floor', x: 50, y: 72 }, { id: 'floor3', kind: 'floor', x: 70, y: 68 }, { id: 'floor4', kind: 'floor', x: 88, y: 70 },
  { id: 'feature0', kind: 'feature', x: 30, y: 51 }, { id: 'feature1', kind: 'feature', x: 70, y: 51 },
];
const KIND_NAMES: Record<Kind, string> = { back: '窗外', ground: '地面', ceil: '吊饰', wall: '墙面', floor: '摆件', feature: '主摆件' };
const TABS: [Tab, string][] = [['food', '食物'], ['room', '房间'], ['wear', '服装'], ['paint', '涂装'], ['light', '灯光'], ['festival', '庆典']];
const NAMES: Record<PetLine, string[]> = { rover: ['小探', '阿轮', '星星', '咚咚', '小齿', '阿航', '滚滚', '小火星'], dragon: ['小晶', '火火', '阿脊', '亮亮', '晶晶', '小翼', '阿闪', '星芽'] };
const safe = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const slotKey = (slot: Slot): string => `slot:hab:${slot.id}`;
const itemById = (id: string): Decor | undefined => decor.find((it) => it.id === id);
const itemName = (id: string): string => itemById(id)?.name ?? [...catalog.paints, ...catalog.lights, catalog.hat].find((it) => it.id === id)?.name ?? id;
const stageOf = (growth: number): 1 | 2 | 3 => growth >= 250 ? 3 : growth >= 60 ? 2 : 1;

export function showPets(app: App): void {
  const eco = app.economy;
  for (const item of decor.filter((d) => d.price === 0)) eco.grant('free', `item:${item.id}`);
  if (!eco.seen('room:initialized') && eco.setPets({ 'slot:hab:back0': 'back.dusk', 'slot:hab:ground0': 'ground.steel', 'slot:hab:floor2': 'floor.nest' })) eco.markSeen('room:initialized');
  const root = document.createElement('div'); root.className = 'mb-pets';
  app.screen(root, 'day');
  let tab: Tab = 'food'; let kind: Kind = 'floor'; let decorating = false;
  let selectedSlot: Slot | null = null; let selectedItem: string | null = null; let selectedFood: string | null = null;
  let preview: { id: string; slot: Slot } | null = null;
  let mood = 'calm'; let reaction = 0; let naming: PetLine | null = null;
  let caption = '';
  let captionTimer: number | null = null;
  const footerText = (): string => {
    const goal = eco.getPet('goal');
    return goal ? `攒星币：${itemName(goal)} · 还差 ${Math.max(0, (catalogPrice(goal) ?? 0) - eco.balance())}` : '每一枚星币都来自做完一组题。';
  };
  const speak = (id: string): void => {
    caption = lineText(id);
    const label = root.querySelector<HTMLElement>('.mb-pet-caption');
    if (label) app.say(null, { commText: label }, id);
    if (captionTimer !== null) clearTimeout(captionTimer);
    captionTimer = window.setTimeout(() => {
      caption = ''; captionTimer = null;
      const current = root.querySelector<HTMLElement>('.mb-pet-caption');
      if (current) current.textContent = footerText();
    }, 4500);
  };
  const undo: { slot: Slot; before: string | null }[][] = [];
  const earned = () => eco.events().filter((e) => e.kind === 'earn' && e.src === 'mission.new').length;
  const pets = () => eco.pets();
  const active = (): PetLine | null => {
    const value = eco.getPet('active');
    return value === 'rover' && pets().has('rover') ? 'rover' : value === 'dragon' && pets().has('dragon') ? 'dragon' : pets().values().next().value ?? null;
  };
  const nextEgg = (): PetLine[] => {
    const all: PetLine[] = ['rover', 'dragon'];
    return earned() >= (pets().size ? 8 : 1) ? all.filter((line) => !pets().has(line)) : [];
  };
  const place = (slot: Slot, id: string | null): void => {
    if (id && (itemById(id)?.kind !== slot.kind || !eco.owned().has(id))) return;
    const changes: { slot: Slot; before: string | null }[] = [];
    const writes: Record<string, string | null> = {};
    if (id) for (const other of SLOTS) if (other.id !== slot.id && eco.getPet(slotKey(other)) === id) {
      changes.push({ slot: other, before: id }); writes[slotKey(other)] = null;
    }
    changes.push({ slot, before: eco.getPet(slotKey(slot)) });
    writes[slotKey(slot)] = id;
    if (eco.setPets(writes)) { undo.push(changes); if (undo.length > 10) undo.shift(); app.sfx('ui-pop'); }
    selectedItem = null; selectedSlot = slot; render(); speak('mars.pet.place');
  };
  const choose = (id: string): void => {
    if (tab === 'food') { selectedFood = id; decorating = false; render(); return; }
    const item = itemById(id);
    if (item) {
      if (!decorUnlocked(item, app.save)) return;
      const slot = selectedSlot?.kind === item.kind ? selectedSlot : SLOTS.find((s) => s.kind === item.kind && !eco.getPet(slotKey(s))) ?? SLOTS.find((s) => s.kind === item.kind)!;
      if (eco.owned().has(id)) { decorating = true; kind = item.kind; selectedItem = id; selectedSlot = slot; preview = null; render(); return; }
      preview = { id, slot }; selectedSlot = slot; kind = item.kind; decorating = true; render(); speak('mars.pet.preview'); return;
    }
    if (tab === 'festival') { if (eco.spend('fest', id)) { confetti(36); app.sfx('unlock'); render(); } return; }
    if (eco.owned().has(id)) { equip(id); return; }
    preview = { id, slot: SLOTS[0] }; render();
  };
  const equip = (id: string): void => {
    const line = active();
    if (id.startsWith('paint.') && line) eco.setPet(`paint:${line}`, id);
    else if (id.startsWith('light.')) eco.setPet('tint', id);
    else if (id.startsWith('hat.') && line) eco.setPet(`wear:${line}`, id);
    preview = null; app.sfx('ui-select'); render(); speak('mars.pet.equip');
  };
  const feed = (): void => {
    const line = active(); if (!line || !selectedFood) return;
    const before = stageOf(eco.growth(line));
    if (!eco.spend('feed', `${line}:${selectedFood}`)) return;
    const after = stageOf(eco.growth(line));
    mood = 'happy'; selectedFood = null;
    app.sfx(after > before ? 'unlock' : 'ui-pop');
    if (after > before) confetti(28);
    render(); speak(after > before ? (after === 3 ? 'mars.pet.grown3' : 'mars.pet.grown2') : 'mars.pet.fed');
  };
  const products = (): { id: string; name: string; price: number; locked?: boolean; note?: string }[] => {
    if (tab === 'food') return foods.filter((f) => f.level <= app.save.baseLevel).map((f) => ({ ...f, note: f.favorite === active() ? '最爱 · 成长更多' : `成长 +${f.growth}` }));
    if (tab === 'room') return decor.filter((it) => it.kind === kind).map((it) => ({ ...it, locked: !decorUnlocked(it, app.save), note: !decorUnlocked(it, app.save) ? `${({ orbit: '轨道站', vault: '千晶大仓', factory: '生产线' } as Record<string, string>)[it.theme] ?? '基地'}继续建造后上新` : undefined }));
    if (tab === 'wear') return [catalog.hat];
    if (tab === 'paint') return catalog.paints.filter((it) => !active() || it.id.includes(active()!));
    if (tab === 'light') return catalog.lights;
    return catalog.festivals;
  };
  function render(): void {
    if (!root.isConnected) return;
    const oldScroll = root.querySelector('.mb-pet-shelf')?.scrollTop ?? 0;
    const line = active(); const owned = eco.owned(); const balance = eco.balance(); const growth = line ? eco.growth(line) : 0; const stage = stageOf(growth);
    const name = line ? eco.getPet(`name:${line}`) ?? (line === 'rover' ? '探路者' : '晶脊龙') : '';
    const pieces: string[] = []; const drawn = new Set<string>();
    for (const slot of SLOTS) {
      if (preview && itemById(preview.id) && preview.slot.id === slot.id) continue;
      const id = eco.getPet(slotKey(slot));
      if (id && owned.has(id) && itemById(id)?.kind === slot.kind && !drawn.has(id)) {
        drawn.add(id);
        pieces.push(`<div class="mb-room-piece mb-room-piece--${slot.kind}" data-piece="${safe(id)}" style="left:${slot.x}%;top:${slot.y}%">${decorSvg(id)}</div>`);
      }
    }
    if (preview && itemById(preview.id)) pieces.push(`<div class="mb-room-piece mb-room-piece--preview mb-room-piece--${preview.slot.kind}" style="left:${preview.slot.x}%;top:${preview.slot.y}%">${decorSvg(preview.id)}</div>`);
    const slots = decorating && tab === 'room' ? SLOTS.filter((s) => s.kind === kind).map((s) => `<button type="button" class="mb-pet-slot${selectedSlot?.id === s.id ? ' is-selected' : ''}" data-slot="${s.id}" aria-label="${KIND_NAMES[s.kind]}位置" style="left:${s.x}%;top:${s.kind === 'floor' ? 82 : s.y}%">${eco.getPet(slotKey(s)) ? '✓' : '+'}</button>`).join('') : '';
    const productsHtml = products().map((it) => {
      const have = owned.has(it.id); const liked = tab === 'food' && selectedFood === it.id;
      return `<button type="button" class="mb-pet-product${have ? ' is-owned' : ''}${it.locked ? ' is-locked' : ''}${liked || selectedItem === it.id ? ' is-selected' : ''}" data-product="${it.id}" ${it.locked ? 'disabled' : ''}>
        <span class="mb-pet-product-art">${itemById(it.id) ? decorSvg(it.id) : `<span class="mb-pet-product-symbol" aria-hidden="true">${tab === 'food' ? '✦' : tab === 'paint' ? '◉' : tab === 'light' ? '☼' : tab === 'festival' ? '✷' : '⌂'}</span>`}</span>
        <b>${safe(it.name)}</b><small>${it.locked ? safe(it.note ?? '尚未上新') : have ? '已拥有' : `${it.price} 星币`}</small></button>`;
    }).join('');
    const needed = nextEgg();
    const gift = Object.entries(eco.view().pet).find(([key, message]) => key.startsWith('gift:pending:') && message !== null);
    const trialPaint = preview?.id.startsWith('paint.') && line ? preview.id : null;
    const trialHat = preview?.id === 'hat.explorer';
    root.innerHTML = `<header class="mb-pet-head"><button type="button" class="mb-pet-back xg-btn xg-btn--secondary" aria-label="回基地">${icon('back')}</button><div class="mb-pet-title"><strong>宠物舱</strong><span>${line ? safe(name) + ' · 第 ' + stage + ' 阶段' : '等待伙伴入住'}</span></div><button type="button" class="mb-pet-coins" aria-label="星币余额 ${balance}">✦ <b>${balance}</b></button></header>
      ${app.unsaved || eco.unsaved ? '<p class="mb-pet-warning" role="alert">这台设备暂时没存上进度，请先保留页面。</p>' : ''}
      <div class="mb-pet-workspace">
        <section class="mb-pet-left"><div class="mb-pet-room" data-light="${safe(preview?.id.startsWith('light.') ? preview.id : eco.getPet('tint') ?? 'default')}"><div class="mb-pet-window"></div><div class="mb-pet-floor"></div>${pieces.join('')}
          ${line ? `<button type="button" class="mb-pet-character${mood === 'happy' ? ' is-happy' : ''}${decorating ? ' is-decorating' : ''}" aria-label="${safe(name)}，${selectedFood ? '喂食' : '摸摸它'}" ${decorating ? 'disabled' : ''}>${petSvg(line, stage, mood, trialPaint ?? eco.getPet(`paint:${line}`))}${trialHat || eco.getPet(`wear:${line}`) === 'hat.explorer' ? '<span class="mb-pet-hat" aria-hidden="true">✦</span>' : ''}</button>` : `<div class="mb-pet-egg" aria-label="伙伴蛋">${needed.length ? '<span>✦</span><b>选一位伙伴</b>' : '<span>✧</span><b>完成一单，伙伴就来</b>'}</div>`}
          ${slots}</div>
          <div class="mb-pet-actions"><button data-act="touch" ${!line ? 'disabled' : ''}>摸摸</button><button data-act="food" ${!line ? 'disabled' : ''}>喂食</button><button data-act="room">装饰</button><button data-act="perform" ${!line ? 'disabled' : ''}>表演</button></div>
          <div class="mb-pet-status">${line ? `<span>成长 ${growth} / 250</span><div class="mb-pet-meter"><i style="width:${Math.min(100, growth / 250 * 100)}%"></i></div>${pets().size > 1 ? `<button data-act="switch">换伙伴</button>` : ''}${needed.length ? `<button data-hatch="${needed[0]}">迎接${needed[0] === 'rover' ? '探路者' : '晶脊龙'}</button>` : pets().size < 2 ? `<span>下一位伙伴：订单 ${earned()} / 8</span>` : ''}` : needed.length ? `<div class="mb-pet-hatch">${needed.map((p) => `<button data-hatch="${p}">${petSvg(p, 1)}<b>${p === 'rover' ? '探路者' : '晶脊龙'}</b></button>`).join('')}<span>另一位伙伴以后也会来</span></div>` : '<span>去基地完成一单，再来迎接伙伴。</span>'}</div>
        </section>
        <section class="mb-pet-shop"><nav class="mb-pet-tabs" aria-label="货架分类">${TABS.map(([id, label]) => `<button type="button" data-tab="${id}" class="${tab === id ? 'is-active' : ''}">${label}</button>`).join('')}</nav>
          ${tab === 'room' ? `<nav class="mb-pet-kinds" aria-label="装饰位置">${Object.entries(KIND_NAMES).map(([id, label]) => `<button type="button" data-kind="${id}" class="${kind === id ? 'is-active' : ''}">${label}</button>`).join('')}</nav>` : ''}
          <div class="mb-pet-shelf">${productsHtml}</div>
          ${selectedFood ? `<div class="mb-pet-choice"><span>把${safe(foods.find((f) => f.id === selectedFood)?.name ?? '')}喂给${safe(name)}</span><button type="button" data-act="feed">喂给它</button></div>` : ''}
          ${selectedItem ? `<div class="mb-pet-choice"><span>点房间里的位置摆放${safe(itemName(selectedItem))}</span><button type="button" data-act="cancel">取消</button></div>` : ''}
          ${preview ? `<div class="mb-pet-preview"><span>试试看：${safe(itemName(preview.id))} · ${catalogPrice(preview.id)} 星币</span><div><button type="button" data-act="buy">买下</button><button type="button" data-act="cancel">先不买</button></div>${balance < (catalogPrice(preview.id) ?? 0) ? '<button type="button" data-act="goal">设为目标</button>' : ''}</div>` : ''}
        </section>
      </div>
      <footer class="mb-pet-foot"><span class="mb-pet-caption">${safe(caption || footerText())}</span>${undo.length ? `<button type="button" data-act="undo" aria-label="撤销摆放" title="撤销摆放">${icon('undo')}</button>` : ''}</footer>
      ${naming ? `<div class="mb-pet-name-scrim"><div class="mb-pet-name-panel"><h2>给伙伴起个名字</h2><div class="mb-pet-name-choices">${NAMES[naming].map((n) => `<button type="button" data-name="${n}">${n}</button>`).join('')}</div><form class="mb-pet-name-form"><input aria-label="伙伴名字" maxlength="4" placeholder="自己起名" autocomplete="off"/><button type="submit">确定</button></form></div></div>` : gift ? `<div class="mb-pet-name-scrim"><div class="mb-pet-name-panel mb-pet-gift"><h2>爸爸留了一件礼物</h2><div class="mb-pet-gift-art">${decorSvg(gift[0].slice('gift:pending:'.length))}</div><b>${safe(itemName(gift[0].slice('gift:pending:'.length)))}</b>${gift[1] ? `<p>${safe(gift[1])}</p>` : ''}<button type="button" data-act="open-gift">拆开礼物</button></div></div>` : ''}`;
    const shelf = root.querySelector('.mb-pet-shelf'); if (shelf) shelf.scrollTop = oldScroll;
    root.querySelector<HTMLButtonElement>('.mb-pet-back')!.onclick = () => app.goMap();
    root.querySelector<HTMLButtonElement>('.mb-pet-character')?.addEventListener('click', () => { if (selectedFood) feed(); else { reaction++; mood = 'happy'; app.sfx(reaction % 2 ? 'blip-happy' : 'ui-pop'); render(); speak(reaction % 2 ? 'mars.pet.touch1' : 'mars.pet.touch2'); } });
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab as Tab; decorating = tab === 'room'; preview = null; selectedFood = null; selectedItem = null; render(); if (tab === 'food' || tab === 'room') speak(tab === 'food' ? 'mars.pet.food' : 'mars.pet.room'); });
    root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) => b.onclick = () => { kind = b.dataset.kind as Kind; selectedSlot = null; selectedItem = null; preview = null; render(); });
    root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) => b.onclick = () => { const slot = SLOTS.find((s) => s.id === b.dataset.slot)!; if (selectedItem) place(slot, selectedItem); else { selectedSlot = slot; render(); } });
    root.querySelectorAll<HTMLButtonElement>('[data-product]').forEach((b) => { b.onclick = () => choose(b.dataset.product!); bindDrag(b); });
    root.querySelectorAll<HTMLButtonElement>('[data-hatch]').forEach((b) => b.onclick = () => { const p = b.dataset.hatch as PetLine; if (!nextEgg().includes(p) || !eco.grant('egg', p)) return; eco.setPet('active', p); naming = p; app.sfx('unlock'); render(); speak(p === 'rover' ? 'mars.pet.rover' : 'mars.pet.dragon'); });
    root.querySelectorAll<HTMLButtonElement>('[data-name]').forEach((b) => b.onclick = () => { eco.setPet(`name:${naming}`, b.dataset.name!); naming = null; render(); speak('mars.pet.named'); });
    root.querySelector<HTMLFormElement>('.mb-pet-name-form')?.addEventListener('submit', (event) => { event.preventDefault(); const input = root.querySelector<HTMLInputElement>('.mb-pet-name-form input')!; const value = input.value.trim(); if (!/^[\p{L}\p{N}]{1,4}$/u.test(value)) { input.setCustomValidity('用一到四个字母、汉字或数字'); input.reportValidity(); return; } eco.setPet(`name:${naming}`, value); naming = null; render(); speak('mars.pet.named'); });
    root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'food') { tab = 'food'; decorating = false; render(); }
      else if (act === 'room') { tab = 'room'; decorating = true; render(); }
      else if (act === 'touch' || act === 'perform') { reaction++; mood = 'happy'; app.sfx(act === 'perform' ? 'unlock' : 'blip-happy'); render(); speak(act === 'perform' ? (reaction % 2 ? 'mars.pet.perform1' : 'mars.pet.perform2') : (reaction % 2 ? 'mars.pet.touch1' : 'mars.pet.touch2')); }
      else if (act === 'switch') { const other = active() === 'rover' ? 'dragon' : 'rover'; eco.setPet('active', other); render(); speak('mars.pet.switch'); }
      else if (act === 'feed') feed();
      else if (act === 'cancel') { preview = null; selectedItem = null; render(); }
      else if (act === 'goal' && preview) { eco.setPet('goal', preview.id); preview = null; render(); speak('mars.pet.goal'); }
      else if (act === 'open-gift' && gift) { const id = gift[0].slice('gift:pending:'.length); if (eco.grant('gift', `item:${id}`)) { eco.setPet(gift[0], null); app.sfx('unlock'); render(); speak('mars.pet.openGift'); } }
      else if (act === 'buy' && preview) { const id = preview.id; const slot = preview.slot; if (eco.spend('buy', id)) { if (itemById(id)) place(slot, id); else equip(id); preview = null; render(); speak('mars.pet.bought'); } else { eco.setPet('goal', id); render(); speak('mars.pet.goal'); } }
      else if (act === 'undo') { const last = undo[undo.length - 1]; if (last && eco.setPets(Object.fromEntries(last.map((ch) => [slotKey(ch.slot), ch.before])))) { undo.pop(); render(); speak('mars.pet.undo'); } }
    });
  }
  function bindDrag(button: HTMLButtonElement): void {
    if (tab !== 'room' && tab !== 'food') return;
    let startX = 0, startY = 0; let pointer: number | null = null;
    let ghost: HTMLElement | null = null; let dragged = false;
    const clear = () => { ghost?.remove(); ghost = null; pointer = null; };
    button.onpointerdown = (event) => {
      if (event.pointerType === 'touch' && !(event.target as Element).closest('.mb-pet-product-art')) return;
      pointer = event.pointerId; startX = event.clientX; startY = event.clientY; dragged = false;
      button.setPointerCapture(event.pointerId);
    };
    button.onpointermove = (event) => {
      if (pointer !== event.pointerId || (!event.buttons && event.pointerType !== 'touch')) return;
      if (!ghost && Math.hypot(event.clientX - startX, event.clientY - startY) < 14) return;
      if (!ghost) { dragged = true; ghost = document.createElement('div'); ghost.className = 'mb-pet-drag'; ghost.innerHTML = tab === 'room' ? decorSvg(button.dataset.product!) : '✦'; document.body.append(ghost); }
      ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`;
    };
    button.onpointerup = (event) => {
      if (pointer !== event.pointerId) return;
      const wasDragging = !!ghost;
      clear();
      if (!wasDragging) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (tab === 'food' && target?.closest('.mb-pet-character')) { selectedFood = button.dataset.product!; feed(); }
      else if (tab === 'room') { const el = target?.closest<HTMLElement>('[data-slot]'); const slot = SLOTS.find((s) => s.id === el?.dataset.slot); if (slot && itemById(button.dataset.product!)?.kind === slot.kind) { selectedSlot = slot; choose(button.dataset.product!); if (eco.owned().has(button.dataset.product!)) place(slot, button.dataset.product!); } }
    };
    button.addEventListener('click', (event) => { if (dragged) { event.preventDefault(); event.stopImmediatePropagation(); dragged = false; } }, true);
    button.onpointercancel = () => { clear(); dragged = false; };
    button.onlostpointercapture = clear;
  }
  render();
  if (!eco.seen('pets:intro') && nextEgg().length) { eco.markSeen('pets:intro'); speak('mars.pet.pick'); }
  else if (Object.keys(eco.view().pet).some((key) => key.startsWith('gift:pending:'))) speak('mars.pet.gift');
}

function catalogPrice(id: string): number | null {
  return [...decor, catalog.hat, ...catalog.paints, ...catalog.lights].find((item) => item.id === id)?.price ?? null;
}
