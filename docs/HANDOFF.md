# kid-games 交接文档（HANDOFF）

> **2026-10-24 接续状态**：本文以下内容是 2026-10-11 的历史快照，状态、数量和“第 3 节为准”的表述已被后续会话更新。当前本地开发分支为 `iter/rebuild-2026-10`，含未提交改动；没有推送 GitHub 或触发 Netlify。导出会话最后约定的首轮本地验收以 **火星基地 + 楚河棋院** 为主；国际象棋与云存档属后续开发。星图记忆站虽已在本地重建并通过 84 项无头 WebKit 回归，但尚未经过家长真机验收。发布范围必须在推送前再次核对。
>
> 当前火星基地存档为 **v6**，录音清单是 **411 条常规台词 + 1001 条数字**；楚河棋院有 **250 条**录音。两作点击开始后的首句录音请求均已用静音 WebKit 验证。整仓 `npm run check` 为 **2598 通过、106 跳过、0 失败**；`npm run build` 通过；生产包整站冒烟 **56/56**、平台回归 **18/18**、手机返回与存档升级 **3/3**。历史验收记录见 [火星基地](ACCEPTANCE-mars-base.md) 和 [楚河棋院](ACCEPTANCE-xiangqi.md)。真实 iPad 的听感、后台恢复与家长试玩仍待完成。

> 写于 2026-10-11，交给接手迭代的 Agent。读完这一份就能接着干。
> 更细的内容都在文中给出的文件里；**有冲突时，以本文第 3 节"爸爸的决定"为准**。
> 和爸爸沟通一律用**中文**，先给结论，再给细节。

---

## 0. 一屏速览

- **这是什么**：爸爸给 6 岁儿子（游戏内称呼"小步步"）做的网页游戏乐园「星港」，纯静态站，孩子主要在 **iPad 主屏 App（PWA）** 上玩，爸爸也会用手机试。
- **线上**：GitHub `CCinCD-pixel/kid-games` 的 `main` 分支 → **Netlify 自动发布**（免费计划）。`main` 现在是 `e14a550`（2026-10-09 推送）。
- **进度**：
  - 第一批（阶段一）5 款已完成并上线，等爸爸继续验收反馈：星港搬运工、星晶消消乐、陆战棋、贪吃蛇大作战、机关守城。
  - 第二、三批共 6 款**还没开始**，等爸爸验收完第一批再说：火星基地、山海故事匣、棋手学院；月宫建造师、玉兔编程、天宫实验室。
  - 经典角的 3 个旧游戏保持原样；它们会被第二、三批的新游戏替代。
- **铁律**（细节见第 9 节）：
  - **不经爸爸明确同意不推送 `main`**，推送就等于上线。
  - **测试时绝不能让 Mac 发出声音**，爸爸夜里被吵醒过。
  - **16 GB 内存的 Mac 曾被并发任务压到内核崩溃重启**，重任务要限量。
  - **孩子的真名绝不能出现在仓库和文案里**。

---

## 1. 为什么做这件事

- 爸爸 2026-04 给当时 5 岁半的儿子做了一批小游戏（记忆方块、数字探险家、推箱子、国际象棋、国际跳棋、贪吃蛇、军棋、消消乐、星星大作战）。做完基本没迭代，但孩子半年后还偶尔在玩。
- 2026-10 孩子 6 岁 2–3 个月、刚上一年级。爸爸觉得旧游戏**幼稚、粗糙**。他的目标是：
  - 通过游戏**多元化培养能力**：数学、空间、逻辑与编程、阅读识字、科学、策略、文化等；
  - **适度超前**，不要低幼化；
  - **质量要求很高**：关卡设计合理、递进清楚、锻炼目的明确、素材、UI、动画达到**商业产品水准**，不能有 demo 感；
  - 设计和关卡要**反复验证核验**，用求解器、仿真、测试、多轮独立 QA 来保证。
- 爸爸支持孩子玩游戏、通过游戏学习，每天约 30 分钟，**不做硬性时长限制或锁屏**，家长自己管。

