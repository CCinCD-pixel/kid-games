import './styles.css';

import { requireElement } from './dom';
import { LADDERS, STORAGE_KEY } from './game/levels';
import type {
  BoardTile,
  ClearMeta,
  CreationData,
  DragState,
  GoalState,
  Ladder,
  LadderProgress,
  LevelSpec,
  MatchGroup,
  ProgressState,
  RainbowSwapSet,
  ResultOptions,
  ScreenName,
  SolvedRecord,
  SparkShape,
  SpecialKind,
  SwapOptions,
  Tile,
} from './types';

type AudioContextCtor = new () => AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextCtor;
  }
}

const screens: Record<ScreenName, HTMLElement> = {
    menu: requireElement<HTMLElement>("menu-screen"),
    levels: requireElement<HTMLElement>("levels-screen"),
    game: requireElement<HTMLElement>("game-screen")
};

const ladderGridEl = requireElement<HTMLElement>("ladder-grid");
const globalProgressEl = requireElement<HTMLElement>("global-progress");
const levelsTitleEl = requireElement<HTMLElement>("levels-title");
const levelsDescEl = requireElement<HTMLElement>("levels-desc");
const summaryClearedEl = requireElement<HTMLElement>("summary-cleared");
const summaryNextEl = requireElement<HTMLElement>("summary-next");
const summaryStarsEl = requireElement<HTMLElement>("summary-stars");
const progressFillEl = requireElement<HTMLElement>("progress-fill");
const levelsGridEl = requireElement<HTMLElement>("levels-grid");
const continueBtn = requireElement<HTMLButtonElement>("continue-btn");
const backMenuBtn = requireElement<HTMLButtonElement>("back-menu-btn");
const hudLadderEl = requireElement<HTMLElement>("hud-ladder");
const hudLevelEl = requireElement<HTMLElement>("hud-level");
const hudMovesEl = requireElement<HTMLElement>("hud-moves");
const hudScoreEl = requireElement<HTMLElement>("hud-score");
const goalListEl = requireElement<HTMLElement>("goal-list");
const statusTitleEl = requireElement<HTMLElement>("status-title");
const statusTextEl = requireElement<HTMLElement>("status-text");
const boardShellEl = requireElement<HTMLElement>("board-shell");
const effectLayerEl = requireElement<HTMLElement>("effect-layer");
const comboBannerEl = requireElement<HTMLElement>("combo-banner");
const matchBoardEl = requireElement<HTMLElement>("match-board");
const restartBtn = requireElement<HTMLButtonElement>("restart-btn");
const backLevelsBtn = requireElement<HTMLButtonElement>("back-levels-btn");
const resultPanelEl = requireElement<HTMLElement>("result-panel");
const resultCaptionEl = requireElement<HTMLElement>("result-caption");
const resultScoreEl = requireElement<HTMLElement>("result-score");
const resultDetailEl = requireElement<HTMLElement>("result-detail");
const resultPrimaryBtn = requireElement<HTMLButtonElement>("result-primary-btn");
const resultSecondaryBtn = requireElement<HTMLButtonElement>("result-secondary-btn");

let progress: ProgressState = loadProgress();
let currentLadderId = LADDERS[0].id;
let currentLevelNumber = 1;
let currentLevel: LevelSpec = LADDERS[0].levels[0];
let board: BoardTile[] = [];
let boardSize = 5;
let selectedIndex: number | null = null;
let busy = false;
let movesLeft = 0;
let score = 0;
let goalsState: GoalState[] = [];
let tileId = 1;
let clearingSet: Set<number> = new Set();
let swapAnimations: Map<number, string> = new Map();
let specialFlashSet: Set<number> = new Set();
let badSwapSet: Set<number> = new Set();
let dragState: DragState | null = null;

