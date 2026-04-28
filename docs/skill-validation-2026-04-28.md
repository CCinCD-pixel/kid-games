# Superpowers 与 Agent Skills 验证记录

日期：2026-04-28
项目：kid-games

## 安装状态

- Superpowers：当前 Codex 会话已通过插件加载 `superpowers:*` 技能，未重复安装到 `~/.codex/skills`。
- Agent Skills：本地 `/Users/ccincd/github/agent-skills-main/skills` 下 20 个技能已安装到 `~/.codex/skills`。需要重启 Codex 后才能作为自动发现技能出现在会话技能列表里。

## 本轮怎么验证

Superpowers 更像“强约束流程层”。本轮实际使用了：

- `using-superpowers`：先检查是否有适用技能。
- `test-driven-development`：先用临时 Node 静态检查确认缺口，再改代码。
- `verification-before-completion`：完成前重跑构建、静态检查和 HTTP 探测。

Agent Skills 更像“工程专项清单层”。本轮实际参考了：

- `using-agent-skills`：按任务阶段选择技能。
- `code-review-and-quality`：用正确性、可读性、架构、安全、性能五轴评估现有报告和当前 diff。
- `frontend-ui-engineering`：针对图标按钮补可访问名称。
- `performance-optimization`：坚持先测量再优化，没有对 Phaser bundle 做未验证的过早改造。

## 本轮项目优化

1. `sw.js`
   - 将 PWA precache 从 2 个游戏入口扩展到全部 9 个游戏入口。
   - 补充缓存 `/manifest.json` 与 `/icons/icon.svg`。

2. `sokoban/index.html`
   - 给 4 个 D-Pad 图标按钮增加 `aria-label`。
   - 给方向 SVG 增加 `aria-hidden="true"`，避免辅助技术读到无意义图形。

3. `play.sh`
   - 修复 8000 端口被占用时直接崩溃的问题。
   - 现在从 `${PORT:-8000}` 开始寻找下一个可用端口，并打印实际访问地址。
   - 启动服务器前检查所有核心预览文件是否存在，避免缺入口时才在浏览器里发现。

4. `emoji-match/src/main.ts`
   - 给棋盘上的每个 emoji 棋子按钮增加可访问名称。
   - 标签包含棋子 emoji、特效类型、选中状态和行列位置。
   - emoji 视觉文本增加 `aria-hidden="true"`，避免辅助技术重复朗读。

## 验证证据

- 临时静态检查：
  - 改前失败，缺少 8 个 precache URL 和 4 个 D-Pad 标签。
  - 改后输出 `static checks passed`。
- 构建：
  - `snake-battle`: `npm run build` 通过。
  - `emoji-match`: `npm run build` 通过。
- 依赖审计：
  - `snake-battle`: `npm audit --audit-level=moderate` 输出 `found 0 vulnerabilities`。
  - `emoji-match`: `npm audit --audit-level=moderate` 输出 `found 0 vulnerabilities`。
- 预览流程：
  - `./play.sh` 在 8000 被占用时自动改用 8001。
  - Python HTTP 探测确认 `/`、`/index.html`、`/manifest.json`、`/sw.js`、`/icons/icon.svg` 和 9 个游戏入口全部返回 200。

## 对 gstack 报告的客观评估

有价值的事项：

- `/qa`、`/browse`、`/open-gstack-browser` 对这个项目价值很高。kid-games 是多页面、强移动端、强视觉交互项目，自动浏览器 QA 能发现真实回归。
- `play.sh` 先构建 Vite 子项目再静态预览的方向正确，本轮也验证了这条链路。
- `number-adventure` 的题号修复方向正确，当前代码已经避免第一题显示 `0 / 10`。
- `checkers` 和 `memory-matrix` 的小屏压缩布局方向正确，属于真实移动端可用性改进。
- `sw.js precache 只覆盖部分游戏` 是有效问题，本轮已修复。
- `star-catcher` 体积较大、Canvas 可访问性弱，是合理风险，但应先做真机和性能测量，再决定是否重构。

有问题或已过期的事项：

- “推箱子移动端完全不可玩”对当前工作树不成立。`sokoban/index.html` 已有 D-Pad、键盘、WASD 和滑动手势。
- “删除 index.old.html”当前已经处于删除状态，不能再当作待办项。
- “package-lock.json 需要加入 .gitignore”当前 `.gitignore` 已包含 `snake-battle/package-lock.json` 和 `emoji-match/package-lock.json`。
- “Vite moderate CVE”不能作为当前结论继续引用。当前两个子项目都是 `vite v8.0.10`，本轮 `npm audit --audit-level=moderate` 均为 0 漏洞。
- “测试覆盖率 0%”是事实，但对这个纯静态小游戏集合，短期优先级低于浏览器端冒烟测试、移动端交互和构建预览链路。

## 能力边界

Superpowers 的优势：

- 适合防止代理跳步骤：先想清楚、先写测试、先验证，再声称完成。
- 对 bugfix、计划、TDD、收尾特别强。
- 代价是流程很硬，遇到小修也会要求设计或测试门槛，速度会慢。

Agent Skills 的优势：

- 覆盖工程主题更广：前端、性能、安全、CI/CD、文档、发布、迁移。
- 更像高级工程 checklist，便于按场景抽取专项标准。
- 代价是约束力弱一些，需要操作者自己决定执行深度。

建议用法：

- 不建议“哪个顺手用哪个”。更好的分工是：Superpowers 管流程纪律，Agent Skills 管专项质量。
- 修改代码时先用 Superpowers 的流程技能定节奏，例如 TDD、debugging、verification。
- 做 UI、性能、安全、发布、文档时叠加 Agent Skills 的专项技能。
- 对 kid-games 的日常节奏：`gstack /qa` 做浏览器覆盖，Superpowers 保证修复过程不跳验证，Agent Skills 补充 UI 可访问性、性能和发布清单。

## 后续优先级

1. 对 `star-catcher` 做真实设备加载时间测量，再决定是否拆包或替换 Phaser 构建。
2. 如果继续增加游戏，再考虑统一的年龄/难度标签，而不是先大规模改首页信息架构。