### 孩子画像（2026-10）
| 项 | 情况 |
|---|---|
| 年级 / 教材 | 小学一年级，**人教版** |
| 阅读 | 能自己读简单绘本（文字可以用，旁白辅助） |
| 数学 | **明显超前**（100 以内加减、乘法概念） |
| 兴趣 | 太空 / 宇宙 / 科学实验；机器 / 车辆 / 搭建工程；神话 / 历史 / 冒险故事 |
| 爱玩的商业游戏 | 植物大战僵尸（10 小时以上）、我的汤姆猫、保卫萝卜、纪念碑谷、Funexpected（数学） |
| 喜欢的交互 | **机器人伙伴对话**（大厅和游戏里的"领航员"），爸爸说孩子会喜欢 |
| 设备 | **iPad 第 9 代**（A13、3 GB 内存），iPadOS 26.x，Safari 主屏 App；CSS 视口 810×1080 竖屏 / 1080×810 横屏 |

---

## 2. 当前状态（2026-10-11）

### 2.1 大厅里的游戏（`site/<id>/game.json` 的 `status` 和 `place`）

| 分区 | 游戏 | 目录 | 状态 | 设计文档 |
|---|---|---|---|---|
| 基地 | 星港搬运工（推箱子重做） | `site/sokoban` | live | `docs/specs/sokoban.md` |
| 基地 | 陆战棋（标准陆战棋重写，只开放翻翻棋） | `site/military-chess` | live | `docs/specs/military-chess.md` |
| 游乐场 | 星晶消消乐（三消重做） | `site/emoji-match` | live | `docs/specs/emoji-match.md` |
| 游乐场 | 贪吃蛇大作战（重做） | `site/snake-battle` | live | `docs/specs/snake-battle.md` |
| 游乐场 | 机关守城（新游戏，车道塔防，墨子守城题材） | `site/gear-fort` | live | `docs/specs/lane-defense.md` |
| 经典角 | 记忆方块 / 数字探险家 / 国际象棋（旧版，没重构） | `site/memory-matrix` 等 | live | — |
| 隐藏 | 火星基地 / 山海故事匣 / 月宫建造师 / 玉兔编程 / 天宫实验室（占位页） | `site/mars-base` 等 | hidden | `docs/specs/*.md`（草稿） |

已删除：国际跳棋（规则教错、没有 AI）、星星大作战（没有返回键，玩法低幼）。旧网址 302 回大厅（`site/redirects.json`）。

### 2.2 第一批质量结论
- 每款都经过：设计文档 → 两位评审挑刺 → 修订 → 分阶段开发 → 配音 → 2～5 轮独立 QA（玩家视角 + 技术视角）和修复 → 定稿检查。
- 最近一次整站检查（2026-10-09）：1241 个单元测试通过，635 个 WebKit 冒烟测试 0 失败；手机三种尺寸（390×664、320×568、844×390）从大厅进每个游戏再返回，0 报错、无横向溢出。
- 完整记录：`docs/QA-REPORT-batch1.md`（每款的 QA 轮次、校验器数字、已知差距、v2 待办）。
- 验收清单：`docs/ACCEPTANCE-batch1.md`。第 0 节是手机与"跳过"，第 3–7 节分游戏。

### 2.3 爸爸已经试玩过的反馈和处理
- 10-07～08：前三款"基本符合预期"。陆战棋 4 条偏差，爸爸的决定见第 3 节。
- 10-08 第一次在线试玩（手机）提了 4 条，已全部处理并上线 `e14a550`：
  1. 手机竖屏兼容差 → 已适配手机，机关守城在手机竖屏提示横过来玩；
  2. 教学太长不能跳过、无痕窗口每次重来 → 统一"跳过"按钮，家长页加"跳过开场和教学"开关；
  3. 陆战棋规则疑问 → 只留翻翻棋，地雷和扛旗按标准规则，加了碰地雷提醒；
  4. 旧游戏以后按新风格重做 → 并入第二、三批。

---

## 3. 爸爸的决定（权威汇总，按时间）

**2026-10-04**
- 部署用 **Netlify**（免费计划，生产部署要省着用、批量推）。Vercel 不用管（见第 6 节）。
- 孩子在游戏里叫 **小步步**，真名已从代码里替换掉。改名后仓库**可以公开**；老提交历史里还有真名，爸爸接受。
- 删除国际跳棋；下架星星大作战；数字探险家重做为火星基地。
- 推箱子要彻底重做到**商业产品水准**（素材、UI、动画）。
- 军棋改写为**标准陆战棋**。家里有实体棋，孩子常和爸爸下。
- 贪吃蛇、消消乐孩子常玩，要对标市面最好的产品：AI 要聪明、吃东西反馈要爽、要有挑战。
- 国际象棋按方案升级为棋手学院；记忆方块先修布局，以后并入 3D 游戏。
- 新做一款**植物大战僵尸式车道塔防**，立意要好，不能抄（孩子想要类似"美食大战老鼠"的游戏）→ 评审选中《机关守城·九攻九距》：墨子与鲁班沙盘推演，立意"非攻、以智止战"。
- 每天约 30 分钟，**无硬性时长限制**。
- 配音先用**免费本地 TTS**，以后要能换（见第 7 节）。