// ==========================================
// ENHANCED VISUAL EFFECTS SYSTEM (VFX)
// ==========================================
const VFX = {
    // Show full board flash
    flashBoard(type: 'white' | 'rainbow' = 'white'): void {
        const flash = document.createElement('div');
        flash.className = `flash-overlay ${type}`;
        effectLayerEl.appendChild(flash);
        requestAnimationFrame(() => flash.classList.add('active'));
        setTimeout(() => flash.remove(), 600);
    },

    // Screen shake
    shakeBoard(intensity: 'light' | 'heavy' = 'light'): void {
        boardShellEl.classList.remove('shake', 'shake-light');
        void boardShellEl.offsetWidth;
        boardShellEl.classList.add(intensity === 'heavy' ? 'shake' : 'shake-light');
        setTimeout(() => boardShellEl.classList.remove('shake', 'shake-light'), 600);
    },

    // Show shockwave at position
    showShockwave(x: number, y: number): void {
        const shockwave = document.createElement('div');
        shockwave.className = 'shockwave';
        shockwave.style.left = x + 'px';
        shockwave.style.top = y + 'px';
        effectLayerEl.appendChild(shockwave);
        requestAnimationFrame(() => shockwave.classList.add('active'));
        setTimeout(() => shockwave.remove(), 700);
    },

    // Show stripe line sweep (horizontal or vertical)
    showStripeLine(orientation: 'horizontal' | 'vertical', index: number, tileSize: number, gap: number): void {
        const line = document.createElement('div');
        line.className = `stripe-line ${orientation}`;
        if (orientation === 'horizontal') {
            line.style.top = (index * (tileSize + gap) + tileSize / 2) + 'px';
        } else {
            line.style.left = (index * (tileSize + gap) + tileSize / 2) + 'px';
        }
        effectLayerEl.appendChild(line);
        requestAnimationFrame(() => line.classList.add('active'));
        setTimeout(() => line.remove(), 500);
    },

    // Show rainbow wave
    showRainbowWave(): void {
        const wave = document.createElement('div');
        wave.className = 'rainbow-wave';
        effectLayerEl.appendChild(wave);
        requestAnimationFrame(() => wave.classList.add('active'));
        setTimeout(() => wave.remove(), 900);
    },

    // Show chain combo number
    showChainNumber(level: number): void {
        const display = document.createElement('div');
        display.className = 'chain-display';
        display.textContent = level + 'x';
        effectLayerEl.appendChild(display);
        requestAnimationFrame(() => display.classList.add('show'));
        setTimeout(() => display.remove(), 1100);
    },

    // Enhanced spark burst with many particles and varied shapes
    createSparkBurst(indices: number[], color = '#ff8fab', maxCount = 20): void {
        const shellRect = boardShellEl.getBoundingClientRect();
        const shapes: SparkShape[] = ['circle', 'star', 'diamond'];
        indices.slice(0, maxCount).forEach((index, i) => {
            const tileEl = matchBoardEl.querySelector<HTMLElement>(`[data-index="${index}"]`);
            if (!tileEl) return;
            const rect = tileEl.getBoundingClientRect();
            const spark = document.createElement('div');
            const shape = shapes[i % shapes.length];
            spark.className = `spark ${shape}`;
            const size = 12 + Math.random() * 16;
            spark.style.width = size + 'px';
            spark.style.height = size + 'px';
            spark.style.left = (rect.left - shellRect.left + rect.width / 2 - size / 2) + 'px';
            spark.style.top = (rect.top - shellRect.top + rect.height / 2 - size / 2) + 'px';
            spark.style.background = color;
            spark.style.setProperty('--dx', ((Math.random() - 0.5) * 140) + 'px');
            spark.style.setProperty('--dy', ((Math.random() - 0.7) * 130) + 'px');
            effectLayerEl.appendChild(spark);
            setTimeout(() => spark.remove(), 900);
        });
    },

    // Show charge-up effect on special tiles
    chargeTiles(indices: number[]): void {
        indices.forEach(index => {
            const tileEl = matchBoardEl.querySelector<HTMLElement>(`[data-index="${index}"]`);
            if (tileEl) {
                tileEl.classList.add('charging');
                setTimeout(() => tileEl.classList.remove('charging'), 500);
            }
        });
    },

    // Bomb explosion - shockwave + many sparks
    bombExplosion(centerIndex: number): void {
        const tileEl = matchBoardEl.querySelector<HTMLElement>(`[data-index="${centerIndex}"]`);
        if (tileEl) {
            const rect = tileEl.getBoundingClientRect();
            const shellRect = boardShellEl.getBoundingClientRect();
            this.showShockwave(
                rect.left - shellRect.left + rect.width / 2,
                rect.top - shellRect.top + rect.height / 2
            );
            // Extra sparks for bomb
            this.createSparkBurst([centerIndex], '#ffd700', 30);
        }
        this.shakeBoard('heavy');
    },

    // Stripe activation - line sweep effect
    activateStripe(type: 'row' | 'col', lineIndex: number): void {
        const tileSize = matchBoardEl.querySelector<HTMLElement>('.tile')?.offsetWidth || 60;
        const gap = 8;
        this.showStripeLine(type === 'row' ? 'horizontal' : 'vertical', lineIndex, tileSize, gap);
        this.createSparkBurst([lineIndex], type === 'row' ? '#ffcc66' : '#66ccff', 16);
    },

    // Rainbow activation - wave effect
    activateRainbow(): void {
        this.showRainbowWave();
        this.flashBoard('rainbow');
        this.shakeBoard('heavy');
        // Rainbow creates sparks across entire board
        const allIndices = Array.from({length: boardSize * boardSize}, (_, i) => i);
        this.createSparkBurst(allIndices, '#ffd700', 40);
    }
};

