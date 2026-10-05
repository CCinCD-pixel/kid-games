# 记忆方块 · memory-matrix · 过渡说明（构建规格）

> 日期 2026-10-05 ｜ 作者：主策划 + 技术负责（规格代理）｜ 读者：实现代理（按本文 + `docs/ARCHITECTURE.md` + `docs/GAME_AUTHORING.md` 施工）
> 上位文件：`~/kid-games-evidence/2026-10-04/plan/final-plan.md` §0、§3.9（H6）、§4.8（旧游戏去留）、§6.3（URL 对照）、§7.1（H6 验收）、§7.5（砍单顺序）；审计 `audit/memory-matrix.json`。爸爸决定 5：**只修布局，之后并入月宫建造师 M4**。本文**不做重做设计**：记忆方块冻结，记忆玩法的续航由月宫 M4（7 关）+ M6-08 / M8-08 复习关 + `memory` 施工单（48 张）承担，见 `specs/moon-builder.md`。
> 附带工具（已在本机跑通，不开浏览器）：`/Users/ccincd/kid-games-work/specs/memory-matrix-tools/`
> - `level-audit.mjs`：从**线上页面源码**抽出 `buildLevels/LADDERS/generatePattern` 放进 node:vm 跑。实测：A1–A4 全 PASS（最短展示 1200 ms，75 关被抬到下限；"重玩出现与上一局相同图案"的最坏概率 1.55e-8，在萌芽第 5 关；48 000 次模拟重玩 0 次连续重复）。
> - `veteran.mjs`：元老卡迁移的参考实现（金标准）。`fixtures/veteran-cases.json` 有 10 个手写用例。
> - `retire-check.mjs`：跳转闸门，纯函数 + 命令行，输入是家长页导出的进度包。
> - `selftest.mjs`：38 项断言全 PASS，覆盖迁移、幂等、不抛错和闸门。
> - `forecast.mjs`：根据 CSS 公式纸面预测棋盘尺寸和文字对比度。
> - `phase0.spec.ts`：Playwright WebKit 回归草稿，P1–P12。已通过与仓库相同 tsconfig 的 `tsc --noEmit`，**规格阶段按规定没有运行**。

---

## 0. 一屏结论（实现代理只需先读这里）

1. **三个阶段**
   - **A 过渡期**：从现在到月宫上线。Phase 0 版加上 H6b（两行 CSS，见 §8.1），其余冻结。
   - **B 并存期**：月宫 `status:live` 之后。菜单顶部加一条"记忆塔在月宫开张啦"的路标；月宫每次启动都重算元老卡。
   - **C 跳转**：闸门通过后由平台执行。删除 `site/memory-matrix/`，在 `site/redirects.json` 加 `302!` 跳到 `/moon-builder/?from=memory-matrix`；旧存档键**永不删除**。
2. **跳转闸门**（§8.4，`retire-check.mjs` 实现，数字写死）：
   - **前置条件**（全部满足，爸爸也不能豁免）：
     - P1 月宫上线 ≥56 天；
     - P2 月宫 DoD 和校验器在已部署的提交上全绿；
     - P3 在孩子 iPad 的**主屏 App** 里核对过：元老卡的星数等于旧菜单 4 张卡"累计星星"之和，或者旧星数本来就是 0。
   - **决策规则**（爸爸可以推翻）：
     - D1 近 28 天里记忆方块的"自选打开"不超过 3 次。只统计 `source ∈ {hub, direct}` 且 `activeMs ≥ 30 s` 的会话。
     - D2 最近一次访谈问"哪个游戏没了你会难过？"，他**没有**提到记忆方块。
   - **复查节奏**：不通过就每 14 天复查一次，CP2（5/9）、CP3（8/31）各复查一次。CP3 仍保留时由爸爸定，默认冻结保留，成本为 0。
