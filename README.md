# drawtell

**draw & tell** — turn problems into stroke-by-stroke chalkboard explanations, from your terminal.

> **Status: early.** The npm release is a name-reservation placeholder — no CLI commands are
> implemented yet. This repo already contains the player engine and the polishing bench.

drawtell(边画边讲):把题目变成逐笔画出、带讲解节奏的黑板动画。

## Planned surface

```
drawtell build <scene.ts>    # compile a TS scene into a self-contained lesson bundle
drawtell check <scene.ts>    # type / schema / layout checks, errors as fix guides
drawtell snap <scene>        # keyframe screenshots for visual review
drawtell serve               # local web player + lesson library + LAN distribution
drawtell ls                  # list local scenes and lesson bundles
```

## Development

```bash
pnpm install
pnpm dev          # polishing bench (打磨台) at http://localhost:5175
pnpm typecheck
pnpm build        # static bundle → dist/web
```

Layout: `src/player/` — the chalkboard player engine (stroke-by-stroke SVG replay via
excalidraw + excalidraw-animate, pointer tracking, per-step pauses); `src/web/` — the
polishing bench, future home of `drawtell serve` pages; `scenes/` — seed scenes
(authored in TS, the source format; lesson bundles in JSON are the build artifact);
`bin/` — the CLI (placeholder for now).

## Design principles

Built agent-first: text in, text out; `--json` on every command; semantic exit
codes; no interactive prompts; error messages that say what to do next. The
same rules that make a CLI good for LLM agents make it good for humans.

## License

MIT © tarslab
