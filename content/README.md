# content/

Everything a parent can review without reading code: levels, question banks, scripts, narration
text. One folder (or file prefix) per game id. **Game code reads these files; validators read the
same files** (plan §6.4).

```
content/
├─ narration/
│  ├─ _lexicon.yaml          # site-wide polyphone/pronunciation overrides (voice pipeline)
│  └─ <game>.yaml            # every spoken line of one game → public/audio/<game>/
└─ <game>/                   # levels, banks, books … (format owned by the game / its engine)
```

Rules
- Text shown to the child is Chinese, short (instructions ≤15 characters), process praise only.
  `node tools/check-content.mjs` (part of `npm run build`) lints the tone; see TONE_RULES there.
- Never put the child's real name in any file (the in-game name is 小步步).
- Narration format and the generation step: docs/GAME_AUTHORING.md §Narration.
