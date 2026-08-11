# drawtell

**draw & tell** — turn problems into stroke-by-stroke chalkboard explanations, from your terminal.

> **Status: early.** `check` and `build` work from a repo checkout (Node ≥ 22.18, runs the TS
> sources via native type stripping). The npm release is still a name-reservation placeholder.

drawtell(边画边讲):把题目变成逐笔画出、带讲解节奏的黑板动画。

## CLI

```
drawtell check <scene.ts> [--json]        # schema + stroke-order + layout checks, errors as fix guides
drawtell build <scene.ts> [--out <dir>]   # scene → lesson bundle (scene.json + manifest.json), idempotent
```

Planned: `snap` (keyframe screenshots) · `serve` (web player + bundle library + LAN distribution) · `ls`

Exit codes: `0` pass · `1` scene has problems (findings carry fix guidance) · `2` usage error ·
`3` planned-but-unimplemented · `4` internal error. Every command takes `--json`.

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

## Design principles

Built agent-first: text in, text out; `--json` on every command; semantic exit
codes; no interactive prompts; error messages that say what to do next. The
same rules that make a CLI good for LLM agents make it good for humans.

## License

MIT © tarslab
