# engines/board — STATUS（维护者：engines-board build 任务，唯一所有者）

ALL FROZEN

S0: FROZEN
S0b: FROZEN（core/search · errormodel · see · coach · hints · stateadapter）
S1: FROZEN（view + input + 布局类型 + art/shade+bake + 游乐场 site/dev/board；WebKit 4 视口端到端全绿）
S2: FROZEN（ai/host + handler + worker-entry + protocol；假 Worker + 回环；游乐场电脑对手走真 Worker）
S3: FROZEN（save/adapter · play/{states,session,facetoface,recorder,replay,reasons} · puzzle/{validate,audit,player（含选择题）} · lesson/{registry,common,fen,solo,battle,step-ui,steps(15 种步型),player,twins,ghost} · test/{pw,diff,calibrate}）
S4: FROZEN（art/shade + bake；烘焙像素取样测试；体积预算测试；游乐场中文原因映射）
> 追加变更 = 只加不改（additive）；破坏性变更走 `~/kid-games-work/state/rr/engine-requests.md`。游戏代理可以全部使用。

## 数字（2026-10-13）
- `npx vitest run engines site/dev`：**429 通过 / 4 跳过**（跳过 = `XQ_FULL` 才跑：差分 300 局、B1/B3 小战场求解、天梯校准）；`XQ_FULL=1` 实跑：差分 **43 391 个局面 0 不一致**（vs `@weshell/xiangqi.js`）、B1/B2/B3 par = 6/6/6 与数据一致、校准冒烟通过。
- `tsc`：`npx tsc --noEmit -p tools/board/tsconfig.json` 无错；根 `tsconfig.json` 在 engines/board、site/dev/board、tests/board、tools/board 范围内无错。
- WebKit（端口 5326，4 视口 ipadL / ipadP / phoneP / phoneL）：游乐场 **92/92**；课 `lesson.spec.ts`（L03 摆子、L04 收星、L17 将军 + 选答案、L22 吃一个看赚亏、L24 小眼睛、走错悔回 + H1、取消课）；`art-contrast.spec.ts` 烘焙像素对比度（红子最差 4.77、黑子最差 4.85，≥4.5）。
- 体积（`size-budget.test.ts`，Vite 程序化打包、入口全部导出不摇树）：通用核心 **38.9 KB gzip**（预算 60）；Worker 包 **9.2 KB gzip**（含一份象棋参考规则；预算 50）；无 barrel；Worker 包里没有 view / input / lesson / puzzle / play / save / art / calibrate。

## 已冻结（改动 = 破坏性）
- `core/types.ts`：契约（GameRules / Game / Geometry / Effect / Theme / PieceSprites / BoardView / InputController / AiHost / ErrorModel / CoachPolicy / StepBase / Puzzle / FaceToFace …）。
- `core/game.ts`：`createGame(rules, startFen?)`、`replayMoves(rules, startFen, texts)`。
- `core/rng.ts`：`createRng(seed)`（与 `@kit/rng` 逐位相同）、`hash32`、`keyHash`。
- `core/search.ts`：`Searcher<M>`；`core/errormodel.ts`：`createErrorModel<M>()`、`softmaxPick`、`easyOf`、`shouldResign`（抽签顺序已校准，不要改）。
- `core/see.ts`（`see / seeFull / netCapture / bestGain / bestGainPair / mateIn1Moves / hasMateIn1 / threatAfter`）· `core/coach.ts` · `core/hints.ts`（`createHintLadder / createIdleTimer / autoTier`）· `core/stateadapter.ts`（`stateSearchAdapter(rules)`）。
- `test/conformance.ts` + `test/run-conformance.ts`：16 项 C01–C16，**每个 GameRules 适配器必须全绿**：`runConformance(createRules(), { fens, noKing, obstacle, perft, fenKey, randomGames, maxPly })`。`test/reference/*` 是象棋 / 国象**原型**适配器（夹具，真实规则在 `games/<id>/`）。

