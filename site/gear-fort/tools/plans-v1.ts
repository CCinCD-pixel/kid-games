// v1 wave plans, volumes 1 and 2 (validators only; spec §4.6, V6) — verbatim from proto/levels/defs.mjs (rev d). The
// shipped content/gear-fort/levels/{1,2}-*.json are these plans expanded at the frozen p; levelgen.test.ts proves it.
import { std, sec, type Def, type Meta, type Plan } from '../src/lane/levelgen';

const W = { walker: 1 };
export const DEFS_V1: Def[] = [];
const L = (id: string, meta: Meta, plan: (p: number) => Plan): void => { DEFS_V1.push({ id, meta, plan }); };

// ═════════ 第一卷 宋城·白昼 (day, sky grain, slots 1 → 6) — rev d skeletons (review D10: 1–3 flags at varied times,
// 2–4.5 min, start grain 50–150; one short skirmish 1-5, one 3-flag siege 1-8, one special 1-6 急报·昼; first choose at 1-8
// with a pre-filled deck, review D9). Every level lists the 3★ condition the child can track on the HUD chip (D13).
L('1-1', { name: '第一盘推演', type: 'tutorial', newCard: 'shooter', newEnemy: 'walker', concept: '拖牒放车、点粮包', jinnang: null, loadout: ['shooter'], slots: 1,
  star3: { minX: 4 }, star3Text: '没有木甲兵走过第 5 格', ask: '连弩车是怎么拆掉木甲兵的？' },
  (): Plan => ({ lanes: [2], start: 150, skyAfterKill: true, intro: [[15, 2, 'walker']], extra: [[30, 2, 'walker'], [44, 2, 'walker'], [58, 2, 'walker'], [70, 2, 'walker'], [74, 2, 'walker'], [78, 2, 'walker']], flagTimes: [70] }));
L('1-2', { name: '粮草先行', type: 'tutorial', newCard: 'farm', concept: '先种禾田再布防', jinnang: 'econ', loadout: ['shooter', 'farm'], slots: 2,
  star3: { econAt60: 4 }, star3Text: '第 60 秒时有 4 块禾田', ask: '为什么先种禾田？' },
  (_p: number) => std({ lanes: [1, 2, 3], intro: [[35, 2, 'walker']], tr: [{ a: 50, z: 100, e: 13, k: W }], flags: [{ t: 110, n: 6, k: W, sp: 14 }] }));
L('1-3', { name: '先挡后打', type: 'teach', newCard: 'wall', concept: '木垒替连弩车争取时间', jinnang: 'depth', loadout: ['shooter', 'farm', 'wall'], slots: 3,
  star3: { attackersLost: 2 }, star3Text: '最多两台连弩车被咬坏', ask: '木垒为什么要放在连弩车前面？' },
  (_p: number) => std({ start: 90, intro: [[25, 2, 'walker']], tr: [{ a: 38, z: 66, e: 11, k: W }, { a: 92, z: 128, e: 8, k: W }],
    flags: [{ t: 75, n: 8, k: W, sp: 8, ln: [1, 3], lead: [['walker', 1], ['walker', 1]] }, { t: 140, n: 11, k: W, sp: 13, ln: [0, 2, 4], lead: [['walker', 3], ['walker', 3], ['walker', 3]] }] }));
L('1-4', { name: '盾甲兵', type: 'teach', newCard: 'lobber', newEnemy: 'shielder', concept: '籍车把石头抛过盾牌', jinnang: 'counter', loadout: ['shooter', 'farm', 'wall', 'lobber'], slots: 4,
  star3: { minXOf: { shielder: 2 } }, star3Text: '盾甲兵没有走过第 3 格', ask: '盾挡住了箭，挡得住从天上落下的石头吗？' },
  (_p: number) => std({ intro: [[50, 2, 'shielder']], tr: [{ a: 22, z: 40, e: 14, k: W }, { a: 64, z: 90, e: 13, k: { walker: 1, shielder: 1 } }, { a: 115, z: 170, e: 10, k: { walker: 1, shielder: 2 } }],
    flags: [{ t: 100, n: 6, k: { walker: 1, shielder: 2 }, sp: 10, lead: [['shielder', 1], ['shielder', 1]] }, { t: 185, n: 10, k: { walker: 1, shielder: 3 }, sp: 14, lead: [['shielder', 3], ['shielder', 3]] }] }));
