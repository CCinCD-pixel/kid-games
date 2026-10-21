# 验收草稿 · 火星基地（mars-base，旧"数字探险家"重建）— 构建 session 5（2026-10-20，最终数字）
> 草稿：本轮未提交、未推送、未生成配音音频。`docs/ACCEPTANCE-mars-base.md` 由构建代理起草；协调者合并时可改写。规格见 `docs/specs/mars-base.md`（附录 E = 偏差与配音步骤）。

## 1. 范围（对照规格 §0A / §10）
| 项 | 状态 |
|---|---|
| 数据、题族（90 个 family 定义，其中 v1 用 52 个）、纯逻辑核心、存档 v5 + 迁移、校验器 V1–V6、V8、V13、V14 | 完成（session 1–2） |
| 壳：地图（建筑随存档升级）、章节图、任务运行器（H0–H3 提示阶梯、对质演示、`？`再看一遍、三错 H3 + 孪生题、空交付不计）、收尾卡 + 建造动画、家长页（长按标题 3 秒 + PIN）、档案馆（你的轨道图）| 完成 |
| 舞台：数轴（放置 / 读数 / 校准 / 两步放大）、晶体托盘（搭 / 装 / 加 / 减，含借位）、千晶计数器 + 听写 + 排队 + 跳数、乘法舱（分组 / 阵列 / 转一转 / 跳数 / 拆分）、比大小、竖式图 | 完成（45 个题族 / 46 个变体可玩并被 V10 审计，见 §2）|
| 徽章站：三块牌 + "去练" + **"一起验货"**（一次任务验完所有没亮的牌；刷新后恢复） | 完成（本 session 补完并上了浏览器测试）|
| 认证：嵌入式验货（每任务 3 热身 + 1 验货单，一次作答，延迟反馈）+ 补救章 C1–C3 | 完成 |
| 区：数轴轨道 / 徽章站 / 千晶大仓 / 生产线（P1、P2）| 完成；**天平区（9 个节点中的 8 个）、谜题舱（1 个）、火箭赛道未建**——地图上是"空地"，点它只说"还没建好"（规格附录 E.1） |
| 配音 | **未生成**。台词 + 字幕全部就绪，静音 + 字幕可完整玩；TTS 集 1368 条（340 句 + 27 片段 + 1001 数字），16 条模板句不合成；12 块批处理 + `full` 已在 `~/kid-games-work/voice-stage/mars-base/` 备好（规格附录 E）|
| 5 个合成音效（`mars.press/cut/crystal/orbit/meteor`）| **未做**（只用 kit 已有音效）|