// Enhanced AudioEngine with more impactful sounds
const AudioEngine = (() => {
    let ctx: AudioContext | null = null;
    function ensure(): AudioContext | null {
        if (!ctx) {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            ctx = new Ctor();
        }
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return ctx;
    }
    function tone(freq: number, duration: number, type: OscillatorType, volume: number): void {
        const audio = ensure();
        if (!audio) return;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + duration);
    }
    // Play multiple harmonics for richer sound
    function chord(freqs: number[], duration: number, volume: number): void {
        freqs.forEach(f => tone(f, duration, 'sine', volume / freqs.length));
    }
    return {
        select() { tone(520, 0.07, "triangle", 0.04); },
        swap() { tone(640, 0.08, "square", 0.05); },
        clear(power = 1) {
            // More impactful clear sound
            tone(520 + power * 45, 0.12, "triangle", 0.07);
            window.setTimeout(() => tone(690 + power * 40, 0.15, "triangle", 0.07), 60);
            window.setTimeout(() => tone(860 + power * 30, 0.18, "sine", 0.05), 120);
        },
        combo(level: number): void {
            // Dramatic combo sound with harmonics
            const baseFreq = 600 + level * 80;
            chord([baseFreq, baseFreq * 1.5, baseFreq * 2], 0.15, 0.08);
            window.setTimeout(() => chord([baseFreq * 1.2, baseFreq * 1.8], 0.2, 0.07), 100);
            window.setTimeout(() => tone(baseFreq * 2.5, 0.3, "triangle", 0.06), 200);
        },
        fail() {
            tone(220, 0.15, "sawtooth", 0.06);
            window.setTimeout(() => tone(160, 0.2, "sawtooth", 0.06), 80);
        },
        explosion() {
            // Bomb/explosion sound
            tone(150, 0.1, "sawtooth", 0.1);
            tone(100, 0.2, "square", 0.08);
            window.setTimeout(() => tone(80, 0.3, "sawtooth", 0.06), 50);
        },
        stripe() {
            // Stripe sweep sound
            tone(800, 0.08, "square", 0.06);
            tone(1000, 0.1, "square", 0.05);
            tone(1200, 0.12, "triangle", 0.04);
        },
        rainbow() {
            // Rainbow super effect sound
            chord([523, 659, 784, 1047], 0.2, 0.06);
            window.setTimeout(() => chord([587, 740, 880, 1175], 0.25, 0.06), 150);
            window.setTimeout(() => chord([659, 784, 988, 1319], 0.3, 0.07), 300);
        }
    };
})();

function loadProgress(): ProgressState {
    const state: ProgressState = { ladders: {} };
    LADDERS.forEach((ladder) => {
        state.ladders[ladder.id] = { unlocked: 1, solved: {} };
    });
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as { ladders?: Record<string, { unlocked?: unknown; solved?: unknown }> } | null;
        if (!raw || !raw.ladders) return state;
        LADDERS.forEach((ladder) => {
            const saved = raw.ladders?.[ladder.id] || {};
            state.ladders[ladder.id] = {
                unlocked: Math.max(1, Math.min(ladder.levels.length, Number(saved.unlocked) || 1)),
                solved: typeof saved.solved === "object" && saved.solved ? saved.solved as Record<number, SolvedRecord> : {}
            };
        });
    } catch {
        return state;
    }
    return state;
}

function saveProgress(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {}
}

function setScreen(name: ScreenName): void {
    Object.entries(screens).forEach(([key, el]) => {
        el.classList.toggle("active", key === name);
    });
}

function getLadder(id: string): Ladder {
    const ladder = LADDERS.find((item) => item.id === id);
    if (!ladder) throw new Error(`Unknown ladder: ${id}`);
    return ladder;
}

function getLadderProgress(id: string): LadderProgress {
    return progress.ladders[id];
}

function getSolvedCount(id: string): number {
    return Object.keys(getLadderProgress(id).solved).length;
}

function getStarCount(id: string): number {
    return Object.values(getLadderProgress(id).solved).reduce((sum, item) => sum + (item.stars || 0), 0);
}

function getNextLevelNumber(id: string): number {
    return Math.min(getLadder(id).levels.length, getLadderProgress(id).unlocked);
}

function setStatus(title: string, text: string): void {
    statusTitleEl.textContent = title;
    statusTextEl.textContent = text;
}

function hideResult(): void {
    resultPanelEl.classList.remove("show");
}

function showResult(options: ResultOptions): void {
    resultCaptionEl.textContent = options.caption;
    resultScoreEl.textContent = options.score;
    resultDetailEl.textContent = options.detail;
    resultPrimaryBtn.textContent = options.primaryLabel;
    resultSecondaryBtn.textContent = options.secondaryLabel;
    resultPrimaryBtn.onclick = options.primaryAction;
    resultSecondaryBtn.onclick = options.secondaryAction;
    resultPanelEl.classList.add("show");
}

function renderMenu(shouldSwitch = true): void {
    const totalLevels = LADDERS.reduce((sum, ladder) => sum + ladder.levels.length, 0);
    const done = LADDERS.reduce((sum, ladder) => sum + getSolvedCount(ladder.id), 0);
    globalProgressEl.textContent = `已完成 ${done} / ${totalLevels} 关`;
    ladderGridEl.innerHTML = "";
    LADDERS.forEach((ladder) => {
        const solved = getSolvedCount(ladder.id);
        const stars = getStarCount(ladder.id);
        const nextLevel = getNextLevelNumber(ladder.id);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "ladder-card";
        card.style.borderColor = `${ladder.accent}66`;
        card.innerHTML = `
            <div class="pill" style="color:${ladder.accent};">${ladder.title}</div>
            <h3>${ladder.shortTitle}</h3>
            <div class="muted" style="margin-top:8px;line-height:1.55;">${ladder.description}</div>
            <div class="meta">
                <div>已通关：${solved} / ${ladder.levels.length}</div>
                <div>累计星星：${stars} ✨</div>
                <div>继续建议：第 ${nextLevel} 关</div>
            </div>
        `;
        card.addEventListener("click", () => {
            currentLadderId = ladder.id;
            renderLevels();
        });
        ladderGridEl.appendChild(card);
    });
    if (shouldSwitch) setScreen("menu");
}

