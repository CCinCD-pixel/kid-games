// view/styles.ts — 引擎自带的最小样式（棋盘层级、棋子容器、标记、箭头、印章、升变选择框）。颜色一律取主题 token（--bk-*），带兜底值。
export const BOARD_CSS = `
.bk-board{position:absolute;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;contain:layout style;outline:none}
.bk-board:focus-visible{outline:3px solid var(--bk-focus,#ffd36a);outline-offset:3px;border-radius:6px}
.bk-art,.bk-marks,.bk-over,.bk-pieces,.bk-stamps{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.bk-art>svg{width:100%;height:100%;display:block}
.bk-marks,.bk-over{overflow:visible}
.bk-piece{position:absolute;left:0;top:0;will-change:transform;pointer-events:none;contain:layout style}
.bk-piece::before{content:'';position:absolute;left:12%;right:12%;bottom:0;height:20%;border-radius:50%;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.34),rgba(0,0,0,0) 72%);transform:translateY(22%);transition:transform .12s ease-out,opacity .12s}
.bk-piece[data-bk-rot="180"]::before{bottom:auto;top:0;transform:translateY(-22%)}.bk-piece[data-bk-rot="180"].is-lifted::before{transform:translateY(-52%) scale(1.18);opacity:.7}
.bk-piece.is-lifted::before{transform:translateY(52%) scale(1.18);opacity:.7}
.bk-sprite{position:absolute;inset:0;transform-origin:50% 72%;transition:transform .12s ease-out}
.bk-piece.is-lifted>.bk-sprite{transform:translateY(-7%) scale(1.12)}
.bk-piece.is-drag>.bk-sprite{transition:none}
.bk-piece.is-drag::before{transition:none}
.bk-rot{position:absolute;inset:0}
.bk-rot>*{width:100%;height:100%;display:block}
.bk-toy{position:relative}.bk-toy>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}.bk-toy-glyph{transform:rotate(var(--bk-deg,0deg))}
.bk-mk{transform-box:fill-box;transform-origin:center}
.bk-mk-legal{fill:var(--bk-legal,rgba(255,255,255,.62));stroke:var(--bk-legal-edge,rgba(20,30,60,.35));stroke-width:2}
.bk-mk-capture{fill:var(--bk-capture-fill,rgba(255,110,90,.16));stroke:var(--bk-capture,#ff7a62);stroke-width:8}
.bk-mk-select{fill:var(--bk-select-fill,rgba(255,211,106,.30));stroke:var(--bk-select,#ffd36a);stroke-width:4}
.bk-mk-last{fill:var(--bk-last,rgba(120,190,255,.26))}
.bk-mk-checker{fill:none;stroke:var(--bk-checker,#ff9a4a);stroke-width:6}
.bk-mk-danger{fill:none;stroke:var(--bk-danger,#ff5f6d);stroke-width:5;stroke-dasharray:10 8}
.bk-mk-hint{fill:var(--bk-hint-fill,rgba(255,225,130,.18));stroke:var(--bk-hint,#ffe18a);stroke-width:6}
.bk-mk-dim{fill:var(--bk-dim,rgba(8,12,30,.46))}
.bk-mk-star{fill:var(--bk-star,#ffd36a);stroke:var(--bk-star-edge,#b5791f);stroke-width:2}
.bk-mk-sight{stroke:var(--bk-sight,#ffd36a);stroke-width:5;stroke-linecap:round;stroke-dasharray:14 9;opacity:.95}
.bk-mk-sight-glow{stroke:var(--bk-sight,#ffd36a);stroke-width:16;stroke-linecap:round;opacity:.22}
.bk-mk-preview{fill:none;stroke:var(--bk-preview,#ffffff);stroke-width:5;opacity:.92}
.bk-mk-focus{fill:none;stroke:var(--bk-focus,#ffd36a);stroke-width:4;stroke-dasharray:6 5}
.bk-pulse{animation:bk-pulse 1.1s ease-in-out infinite}
@keyframes bk-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.12);opacity:.72}}
.bk-arrow{fill:none;stroke-linecap:round;stroke-linejoin:round}
.bk-arrow-hint{stroke:var(--bk-arrow-hint,#ffe18a)}.bk-arrow-threat{stroke:var(--bk-arrow-threat,#ff7a62)}.bk-arrow-good{stroke:var(--bk-arrow-good,#7be0a4)}.bk-arrow-warn{stroke:var(--bk-arrow-warn,#ffb14a)}
.bk-coord{font:600 22px var(--xg-font-num,system-ui,sans-serif);fill:var(--bk-coord,rgba(255,255,255,.62));pointer-events:none}
.bk-stamp{position:absolute;left:0;top:0;pointer-events:none;will-change:transform,opacity;font:700 var(--bk-stamp-size,34px)/1 var(--xg-font-title,var(--xg-font-read,system-ui,sans-serif));color:var(--bk-stamp-ink,#fff);padding:.18em .5em .22em;border-radius:.5em;background:var(--bk-stamp-bg,rgba(214,70,70,.94));box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 0 0 2px rgba(255,255,255,.35);white-space:nowrap;letter-spacing:.04em}
.bk-stamp.is-mate{background:var(--bk-stamp-mate,rgba(190,40,60,.96))}.bk-stamp.is-stalemate{background:var(--bk-stamp-stale,rgba(90,110,170,.95))}
.bk-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.bk-promo{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(6,10,28,.46);touch-action:none;-webkit-tap-highlight-color:transparent}
.bk-promo-card{display:flex;gap:10px;padding:12px;border-radius:22px;background:var(--bk-promo-bg,rgba(24,34,72,.96));box-shadow:0 14px 40px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,255,255,.18)}
.bk-promo-btn{position:relative;border:0;border-radius:16px;background:var(--bk-promo-btn,rgba(255,255,255,.10));padding:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .1s,background .1s}
.bk-promo-btn:active,.bk-promo-btn:focus-visible{transform:scale(1.07);background:var(--bk-promo-btn-on,rgba(255,211,106,.32));outline:3px solid var(--bk-focus,#ffd36a)}
.bk-promo-btn .bk-sprite{position:absolute;inset:6%}
@media (prefers-reduced-motion:reduce){.bk-pulse{animation:none}.bk-sprite,.bk-piece::before{transition:none}}
`;
let injected = false;
export function ensureBoardStyles(doc: Document = document): void {
  if (injected && doc.getElementById('bk-styles')) return;
  const el = doc.createElement('style'); el.id = 'bk-styles'; el.textContent = BOARD_CSS; doc.head.appendChild(el); injected = true;
}