## 2. 自动化验证（本 session 最终数字）
- `npx tsc -p site/mars-base/tsconfig.json`：0 错误（含 `e2e/`）。`MARS_FULL=1 npx vitest run site/mars-base engines/manip`（含全量模拟 / 校验器）：**216 通过 / 15 文件**（246 s；比 session 4 多 `art/crystals.test.ts` 5 项）。kit `tests/unit`：118/118。校验器数字沿用 session 2（首试 strong 83.0 / medium 81.0 / weak 76.6 / knows100 81.6 / linear100 82.7 %，覆盖 68/68，第 18 次访问前 0 人耗尽），本 session 的 `MARS_FULL=1` 全量复跑全部通过。
- **V10 Playwright WebKit 矩阵**（`tools/mars-base/e2e-all.sh`，范围内生产包，一次一个浏览器；日志 `~/kid-games-work/state/rr/e2e/prev/run-s5-final.log`，修完泄漏 / 数的图 / 拖旗后的**最终代码**整跑一次，2026-10-19 23:57 → 00:35，约 37 分钟）：九个项目 = 六视口（iPad 竖 810×1080、横 1080×810；iPhone 13 390×664；SE 320×568；手机横 844×390）+ 注入边距（手机横 0,47,21,47；主屏竖 390×844 47,0,34,0；iPad 竖/横 24,0,20,0）。每项目：`layout`（**112 屏、46 个题族变体、45 个题族**；区域 = `computeLayout` ±1 px、两两不相交、命中框 ≥44 / 键 ≥72、无滚动、文字不裁、无 fallback 舞台）· `numline`（5 个真拖旗位、放大镜 ⊂ 舞台∩视口、不盖订单卡、DOM 只露锚点数字）· `wall` · `screens`（地图 / 4 个章节图 / 徽章站 / 档案馆 / 家长页）；四个行为项目（ipad-l / phone-p / se / phone-l-inset）再跑 `behaviour`（无声、AudioContext ≤1、解码 ≤48 MB、存档 v=5、三探针、旋转 / 返回 / 刷新保持任务、SW 离线重载）与 `glyphs`；ipad-l 另跑 **`soak`**（见下）。**结果：全部通过，0 失败**：ipad-p 4（+1 跳过）· ipad-l **26**（13 + soak 13）· phone-p 13 · se 13 · phone-l 4（+1）· phone-l-inset 12（+1）· phone-pwa-p 4（+1）· ipad-p-inset 4（+1）· ipad-l-inset 4（+1）；"跳过"= 只在行为项目上跑的变体。
- **V11 内存持平闸门（本 session 过）**：`e2e/soak.spec.ts`（Chromium + CDP，GC 后第 5 → 28 轮的增量；门槛 DOM 节点 ≤60、监听器 ≤60、堆 ≤3 MB）。**全部屏型 / 舞台型：节点 0 / 监听 0**（任务玩 3 题 −49 / −2）：地图 0/0/0.06 MB · 章节图 0/0/0.08 · 徽章站 0/0/0.03 · 档案馆 0/0/0 · 家长页 0/0/0.03 · 一起验货 0/0/0.05 · 建造动画 0/0/0.01 · 任务开关（6 类舞台）0/0/0.18 · 任务玩 3 题 −49/−2/0.11 · 整任务到结果卡 + 建造（12 轮）0/0/0.10 · **全部 166 个舞台签名挂载-操作-销毁 28 轮 0/0/0.12** · **反例**（每轮故意钉住一个句柄）+1089 节点 / +117 监听 → 闸门正确报错。`perf.mjs` 混合旅程 soak：0 / 0 / 0.30 MB。**根因**：第 3–4 个 session 的"+13 453 节点"主要是测量假象（soak 循环里 `waitForSelector` 返回的 ElementHandle 钉住每个被替换的屏幕；读数前没等计时器）；真泄漏只有 kit `bindPress`（`nodeMap` 每次进章节在 window 上留两个监听 + 整个章节图）—— 已在 `kit/ui/xg.ts` 修（规格附录 E）。
- **本 session 由闸门 / 目测抓到并已修**：SE 任务屏崩溃（舞台两次挂载选择不一致）、章节图节点堆叠、徽章站 / 地图屏在 SE 与手机横屏的重叠、5 个题族的空白舞台（详见规格附录 E）。
- **V11 体积**（`tools/mars-base/budget.mjs`）：入口 JS **74.4 KB gzip**（预算 90）· 含懒加载 75.6（180）· CSS 7.3（24）· 运行时 JSON 20.4（60）。**性能**（`perf.mjs`，Chromium + CDP 4× 降速，静音）：地图首绘 **32–33 ms**（≤120）· 拖旗帧 p95 **16.7–16.8 ms**（门槛 16.7 + 0.6 ms 显示时钟抖动：无头 Chromium 的帧时钟在 16.6–16.8 之间摆，同一份代码读到 16.7 或 16.8 是随机的 → 原来"恰在 16.7"的闸门会假失败；**真余量用新闸门量：拖旗主线程忙时 ≤8.3 ms/帧（半帧），实测 2.1–2.7 ms**，改前 3.0）· 托盘输入反馈 p95 **30 ms**（≤100）· DOM 最多 **593** 节点（≤1500）· 单 SVG 形状 171（≤400）· 解码音频 3.1 MB（≤48）· 任务屏静止 rAF **0** · soak 0 / 0 / +0.30 MB。WebKit（不降速，第二意见）：首绘 34 ms · 拖旗 p95 18 ms（WebKit 计时器按整毫秒走，门槛 +1.5 ms；中位 17 = 60 Hz）· 反馈 31 ms · DOM 593，全 ok。**拖旗优化**（`engines/manip/numberline.ts`）：`pointermove` 不再每次整段 `innerHTML` 重建 + 立刻 `getBoundingClientRect()`（强制同步布局）→ 每帧最多重建一次（rAF 合并）、一次拖动只读一次轨道矩形；`.nl` 加 `contain: layout style`。
- **V12**：色板（CIEDE2000，Machado 三类色觉，3 组：托盘部件 / 反馈 / 轨道晶体）**全部 ≥12，最小 12.3**（tritan 下 对/提示）；字集：`tools/fonts/patch-subset.mjs --check --extra <三份屏上汉字>` → 缺 3 字（咦孪琶），**全部来自 `content/chess`，与火星基地无关**。
- 配音：`emit-narration.mjs --scope v1 --count` = 1368 条（340 句 + 27 片段 + 1001 数字，16 条模板句不合成），门槛通过；`voice-plan.mjs` 已分 12 块 + `full`；**没有生成任何音频**。全部浏览器运行都静音（kit 自动静音 + `tools/qa/mute-audio.js` 初始化脚本；`h3.mjs` / `screens.mjs` 本 session 补了显式静音；`perf.mjs` 另加 `--mute-audio`）。