## import 路径与用法（`@engines/board/...`）
- **规则 / 对局 / 搜索**：`core/*`。
- **视图 / 输入**：`view/board-view.ts`（`createBoardView`）· `view/promotion-picker.ts` · `view/layout-types.ts` · `input/input-controller.ts`（`createInputController`；`overrideHooks({ state, seatToMove, canAct, commit, onIllegal, onSelect, rawTap })` 供课与谜题接管输入；**设了 `rawTap` 时 pointerdown 不再选子 / 拖动，抬手只交给 rawTap**）。
- **对局**：`play/session.ts`（`createSession`：Game + 视图 + 输入 + AI 的完整循环）· `play/facetoface.ts` · `play/recorder.ts` + `play/replay.ts` · `save/adapter.ts`（`createBoardStore`）· `play/reasons.ts`（`createReasonText(overrides?)`：把 `whyIllegal` / `Outcome.reason` 的英文原串翻成中文；引擎状态里永远是原串，显示处用它；游戏可追加 / 覆盖词条）。
- **AI**：`ai/host.ts`（`createAiHost`、`fromWorker`）· `ai/worker-entry.ts`（`registerAiWorker`）· `ai/handler.ts`（`createAiHandler(plugin, { fallback: true })`）· `ai/protocol.ts`（`AiPluginExt`）。
- **课**（`lesson/`，字段名 = `lessons.mjs` 最终 schema）：
  ```ts
  import { createLessonPlayer } from '@engines/board/lesson/player';      // import 即注册全部 15 种步型
  import { createStepUi } from '@engines/board/lesson/step-ui';             // 缺省 DOM 答题界面（可整个替换）
  const ctx = { rules, view, input: session.input, ai, hooks, hints: createHintLadder(), ui: createStepUi(view), data: myLessonData, wrongHoldMs: 600 };  // 必须是 plain object（播放器会 {...ctx} 派生）
  const player = createLessonPlayer(ctx, { askOptional: async (s) => askKid(s), onStep: (e) => hud(e) });
  const r = await player.run(lessonDef, savedProgress);   // { stars, results[], completed }；player.cancel() 立刻放手输入
  ```
  - `hooks = { narrate(id), companion: { mood, say }, sfx(name), ghost（createGhost）, save(progress), skip() }`。走错说原因 = `hooks.narrate('w.' + whyIllegal 原因)`；提示旁白 `h.1.*` / `h.2` / `h.3`（`data.hintSay` 可改）。
  - 步型：`tap quiz setup`（steps-ask）· `stars capture sweep escape make trade`（steps-move）· `demo card bank bank2 battle play`（steps-flow）。字段见 `test/fixtures/xq-lessons.v1.json`；`quiz.q` = `palace moves attackers`（点格子）/ `incheck mated stalemate recapture trade safe`（按钮选答案，选项与文案见 `steps-ask.ts` 的 `CHOICES`，`data.choices` 可覆盖）。
  - **红方连走**：stars / capture / sweep / escape / make / trade 里黑子静止，每步后走子方被拨回红方（`lesson/solo.ts` 的 `forceSide`）；`lesson/solo.ts` 的 `solve()` 是 BFS（par 校验与运行时提示共用）。走进死胡同（再也吃不到 / 收不齐）按"走错"处理，悔回。
  - **走错处理**：说原因 → 走过去看一眼 → 悔回 → 连续 2 / 3 / 4 次 H1 / H2 / H3（`ctx.hints`）；小眼睛按钮 `ui.button('小眼睛')`（sweep）铺 `sight` 标记 1 s；trade 吃亏时黑子回吃 + `ui.chip(sq, net)` 飘筹码。落子动画一结束就放开输入锁，"看后果"的长尾在 `busy` 保护下继续（dev 的 2 s anim 看门狗不会误触发）。
  - **孪生**：选答案类 quiz（以及选项 ≤3 的点选题）首次对也要孪生也对才 ★★★；其余步型走错后给镜像孪生再做一次（`twins.ts`：`mirrorStep` / `twinOf`；无 `pos` 的 puzSel 题用 `data.position(step)`）。连续 2 步首试没对 → 下一步先亮 H1（`ctx.assist`）。
  - **数据钩子 `LessonData`**（全部可选）：`position(step)`（puzSel 等无 pos 的步骤）· `setup(part, step)`（摆子：`{ base, place: [[格名, 字符]] }`）· `puzzle(id, step)`（bank / bank2 取题）· `choices(q)` · `play(step, ctx)`（整盘 / 小局，交给游戏）· `battle: { pawn, king }` · `hintSay(step, tier)`。**参考接入**：`test/xq-lesson-core.ts` 的 `makeXqLessonData(rules, puzzleBank)`（33 课 / 题库夹具已在 `test/fixtures/`；Node ESM / Playwright 不能 import JSON，用 core 版自己读文件；vitest / Vite 用 `test/xq-lesson-data.ts`）。
  - **棋手学院扩展**：在 `lesson/steps-chess/` 里 `registerStep<M, S, MyStep>('castleQuiz', { mount, hint, demo })`，不改引擎；可复用 `lesson/common.ts`（`starsFor / showHint`）、`lesson/registry.ts`（`stepPromise` 取消安全的承诺、`posOf`、`nameMap`）、`lesson/fen.ts`（`withSide / fenEdit / fenFind`）、`lesson/solo.ts`、`lesson/step-ui.ts`。
  - 题组 `bank / bank2`：逐题 `PuzzlePlayer`，每题存检查点（`hooks.save({ lessonId, stepId, puzzleIx })`），`run(lesson, progress)` 带 `puzzleIx` 即从第 k 题续；`guided` 或连续 2 题没一次做对 → 先亮 H1。小战场 `battle`：`lesson/battle.ts`（`advancePawns / playBattle / solveBattle`）；`optional` 步由 `askOptional` 决定；连败 2 盘少 1 个卒。
