# BoardKit (`@engines/board`)

共享棋盘引擎（象棋 9×10 与国际象棋 8×8 通用）。**现状、import 路径与用法见 [STATUS.md](./STATUS.md)；设计见 `docs/specs/board-engine.md`。**
所有者：engines-board 任务（`engines/board/**`、`site/dev/board/**`、`tests/board/**`、`tools/board/**`）；游戏代理只提变更请求（`~/kid-games-work/state/rr/engine-requests.md`）。

## 目录
`core/`（冻结的契约与算法）· `view/` · `input/` · `play/`（对局会话 / 面对面 / 记录 / 复盘 / 原因文案）· `ai/`（Worker 宿主与处理器）·
`lesson/`（课播放器与 15 种步型）· `puzzle/`（题校验 / 审计 / 播放器）· `art/`（OKLab 配方与烘焙）· `save/` · `test/`（一致性套件、差分、校准、Playwright 助手、夹具）。

## 铁律
- 规则引擎纯函数、确定性；页面、Worker、校验器 import 同一份。
- 没有 barrel（`index.ts`）；Worker 包只含 `core/` + `ai/` + 游戏规则（有体积测试）。
- 输了不庆祝、孩子走错只"看一眼 + 悔回"，不出现"错"字、不扣星。