L('1-5', { name: '冲车来了', type: 'teach', newCard: 'spikes', newEnemy: 'ram', concept: '铁蒺藜让冲车冲不起来', jinnang: 'control', loadout: ['shooter', 'farm', 'wall', 'lobber', 'spikes'], slots: 5,
  star3: { jammed: { ram: 5 } }, star3Text: '铁蒺藜卡住 5 辆冲车', ask: '冲车为什么要先跑起来才撞得狠？' },
  (_p: number) => std({ start: 100, preplace: [['wall', 2, 4]], intro: [[40, 2, 'ram']], extra: [[62, 2, 'ram'], [68, 2, 'ram'], [86, 0, 'ram'], [92, 0, 'ram'], [112, 4, 'ram']],
    tr: [{ a: 20, z: 36, e: 10, k: W }, { a: 50, z: 80, e: 10, k: { walker: 3, shielder: 1 } }],
    flags: [{ t: 100, n: 6, k: { walker: 3, shielder: 1 }, sp: 10, ln: [1, 2, 3] }] }));
L('1-6', { name: '未雨绸缪', type: 'conveyor', newCard: 'pit', concept: '急报：驿马把牒片送来；鲁班的手按住哪路，就先在那路挖坑', jinnang: 'depth', slots: 0,
  star3: { captures: 5 }, star3Text: '陷坑收走 5 个机关', ask: '鲁班的手按住了哪几路？你提前做了什么？' },
  (_p: number) => std({ sky: false, start: 0, warn: [{ t: 70, lanes: [1, 3] }, { t: 125, lanes: [0, 4] }, { t: 180, lanes: [2, 1] }],
    belt: { first: 80, period: 200, cap: 6, seq: ['shooter', 'shooter', 'wall', 'pit', 'shooter', 'lobber', 'pit', 'shooter', 'pit', 'spikes', 'lobber', 'pit', 'shooter', 'wall', 'pit', 'lobber', 'pit'] },
    tr: [{ a: 18, z: 58, e: 12, k: W }, { a: 85, z: 112, e: 11, k: { walker: 2, shielder: 1 } }, { a: 140, z: 168, e: 10, k: { walker: 2, shielder: 1, ram: 0.4 } }],
    flags: [{ t: 70, n: 6, k: W, sp: 8, ln: [1, 3] }, { t: 125, n: 8, k: { walker: 2, shielder: 1 }, sp: 10, ln: [0, 4] }, { t: 180, n: 10, k: { walker: 2, shielder: 1, ram: 0.5 }, sp: 12, ln: [2, 1] }] }));
L('1-7', { name: '蚁傅', type: 'teach', newCard: 'burner', newEnemy: 'ant', concept: '成群的用火油罐一网打尽', jinnang: 'aoe', loadout: ['shooter', 'farm', 'wall', 'lobber', 'pit', 'burner'], slots: 6,
  star3: { bestBurn: 8 }, star3Text: '一罐火油烧到一整群（8 只）蚁傅', ask: '一箭只能拆一只蚂蚁，一罐火油呢？' },
  (_p: number) => std({ start: 80, intro: [[62, 2, 'swarm']], tr: [{ a: 22, z: 50, e: 14, k: W }, { a: 74, z: 88, e: 12, k: W }, { a: 112, z: 150, e: 12, k: { walker: 3, shielder: 1 } }],
    flags: [{ t: 95, n: 4, k: W, sp: 8, ln: [0, 1, 3, 4], lead: [['swarm', 2], ['swarm', 2], ['swarm', 3]] }, { t: 165, n: 6, k: { walker: 2, shielder: 1 }, sp: 12, ln: [0, 2, 4], lead: [['swarm', 3], ['swarm', 3], ['swarm', 1], ['swarm', 2]] }] }));