function renderLevels(): void {
    const ladder = getLadder(currentLadderId);
    const solved = getSolvedCount(currentLadderId);
    const nextLevel = getNextLevelNumber(currentLadderId);
    levelsTitleEl.textContent = ladder.title;
    levelsDescEl.textContent = ladder.description;
    summaryClearedEl.textContent = `${solved} / ${ladder.levels.length}`;
    summaryNextEl.textContent = `第 ${nextLevel} 关`;
    summaryStarsEl.textContent = `${getStarCount(currentLadderId)} ✨`;
    progressFillEl.style.width = `${(solved / ladder.levels.length) * 100}%`;
    levelsGridEl.innerHTML = "";

    ladder.levels.forEach((level) => {
        const record = getLadderProgress(currentLadderId).solved[level.number];
        const unlocked = level.number <= getLadderProgress(currentLadderId).unlocked || Boolean(record);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "level-pill";
        if (!unlocked) button.classList.add("locked");
        if (record) button.classList.add("done");
        if (level.number === nextLevel) button.classList.add("current");
        button.innerHTML = `${level.number}${record ? `<span class="badge">${"✨".repeat(record.stars || 1)}</span>` : ""}`;
        if (unlocked) {
            button.addEventListener("click", () => startLevel(currentLadderId, level.number));
        } else {
            button.disabled = true;
        }
        levelsGridEl.appendChild(button);
    });

    continueBtn.textContent = solved >= ladder.levels.length ? "重玩第 40 关" : `继续第 ${nextLevel} 关`;
    continueBtn.onclick = () => startLevel(currentLadderId, solved >= ladder.levels.length ? ladder.levels.length : nextLevel);
    setScreen("levels");
}

function pickGoalKinds(pool: string[], count: number, seed: number): string[] {
    const result = [];
    for (let i = 0; i < count; i += 1) {
        result.push(pool[(seed + i * 2) % pool.length]);
    }
    return result;
}

function startLevel(ladderId: string, levelNumber: number): void {
    currentLadderId = ladderId;
    currentLevelNumber = levelNumber;
    currentLevel = getLadder(ladderId).levels[levelNumber - 1];
    boardSize = currentLevel.boardSize;
    selectedIndex = null;
    busy = false;
    score = 0;
    movesLeft = currentLevel.moves;
    clearingSet = new Set();
    specialFlashSet = new Set();
    swapAnimations = new Map();
    badSwapSet = new Set();
    dragState = null;
    tileId = 1;
    hideResult();

    const ladder = getLadder(ladderId);
    const goalKinds = pickGoalKinds(ladder.pool, currentLevel.goals.length, levelNumber + ladder.pool.length);
    goalsState = currentLevel.goals.map((target, index) => ({
        kind: goalKinds[index],
        target,
        collected: 0
    }));

    board = createPlayableBoard(boardSize, ladder.pool.slice(0, currentLevel.kindCount));
    renderGame();
    setStatus("开始闯关", "做四个会得到横扫或竖扫，做五个或者十字形会得到炸弹。");
    setScreen("game");
}

function createPlayableBoard(size: number, pool: string[]): BoardTile[] {
    let attempt = 0;
    while (attempt < 80) {
        const nextBoard = new Array(size * size).fill(null);
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const forbidden = new Set();
                if (x >= 2) {
                    const left1 = nextBoard[indexOf(x - 1, y, size)];
                    const left2 = nextBoard[indexOf(x - 2, y, size)];
                    if (left1 && left2 && left1.kind === left2.kind) forbidden.add(left1.kind);
                }
                if (y >= 2) {
                    const up1 = nextBoard[indexOf(x, y - 1, size)];
                    const up2 = nextBoard[indexOf(x, y - 2, size)];
                    if (up1 && up2 && up1.kind === up2.kind) forbidden.add(up1.kind);
                }
                const choices = pool.filter((kind) => !forbidden.has(kind));
                const kind = choices[Math.floor(Math.random() * choices.length)];
                nextBoard[indexOf(x, y, size)] = makeTile(kind);
            }
        }
        if (hasPossibleMove(nextBoard, size)) return nextBoard;
        attempt += 1;
    }
    return new Array(size * size).fill(null).map(() => makeTile(pool[Math.floor(Math.random() * pool.length)]));
}

function makeTile(kind: string, special: SpecialKind | null = null): Tile {
    return {
        id: tileId++,
        kind,
        special
    };
}

function getSpecialPriority(special: SpecialKind | null): number {
    if (special === "bomb") return 4;
    if (special === "rainbow") return 3;
    if (special === "row" || special === "col") return 2;
    return 0;
}

function indexOf(x: number, y: number, size = boardSize): number {
    return y * size + x;
}

function coords(index: number, size = boardSize): { x: number; y: number } {
    return { x: index % size, y: Math.floor(index / size) };
}

function areAdjacent(a: number, b: number): boolean {
    const p1 = coords(a);
    const p2 = coords(b);
    return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y) === 1;
}

function swapTiles(source: BoardTile[], a: number, b: number): void {
    const temp = source[a];
    source[a] = source[b];
    source[b] = temp;
}