**2026-10-05**
- 改为**分批**做：第一批 = 推箱子、贪吃蛇、消消乐、陆战棋、机关守城。**第一批验收通过前不开始第二批。**
- 每款首版内容**够玩 4–6 周**即可（v1 范围），生成器和校验工具照样做全，其余放进 v2 待办。
- 周额度先不设上限，但爸爸要能**看到消耗和进度**（用 `mcp__ccd_session_mgmt__get_usage`）。
- 省额度：按难度给每个代理分配推理强度（只有最难的用 max）；代理**只读需要的设计文档章节**。

**2026-10-07 陆战棋 4 条**
1. 机器人强度按现状发布；
2. 自对弈 600 步上限的"随机对随机"例外接受；
3. **对战机器人始终用标准规则：先挖光地雷才能扛旗**（翻翻棋）。"随时能扛"家规只用于和爸爸下（默认也是标准）；
4. 残局第 3 档放到 v2。

**2026-10-08 手机试玩后**
- 家里**只玩翻翻棋**。对战和"和爸爸下"只保留翻翻棋，明棋、暗棋、实体棋裁判隐藏（代码保留）；学堂、残局保留。
  - 翻翻棋走法：棋子全部扣着；轮到谁，谁就二选一：翻任意一颗暗子，或者走（吃）一颗自己已翻开的子。第一颗翻出来的颜色定阵营，暗子不能被吃。
- **地雷按标准规则**：不能动；工兵挖、炸弹同归于尽；其他子碰了会牺牲。碰已翻开的地雷前，参谋会提醒并确认。
- **扛旗按标准规则**：任何能走的子都能扛，**扛到立刻获胜**，不存在扛着旗走的阶段。翻翻棋要先挖光对方地雷。
- **手机也要能用**：机关守城在手机竖屏提示横过来，横屏能玩。
- 所有开场和教学都能跳过；家长开关"跳过开场和教学"。
- 经典角旧游戏以后按新风格重做（就是第二、三批），**现在不做**。

**2026-10-08～09**：爸爸授权推送上线（已完成）。**以后每次推送仍需他同意。**

---

## 4. 批次规划（阶段一、二、三）

| 批次 | 游戏 | 状态 | 说明 |
|---|---|---|---|
| **第一批** | 星港搬运工、星晶消消乐、陆战棋、贪吃蛇大作战、机关守城 | ✅ 已上线，等爸爸进一步反馈 | 未决事项见第 10 节 |
| **第二批**（建议） | 棋手学院（替代旧国际象棋）、火星基地（替代旧数字探险家）、山海故事匣（神话剪纸绘本 + 航天小书） | ⏸ 未开始，**等爸爸说开始** | 规格见下 |
| **第三批**（建议） | 月宫建造师（3D 搭建，吸收旧记忆方块）、玉兔编程（编程月球车，依赖 `engines/voxel`）、天宫实验室（预测、观察、解释的科学实验） | ⏸ 未开始 | 玉兔要等月宫的 voxel 引擎 |

**规格文件状态**（开工前必须先过"两位评审挑刺 + 修订 + 定义 v1 范围"，做法照第一批）：
- `docs/specs/mars-base.md`、`story-box.md`、`moon-builder.md`、`rover-code.md`、`tiangong-lab.md`：**只有草稿**，没做完评审和修订。各自的原型和校验工具在 `~/kid-games-work/specs/<id>-tools/`。
- 棋手学院的规格**不在仓库里**：在 `~/kid-games-work/specs/chess.md`（约 250 KB，加上 `chess-tools/`：课程、谜题生成、机器人、教练原型），同样没评审。旧国际象棋的规则引擎通过了 perft 验证，可以复用。
- 总方案（能力版图、每款的设计意图、证据等级、路线）：`docs/plan-2026-10.md`。