- **谜题**：`puzzle/validate.ts`（`validateMate1/2`、`immediateWins`、`captureAnswerHasAlternatives`）· `puzzle/audit.ts`（`shortcutAudit`）· `puzzle/player.ts`（`createPuzzlePlayer`；**kidPlies 0 = 选择题**：`meta.options` + `answer`，经 `ctx.ui.choose`；答偏 2 次点亮正解、4 次只留正解）。
- **美术**：`art/shade.ts`（OKLab 配方、对比度）· `art/bake.ts`（`createToySprites`：字体就绪后烘焙车削木玩具圆片，字形层单独一张）。国象 SVG 剪影见 `site/dev/board/pieces-chess.ts`（演示用）。
- **测试工具**：`test/pw.ts`（Playwright 助手，页面需暴露 `window.__board`）· `test/diff.ts`（`diffAgainst(rules, makeOracle, { games, maxPly, starts, extra })`：对独立实现逐局面比合法着法与将军状态；象棋用 `@weshell/xiangqi.js`，见 `diff.test.ts`）· `test/calibrate.ts`（`playGame / playMatch / mergeMatches / checkLadder / levelOf`：机器人对机器人走真 `AiHandler`；**并行 = 分片**：`XQ_SHARD=0/4 XQ_FULL=1 npx vitest run engines/board/test/calibrate`，各片 `mergeMatches`）· `lesson/test-kit.ts`（假视图 / 脚本化 ui / `mkCtx`，vitest 里测自己的课数据用）。
- **游乐场** `/dev/board/`：`?game=xq|chess &f2f=1 &orient=second &bot=0 &reduced=1 &fen=… &think=ms &lesson=L05 &step=L05.2`；`window.__board.lesson.{start(id, fromStep?), cancel(), state, ui, ids()}`。截图 `tools/board/shot.mjs`；端到端 `tests/board/`（端口 5326）。

## 与冻结契约的偏差（均为放宽 / 补充，不破坏）
- `registerStep` 的实际签名放宽为 `St extends StepBase`（冻结类型里 `Step = never` 太窄）。
- `StepRunner.hint(step, tier)` 没有 ctx，无法按局面算提示：引擎自带步型的 `hint()` 返回 `{}`，真提示在 `mount` 里现算（`showHint`）。
- `StepContext` 的实现类型 `StepContextImpl` 多出 `ui / data / wrongHoldMs / lessonId / resumeIx / assist / scope`；`LessonResult.results[]` 多出 `optional / twin`。
- 并行校准用"分片"而不是 `worker_threads`（vitest 无法把 TS 交给原生 Worker）。
- 参考适配器没有 `attackersOf`：sweep 的"被攻击"用"黑方的合法吃子"近似（被将军时可能少算；数据里的 par 全部吻合）；游戏实现 `attackersOf` 即可精确。
- `docs/specs/board-engine.md`（不是我的文件）里 `quiz` 的 `options` 字段名以 `lessons.mjs` 的 `opts` 为准。

