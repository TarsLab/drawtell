# drawtell

**draw & tell** — turn problems into stroke-by-stroke chalkboard explanations, from your terminal.

> **Status: early.** `check` / `build` / `serve` / `snap` / `dub` / `note` / `ls` / `init` / `doctor` work,
> either from npm (`npm i -g drawtell`, Node ≥ 22.18) or from a repo checkout (which runs the TS sources via
> native type stripping). `snap` needs `npx playwright install chromium` (playwright is an optional dependency).

drawtell(边画边讲):把题目变成逐笔画出、带讲解节奏的黑板动画。

## CLI

```
drawtell check <scene.ts> [--no-types] [--json] # types (embedded tsc, zero workspace config) + schema + stroke-order + layout checks, errors as fix guides
drawtell build <scene.ts> [--out <dir>]         # scene → lesson bundle (scene.json + manifest.json), idempotent
drawtell serve [--port <n>] [--bundles <dir>]   # / = bundle list page (iPad entry) · ?scene=<id> player · /bundles/<id>/ + /api/bundles for LAN distribution
drawtell snap <scene.ts|bundle-id> [--step <n>] [--no-cursor] [--out <dir>] [--bundles <dir>]   # keyframe screenshots + index.json
drawtell dub <scene.ts|bundle-id> [--voice <v>] [--instruction <s>] [--model <m>] [--dry-run] [--force] [--voxtell <bin>]   # narration audio via voxtell (voice from drawtell.json if omitted)
drawtell note <scene.ts|bundle-id>                # lesson archive block → stdout (title + problem + final-frame wikilink + per-step narration; `markdown` field under --json), final frame copied to <paths.attachments>/<id>-final.png — appending into the journal is the caller's job
drawtell ls                                       # workspace status: source / bundle / audio / snaps / review
drawtell init [dir]                               # scaffold / repair a workspace: idempotent gap-filling, existing files never touched
drawtell doctor                                   # environment + workspace health checks, failures carry fix commands (exit 0/1)
```

`snap` writes `snaps/<id>/step-<n>.png` (0 = blank board) and `index.json` (schema `drawtell-snaps` v2):
per shot the narration line, the elements **added in that step** (`id`, `type`, colors, `text`, approximate
`bbox` in scene coordinates) and the board `viewBox` — so a reviewer can name elements by id and check counts /
clipping without reading the scene source. `--step n` re-shoots one step and **merges** into the existing
index; `--no-cursor` omits the chalk pointer (recommended for review frames). Frames freeze half a millisecond
before the step boundary (no trace of the next stroke) and hand-drawn wobble is seeded per element id, so
re-running yields byte-identical images.

Player page params (what `snap` drives): `?scene=<id>` load a bundle · `&step=<n>` freeze at
the end of step n (0 = blank board) · `&bare=1` chrome-less stage · `&cursor=0` hide the chalk pointer · `&bench=1` the seed-scene polishing bench (also the fallback under `pnpm dev`, which has no `/api/bundles`). The page sets
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
brand of its own; the name is the family's setting; `serve` exposes it as `GET /api/config` and its bundle list page
and the application-layer pages read it) and `paths` (where derived `bundles` / `snaps` go, plus
parent-facing directory **roles** `attachments` / `photos` / `notes` / `kids` / `inbox`, default = same-name
English directories; contracts and skills only ever name the role, a family maps it to any directory name — see
`docs/文件系统.md`).

The workspace is resolved in priority order: global `--workspace <dir>` (explicit, the directory must
exist; `~` works) > a `drawtell.json` in the cwd > the `workspace` in `~/.config/drawtell/config.json` >
the cwd itself. `--workspace` decides the workspace and where `paths` land; scene-file arguments and
`--out` / `--bundles` relative paths still resolve against the cwd. Every `--json` reports which
workspace was used and how (`workspaceSource`: `flag` / `cwd` / `user-config` / `default`).

`init` scaffolds the workspace skeleton (the dirs the CLI reads/writes plus the family sub-product dirs
the workflows expect), writes a `drawtell.json` template and a `.gitignore`, and points
`~/.config/drawtell/config.json` at the workspace when nothing is configured yet (it never re-points an
existing setting). It is idempotent — re-run it any time to fill gaps; existing files are never
overwritten, and the policy file (`drawtell.json`) is never regenerated: policy belongs to the family,
broken policy is restored from git, not rebuilt by the machine. `doctor` makes silent failures visible:
which workspace was resolved and why; config files that exist but no longer parse (these fail loudly
everywhere now, instead of silently falling back to defaults); missing skeleton dirs; configured `paths`
roles pointing at nothing; iCloud-evicted `.icloud` placeholders; plus environment probes for
`serve` / `snap` / `dub`. New machine in three steps: `npm i -g drawtell` → `drawtell init <dir>` →
`drawtell doctor`. Applications that need the same workspace resolution (dev servers, tools) import it
from the `drawtell/workspace` subpath export (`resolveAppWorkspaceRoot` — env override > user config >
`~/drawtell-workspace` — plus `readWorkspaceConfigSync` and `expandPath`) instead of copying the chain.

Exit codes: `0` pass · `1` scene has problems (findings carry fix guidance) · `2` usage error ·
`3` planned-but-unimplemented (reserved; no command returns it today) · `4` internal error. Every command
takes the global flags `--json` and `--workspace <dir>`.

## Glyphs

`drawtell/glyphs` ships stroke-order data for the 52 Latin letters (`a–z` and `A–Z`) —
*how a letter is written*, one stroke at a time, not just how it looks. Normalized to
the four-line ruling used on practice paper (x-height = 1, baseline = 0), rendered as
`freedraw` elements so handwriting demos and chalkboard explanations share one
animation pipeline. See [docs/glyphs.md](docs/glyphs.md).