function renderGame(): void {
    const ladder = getLadder(currentLadderId);
    matchBoardEl.style.setProperty("--grid-size", String(boardSize));
    hudLadderEl.textContent = ladder.shortTitle;
    hudLevelEl.textContent = `${currentLevelNumber} / ${ladder.levels.length}`;
    hudMovesEl.textContent = String(movesLeft);
    hudScoreEl.textContent = String(score);

    goalListEl.innerHTML = "";
    goalsState.forEach((goal) => {
        const chip = document.createElement("div");
        chip.className = "goal-chip";
        if (goal.collected >= goal.target) chip.classList.add("done");
        chip.textContent = `${goal.kind} ${Math.min(goal.collected, goal.target)} / ${goal.target}`;
        goalListEl.appendChild(chip);
    });

    matchBoardEl.innerHTML = "";
    board.forEach((tile, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tile";
        button.dataset.index = String(index);
        if (selectedIndex === index) button.classList.add("selected");
        if (dragState && dragState.index === index) button.classList.add("drag-source");
        if (clearingSet.has(index)) button.classList.add("clearing");
        if (specialFlashSet.has(index)) button.classList.add("special-fire");
        if (badSwapSet.has(index)) button.classList.add("bad-swap");
        if (!tile) button.classList.add("empty");
        if (tile && tile.special) button.classList.add(`special-${tile.special}`);
        const swapClass = swapAnimations.get(index);
        if (swapClass) button.classList.add(swapClass);
        button.innerHTML = tile ? `<span class="emoji">${tile.kind}</span>` : "";
        matchBoardEl.appendChild(button);
    });
}

function showComboBanner(text: string): void {
    comboBannerEl.textContent = text;
    comboBannerEl.classList.remove("show");
    void comboBannerEl.offsetWidth;
    comboBannerEl.classList.add("show");
}

function showBurstText(text: string, kind = "good"): void {
    const el = document.createElement("div");
    el.className = `burst-text ${kind}`;
    el.textContent = text;
    effectLayerEl.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    window.setTimeout(() => el.remove(), 1000);
}

function createSparkBurst(indices: number[], color = "#ff8fab", maxCount = 20): void {
    // Use enhanced VFX system (20 particles default, up from 8)
    VFX.createSparkBurst(indices, color, maxCount);
}

function setSwapAnimationPair(a: number, b: number): void {
    const start = coords(a);
    const end = coords(b);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    swapAnimations = new Map();
    if (dx === 1) {
        swapAnimations.set(a, "from-right");
        swapAnimations.set(b, "from-left");
    } else if (dx === -1) {
        swapAnimations.set(a, "from-left");
        swapAnimations.set(b, "from-right");
    } else if (dy === 1) {
        swapAnimations.set(a, "from-down");
        swapAnimations.set(b, "from-up");
    } else if (dy === -1) {
        swapAnimations.set(a, "from-up");
        swapAnimations.set(b, "from-down");
    }
    window.setTimeout(() => {
        swapAnimations = new Map();
        renderGame();
    }, 240);
}

function handleTileTap(index: number): void {
    if (busy) return;
    const tile = board[index];
    if (!tile) return;

    if (selectedIndex === null) {
        selectedIndex = index;
        AudioEngine.select();
        renderGame();
        return;
    }

    if (selectedIndex === index) {
        selectedIndex = null;
        renderGame();
        return;
    }

    if (!areAdjacent(selectedIndex, index)) {
        selectedIndex = index;
        renderGame();
        return;
    }

    const from = selectedIndex;
    selectedIndex = null;
    attemptSwap(from, index);
}

function tileFromEvent(event: PointerEvent): number | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const tileEl = target.closest<HTMLElement>(".tile");
    if (!tileEl || !matchBoardEl.contains(tileEl)) return null;
    const index = Number(tileEl.dataset.index);
    return Number.isFinite(index) ? index : null;
}

function getDragTarget(index: number, dx: number, dy: number): number | null {
    const point = coords(index);
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (Math.abs(dx) < 18) return null;
        const nextX = point.x + (dx > 0 ? 1 : -1);
        if (nextX < 0 || nextX >= boardSize) return null;
        return indexOf(nextX, point.y);
    }
    if (Math.abs(dy) < 18) return null;
    const nextY = point.y + (dy > 0 ? 1 : -1);
    if (nextY < 0 || nextY >= boardSize) return null;
    return indexOf(point.x, nextY);
}

function onBoardPointerDown(event: PointerEvent): void {
    if (busy) return;
    const index = tileFromEvent(event);
    if (index === null || !board[index]) return;
    event.preventDefault();
    dragState = {
        pointerId: event.pointerId,
        index,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
    };
    renderGame();
}

