# Game build specs (2026-10)

One BUILD-READY spec per game, copied from the spec workshop (`~/kid-games-work/specs/`). The
executable prototype tools each spec cites (`~/kid-games-work/specs/<id>-tools/`) stay outside the
repo; implementations port them to TypeScript validators (docs/GAME_AUTHORING.md §8).
Master plan: [../plan-2026-10.md](../plan-2026-10.md). Where a spec and docs/ARCHITECTURE.md /
docs/GAME_AUTHORING.md disagree on engineering, the platform docs win; game rules/content follow
the spec.

| spec | game (folder) | place | status of the spec |
|---|---|---|---|
| [mars-base.md](mars-base.md) | 火星基地 (`mars-base`, replaces `/number-adventure`) | 基地 | v1.1 |
| [moon-builder.md](moon-builder.md) | 月宫建造师 (`moon-builder`, absorbs 记忆方块) | 基地 | v1.1 |
| [rover-code.md](rover-code.md) | 玉兔编程 (`rover-code`) | 基地 | v1.1 |
| [story-box.md](story-box.md) | 山海故事匣 (`story-box`) | 基地 | v1.1 |
| [tiangong-lab.md](tiangong-lab.md) | 天宫实验室 (`tiangong-lab`) | 基地 | v1.1 |
| [sokoban.md](sokoban.md) | 星港搬运工 (`sokoban`, rebuilt in place) | 基地 | v1.0 |
| [military-chess.md](military-chess.md) | 陆战棋 (`military-chess`, standard rules, rebuilt in place) | 基地 | v1.0 |
| [snake-battle.md](snake-battle.md) | 贪吃蛇大作战 (`snake-battle`) | 游乐场 | v1 |
| [emoji-match.md](emoji-match.md) | 星晶消消乐 (`emoji-match`) | 游乐场 | v1 |
| [memory-matrix.md](memory-matrix.md) | 记忆方块 (frozen; folds into 月宫 M4) | 经典角 | transition note |
| — | 棋手学院 (`chess`) | 基地 | **missing**: the spec run stopped at the session limit; drafts in `~/kid-games-work/specs/chess-parts/` |
| — | 机关守城 lane defense (`gear-fort`) | 游乐场 | **missing**: the spec run stopped at the session limit; simulator/level tools in `~/kid-games-work/specs/lane-defense-tools/` (folder id `gear-fort` taken from there) |