L('1-8', { name: '留一手', type: 'practice', newCard: 'strike', concept: '礌石留给扎堆的大波；第一次自己挑牒', jinnang: 'timing', choose: true, slots: 6,
  prefill: ['shooter', 'farm', 'wall', 'lobber', 'pit', 'burner'], seal: ['strike', 'counters'],
  star3: { strikeMax: 3 }, star3Text: '一块礌石砸中 3 个机关', ask: '礌石为什么要等它们挤在一起再砸？' },
  (_p: number) => std({ start: 80, tr: [{ a: 20, z: 58, e: 13, k: { walker: 3, shielder: 1 } }, { a: 84, z: 120, e: 11, k: { walker: 2, shielder: 1, swarm: 0.5 } }, { a: 148, z: 186, e: 10, k: { walker: 2, shielder: 1, ram: 0.5 } }],
    flags: [{ t: 70, n: 7, k: { walker: 2, shielder: 1 }, sp: 4, ln: [2, 2, 1] }, { t: 135, n: 9, k: { walker: 2, shielder: 1, swarm: 0.5 }, sp: 5, ln: [3, 3, 4] }, { t: 200, n: 12, k: { walker: 2, shielder: 1, ram: 0.6 }, sp: 5, ln: [0, 1] }] }));
L('1-9', { name: '铜甲力士', type: 'teach', newCard: 'beam', newEnemy: 'brute', concept: '铜不怕火，怕重石和聚光', jinnang: 'adapt', loadout: ['shooter', 'farm', 'wall', 'lobber', 'burner', 'beam'], slots: 6,
  star3: { minX: 1 }, star3Text: '没有机关走过第 2 格', ask: '火油罐为什么烧不动铜甲力士？' },
  (_p: number) => std({ start: 70, preplace: [['burner', 2, 1]], intro: [[60, 2, 'brute']], tr: [{ a: 22, z: 48, e: 14, k: W }, { a: 74, z: 96, e: 12, k: { walker: 2, shielder: 1 } }, { a: 125, z: 185, e: 10, k: { walker: 2, shielder: 1, swarm: 1 } }],
    flags: [{ t: 110, n: 7, k: { walker: 2, shielder: 1 }, sp: 10, lead: [['brute', 4]] }, { t: 200, n: 11, k: { walker: 3, shielder: 1, swarm: 0.6 }, sp: 14, lead: [['brute', 1], ['brute', 3]] }] }));
L('1-10', { name: '鲁班的考题', type: 'test', concept: '看鲁班亮的招，自己选牒', jinnang: 'preview', choose: true, slots: 6, seal: 'counters',
  prefill: ['shooter', 'farm', 'wall', 'lobber', 'burner', 'beam'],
  star3: { lostTo: { ram: 2 } }, star3Text: '冲车最多撞坏两台机关', ask: '你为什么带了这几张牒？' },
  (_p: number) => std({ start: 90, warn: [{ t: 160, lanes: [1, 3] }], tr: [{ a: 24, z: 75, e: 13, k: { walker: 2, shielder: 1, ram: 1, swarm: 0.6 } }, { a: 100, z: 148, e: 10, k: { shielder: 1, ram: 1, swarm: 1 } }],
    flags: [{ t: 85, n: 8, k: { shielder: 1, swarm: 1, ram: 1 }, sp: 10, lead: [['ram', 2], ['ram', 4]] }, { t: 160, n: 12, k: { shielder: 1, ram: 1, swarm: 1.5 }, sp: 14, ln: [1, 3, 1, 3, 0, 2, 4], lead: [['ram', 1], ['ram', 3], ['ram', 0]] }] }));
L('1-11', { name: '铜犀冲车', type: 'boss', concept: '组合：重石破甲、蒺藜挡冲、火油收蚁', jinnang: 'counter', choose: true, slots: 6, boss: 'rhino',
  star3: { minX: 2 }, star3Text: '没有机关走过第 3 格', ask: '铜犀缩进壳里时，什么能把壳敲裂？' },
  (p: number) => std({ start: 100, boss: { type: 'rhino' }, extra: [[50, 2, 'boss:rhino']], tr: [{ a: 20, z: 45, e: 12, k: W, ln: [0, 1, 3, 4] }, { a: 60, z: 200, e: 11 / Math.max(0.5, p), k: { walker: 2, shielder: 1 }, ln: [0, 1, 3, 4] }],
    flags: [{ t: 120, n: 6, k: { walker: 1, shielder: 1 }, sp: 10, ln: [0, 1, 3, 4] }] }));

export const DEFS_V2: Def[] = [];
const L2 = (id: string, meta: Meta, plan: (p: number) => Plan): void => { DEFS_V2.push({ id, meta, plan }); };