```ts
import { wordSkeletons } from 'drawtell/glyphs';
import { buildAnimatedSvg } from 'drawtell/player';

const { svg } = await buildAnimatedSvg(wordSkeletons('ram', { xHeight: 120, x: 80, y: 300 }));
```

## Core

`drawtell/core` is the pure half — no DOM, no React — so servers, the CLI and reviewers can ask questions about a
bundle without a browser:

- **Clock** — `lessonClock(skeletons, steps)` lays the steps end to end on one timeline (segment length =
  max(drawing, narration), strokes stretched to the narration exactly as the player does). `clockAt(clock, ms)` →
  segment, offset and the SVG time to freeze at; `frameAt(clock, ms)` → which elements are on the board and how far
  each is drawn. Steps are markers on the timeline; whether to pause at them is a player policy.
- **Geometry** — `elementBounds` / `measureText` use a width table measured from the real player's handwriting fonts
  (`src/core/text-metrics.ts`, regenerated by `scripts/gen-text-metrics.mjs`); `build` writes every element's
  bounds into `scene.json` (`bounds`), and `check` / `snap` use the same numbers.
- **What a circle covers** — `circleHits(clock, ms, path, { groups, blocks, bounds })` → the groups, blocks,
  labelled elements, text and piles of shapes inside a child's circle at that moment; `describeCircle` says it in
  one Chinese sentence (「圈住了:散的 3 根小棒;文字『3』」).

Scenes can name what they draw: `groups: [{ id, label, elementIds }]` (several strokes that are one thing, e.g.
「一捆 10 根小棒」) and `label` on a single element. Names are semantics only — they never change how or in what order
anything is drawn.

## Player

`drawtell/player` exports the `ChalkPlayer` React component plus the primitives it is
built from (`buildAnimatedSvg`, `computeStepWindows`, `stretchToAudio`). Scene protocol
v2 additions, all consumed here:

- **`template: 'static'`** — a scene with no timeline (`steps: []`): the player renders
  the full board on load; tap-to-read canvases build on top of it.
- **`blocks[]`** — word/character hit targets anchored to element ids (no coordinate
  copies); `blockBounds()` / `allBlockBounds()` give the hit rectangles.
- **`subscenes[]`** — popup mini-scenes (own coordinate space) triggered by a block.
- **`background`** — an optional image under the strokes (`{ src, width, height }`, e.g. a photo of
  the problem). The board becomes the image: scene coordinates are image pixels, `build` copies the
  file into the bundle as `background.<ext>`, and the player resolves it against `audioBaseUrl`.
- **Transport** — music-player controls: pause / resume / previous / next segment
  (segment = step). Drive it via a ref (`ChalkPlayerHandle`) or the built-in bar
  (`controls` prop). Jumps always redraw a segment from its start; `prev` in a gap
  replays the segment just drawn, `prev` while drawing goes back one.

## Development

```bash
pnpm install
pnpm dev          # polishing bench (打磨台) at http://localhost:5175
pnpm typecheck    # browser side (tsconfig.json) + node side (tsconfig.cli.json)
pnpm test         # node tests (glyphs)
pnpm build        # static bundle → dist/web (player page for serve / snap)
pnpm run build:lib   # dist/cli + dist/player + dist/glyphs + dist/schema (what the npm package ships; prepublishOnly runs all of the above)

node bin/drawtell.js check scenes/dengche.ts
node bin/drawtell.js build scenes/dengche.ts   # → bundles/dengche/
```

Layout: `src/player/` — the chalkboard player engine (stroke-by-stroke SVG replay via
excalidraw + excalidraw-animate, pointer tracking, per-step pauses); `src/web/` — the
polishing bench and the player page `drawtell serve` / `snap` drive; `src/cli/` — the CLI (check /
build / serve / snap / dub / ls); `skills/` — the four agent skills shipped with the package (see Skills); `src/schema/` — the scene contract (zod) and lesson-bundle contract; `scenes/` —
seed scenes (authored in TS, the source format; lesson bundles in JSON are the build
artifact).

## Skills

Four agent skills ship inside the npm package under `skills/<name>/` (SKILL.md + references; frontmatter is
`name` + `description` only, so Claude Code and Qwen Code both mount them). Copy a directory into your project's
`.claude/skills/` or `.qwen/skills/`; [cotutor](https://github.com/TarsLab/cotutor) does this on `init`.

- `drawtell-cli` — how to run the tool chain: workspace resolution, check / snap feedback ladder, dub, serve
- `drawtell-scene` — the scene contract: what a `ChalkScene` TS module must look like to be valid and fit the board
- `drawtell-teaching` — how to explain a problem: the explanation file format, the model library (`models/`), narration patterns, colors
- `drawtell-verify` — reviewing keyframe screenshots against the narration, as an independent checker

`tests/skills.test.ts` lints them (frontmatter keys, name = directory, relative links resolve, no `!` or `>word`
inside inline backticks — those trip Claude Code's bash permission scan). They moved here from the retired
`drawtell-skills` repo on 2026-09-15.

## Filesystem

All state lives on the filesystem — plain files you can `ls`, `git`, and `rm`. Sources
(`scenes/*.ts`) and human decisions (the review ledger `reviews.json`, the parent journal, notes) are precious;
everything else is derived and regenerable. Layout and state model: [docs/文件系统.md](docs/文件系统.md).

## Design principles

Built agent-first: text in, text out; `--json` on every command; semantic exit
codes; no interactive prompts; error messages that say what to do next. The
same rules that make a CLI good for LLM agents make it good for humans.

## License

MIT © tarslab
