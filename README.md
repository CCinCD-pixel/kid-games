# kid-games · 爸爸的游戏乐园

A static, offline-capable game hall for one kid's iPad (home-screen web app). Vite + TypeScript,
deployed by Netlify from `main` (free plan — production deploys are scarce).

```bash
npm ci
npm run dev          # http://localhost:5173/  (kit playground: /dev/kit/)
npm run check        # registry + content checks, typecheck, unit tests
npm run test:smoke   # build + WebKit smoke tests at iPad sizes (one browser)
npm run voice:build -- hub   # narration clips with the local TTS (docs/VOICE.md: check memory first)
./play.sh            # Netlify-identical build served on the LAN for the iPad
```

The hub is 星港 (/): today's moon, the companion robot, places 基地 / 游乐场 / 经典角. Grown-ups:
hold the 家长 button (top right) or the 星港 title for 3 s → 家长中心 (PIN, stats, settings, backup).

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Adding or rebuilding a game: [docs/GAME_AUTHORING.md](docs/GAME_AUTHORING.md); specs in [docs/specs/](docs/specs/)
- Narration pipeline: [docs/VOICE.md](docs/VOICE.md)
- Master plan: [docs/plan-2026-10.md](docs/plan-2026-10.md); asset licences: [assets-src/LICENSES.md](assets-src/LICENSES.md)