## 3. 截图（我亲眼看过）
`~/kid-games-work/shots/rr/mars/final/`（本 session，iPad 竖屏 810×1080 @2x WebKit，**全尺寸逐张看过**）：`pv2.step.png`（59 + 1：5 棒 9 颗，对）、`pv3.step_T.png`（299 + 1：2 箱 9 棒 9 颗，对）、`pv3.round.png`（935 大约几百？：**修之前画成 4 箱 3 棒 5 颗 = 435（箱数封顶 4 的 bug）**，修后 9 箱 3 棒 5 颗，两行居中）、`pv3.addHund.png`（200 + 800：**修之前右边只有 4 箱**，修后 2 箱 + 8 箱、同一件尺寸）、`rel.compare.png`（大的 61，小的 35：6 棒 1 颗 ｜ ? ｜ 3 棒 5 颗，居中、同尺寸，未知量不画）、另有 `pv2.step_T / pv3.step / pv3.step_H / pv3.addHund_T / rel.compare_T`。早先 session 的：`~/kid-games-work/shots/rr/mars-s4/`（徽章墙五个状态、iPad 竖屏 50 屏联系表、修前的空白舞台 / SE 屏 / 章节图、修后对照）。每个视口的逐屏截图在 `~/kid-games-work/shots/rr/mars/e2e/<项目>/`（题族每变体一张 + `screen_*` + `wall_*`）。

## 4. 偏差与已知问题（诚实）
见 `docs/specs/mars-base.md` 附录 E。补充：
- **本 session 看图抓到并已修的真 bug**：`partsSvg` 把"箱"封顶为 4 个——凡是 ≥500 的数（`pv3.round` 935、`pv3.addHund` 800、`pv3.read` 抽象版、对质演示）画出来的比数字少，图和题不符。现在每件都画（`art/crystals.test.ts`：0…1000 每个数的件数 = 数字）。两个数并排用同一件尺寸。上一版说的"数的图只看过缩略图"已补：5 个抽象题舞台逐张放大看过。
- 章节图在长章节上会滚动（手机长边、iPad 横屏）；进入时自动滚到当前节点。
- 数字旁白：模板句不合成成句子 clip（规格附录 E.9）。
- 偏差：拖旗帧 p95 的闸门从"≤16.7"改为"≤16.7 + 0.6 ms 时钟抖动"并新增"主线程忙时 ≤8.3 ms/帧"（原闸门对同一代码随机红 / 绿）；顺序上先做拖旗优化与数的图修复、**最后**整跑矩阵，所以矩阵只跑了一次（最终代码）。
- 没有真机数据（§5）；配音未生成；天平 / 谜题 / 赛道未建（附录 E.1）。

## 5. 需要真 iPad 的（爸爸的清单，≤20 分钟；Playwright WebKit 做不到）
1. **静音键开着时是否仍有声**（规格 §9 的要求，音频一出来就要在真机确认 iOS 的音频会话策略）；切 App 再回来：题没丢、声音不卡死。
2. **拖旗 + 放大镜手感**：手指在屏上时放大镜是否遮住订单卡、手指移动的跟手程度（Chromium 4× 降速只是近似 A13）。
3. 手掌搭屏幕（掌拒）/ 双指误触：键盘、托盘搬运、数轴三类输入。
4. **旋转**：竖 ↔ 横，任务中途旋转，题目与托盘内容不丢；主屏 App（全屏）下的真实安全区（竖 47/34、横 47/21，我们只用注入值测过）。
5. 数字读音：**音频生成后**抽听 20 个数字 + 30 句（规格 §7.2、§9 V9）；现在只有浏览器语音回退，没有听感可验。
6. 低电量模式下动画（建造、对质演示）是否仍流畅；内存与发热：连续玩 15 分钟的机身温度、页面是否被系统回收。
7. 一个完整任务停在收尾卡再回来；断网后从主屏图标打开（SW 离线，Playwright 已验证脚本 / 样式 / 清单都在缓存里，真机还要验证 iOS 对缓存的回收）。
8. 首次会话录屏（孩子的前 90 秒：用时、无效点击、求助）→ 修最差 3 处；试玩后看家长页的首试率，对照 `tuning.ts`（规格 §9 试玩调参）。
9. **知识卡签字**：24 张卡 + 行星距离已由代理对照 NASA / JPL 等来源核对（`verified:'agent'`，来源写在 `cards.json` 的 `sources`；孩子看到的与 verified 一样）。爸爸读一遍后把每张的 `signed` 改成 `true`（天问一号 / 祝融号 / 长征五号三处用的是维基百科，CNSA 一手页没抓到，请重点看）。
10. 家里的规矩对照：数轴"不给读数、不给计数通道"在孩子手里是否真的难作弊（他会不会数刻度）。