function onBoardPointerMove(event: PointerEvent): void {
    if (!dragState || dragState.pointerId !== event.pointerId || busy) return;
    const target = getDragTarget(dragState.index, event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (target === null || !board[target]) return;
    dragState.moved = true;
    const from = dragState.index;
    dragState = null;
    selectedIndex = null;
    attemptSwap(from, target, { fromDrag: true });
}

function onBoardPointerUp(event: PointerEvent): void {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const index = dragState.index;
    const moved = dragState.moved;
    dragState = null;
    if (!moved) handleTileTap(index);
    else renderGame();
}

async function attemptSwap(a: number, b: number, options: SwapOptions = {}): Promise<void> {
    if (busy) return;
    busy = true;
    swapTiles(board, a, b);
    setSwapAnimationPair(a, b);
    AudioEngine.swap();
    renderGame();

    if ((board[a] && board[a].special === "rainbow") || (board[b] && board[b].special === "rainbow")) {
        movesLeft -= 1;
        const rainbow = buildRainbowSwapSet(a, b);
        setStatus("超级棋子出动", "它会把全盘同类棋子一下子全部清掉。");
        showComboBanner("超级清屏!");
        showBurstText("超级棋子!", "combo");
        await applyClearSet(rainbow.clearSet, new Map(), {
            comboLevel: 2,
            source: "rainbow",
            flashColor: rainbow.color,
            burstText: rainbow.label
        });
        await resolveCascades();
        finishTurn();
        return;
    }

    if ((board[a] && board[a].special) || (board[b] && board[b].special)) {
        movesLeft -= 1;
        setStatus("特殊块出动", "看它们怎么把整行、整列或者一片区域清掉。");
        showBurstText("特殊块!", "combo");
        let clearSet = new Set([a, b]);
        expandSpecials(clearSet);
        await applyClearSet(clearSet, new Map(), { comboLevel: 1, source: "special" });
        await resolveCascades();
        finishTurn();
        return;
    }

    const groups = findMatches(board, boardSize);
    if (!groups.length) {
        await wait(240);
        swapTiles(board, a, b);
        setSwapAnimationPair(b, a);
        badSwapSet = new Set([a, b]);
        renderGame();
        setStatus("这步不行", "换成旁边另一个表情试试。");
        showBurstText(options.fromDrag ? "滑错啦" : "再试试", "good");
        AudioEngine.fail();
        window.setTimeout(() => {
            badSwapSet = new Set();
            renderGame();
        }, 360);
        busy = false;
        return;
    }

    movesLeft -= 1;
    setStatus("消掉啦", "继续找机会做四消和五消。");
    await applyMatchGroups(groups, [a, b], 1);
    await resolveCascades();
    finishTurn();
}

function findMatches(source: BoardTile[], size: number): MatchGroup[] {
    const groups: MatchGroup[] = [];

    for (let y = 0; y < size; y += 1) {
        let x = 0;
        while (x < size) {
            const start = indexOf(x, y, size);
            const tile = source[start];
            if (!tile) {
                x += 1;
                continue;
            }
            let end = x + 1;
            while (end < size) {
                const other = source[indexOf(end, y, size)];
                if (!other || other.kind !== tile.kind) break;
                end += 1;
            }
            if (end - x >= 3) {
                groups.push({
                    kind: tile.kind,
                    orientation: "row",
                    indices: Array.from({ length: end - x }, (_, offset) => indexOf(x + offset, y, size))
                });
            }
            x = end;
        }
    }

    for (let x = 0; x < size; x += 1) {
        let y = 0;
        while (y < size) {
            const start = indexOf(x, y, size);
            const tile = source[start];
            if (!tile) {
                y += 1;
                continue;
            }
            let end = y + 1;
            while (end < size) {
                const other = source[indexOf(x, end, size)];
                if (!other || other.kind !== tile.kind) break;
                end += 1;
            }
            if (end - y >= 3) {
                groups.push({
                    kind: tile.kind,
                    orientation: "col",
                    indices: Array.from({ length: end - y }, (_, offset) => indexOf(x, y + offset, size))
                });
            }
            y = end;
        }
    }

    return groups;
}

function preferredCreateIndex(group: MatchGroup, movedIndices: number[]): number {
    for (const index of movedIndices) {
        if (group.indices.includes(index)) return index;
    }
    return group.indices[Math.floor(group.indices.length / 2)];
}

function buildCreationMap(groups: MatchGroup[], movedIndices: number[]): Map<number, CreationData> {
    const createMap: Map<number, CreationData> = new Map();
    const overlap: Map<number, number> = new Map();
    groups.forEach((group) => {
        group.indices.forEach((index) => {
            overlap.set(index, (overlap.get(index) || 0) + 1);
        });
    });

    overlap.forEach((count, index) => {
        if (count > 1) {
            const tile = board[index];
            if (tile) createMap.set(index, { kind: tile.kind, special: "bomb" });
        }
    });

    groups.forEach((group) => {
        if (group.indices.length < 4) return;
        const index = preferredCreateIndex(group, movedIndices);
        const tile = board[index];
        if (!tile) return;
        const special = group.indices.length >= 5 ? "rainbow" : group.orientation === "row" ? "row" : "col";
        const existing = createMap.get(index);
        if (!existing || getSpecialPriority(special) > getSpecialPriority(existing.special)) {
            createMap.set(index, { kind: tile.kind, special });
        }
    });

    return createMap;
}

function expandSpecials(clearSet: Set<number>): void {
    const queue: number[] = [...clearSet];
    const seen: Set<number> = new Set();
    while (queue.length) {
        const index = queue.shift();
        if (index === undefined) continue;
        if (seen.has(index)) continue;
        seen.add(index);
        const tile = board[index];
        if (!tile || !tile.special) continue;
        getBlastIndices(index, tile.special).forEach((target) => {
            if (!clearSet.has(target)) {
                clearSet.add(target);
                queue.push(target);
            }
        });
    }
}

function getBlastIndices(index: number, special: SpecialKind): number[] {
    const { x, y } = coords(index);
    const indices: number[] = [];
    if (special === "row") {
        for (let cx = 0; cx < boardSize; cx += 1) indices.push(indexOf(cx, y));
    } else if (special === "col") {
        for (let cy = 0; cy < boardSize; cy += 1) indices.push(indexOf(x, cy));
    } else if (special === "bomb") {
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                    indices.push(indexOf(nx, ny));
                }
            }
        }
    } else if (special === "rainbow") {
        const tile = board[index];
        if (!tile) return indices;
        for (let target = 0; target < board.length; target += 1) {
            const current = board[target];
            if (current && current.kind === tile.kind) indices.push(target);
        }
    }
    return indices;
}