3. **用 302，不用 301**：
   - Safari 会长期缓存 301，一旦反悔，孩子会被困在跳转里。方案 §6.3 也写的是 `302!`。
   - 因此**推翻 `moon-builder.md` §8.9**："月宫 live 的同一变更里删目录并加 `redirectFrom`（301）"这一条作废。月宫的 `game.json` **不得**出现 `redirectFrom: ["/memory-matrix"]`。见 §8.6 CR-1。
4. **元老卡迁移改为"每次启动幂等重算、取最大值、永不收回"**：
   - 原月宫规格只在首次启动算一次，并存期里新得的星星会丢。见 CR-2。
   - 同时读活键 `kid_games_memory_matrix_v2` 和大厅快照 `kg:v1:legacy-memory-matrix`。卡面写"★ 星数 · 通关 N 关"。
5. **Phase 0 尚未上生产**：它只在 `upgrade/2026-10` 分支，`main` 还是旧版。下一次批量发布之前，§9 的 Phase 0 检查必须全绿。不 push，发布由爸爸控制。

---

## 1. 定位、立意、能力、课标、证据

- **定位**：经典角（`place: classic`）里冻结的旧游戏，作为过渡，最终并入月宫 M4"看一眼就搭"。不再加内容、美术或玩法。
- **玩家幻想**：保持原样，在星际观测站记住亮起的方块。
- **立意**：尊重孩子已有的投入。旧成绩换成月宫里的"记忆方块元老"卡和"老玩家小旗"，迁移不清空、不贬值；跳转以他的实际选择和访谈为准，不由大人单方面拿走。
- **目标能力**：同时呈现的视觉空间图案广度（Visual Pattern Span）。**不练**顺序 / 倒序记忆、空间变换、方位语言。
- **课标锚点**：没有实质锚点。一上"位置"只是弱相关，游戏里不出现方位词。家长页如实写"旧版小练习"。
- **证据等级**：近迁移 B-（同类任务有提升），远迁移 D（Melby-Lervåg 等 2016；Sala & Gobet）。家长页不写"提升记忆力 / 智力"。

## 2. 屏幕流程与布局（Phase 0 后的现状 + B 期路标）

流程：大厅卡 → **菜单**（4 张阶梯卡）→ **选关**（40 个关卡钮）→ **游戏**（看 → 答 → 结果面板）→ 下一关 / 重玩 / 回选关。🏠 返回由 `legacy-shell.ts` 接管，热区 ≥56 px，避开安全区。

| 视口（CSS px） | 棋盘边长 | 3×3 格 | 4×4 格 | 5×5 格 | 预计棋盘底边（安全区 20） | 结果面板出现后 |
|---|---|---|---|---|---|---|
| 810×1080 竖 | 480 | 144 | 105.5 | 82.4 | ≈742 | 不滚动（≈960 <1080） |
| 1080×810 横 | 480 | 144 | 105.5 | 82.4 | ≈742 | 自动滚动约 140 px；棋盘顶仍在 ≥100 px 处 |
| 1133×744 横（mini，方案 H6 指定） | 434（安全区 20）／454（0） | 135 | 99 | 77 | ≈716 | 自动滚动约 160 px；棋盘仍完整 |

（`forecast.mjs` 按 `--board-side: min(92vw, 480px, calc(100vh − 290px − env(safe-area-inset-top)))` 算出；以 Playwright 实测为准。）

- **布局规则（冻结）**：
  - 展示和作答阶段 `scrollY = 0`，整块棋盘都在视口内。
  - 只有结果面板出现时允许自动纵向滚动（H6 认可，是旧页的已知例外）。
  - 菜单和选关页在三种视口下都不滚动。
- **B 期路标**：
  - 是 `.menu-panel` 的第一个子元素：`<a class="moon-signpost" href="/moon-builder/?from=memory-matrix">`。
  - 高 64 px、全宽、圆角 20。左侧 40×40 月宫图标，路径用月宫 `game.json` 的 `icon`。中间文字"记忆塔在月宫开张啦"，右侧"去看看 ›"。
  - 配色：背景 `rgba(255,214,102,.12)`，边框 `1px solid rgba(255,214,102,.55)`，文字 `#ffe7a3`（对比度约 12:1）。
  - 两种朝向都放在菜单面板顶部，菜单仍不能滚动（P8 断言）。只在菜单出现，游戏中不打扰。