// ═════════ 第二卷 十日十夜 (night / fog / smoke; slots 6 → 7) — rev d: one skirmish 2-3, one 3-flag siege 2-9, special 2-7;
// choose with a pre-filled deck at 2-5 and 2-9 (D9); 2-10 debuts 铜盾甲兵 with no pairing line (举一反三, D15);
// 2-11 is a remix finale (D11).
L2('2-1', { name: '夜路', type: 'breather', newCard: 'bank', concept: '夜里没有送粮：先建粮仓', jinnang: 'invest', loadout: ['farm', 'bank', 'shooter', 'wall', 'lobber', 'burner'], slots: 6,
  star3: { minX: 3 }, star3Text: '没有机关走过第 4 格', ask: '粮仓要等一会儿才出粮，为什么还值得先建？' },
  (_p: number) => std({ env: { night: true }, tr: [{ a: 45, z: 86, e: 14, k: { walker: 2, shielder: 1 } }, { a: 115, z: 156, e: 10, k: { walker: 2, shielder: 1, swarm: 1 } }],
    flags: [{ t: 95, n: 8, k: { walker: 2, shielder: 1 }, sp: 12 }, { t: 170, n: 12, k: { walker: 3, shielder: 1, swarm: 0.5 }, sp: 14 }] }));
L2('2-2', { name: '木鹊偷粮', type: 'teach', newCard: 'radial', newEnemy: 'flyer', concept: '转射机守住后院的禾田', jinnang: 'priority', loadout: ['farm', 'shooter', 'wall', 'lobber', 'burner', 'radial'], slots: 6,
  star3: { econLost: 0 }, star3Text: '没有一块禾田被啄坏', ask: '木鹊飞过了连弩车，为什么转射机打得到它？' },
  (_p: number) => std({ start: 70, intro: [[50, 1, 'flyer']], extra: [[80, 3, 'flyer']], tr: [{ a: 22, z: 40, e: 14, k: W }, { a: 64, z: 76, e: 12, k: { walker: 2, shielder: 1 } }, { a: 105, z: 148, e: 9, k: { walker: 3, shielder: 1, flyer: 0.5 } }],
    flags: [{ t: 85, n: 8, k: { walker: 3, shielder: 1 }, sp: 12 }, { t: 160, n: 12, k: { walker: 3, shielder: 1, swarm: 0.5 }, sp: 14, lead: [['flyer', 0], ['flyer', 4]] }] }));
L2('2-3', { name: '风箱', type: 'teach', newCard: 'gust', concept: '没有转射机：风把木鹊吹下来给连弩打，把蚁群吹回去', jinnang: 'control', loadout: ['farm', 'shooter', 'wall', 'lobber', 'burner', 'gust'], slots: 6,
  star3: { downed: 3, econLost: 0 }, star3Text: '风箱吹落 3 只木鹊，禾田一块不丢', ask: '风箱吹不动谁？为什么？' },
  (_p: number) => std({ start: 100, extra: [[40, 2, 'flyer'], [52, 2, 'flyer'], [70, 1, 'flyer'], [88, 2, 'swarm'], [100, 1, 'flyer']], tr: [{ a: 20, z: 70, e: 12, k: W }],
    flags: [{ t: 90, n: 5, k: { walker: 3, shielder: 1 }, sp: 12, ln: [0, 3, 4] }] }));
L2('2-4', { name: '烟车', type: 'teach', newEnemy: 'smoker', concept: '烟里连弩看不见：吹散它，或改用籍车', jinnang: 'adapt', loadout: ['farm', 'bank', 'shooter', 'lobber', 'gust', 'wall'], slots: 6,
  star3: { smokeCleared: 10 }, star3Text: '风箱吹散 10 格烟', ask: '烟里看不见，籍车为什么还能打中？' },
  (_p: number) => std({ intro: [[55, 2, 'smoker']], tr: [{ a: 25, z: 45, e: 14, k: W }, { a: 72, z: 90, e: 12, k: { walker: 2, shielder: 1 } }, { a: 120, z: 168, e: 10, k: { walker: 2, shielder: 1, smoker: 1 } }],
    flags: [{ t: 100, n: 8, k: { walker: 3, shielder: 1 }, sp: 12, lead: [['smoker', 1]] }, { t: 180, n: 12, k: { walker: 3, shielder: 1 }, sp: 14, lead: [['smoker', 0], ['smoker', 3]] }] }));