---

## 5. 仓库与架构

完整说明：`docs/ARCHITECTURE.md`（目录、构建、kit、离线、托管、质量门）和 `docs/GAME_AUTHORING.md`（**写游戏必读**：kit API、文件归属规则、资源规则、静音规则、预算）。

```
site/            每个游戏一个目录 = 一个网址（Vite 多页应用，root=site）；site/<id>/game.json 是登记表
  index.html     大厅「星港」（夜景 + 今天的真实月相 + 领航员机器人）；site/_hub/**
  parent/        家长中心（长按大厅页眉 3 秒 + PIN）：游玩记录、设置（显示名、旁白、拼音、隐藏游戏、跳过开场和教学）、导出导入
kit/             全站共用运行时：shell（开始门/返回/防缩放）、audio（单一 AudioContext）、narration、progress（本地存档）、
                 log、input、rng、tween、particles、settings、ui（星港设计系统组件）、companion（机器人伙伴）、automute（自动化下静音）
engines/         共用引擎：story / manip / voxel / board / puzzle（第二、三批要用）
content/<game>/  关卡、文案、旁白 yaml 等内容数据
public/audio/    生成的旁白 m4a + audio-manifest.json（提交进 git）
tools/           check-registry / check-content / 图标 / sw / voice（配音管线）/ 各游戏校验器 / qa/mute-audio.js
tests/           smoke（平台冒烟）+ 各游戏 Playwright
docs/            ARCHITECTURE、GAME_AUTHORING、VOICE、specs/、plan-2026-10、QA-REPORT-batch1、ACCEPTANCE-batch1、HANDOFF（本文）
assets-src/LICENSES.md   素材许可台账（CC0 优先；Kenney 等）；/credits/ 致谢页
```

**常用命令**（Node 20，`@playwright/test` 固定 1.63.0，浏览器已缓存：webkit-2359、chromium-1243）：
```sh
npm run dev            # 开发服务器
npm run check          # 登记表 + 内容 + tsc + vitest（日常）
npm run build          # 和 Netlify 一样的构建 → dist/（会生成 sw.js、_redirects、_headers）
npm test               # vitest
npm run test:smoke     # 全量 WebKit 冒烟（含五款全部 Playwright，约 30 分钟）；日常可只跑 tests/smoke/
./play.sh              # 构建并在局域网起服务，iPad/手机同一 Wi-Fi 打开打印出的地址（SKIP_BUILD=1 跳过构建）
npm run voice:build -- <game>   # 生成旁白（见第 7 节）
```
- 每个游戏有自己的 `site/<id>/tsconfig.json` 和测试、校验器，比如推箱子求解器、消消乐仿真机器人、陆战棋自对弈、贪吃蛇确定性回放、机关守城平衡仿真。各游戏的完整校验命令写在 QA 报告对应小节。
- 存档全在浏览器本地（localStorage + `navigator.storage.persist()`）。主屏 App 里会一直保留；无痕窗口、换浏览器就会重来，这就是"跳过开场和教学"开关的用途。

---

## 6. GitHub 与 Netlify

- **仓库**：`git@github.com:CCinCD-pixel/kid-games.git`（公开）。本机路径 `/Users/ccincd/github/kid-games`。
  - `main` = 线上 = `e14a550`。
  - 本地分支 `upgrade/2026-10` 目前和 `main` 相同（没推送这个分支）。新工作建议开新分支，例如 `batch2/...` 或 `fix/...`。
- **Netlify**：免费计划，连 GitHub，**push 到 `main` 就自动构建发布**，每次生产部署都消耗额度，所以要攒一批再推。
  - 配置在 `netlify.toml`：`npm ci && npm run build`，`publish = "dist"`，`NODE_VERSION = 20`，`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`。
  - 团队页：https://app.netlify.com/teams/408314925/projects（爸爸的 Chrome 已登录）。**站点网址没记录下来，需要时问爸爸。**
  - Netlify **不会**把部署状态回报给 GitHub，GitHub 上看不到 Netlify 是否成功。
  - 爸爸的全局规则：网页浏览用 gstack `/browse`，禁止用 claude-in-chrome。本机没装 Aside 浏览器，无法直接借用 Chrome 登录态。