**前 60 秒**：不改。他已经玩过，没有新玩家路径。新的记忆玩法入门由月宫 M4-01 负责（无字示范）。

**阅读负担**（冻结，如实记录）：

| 屏 | 字量 |
|---|---|
| 菜单 | 约 120 字成人说明（不读也能玩：点卡 → 点数字） |
| 选关 | 约 20 字 |
| 游戏状态行 | 每次 4–15 字（"认真看""轮到你了"） |
| 结果 | 约 20 字 |
| 路标 | 9 字 |

不加配音：旧页没有 narration，也不在冻结件上投入。

## 3. 核心循环与规则（Phase 0 版，逐条可测）

1. `startLevel(ladder, n)`：
   - 同一关（`ladder:n`）的尝试次数 `attemptCount` 加 1。切到别的关再回来，从 1 重新计。
   - 隐藏结果面板、重建棋盘、`scrollTo(0,0)`，350 ms 后进入展示阶段。
2. **展示**：用随机 `salt` 生成图案。和**上一局**相同就重抽，最多 8 次。亮格显示 `max(1200, previewMs)` ms，期间锁输入。
3. **作答**：
   - 点亮过的格子：变绿，按五声序列发音；全部点完即胜利。
   - 点没亮过的格子：立即失败，红抖动，显示全部答案，弹出结果面板（主按钮"重玩本关"）。
   - 已点过的格子再点：忽略。锁定期间点击：忽略。
4. **星级**：只看尝试次数，第 1 次 3 星，第 2 次 2 星，之后 1 星。存档里保留最好成绩 `max(新, 旧)`。不再有"分"。HUD 的"重玩本关"在作答中也能按，但会算一次新尝试（换新图案，偷看要付一颗星）。
5. **解锁**：通过第 n 关就解锁 n+1。4 条阶梯一开始全部开放（冻结，不改）。
6. **边界情况**（P4–P7、P12 覆盖）：
   - 展示中按"回到选关"：计时器清掉，输入保持锁定，不会迟到翻牌。
   - 展示中旋转屏幕：棋盘按新视口重算，仍然完整可见。
   - 胜利后马上点"下一关"：上一关的计时器已清除。
   - 旧存档里的 `bestScore` 保持原样，新纪录不写 `bestScore`。
   - 坏 JSON：回落到空进度，不覆盖原键，直到下一次胜利。

## 4. 内容（冻结；不新增）

- 4 条阶梯 × 40 关，由 `buildLevels` 线性插值生成：棋盘 3/4/5，块数 2→13，展示 2400→720 ms，Phase 0 后下限是 1200 ms。
- **已知缺陷，按决定不修**，因为内容已冻结，替代品是月宫 M4：
  - 146/160 关的图案多数是一整块连通形状；
  - 30/160 关亮块超过 50%；
  - 难度点只有 18 个，阶梯之间锯齿重叠。
- **续航不在这里**。月宫 M4 有 7 关（3→5 块，单色→双色，展示 ≥5 s），外加 `memory` 施工单 4 档 × 12 张、两关复习。≥6 周的要求由月宫满足。

## 5. 提示、失败、星级、元进度

- 没有提示阶梯（冻结）。失败时显示答案，"再来一次会换一个新图案"。
- 星级规则见 §3.4。
- **元进度 = 元老卡**（由月宫发放，本页什么都不发）：
  - 条件：旧存档里至少通关 1 关。
  - 卡面：标题"记忆方块元老"；大号"★ {stars}"；一行"通关 {cleared} 关"；事实句"你在记忆方块里得过星星！"。
  - 同时在基地记忆塔旁插"老玩家小旗"。
  - 发卡是确定性的、只发一次、永不收回。没有档位或排名，不做"再去刷星"之类的引导。
- 元老卡排在砍单顺序第 3 位。如果砍掉，家长页用同一个 `tally()` 列出"记忆方块旧存档：★S，通关 C 关"。