## post-freeze fixes（2026-10-19，xiangqi 修复轮；均为 bug 修复，不改冻结契约）
- `ai/host.ts`：Worker 连续报错时不再无限重建。按 `WORKER_ERROR_BACKOFF_MS = [0, 300, 900]` 重建（收到过一次好回复即清零），仍错 → `giveUp`：放弃 Worker、请求改走主线程 `fallback`；`WORKER_RETRY_AFTER_MS = 60 000` 后再给 Worker 一次机会（例如 chunk 又能取到）。Worker 回 `ok:false` → 该请求走兜底一次（不重建）。`rebuild()` 遇到已放弃的 Worker → 直接 `giveUp`。`ai/ai.test.ts` 新增 3 个用例（构造后报错 → 兜底并出着；ok:false → 兜底一次；60 s 后重试）。新增导出常量不破坏旧 import。
- `view/overlays.drawCoords` 对"点位"棋盘保持原样（不画竖线号）；象棋的"九…一 / 1…9"数字行是游戏层的 `site/xiangqi/src/art/coords.ts`（`COORD_H = 22`）。
- `lesson/steps-flow.ts` bankRunner：`ids` 空 / 缺时原来直接返回 `{ stars: 3, firstTry: true }`（xiangqi 摸底第 9 题因此永远"答对"、L25 恒被判会）；现在返回 `{ stars: 1, firstTry: false }`（数据错绝不白送）。`lesson/steps-paths.test.ts` 新增 1 个测试；契约（步骤形状 / 返回类型）不变。
- 失误模型 `core/errormodel.ts` 未改。象棋 R6 的"瞥一眼护栏"（`look.glanceGuard`，2 层 + 静态搜索剔除差 >300 厘兵的候选）以包装器形式放在 `site/xiangqi/src/rules/plugin.ts`；若别的游戏也要，可以把它收进引擎（见 `~/kid-games-work/state/rr/engine-requests.md` 的 2026-10-19 行）。

## post-freeze fixes（2026-10-20，xiangqi QA r3 修复轮；均为 bug 修复 / 向后兼容的可选字段，不改冻结契约）
- `lesson/steps-flow.ts` bankRunner：放宽（guided / 连续两题没对 / 辅助档）以前会赦免走错 ≤ 2 步（`firstTry = r.firstTry || (eased && r.hintTier <= 1)`），摸底第 9 题因此在前两题没对之后被判"一次做对"、L25 被白送，题组星级也被抬高。现在用 `PuzzleHooks.onWrong` 数走错步数，**只放宽"预先亮出的 H1"**（一步没走错且没再要提示才算一次做对）；走错就如实记。题组步星 = `round(平均)`，有一题没一次做对时最多 ★★。
- `lesson/player.ts`：`LessonDef.strict?: boolean`（测验口径，楚河棋院的"考考你"用）——不给辅助档、题组不放宽、`StepContextImpl.strict` 填上；默认 `false`，其它游戏不受影响。`LessonPlayerOptions.onStep` 的返回值可以是 `Promise<void>`，**phase `'end'` 的 Promise 会被等完**才进下一步（步后旁白：揭晓句在这一步的盘上念完，下一步的局面才摆上盘）；返回 `void` 的老用法不变。
- `lesson/steps-flow.ts` battle：`commit` 在红方这一步落完就返回（`busy` 挡住新点击），卒的行军 + 败北停顿在输入锁外跑——以前整段 > 2 s 都罩在 `anim` 锁里，开发版报"输入锁 anim 超过 2000 ms"（生产版没有看门狗，孩子不受影响）。
- 新增 `lesson/strict.test.ts`（7 项）；`site/xiangqi/tests/placement.test.ts` +5 项（"全错" / 前两题没对 + 第 9 题走错 1–2 步 × strict 开关 / 前两题没对但第 9 题一步不错）。回退上面两处修复后这 9 项会失败（已做变异检查）。

## 未做 / 留给游戏
- `play` 步的整盘对局、`card` 的对照卡画面（引擎只给"好"按钮）、旁白 id 的实际语音、徽章与星星动画：游戏自己的 HUD。
- 真实机器人插件的校准（引擎只给工具）、`attackersOf` / 快速 make/unmake 适配器：`games/<id>/`。