- **残留的其他部署**（爸爸说忽略即可）：
  - Vercel 集成仍连着仓库，`main` 也会部署到 `kid-games-cyan.vercel.app`；
  - GitHub 上有一个 GitHub Actions 的 `build` 检查（像是 GitHub Pages）。
- **发布流程**（2026-10-08、10-09 用过两次）：
  1. 爸爸明确同意推送；
  2. 干净副本构建检查：`~/kid-games-work/release-check`（`git fetch <repo> <branch> && git checkout -f FETCH_HEAD && git clean -fdx -e node_modules && npm ci && npm run build`）；
  3. 推送前检查仓库里没有真名：`git grep -l "<真名>" <branch>`。真名见爸爸的 memory，**不要写进任何文件**；
  4. `git checkout main && git merge --ff-only <branch> && git push origin main`；
  5. 告诉爸爸怎么看新版：手机刷新；iPad 主屏 App 完全划掉重开，Service Worker 会换新。

---

## 7. 配音（语音）怎么生成

**权威文档：`docs/VOICE.md`**（务必先读）。要点：

- **原则**：配音在开发时**一次性生成**成 m4a 文件，提交进仓库，随网站部署。孩子玩的时候直接播放文件，**不需要任何服务器**，iPad 离线也能放。缺某句时游戏回退到浏览器自带语音 + 字幕。以后可以换成付费语音或爸爸亲自录音：换引擎，或者把录音放进 `content/narration/overrides/<id>.m4a`。
- **引擎**：Qwen3-TTS-12Hz **0.6B** CustomVoice 8-bit（mlx-community，Apache-2.0），在本机 Apple Silicon 上跑。轻量备选 Kokoro（sherpa-onnx）；macOS `say` 只能用来预览。
- **质检**：本地 Paraformer-zh ASR 回听，检查字错率、拼音、多音字、语速；不合格自动换 seed 重生成，最多 3 次。
- **角色（音色）**：`narrator` = Serena；`companion`（机器人）= Vivian 加机器人音效；`word` 点读；`dad` = Uncle_Fu（机关守城里的墨子）；`luban` = Dylan，音调 0.96，暖色 EQ（鲁班）。配置在 `tools/voice/voice/config.py`。
- **文件**：
  - 台词在 `content/narration/<game>.yaml` 或 `content/<game>/narration*.yaml`；
  - 多音字锁定在 `content/narration/_lexicon.yaml`，也可以在单句上写 `pinyin:`；生僻字用 `norm:` 写同音常用字；
  - 选中的 seed 存在 `_takes/`；
  - 产物在 `public/audio/<game>/`。
- **环境**：`$VOICE_HOME=~/kid-games-work/voice`，里面有 venv、模型权重（约 3 GB）、缓存、报告，都**不进 git**。安装和下载命令见 `docs/VOICE.md` "Setup"。
- **⚠ 内存安全（必须遵守）**：2026-10-05 本机就是因为同时评测几个大 TTS 模型、单个进程吃到 12 GB 而内核崩溃重启的。
  - 先 `memory_pressure -Q | tail -1`，空闲低于 25% 就等；
  - **一次只跑一个模型进程**，只用 0.6B 8-bit；
  - 必须通过 `tools/voice/memrun.sh` 跑（超过 4 GB 自动杀掉）；
  - 绝不后台跑，绝不加载 1.7B 或全精度模型。
- **待补配音的句子**（下次跑配音时一起做）：
  - 机关守城：`fort.dock.3`、`fort.belt.full`、点读词"首领"；
  - 贪吃蛇：两句新的"截击"提示；
  - 陆战棋：`mc.wrap.L7`、`mc.rule.2`、`mc.l2.rule`。
- **试听**：`tools/voice/voice.sh compare` 生成 `$VOICE_HOME/compare.html`，给爸爸听。**Agent 自己绝不外放**，只用 ffprobe 和 ASR 检查。

---

## 8. 预览与验收

- **稳定预览副本**：`~/kid-games-work/preview-1a` 是仓库的 git worktree，目前在 `e14a550`。爸爸用：
  ```sh
  cd ~/kid-games-work/preview-1a && SKIP_BUILD=1 ./play.sh
  ```
  然后在 iPad 或手机上打开打印出的 `http://192.168.0.111:8000`（局域网 IP 可能变）。
  - 更新它：`git -C ~/kid-games-work/preview-1a checkout -q --detach <commit> && (cd ~/kid-games-work/preview-1a && npm run build)`；
  - 删掉它：`git worktree remove ~/kid-games-work/preview-1a`。
