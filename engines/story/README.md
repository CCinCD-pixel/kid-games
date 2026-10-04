# StoryKit (`@engines/story`)

Owner: 山海故事匣 agent. First user: `site/story-box/`. Wave: W1 (lite).

## Scope
- **Book model**: `content/story-box/<book>.yaml` → page JSON (layers, text runs, interactions,
  branches that re-join). Loader + validator (`tools/` script) that fails on missing art/audio.
- **Text grid**: per-character layout with optional pinyin row; tap a character → speak the *whole
  word* it belongs to (clip id `<book>.w.<word>`; polyphones locked at generation time).
- **Read modes**: 听我读 (auto narration with word highlight), 一起读 (tap to advance), 自己读.
- **Interactions**: per question type (choose, drag-to-scene, order, retell prompts).
- **字宝盒**: words collected while reading (saved through `@kit/progress`).
- **Recording** (later): MediaRecorder → IndexedDB, never uploaded.
- **Coverage report**: which characters/words a book exercises.

## Uses from kit
`Narrator` (clips + word timings), `createSubtitleBar`, `createStore`, `onTap`, `animate`.

## Contract sketch
```ts
loadBook(url: string): Promise<Book>
mountReader(host: HTMLElement, book: Book, opts: { narrator: Narrator; mode: 'listen' | 'together' | 'self' }): Reader
validateBook(book: Book, manifest: NarrationManifest): string[]   // used by tools + vitest
```