L2('2-5', { name: '大雾', type: 'practice', concept: '看不见从哪路来，就每路都守；阳燧照得透雾', jinnang: 'preview', choose: true, slots: 6, seal: ['counters'],
  prefill: ['farm', 'bank', 'shooter', 'lobber', 'gust', 'wall'],
  star3: { econLost: 1 }, star3Text: '雾里最多只有 1 块禾田被咬坏', ask: '雾里看不见，你怎么知道每路都要守？' },
  (_p: number) => std({ start: 95, env: { fogCol: 5 }, tr: [{ a: 22, z: 86, e: 12, k: { walker: 2, shielder: 1, swarm: 1 } }, { a: 112, z: 158, e: 9, k: { walker: 2, shielder: 1, swarm: 1, ram: 0.4 } }],
    flags: [{ t: 95, n: 9, k: { walker: 2, shielder: 1, swarm: 1 }, sp: 12 }, { t: 172, n: 13, k: { walker: 2, shielder: 1, swarm: 1, ram: 0.6 }, sp: 14 }] }));
L2('2-6', { name: '云梯车', type: 'teach', newCard: 'hook', newEnemy: 'ladder', concept: '云梯会压住木垒后面那几台：钩拒把梯子拉倒', jinnang: 'control', loadout: ['farm', 'bank', 'shooter', 'wall', 'lobber', 'hook'], slots: 6,
  star3: { wallsLost: 0 }, star3Text: '没有一座木垒被推倒', ask: '云梯压住的是哪一台？' },
  (_p: number) => std({ start: 90, intro: [[58, 2, 'ladder']], tr: [{ a: 28, z: 48, e: 14, k: W }, { a: 72, z: 86, e: 12, k: { walker: 2, shielder: 1 } }, { a: 112, z: 152, e: 10, k: { walker: 2, shielder: 1, ladder: 1 } }],
    flags: [{ t: 90, n: 6, k: { walker: 3, shielder: 1 }, sp: 12, lead: [['ladder', 3]] }, { t: 165, n: 9, k: { walker: 3, shielder: 1 }, sp: 14, lead: [['ladder', 1], ['ladder', 4]] }] }));
L2('2-7', { name: '急报·夜', type: 'conveyor', concept: '没有粮，牒片自己送来', jinnang: 'improvise', slots: 0,
  star3: { unitsLost: 1 }, star3Text: '最多只丢一台机关', ask: '牒片送来时你是怎么决定放哪儿的？' },
  (_p: number) => std({ env: { night: true }, sky: false, start: 0, belt: { first: 10, period: 300, cap: 6, seq: ['shooter', 'lobber', 'shooter', 'shooter', 'lobber', 'wall', 'burner', 'shooter', 'gust', 'radial', 'wall', 'lobber', 'hook', 'burner', 'shooter', 'strike'] },
    tr: [{ a: 35, z: 92, e: 11, k: { walker: 2, shielder: 1, swarm: 1 } }, { a: 120, z: 160, e: 9, k: { walker: 2, shielder: 1, swarm: 1, ladder: 0.5, flyer: 0.5 } }],
    flags: [{ t: 100, n: 8, k: { walker: 2, shielder: 1, swarm: 1 }, sp: 12 }, { t: 175, n: 12, k: { walker: 2, shielder: 1, swarm: 1, ladder: 1 }, sp: 14 }] }));
L2('2-8', { name: '鼓车', type: 'practice', newEnemy: 'drummer', concept: '认识鼓车：鼓一响，旁边的机关又快又硬（点一下可以标记它）', jinnang: 'mark', loadout: ['farm', 'shooter', 'wall', 'lobber', 'spikes', 'strike'], slots: 6,
  star3: { minXOf: { drummer: 3 } }, star3Text: '鼓车没有走过第 4 格', ask: '为什么先拆鼓车？' },
  (_p: number) => std({ intro: [[60, 2, 'drummer']], tr: [{ a: 24, z: 48, e: 14, k: W }, { a: 75, z: 92, e: 12, k: { walker: 2, shielder: 1 } }, { a: 122, z: 168, e: 10, k: { walker: 2, shielder: 1, ram: 0.5, drummer: 0.7 } }],
    flags: [{ t: 100, n: 8, k: { walker: 2, shielder: 1, ram: 0.5 }, sp: 10, lead: [['ram', 1], ['drummer', 1]] }, { t: 180, n: 12, k: { walker: 2, shielder: 1, ram: 0.6 }, sp: 14, lead: [['ram', 3], ['drummer', 3], ['ram', 0], ['drummer', 0]] }] }));