function buildRainbowSwapSet(a: number, b: number): RainbowSwapSet {
    const tileA = board[a];
    const tileB = board[b];
    const clearSet: Set<number> = new Set([a, b]);
    if (tileA && tileB && tileA.special === "rainbow" && tileB.special === "rainbow") {
        for (let index = 0; index < board.length; index += 1) {
            if (board[index]) clearSet.add(index);
        }
        return { clearSet, label: "双超级清屏!", color: "#ffd166" };
    }

    const rainbowIndex = tileA && tileA.special === "rainbow" ? a : b;
    const targetTile = rainbowIndex === a ? tileB : tileA;
    const targetKind = targetTile ? targetTile.kind : null;
    if (!targetKind) {
        return { clearSet, label: "超级清屏!", color: "#ffd166" };
    }

    for (let index = 0; index < board.length; index += 1) {
        const current = board[index];
        if (current && current.kind === targetKind) clearSet.add(index);
    }
    return { clearSet, label: `${targetKind} 全盘消除!`, color: "#ffd166" };
}

async function applyMatchGroups(groups: MatchGroup[], movedIndices: number[], comboLevel = 1): Promise<void> {
    const clearSet: Set<number> = new Set();
    groups.forEach((group) => group.indices.forEach((index) => clearSet.add(index)));
    const createMap = buildCreationMap(groups, movedIndices);
    expandSpecials(clearSet);
    createMap.forEach((_, index) => clearSet.delete(index));
    await applyClearSet(clearSet, createMap, { comboLevel, source: "match" });
}

async function applyClearSet(clearSet: Set<number>, createMap: Map<number, CreationData>, meta: ClearMeta = {}): Promise<void> {
    const comboLevel = meta.comboLevel || 1;
    specialFlashSet = new Set(createMap.keys());
    clearingSet = new Set(clearSet);
    renderGame();

    // Enhanced VFX: charge-up special tiles before explosion
    if (createMap.size > 0) {
        VFX.chargeTiles([...createMap.keys()]);
    }

    // Detect and trigger special tile VFX
    let hasBomb = false;
    let hasStripe = false;
    let stripeType: 'row' | 'col' = 'row';
    let stripeIndex = -1;
    let hasRainbow = meta.source === 'rainbow';

    // Check clearSet for bomb and stripe activations
    clearSet.forEach(index => {
        const tile = board[index];
        if (tile && tile.special) {
            if (tile.special === 'bomb' && !hasBomb) {
                hasBomb = true;
                VFX.bombExplosion(index);
                AudioEngine.explosion();
            }
            if ((tile.special === 'row' || tile.special === 'col') && !hasStripe) {
                hasStripe = true;
                stripeType = tile.special;
                const c = coords(index);
                stripeIndex = tile.special === 'row' ? c.y : c.x;
                AudioEngine.stripe();
            }
        }
    });

    // Trigger rainbow wave
    if (hasRainbow) {
        VFX.activateRainbow();
        AudioEngine.rainbow();
    }

    // Trigger stripe line sweep
    if (hasStripe) {
        VFX.activateStripe(stripeType, stripeIndex);
    }

    // Enhanced spark bursts
    createSparkBurst(
        [...clearSet],
        meta.flashColor || (createMap.size ? "#f4b942" : "#ff8fab"),
        meta.source === "rainbow" ? 40 : 20
    );

    // Chain combo effects
    if (comboLevel > 1) {
        VFX.flashBoard('white');
        VFX.shakeBoard(comboLevel >= 3 ? 'heavy' : 'light');
        VFX.showChainNumber(comboLevel);
        if (meta.source !== 'rainbow') {
            showComboBanner(`连锁 x${comboLevel}`);
            AudioEngine.combo(comboLevel);
        } else {
            AudioEngine.combo(comboLevel + 1);
        }
    } else {
        AudioEngine.clear(createMap.size + clearSet.size / 4);
    }

    if (meta.burstText) {
        showBurstText(meta.burstText, "combo");
    } else if (createMap.size) {
        const specials = [...createMap.values()].map((item) => item.special);
        if (specials.includes("rainbow")) {
            showComboBanner("超级棋子诞生!");
            showBurstText("五消! 超级棋子!", "combo");
        } else if (specials.includes("bomb")) {
            showBurstText("炸弹诞生!", "combo");
        } else {
            showBurstText(createMap.size > 1 ? "超强合成!" : "做出特殊块!", "combo");
        }
    } else if (clearSet.size >= 6) {
        showBurstText("太棒啦!", "good");
    }
    await wait(320);
    collectRewards(clearSet);
    clearSet.forEach((index) => {
        board[index] = null;
    });
    createMap.forEach((data, index) => {
        board[index] = makeTile(data.kind, data.special);
        score += data.special === "bomb" ? 120 : 80;
    });
    collapseBoard();
    refillBoard();
    clearingSet = new Set();
    specialFlashSet = new Set();
    renderGame();
    await wait(240);
}

function collectRewards(clearSet: Set<number>): void {
    clearSet.forEach((index) => {
        const tile = board[index];
        if (!tile) return;
        score += tile.special ? 70 : 35;
        goalsState.forEach((goal) => {
            if (goal.kind === tile.kind && goal.collected < goal.target) {
                goal.collected += 1;
            }
        });
    });
}

