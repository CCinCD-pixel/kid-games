// 机关令 families (A2/A3, presentation only): the 13 ults are drawn and heard as five families, not one shared sound.
// 射击 shoot (连弩·转射机) · 抛射 lob (籍车·礌石) · 火 fire (火油罐·阳燧) · 控制 ctrl (蒺藜·陷坑·橐·钩拒·木垒·听瓮·墨匠) · 经济 econ (禾田·粮仓·拆解场)
export type UltFamily = 'shoot' | 'lob' | 'fire' | 'ctrl' | 'econ';
const FAM: Record<string, UltFamily> = {
  shooter: 'shoot', radial: 'shoot',
  lobber: 'lob', strike: 'lob',
  burner: 'fire', beam: 'fire',
  spikes: 'ctrl', pit: 'ctrl', gust: 'ctrl', hook: 'ctrl', wall: 'ctrl', listener: 'ctrl', repair: 'ctrl',
  farm: 'econ', bank: 'econ', salvage: 'econ',
};
export const ultFamily = (card: string | undefined): UltFamily => (card && FAM[card]) || 'ctrl';
/** screen-flash colour per family (r,g,b), gold-white for the shooters, warm for stone, orange for fire, jade for control, gold for grain */
export const ULT_FLASH: Record<UltFamily, string> = { shoot: 'rgb(255,246,214)', lob: 'rgb(255,226,170)', fire: 'rgb(255,176,92)', ctrl: 'rgb(190,244,226)', econ: 'rgb(255,222,120)' };
/** the sound recipe of a family */
export const ultSfx = (card: string | undefined): string => 'token.' + ultFamily(card);