## 6. 美术

- 记忆方块本身：不加美术。
- **H6b**：`--text-muted` 的透明度从 .60 提到 .72。全部弱化文字的预测对比度从 4.40–4.80 提到 5.70–6.44。
- 路标：样式见 §2，用纯 CSS 加月宫已有的图标，不引入新素材。
- 元老卡卡面（月宫负责，代码绘制 SVG）：
  - 一张 4×4 的小盘，6 个金色格排成上升的台阶，致敬旧游戏。
  - 右下角放记忆塔剪影。配色用月宫卡片模板。
  - 动效沿用月宫知识卡的翻面：`--xg-motion` 标准缓动，400 ms。

## 7. 音频

- 记忆方块：不改。旧页保留自己的 AudioContext（`legacy-shell` 设了 `audio:false`），每页最多 1 个，smoke 测试有断言。
- 旁白一共 2 条，都在月宫的 yaml 里：

| id | 角色 | 文本 | 状态 |
|---|---|---|---|
| `moon.m4.veteran` | narrator | 记忆方块老玩家，欢迎回来！ | 月宫规格已有 |
| `moon.arrive.memory` | companion | 记忆方块搬进月宫的记忆塔啦！ | **新增**（CR-3），≤15 字，过 tone lint |

## 8. 技术设计

### 8.1 文件与归属

| 阶段 | 文件 | 改动 | 归属 |
|---|---|---|---|
| A | `site/memory-matrix/index.html` | **H6b**（两行）：`:root{--text-muted: rgba(200,200,255,.72)}`，`.ghost-btn,.primary-btn,.mini-btn{min-height:48px}` | 本游戏 |
| A | `site/memory-matrix/tests/phase0.spec.ts` | 从工具目录拷贝（P1–P12） | 本游戏 |
| A | `site/memory-matrix/phase0.test.ts`（vitest） | 移植 `level-audit.mjs`。读同一个 `index.html`；默认 500 个 salt × 100 次重玩（约 6 s），`MM_FULL=1` 时用 2000 × 300 | 本游戏 |
| B | `site/memory-matrix/index.html` | 加路标 `<a>` 和 CSS | 本游戏，与月宫翻 live 同一变更 |
| B | `site/memory-matrix/game.json` | 见下方 B 期 game.json | 本游戏 |
| B | `site/moon-builder/src/rules/veteran.ts` + `veteran.test.ts` + `veteran.cases.json` | 移植 `veteran.mjs` 和 10 个用例（CR-2） | 月宫 |
| C | 删除 `site/memory-matrix/`；`site/redirects.json` 加一条（§8.5） | — | 平台 |

B 期 `site/memory-matrix/game.json` 的改动：
- `parentNote` 改为："视觉空间记忆小练习（旧版，已冻结）。新版在月宫建造师 M4「看一眼就搭」；满足条件后本页跳转到月宫。"
- 新增 `"notes": "moon-builder live since YYYY-MM-DD (Stage B); retirement gate: specs/memory-matrix.md §0"`。

### 8.2 旧存档格式（只读契约）

- 键：`kid_games_memory_matrix_v2`。
- 结构：`{ ladders: { [id in sprout|explore|leap|galaxy]: { unlocked: 1..40, solved: { "<1..40>": { stars: 1..3, bestTimeMs?: number, bestScore?: number } } } } }`
  - `bestScore` 只出现在 Phase 0 之前写的记录里。Phase 0 之前的星数按速度给，之后按尝试次数给，两种都原样保留。
- 更早的 `memory_matrix_high` 只在 2026-03-01 存在约 3 小时（1aef7fd → 61408bd），**不迁移**。
- 大厅每次启动执行 `snapshotLegacyProgress()`，内容有变化就写 `kg:v1:legacy-memory-matrix`，格式为 `{v:1, updatedAt, data}`。

### 8.3 迁移契约（月宫实现；金标准是 `veteran.mjs`）