- 爸爸看的验收清单：`docs/ACCEPTANCE-batch1.md`。新一批做完也要写同样的清单，包括怎么打开、点哪里、看什么、怎么反馈。
- 爸爸习惯：先看结论和百分比进度，再决定；需要他拍板的事用**选项**问，附上建议。

---

## 9. 机器、额度与安全约束（踩过的坑）

| 约束 | 来历 | 做法 |
|---|---|---|
| **16 GB Mac 内存** | 10-05 并发 TTS 评测 + 约 10 个浏览器代理把机器压到内核 panic 重启 | 会开浏览器、跑构建或模型的"重"任务最多 3 个并行；模型只用 0.6B；跑长任务时开看门狗 `~/kid-games-work/tools/memguard.sh`（空闲内存低于 12% 或单进程超过 5 GB 就杀**我们自己的**进程，只匹配本项目路径和 Playwright webkit-2359 / chromium-1243，日志 `~/kid-games-work/logs/memguard.log`），跑完关掉 |
| **静音** | Playwright 测试时游戏声音和系统 TTS 从扬声器外放，半夜吵醒爸爸，而且静音也挡不住 | `kit/automute.ts`：`navigator.webdriver` 为真时整页静音（已用离线渲染验证峰值为 0）；不加载 kit 的页面用 `tools/qa/mute-audio.js` 作为 init script；Chromium 加 `--mute-audio`；**禁止** `afplay`、不带 `-o` 的 `say`，禁止改系统音量 |
| **/private/tmp 重启会被清空** | 崩溃重启丢过中间产物 | 工作文件一律放 `~/kid-games-work/`（持久，目前约 21 GB，其中截图 16 GB，可清理） |
| **用量额度** | Max 计划：5 小时窗口 + 周额度；3～4 个重代理并行时，一个 5 小时窗口约 2 小时就用完，约等于周额度的 15% | 开工前和过程中用 `get_usage` 看额度并汇报给爸爸；长任务配 30 分钟一次的 cron 自检，限额重置后自动续跑；会话期间用 `caffeinate` 防休眠 |
| **长会话越跑越贵** | 代理上下文涨到约 1M token 后，每次调用都重读，一个窗口里 5 个代理全被截断，一步都没完成 | 每个代理会话限约 100～130 次工具调用，写断点文件 `progress-<key>.md` 再交接；任务拆小 |
| **Workflow 的 resume 缓存按前缀匹配** | 改了脚本再 `resumeFromRunId`，已完成的工作被重跑 | 用**磁盘标记文件**（`*.done`）记录完成的步骤，每次**全新启动**并通过 `args` 告诉脚本跳过哪些（`~/kid-games-work/wf/mkargs.py`） |
| **并行代理共用一个工作区** | — | 每个代理只改自己游戏的目录；不准跑会改状态的 git 命令（定稿步骤除外）；不准 `npm install`；只做本游戏范围的类型检查；dev server 用固定端口（5301 推箱子、5303 陆战棋、5304 贪吃蛇、5305 消消乐、5311 机关守城），用完就停 |
| **隐私** | 旧代码里有孩子真名 | 游戏内统一用"小步步"（家长页可改显示名，只存在本地）；任何文件和提交都不能出现真名 |
| **Netlify 额度** | 免费计划，每次生产部署都扣额度 | 攒一批再推，推之前必须爸爸同意 |

---

## 10. 未决事项（按优先级）

1. **等爸爸进一步试玩反馈**（手机 + iPad，按 `docs/ACCEPTANCE-batch1.md`），收到后按反馈修。上一轮反馈的处理方式见第 2.3 节。
2. **机关守城需要爸爸做的**：
   - 在真 iPad 上打开 `/gear-fort/?dev=perf`，报 p95，要求 ≤ 16.7 ms；
   - 核对 15 条引文和史实（`docs/specs/lane-defense.md` 附录 D）；
   - 第二卷"墨家旗"阈值选 26 还是 27（现在是 26）；
   - 驿站台词 1-9.2 请爸爸听一遍（ASR 一直报疑似错误，可能是误报）。
3. **贪吃蛇**：
   - 太空知识句请爸爸看；
   - CSS 预算从 15 KB 提到了 17 KB（手机样式），内容 JSON 18.5 KB 超过 15 KB 预算，需要定夺；
   - 火星竞技场 13 条蛇，规格写的是 14。
