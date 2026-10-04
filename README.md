# kid-games · 爸爸的游戏乐园

A static, offline-capable game hall for one kid's iPad (home-screen web app). Vite + TypeScript,
deployed by Netlify from `main` (free plan — production deploys are scarce).

```bash
npm ci
npm run dev          # http://localhost:5173/  (kit playground: /dev/kit/)
npm run check        # registry + content checks, typecheck, unit tests
npm run test:smoke   # build + WebKit smoke tests at iPad sizes (one browser)
./play.sh            # Netlify-identical build served on the LAN for the iPad
```

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Adding or rebuilding a game: [docs/GAME_AUTHORING.md](docs/GAME_AUTHORING.md)