```ts
computeVeteran(liveRaw: string|null, snapshotRaw: string|null, prev?: Legacy, now?: number)
  → { legacy: { memoryMatrixStars: number; memoryMatrixCleared: number; source: 'live'|'snapshot'|'none'; awardedAt?: number },
      awardNow: boolean, changed: boolean }
```

- **`tally`**：
  - 只认 4 个阶梯 id；关键字必须匹配 `/^[1-9][0-9]?$/` 且在 1..40 之间；记录必须是对象。
  - 每条记录计 1 关通关；星数取 `clamp(floor(Number(stars)), 0, 3)`，NaN 计 0。
  - 结果上限 480 星、160 关。
- **合并**：`stars = max(prev, live, snapshot)`，`cleared` 同样取最大。`awardedAt` 在第一次出现 `cleared ≥ 1` 时写入，之后不再改；只有这一次 `awardNow = true`。
- **调用时机**：月宫**每次启动**，在 `store.load()` 之后、首帧之前调用，耗时 ≤2 ms。
  - `changed` 为真时存档。
  - `awardNow` 为真时：
    - `cards` 加 `veteran`、`base.decor` 加 `veteran-flag`，两者都先查重；
    - 下次进入 M4 时播一次 `moon.m4.veteran`；
    - 基地视图给小旗一次 `unlock` 动画。
  - `flags.veteranChecked` 只表示"至少评估过一次"，不再拦住重算。
- **禁止**：写入、改名、删除任何旧键；按旧星数解锁任何玩法内容（M4 仍按月宫规则在 M1-03 后开放）。
- `MoonSaveV1.legacy` 的类型改成上面这个结构。月宫存档还没上线，所以不需要升版本；如果已经上线，就升 v2 并写迁移。

### 8.4 退役状态机与闸门

```
A(frozen) ──月宫 live 的发布──▶ B(coexist; notes 记 live 日期)
B ──[live+56d 起每 14 天，以及 CP2、CP3] retire-check──▶ REDIRECT ? C : 留在 B
C(retired) 终态（反悔：删掉 redirects.json 那一条并恢复目录；302 没有缓存包袱）
```

- **数据来源**：
  - 家长页"导出进度"（kit `downloadProgress()`）生成的 JSON；其中 `kg:log:v1` 的会话记录包含 `game`、`source`、`start`、`activeMs`。
  - 运行：`node retire-check.mjs export.json --moon-live YYYY-MM-DD --cherished no --veteran-confirmed yes --moon-dod yes`。退出码 0 = 跳转，2 = 保留，1 = 输入有误。
  - 家长页上线之前没有导出 → 前置条件不满足 → 保留。默认安全。

### 8.5 C 期平台变更清单（一个提交）

1. 删除 `site/memory-matrix/` 整个目录。
2. 在 `site/redirects.json` 追加：`{ "from": "/memory-matrix", "to": "/moon-builder/?from=memory-matrix", "status": 302, "force": true, "note": "记忆方块并入月宫 M4（dad decision 5；gate passed YYYY-MM-DD）" }`。`buildRedirects` 会生成 `/memory-matrix` 和 `/memory-matrix/*` 两行 `302!`。
3. 不改 `LEGACY_KEYS`、`snapshotLegacyProgress`、`exportProgress` 和 SW 模板。预缓存会根据注册表自动去掉这个页面。
4. `npm run check` 全绿；`dist/_redirects` 里的这两行和上面一字不差（单测在 `tests/unit/registry.test.ts` 加一条，平台负责）。

### 8.6 对其他规格的变更请求

- **CR-1 `moon-builder.md` §8.9 和 §11 风险表"平台"行**：删除"live 同一变更删目录 + `redirectFrom`"，改为"记忆方块退役按 `memory-matrix.md` §0/§8.5（302!，有闸门）"。月宫 `game.json` 不要 `redirectFrom`。
- **CR-2 `moon-builder.md` §5.5 / §8.7**：迁移改为 §8.3 的每次启动幂等重算，读活键和快照、取最大值；卡面显示通关数；移植 `veteran.mjs` 并带上 10 个用例；E2E 增加一项：注入用例 2 的存档后启动，知识卡页显示"★ 42 · 通关 15 关"，基地记忆塔旁有小旗。
- **CR-3 `moon-builder.md`**（可砍，砍单时第一个砍）：
  - 收到 `?from=memory-matrix` 时，开始门之后由伙伴说 `moon.arrive.memory`，每次进入最多一次。
  - M4 已解锁：镜头飞到记忆塔。M4 未解锁：照常走首玩流程。
  - 之后用 `history.replaceState` 去掉查询参数，刷新不会重复。