L2('2-9', { name: '夜里的考验', type: 'practice', concept: '温故知新：烟、蚁群、冲车一起来；风箱配火油（火借风势）', jinnang: 'synergy', choose: true, slots: 6, seal: ['gust', 'counters'],
  prefill: ['bank', 'shooter', 'wall', 'lobber', 'spikes', 'burner'],
  star3: { windBurn: 5 }, star3Text: '风箱同一路的火油罐，一罐烧到 5 个机关', ask: '风箱和火油罐放在同一路，会发生什么？' },
  (_p: number) => std({ env: { night: true }, tr: [{ a: 45, z: 72, e: 13, k: { walker: 2, shielder: 1, swarm: 1 } }, { a: 96, z: 136, e: 11, k: { walker: 1, shielder: 1, swarm: 1, smoker: 0.5 } }, { a: 162, z: 200, e: 10, k: { walker: 1, shielder: 1, swarm: 1, ram: 0.5 } }],
    flags: [{ t: 80, n: 8, k: { swarm: 2, walker: 1, shielder: 1 }, sp: 10, lead: [['smoker', 2]] }, { t: 150, n: 10, k: { swarm: 2, walker: 1, shielder: 1 }, sp: 12 }, { t: 215, n: 13, k: { swarm: 2, shielder: 1, walker: 1 }, sp: 14, lead: [['ram', 1], ['ram', 3]] }] }));
L2('2-10', { name: '天亮了', type: 'test', concept: '前半夜靠粮仓，天亮后阳燧上线；新机关不告诉你怕什么：看标签自己想', jinnang: 'infer', choose: true, slots: 7, seal: ['beam'], infer: 'shielder_m', newEnemy: 'shielder_m',
  prefill: ['bank', 'shooter', 'wall', 'lobber', 'spikes', 'burner', 'gust'],
  star3: { beamAfterDawn: 20 }, star3Text: '天亮后 20 秒内放下阳燧', ask: '铜盾甲兵是谁也没教过你的。你是怎么想出对付它的办法的？' },
  (_p: number) => std({ env: { night: true, dawnAt: sec(120) }, intro: [[135, 2, 'shielder_m']], tr: [{ a: 40, z: 92, e: 13, k: { walker: 2, shielder: 1, swarm: 1, smoker: 0.5 } }, { a: 148, z: 172, e: 9, k: { walker: 1, shielder_m: 1, brute: 1, swarm: 0.5 } }],
    flags: [{ t: 100, n: 9, k: { walker: 2, shielder: 1, swarm: 1, ladder: 0.5 }, sp: 12 }, { t: 185, n: 13, k: { walker: 1, shielder_m: 1, brute: 1, drummer: 0.4 }, sp: 14 }] }));
L2('2-11', { name: '夜枭木鸢', type: 'boss', concept: '对空；看影子预警；俯冲时用风箱和礌石；它掉一半血就更凶', jinnang: 'timing', choose: true, slots: 7, boss: 'owl',
  star3: { owlDown: 1 }, star3Text: '风箱把木鸢打落一次', ask: '木鸢什么时候最好打？' },
  (p: number) => std({ env: { night: true }, start: 420, boss: { type: 'owl' }, extra: [[40, 2, 'boss:owl']], tr: [{ a: 25, z: 230, e: 14 / Math.max(0.5, p), k: { walker: 2, shielder: 1, swarm: 0.5 } }],
    flags: [{ t: 100, n: 6, k: { walker: 1, flyer: 1, smoker: 0.6 }, sp: 12 }, { t: 190, n: 7, k: { walker: 1, shielder: 1, ram: 0.6 }, sp: 14, lead: [['drummer', 0], ['ram', 0]] }] }));