## 6. 给协调者的请求
- kit：见 `~/kid-games-work/state/rr/kit-requests-mars.md`（本 session 复查：`.kit-back` 令牌与 `nodeMap skipped` 已落地；仍开着：`fragment` 档、无清单模式、`MetricDef.data()`、5 个合成音效）。
- `public/icons/games/mars-base.svg`、`game.json` 的 `status:"wip"` → 上线那一次提交再改 `live` + `redirectFrom:["/number-adventure"]` + 删 `site/number-adventure/`（规格 §8.8）。
- 上线前：用生产包（根 build）跑一次 `npm run test:smoke`（本轮没有做，`site/mars-base/tests/stages.spec.ts` 已写）。


## 7. QA 第 1 轮修复（fix-mars-r1，session 1）— 状态
详见 `docs/specs/mars-base.md` 附录 F。要点：开场演示 / 探针续做 / 减法题面 / 结果卡星星与轨道图 / 知识卡（24 张核对 + 档案馆）/ 任务屏世界感 / 空地反应 / 结果卡宽度（kit）/ 数轴按钮与 pointercancel / 坏存档修复 / 配音组合 / **挑战订单** 全部已做并有回归测试。
- **挑战订单：已建（v1 最小版）**：`app/challenge.ts composeSet`，9 题、自适应、无币；地图在主线做完时出入口；未做：每区各自的 Boss 混合挑战（只做了全局一种）、"每日补给"（复用 `composeSet`）。火箭赛道、称重台（8 节点）、谜题舱仍未建（地图上是脚手架 + "建设中"）。
- TTS 集 **1379 条**（350 句 + 28 片段 + 1001 数字，17 条模板句运行时组合）；仍未生成音频。
- 新增测试：`validate/{prompts,resume,repair,twin,compose,challenge}.test.ts`，`e2e/result.spec.ts`，`numline.spec` 两处扩展。
- 爸爸清单新增：知识卡签字（上面 §5 第 9 项）。

**数字（fix-mars-r1 session 1 终态）**：`MARS_FULL=1 npx vitest run site/mars-base engines/manip` **255 / 255**（21 文件，264 s；本轮新增 `prompts`（8 项，每个已建题族 × 每档 × 每 ask 抽样）· `resume`（4）· `repair`（含 400 次模糊）· `twin`（20 种子 × 全部节点主槽，≥97 % 特征匹配）· `compose`（10）· `challenge`（5））· kit `tests/unit` **118 / 118** · `tsc -p site/mars-base` 0 · `tools/check-content.mjs` OK · 字体检查仅 咦孪琶（chess）· **V10 九投影矩阵 0 失败**：ipad-p 7 · ipad-l **29**（含 V11 soak 13，节点 / 监听 +0 / +0）· phone-p 14+2 · se 14+2 · phone-l 7 · phone-l-inset 13+2 · phone-pwa-p 5+2 · ipad-p-inset 5+2 · ipad-l-inset 5+2（"+2" = 之后补进脚本的 `result.spec`，已在每个投影上单独跑过；`e2e-all.sh` 现在默认包含它）· `budget.mjs`：入口 JS **83.7 KB gzip**（预算 90，原 74.4）· 含懒加载 84.9 · CSS 9.0 · 运行时 JSON 22.4。
截图（逐张看过）：`~/kid-games-work/shots/rr/fix-mars/`：`onb-2-hand-mid` `onb-3-flag-at-30`（手带着旗到 30，放大镜在）· `map-*-plot-tap`（脚手架 + 气泡）· `mission-{orbit,vault,factory,cert}-{ipadP,ip13}`（顶栏区徽 + n/总数、底栏名牌、舞台垫子）· `result-node-se` `result-calib-ipadP`（无空星、轨道图）· `kit-*-*`（5 个别的游戏 × 3 视口 结果卡）· `hop-mid`（"10 棒 → 1 箱"）· `challenge-{map,mission,result}-*` · `archive-*` `badges-*` · `firstlight-1`。
没有做 / 未核实：kit 开始页（门）的基地剪影；H2 在计数器 / 仓舞台上是否可见预填（未复现）；压棒动画在真 iPad 上的帧率；每区各自的 Boss 混合挑战。