function collapseBoard(): void {
    for (let x = 0; x < boardSize; x += 1) {
        const column = [];
        for (let y = boardSize - 1; y >= 0; y -= 1) {
            const tile = board[indexOf(x, y)];
            if (tile) column.push(tile);
        }
        for (let y = boardSize - 1; y >= 0; y -= 1) {
            board[indexOf(x, y)] = column[boardSize - 1 - y] || null;
        }
    }
}

function refillBoard(): void {
    const pool = getLadder(currentLadderId).pool.slice(0, currentLevel.kindCount);
    for (let index = 0; index < board.length; index += 1) {
        if (!board[index]) {
            board[index] = makeTile(pool[Math.floor(Math.random() * pool.length)]);
        }
    }
}

async function resolveCascades(): Promise<void> {
    let comboLevel = 1;
    while (true) {
        const groups = findMatches(board, boardSize);
        if (!groups.length) break;
        comboLevel += 1;
        setStatus("连锁继续", "哇，新的连锁又自己消掉啦。");
        await applyMatchGroups(groups, [], comboLevel);
    }
}

function goalsCompleted(): boolean {
    return goalsState.every((goal) => goal.collected >= goal.target);
}

function finishTurn(): void {
    if (!hasPossibleMove(board, boardSize)) {
        reshuffleBoard();
        setStatus("重新排队", "没有可消的组合了，星星把棋盘重新排好了。");
    }
    renderGame();
    if (goalsCompleted()) {
        finishWin();
        return;
    }
    if (movesLeft <= 0) {
        finishFail();
        return;
    }
    setStatus("继续加油", "优先做四消和五消，会更容易完成目标。");
    busy = false;
}

function finishWin(): void {
    busy = false;
    const ladder = getLadder(currentLadderId);
    const ladderProgress = getLadderProgress(currentLadderId);
    const stars = movesLeft >= Math.ceil(currentLevel.moves * 0.35) ? 3 : movesLeft >= Math.ceil(currentLevel.moves * 0.15) ? 2 : 1;
    const previous = ladderProgress.solved[currentLevelNumber];
    ladderProgress.solved[currentLevelNumber] = {
        stars: Math.max(stars, previous ? previous.stars || 0 : 0),
        bestScore: Math.max(score, previous ? previous.bestScore || 0 : 0)
    };
    ladderProgress.unlocked = Math.min(ladder.levels.length, Math.max(ladderProgress.unlocked, currentLevelNumber + 1));
    saveProgress();
    renderMenu(false);
    setStatus("通关成功", "这一关已经记住了，下次可以从已解锁关卡继续。");
    showResult({
        caption: "闯关成功",
        score: `${score} 分  ·  ${"✨".repeat(stars)}`,
        detail: currentLevelNumber >= ladder.levels.length
            ? "这一整个阶梯都打通了，可以回去重玩高分，或者试试更难的阶梯。"
            : `已解锁第 ${Math.min(ladder.levels.length, currentLevelNumber + 1)} 关。`,
        primaryLabel: currentLevelNumber >= ladder.levels.length ? "回到选关" : "下一关",
        primaryAction: () => currentLevelNumber >= ladder.levels.length ? renderLevels() : startLevel(currentLadderId, currentLevelNumber + 1),
        secondaryLabel: "回到选关",
        secondaryAction: () => renderLevels()
    });
}

function finishFail(): void {
    busy = false;
    setStatus("步数用完了", "下一次优先做特殊块，清目标会更快。");
    showResult({
        caption: "本关未通过",
        score: `${score} 分`,
        detail: "已完成的关卡不会丢失，可以随时回来重玩拿更高分。",
        primaryLabel: "重玩本关",
        primaryAction: () => startLevel(currentLadderId, currentLevelNumber),
        secondaryLabel: "回到选关",
        secondaryAction: () => renderLevels()
    });
}

function hasPossibleMove(source: BoardTile[], size: number): boolean {
    for (let index = 0; index < source.length; index += 1) {
        const tile = source[index];
        if (!tile) continue;
        const { x, y } = coords(index, size);
        const right = x + 1 < size ? indexOf(x + 1, y, size) : -1;
        const down = y + 1 < size ? indexOf(x, y + 1, size) : -1;
        for (const next of [right, down]) {
            if (next === -1 || !source[next]) continue;
            if (tile.special || source[next].special) return true;
            swapTiles(source, index, next);
            const matchFound = findMatches(source, size).length > 0;
            swapTiles(source, index, next);
            if (matchFound) return true;
        }
    }
    return false;
}

function reshuffleBoard(): void {
    const pool = getLadder(currentLadderId).pool.slice(0, currentLevel.kindCount);
    board = createPlayableBoard(boardSize, pool);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

backMenuBtn.addEventListener("click", () => renderMenu());
backLevelsBtn.addEventListener("click", renderLevels);
restartBtn.addEventListener("click", () => startLevel(currentLadderId, currentLevelNumber));
matchBoardEl.addEventListener("pointerdown", onBoardPointerDown);
window.addEventListener("pointermove", onBoardPointerMove);
window.addEventListener("pointerup", onBoardPointerUp);
window.addEventListener("pointercancel", onBoardPointerUp);

renderMenu();
