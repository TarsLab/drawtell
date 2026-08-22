# drawtell

**draw & tell** — turn problems into stroke-by-stroke chalkboard explanations, from your terminal.

> **Status: early.** `check` and `build` work from a repo checkout (Node ≥ 22.18, runs the TS
> sources via native type stripping). The npm release is still a name-reservation placeholder.

drawtell(边画边讲):把题目变成逐笔画出、带讲解节奏的黑板动画。

## CLI

```
drawtell check <scene.ts> [--json]              # schema + stroke-order + layout checks, errors as fix guides
drawtell build <scene.ts> [--out <dir>]         # scene → lesson bundle (scene.json + manifest.json), idempotent
drawtell serve [--port <n>] [--bundles <dir>]   # web player + bundle list (/api/bundles) + LAN distribution
drawtell snap <scene.ts|bundle-id> [--step <n>] [--no-cursor]   # keyframe screenshots + index.json
drawtell dub <scene.ts|bundle-id> --voice <v> [--instruction <s>] [--dry-run]   # narration audio via voxtell
drawtell ls                                       # workspace status: source / bundle / audio / snaps / review
drawtell tidy <dir> [--older-than <days>] [--delete]   # remove unreferenced old files (lists only by default)
```

`snap` writes `snaps/<id>/step-<n>.png` (0 = blank board) and `index.json` (schema `drawtell-snaps` v2):
per shot the narration line, the elements **added in that step** (`id`, `type`, colors, `text`, approximate
`bbox` in scene coordinates) and the board `viewBox` — so a reviewer can name elements by id and check counts /
clipping without reading the scene source. `--step n` re-shoots one step and **merges** into the existing
index; `--no-cursor` omits the chalk pointer (recommended for review frames). Frames freeze half a millisecond
before the step boundary (no trace of the next stroke) and hand-drawn wobble is seeded per element id, so
re-running yields byte-identical images.

Player page params (what `snap` drives): `?scene=<id>` load a bundle · `&step=<n>` freeze at
the end of step n (0 = blank board) · `&bare=1` chrome-less stage. The page sets
`body[data-drawtell-ready="1"]` once rendered and seeked. `snap` needs playwright
(devDependency; `npx playwright install chromium` once) and built web assets (`pnpm build`).

`dub` is the glue to [voxtell](https://github.com/tarslab/voxtell): each step's `line` → `voxtell batch`
(user-level content-addressed cache, so re-dubbing after editing one line re-synthesizes one line) →
`bundles/<id>/audio/step-<n>.mp3` + `audio/index.json` (step ↔ file ↔ line hash) → `audioSrc` in
`manifest.json`. `build` re-attaches `audioSrc` for steps whose line hash still matches, so an edited
line silently loses its stale audio until you dub again. Voice and instruction are application policy:
pass `--voice` or put `{"dub": {"voice": "...", "instruction": "..."}}` in `drawtell.json` at the
workspace root; there is no default voice. The player starts a step's audio with its strokes and ends
the step when both drawing and narration are done. `dub` also records each step's `audioDurationMs`
(measured by voxtell) and reports pacing (`音 11.7s / 画 3.1s → 拉伸 ×3.8`); the player stretches a
step's stroke durations to the narration length before building the SVG (stretch only, capped ×5 —
beyond that the line is too long or the step draws too little, fix the explanation, not the clock), so
"draw and count: 1, 2 … 14" really draws one circle per count.

`drawtell.json` also carries `title` (the kid-facing UI title, default `drawtell` — the kid-facing UI has no
brand of its own; the name is the family's setting) and `paths` (where derived `bundles` / `snaps` go, plus
parent-facing directory **roles** `reviews` / `photos` / `ledger` / `notes` / `kids`, default = same-name English
directories; contracts and skills only ever name the role, a family maps it to any directory name — see
`docs/文件系统.md`).

Planned: `ls`

Exit codes: `0` pass · `1` scene has problems (findings carry fix guidance) · `2` usage error ·
`3` planned-but-unimplemented · `4` internal error. Every command takes `--json`.

## Glyphs

`drawtell/glyphs` ships stroke-order data for the 26 lowercase Latin letters —
*how a letter is written*, one stroke at a time, not just how it looks. Normalized to
the four-line ruling used on practice paper (x-height = 1, baseline = 0), rendered as
`freedraw` elements so handwriting demos and chalkboard explanations share one
animation pipeline. See [docs/glyphs.md](docs/glyphs.md).

```ts
import { wordSkeletons } from 'drawtell/glyphs';
import { buildAnimatedSvg } from 'drawtell/player';

const { svg } = await buildAnimatedSvg(wordSkeletons('ram', { xHeight: 120, x: 80, y: 300 }));
```

## Development

```bash
pnpm install
pnpm dev          # polishing bench (打磨台) at http://localhost:5175
pnpm typecheck    # browser side (tsconfig.json) + node side (tsconfig.cli.json)
pnpm build        # static bundle → dist/web

node bin/drawtell.js check scenes/dengche.ts
node bin/drawtell.js build scenes/dengche.ts   # → bundles/dengche/
```

Layout: `src/player/` — the chalkboard player engine (stroke-by-stroke SVG replay via
excalidraw + excalidraw-animate, pointer tracking, per-step pauses); `src/web/` — the
polishing bench, future home of `drawtell serve` pages; `src/cli/` — the CLI (check /
build); `src/schema/` — the scene contract (zod) and lesson-bundle contract; `scenes/` —
seed scenes (authored in TS, the source format; lesson bundles in JSON are the build
artifact).

## Filesystem

All state lives on the filesystem — plain files you can `ls`, `git`, and `rm`. Sources
(`scenes/*.ts`) and human decisions (`bundles/*/review.json`, planned) are precious;
everything else is derived and regenerable. Layout and state model: [docs/文件系统.md](docs/文件系统.md).

## Design principles

Built agent-first: text in, text out; `--json` on every command; semantic exit
codes; no interactive prompts; error messages that say what to do next. The
same rules that make a CLI good for LLM agents make it good for humans.

## License

MIT © tarslab