4. **补配音**：第 7 节列的几句。
5. **发布清理**：删掉消消乐旧版（`?legacy=1`）；`public/` 里推箱子旧图片已经没在用了。
6. **第 2 轮 QA 之后的修复没有再做独立复查**（10-08 手机反馈那一轮），整站测试和手机走查是通过的。
7. **kit 请求**（`docs/QA-REPORT-batch1.md` §6）：
   - 字体子集补字（机关守城的 28 个字、陆战棋的 `display-text.txt`）；
   - 游戏音乐改为按需缓存；
   - 存档不覆盖更新版本；
   - `music.play` 交叉淡入循环；
   - 共享家长 PIN 弹窗；
   - 测试用的 `isDevServer(page)`；
   - 家长页展示各游戏指标；
   - 配音管线直接读 `content/<game>/narration.yaml`。
8. **机关守城 v1.1**：iPad 竖屏时战场偏小（横屏体验更好）、姿势缓存、`calibrate.mjs`、后台恢复和离线测试；第三、四卷在 v2 待办里。
9. **第二批**：等爸爸说开始。先评审和修订规格，定 v1 范围，再照第一批的流水线做。

---

## 11. 多代理流水线怎么复用（第一批的做法）

- 编排脚本：`~/kid-games-work/wf/batch1.js`，第一批全流程。流程：规格评审 → 修订 → 分阶段开发 → 配音 → 质检和修复最多 N 轮 → 先定稿前三款 → 总定稿。其中已实现：
  - 优先级限流（heavy=3，light=5）；
  - 按难度分配推理强度；
  - 只读需要的章节；
  - 分段会话加断点文件；
  - 磁盘标记跳过已完成的步骤；
  - 额外步骤（`extraSteps`）和加轮次（`maxRounds`）。
- 参数生成：`python3 ~/kid-games-work/wf/mkargs.py`。它读 `~/kid-games-work/state/` 的标记，合并 `args-overlay.json`，输出 `args`，然后 `Workflow({scriptPath: batch1.js, args})` **全新启动**。
- 手机反馈修复用的脚本：`~/kid-games-work/wf/feedback-fix-1.js`（标记在 `~/kid-games-work/state/fb1/`），适合"小范围多游戏修复 + QA + 定稿"。
- 运行日志和决策时间线：`~/kid-games-work/wf/STATE.md`、`RESUME.md`。
- 每个代理的提示词都必须写进这几条规则：
  - 文件归属；
  - 静音；
  - 内存；
  - 只读需要的章节；
  - 会话预算；
  - 完成标记；
  - 不推送。
- 截图都存在 `~/kid-games-work/shots/<area>/`，**必须用眼睛看过**再下结论。

---

## 12. 关键文件索引

| 要找什么 | 在哪 |
|---|---|
| 爸爸的决定（本文第 3 节）和 Claude 的记忆 | `~/.claude/projects/-Users-ccincd-github-kid-games/memory/`（dad-directives、child-profile、mac-memory-limits、no-audible-test-sound、kid-games-upgrade） |
| 总方案（审计结论、能力版图、每款设计） | `docs/plan-2026-10.md`；原始证据 `~/kid-games-evidence/2026-10-04/`（审计 JSON、截图、调研、画风原型） |
| 架构 / 写游戏规范 / 配音 | `docs/ARCHITECTURE.md`、`docs/GAME_AUTHORING.md`、`docs/VOICE.md` |
| 各游戏规格 | `docs/specs/*.md`；工作稿、原型和工具在 `~/kid-games-work/specs/`（棋手学院的规格只在这里：`chess.md`） |
| 第一批 QA 报告 / 验收清单 | `docs/QA-REPORT-batch1.md`、`docs/ACCEPTANCE-batch1.md` |
| 机关守城的三个题材方案和评审结果 | `~/kid-games-work/td-concepts/`（`free.md` 中选，`JUDGE.json`） |
| 设计系统源文件 | `~/kid-games-work/design-system/`（已合入 `kit/ui`、`kit/companion`） |
| 流水线脚本 / 状态 | `~/kid-games-work/wf/`、`~/kid-games-work/state/` |
| 看门狗 | `~/kid-games-work/tools/memguard.sh` |