- **CR-4 平台家长页**（元老卡被砍时的兜底）：用同一个 `tally()` 显示旧存档的星数和通关数；"导出进度"按钮是闸门的数据来源。

## 9. 验证方案

### 9.1 离线校验（node，不开浏览器）

| 检查 | 命令 | 门槛 | 现状 |
|---|---|---|---|
| A1 阶梯形状 | `node level-audit.mjs` | 4 × 40，id 不变 | PASS |
| A2 展示下限 | 同上 | 160/160 关 `previewMs ≥ 1200` | PASS（最小值 1200） |
| A3 重玩换图 | 同上 | 最坏 P(与上一局相同) <1e-6；模拟 48 000 次，连续重复 0 次 | PASS（1.55e-8；0） |
| A4 生成器确定 | 同上 | 同一个 salt 得到同一图案 | PASS |
| V 迁移 | `node selftest.mjs` | 10 个用例 + 幂等 + 7 种恶意输入不抛错 | PASS |
| R 闸门 | 同上 | 11 个用例，阈值 56/28/3/30 s | PASS |

### 9.2 Phase 0 回归（Playwright WebKit，`npm run test:smoke` 自动带上，竖 810×1080、横 1080×810，DPR 2，触屏）

先检查内存：`memory_pressure -Q | tail -1` 低于 25% 就等待；只开一个浏览器；跑完不留服务器。变体：原生；`safe24`（注入 24 px 顶部安全区，并让棋盘公式同步扣掉）；横屏另跑 1133×744。

| # | 断言（数字门槛） |
|---|---|
| P1 | 萌芽 1（3×3）、萌芽 21（4×4）、银河 40（5×5）的展示阶段：`scrollY = 0`；**每个格子**（不只是亮格）完全在视口内（容差 0.5 px）；格子短边 ≥64 px；🏠 和棋盘不相交；游戏中 `.hero` 是 `display:none`；0 个控制台错误 |
| P2 | 胜利后：主按钮完全在视口内，高 ≥56；首次就过是 3 星；结果区不出现"分"；存档 `stars = 3` |
| P3 | 失败后：答案格都是 `showing`，每格可见 ≥90%；"重玩本关"完全可见；点它之后 `scrollY = 0`，图案和上一局不同，胜利得 2 星 |
| P4 | 作答中按 HUD"重玩本关"会换图，再胜利得 2 星；失败两次后第 3 次胜利得 1 星；存档只升不降 |
| P5 | 萌芽 5 连续开 30 局，相邻两局图案都不同 |
| P6 | 银河 40 亮格实测持续 ≥1150 ms，HUD 显示"1.2 秒"；160 关 `previewMs ≥ 1200` |
| P7 | 展示 200 ms 时点"回到选关"：2.5 s 后停在选关页，`inputLocked = true`，0 个错误 |
| P8 | 菜单和选关页的 `scrollHeight ≤ innerHeight + 1`（原生 + safe24 + mini） |
| P9 | 载入 Phase 0 之前的存档（用例 2）："已完成 15 / 160 关"，萌芽和探索的星数是 36 / 6；新赢一关不写 `bestScore`，旧记录逐字不变 |
| P10 | **像素实测对比度 ≥4.5:1**：卡片 h3 / desc / meta / pill、`.small-muted`、HUD、状态副标题、`.attempt-note`、结果说明。做法：隐藏文字截图，取文字框下背景的中位数，再把计算色按 alpha 叠上去 |
| P11 | 大厅生成 `kg:v1:legacy-memory-matrix`（4 个阶梯、萌芽 12 条）；从大厅卡打开后 `kg:log:v1` 记录 `source = 'hub'`；旧键逐字不变 |
| P12 | 展示中旋转（交换宽高）后整块棋盘可见；所有可见按钮高 ≥48 px（不含格子、关卡钮和阶梯卡） |

- **截图**（两个朝向都要人看一遍）：`memory-matrix-phase0-{native,safe24,mini-1133x744}-preview-{sprout1,sprout21,galaxy40}`、`-win`、`-miss`、`-levels`、`-levels-mini`。存到 `~/kid-games-work/shots/foundation/<project>/`。
- **H6b 之前的预期**：P10 的 desc 和 attempt-note 处在约 4.4–4.6 的边缘；P12 的 HUD 按钮（约 32–42 px）不过。H6b 之后应全部通过。如果 P10 仍有不过的，只允许继续把 `--text-muted` 提到 .80，不改其他设计。

### 9.3 C 期检查

1. `npm run check` 绿；`dist/_redirects` 里有 `/memory-matrix  /moon-builder/?from=memory-matrix  302!` 和 `/memory-matrix/*  …  302!`。
2. 大厅没有记忆方块卡；`dist/sw.js` 的 PAGES 里没有 `/memory-matrix/`。
3. 跳转只能在 Netlify 上验证（`vite preview` 不读 `_redirects`）：
   - 爸爸在发布之后，用 Safari 打开 `/memory-matrix` 和 `/memory-matrix/index.html`，都应落到月宫，地址里没有 `from` 参数（CR-3 会把它去掉）；
   - 主屏 App 里，元老卡和星数不变；
   - 导出进度包里 `kid_games_memory_matrix_v2` 不变。

### 9.4 iPad 手动清单（iPad 9 代，主屏 App。注意：Safari 和主屏 App 的存储是分开的）

- **A**（Phase 0 发布后）：
  - 横竖屏各玩一关银河 40：展示时不用滚动就能看全；胜利和失败后的按钮都在屏内；
  - 展示中转屏，棋盘仍完整；
  - 有声音（开着静音键时不要求）；
  - 菜单 4 张卡的"累计星星"之和与发布前一致。爸爸在发布前拍一张菜单照片，作为 P3 的基准。
- **B**：
  - 点路标进入月宫；
  - 知识卡里的元老卡 ★ 等于基准照片里 4 卡之和，通关数等于"已完成 N"；
  - 记忆塔旁有小旗；
  - 回到记忆方块再赢一关，重进月宫，★ 随之更新。
- **C**：见 §9.3 第 3 条。

## 10. 完成定义、风险、工作量

**DoD**：
- A：§9.1 全 PASS；P1–P12 在两种朝向全绿；截图人工看过；H6b 合入；`npm run check` 绿。
- B：路标在菜单内且菜单不滚动；月宫 CR-2 的单测和 E2E 绿；`notes` 写明上线日期。
- C：闸门输出 REDIRECT（或爸爸书面推翻 D1/D2，但 P1–P3 必须满足）；§9.3 全过。

**风险与缓解**：

| 风险 | 缓解 |
|---|---|
| 生产域名或主屏 App 变了，本地存档丢失（元老卡无从谈起） | 不改 Netlify 站点和域名；家长页导出作为备份；迁移读快照兜底 |
| 并存期新得的星星漏算 | CR-2 每次启动重算并取最大值 |
| 301 被缓存，无法反悔 | 只用 `302!` |
| 记忆方块其实是他的心头好 | 有 D1/D2 闸门，保留成本为 0 |
| 对比度测量受星空抖动影响 | 截图前暂停动画，取中位数 |
| 内存紧张导致测试被看门狗杀掉 | 单 worker，先查 `memory_pressure` |

**工作量**：
- A：S，约半天（两行 CSS、拷测试、跑一遍并看截图）。
- B：S，约半天，其中月宫迁移移植约 2 小时。
- C：约 1 小时，加爸爸发布后核对 10 分钟。
