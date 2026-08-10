# drawtell

**draw & tell** — turn problems into stroke-by-stroke chalkboard explanations, from your terminal.

> **Status: name reservation.** This is a placeholder release; no commands are implemented yet.
> The CLI is under active design at [tarslab/drawtell](https://github.com/tarslab/drawtell).

drawtell(边画边讲):把题目变成逐笔画出、带讲解节奏的黑板动画。

## Planned surface

```
drawtell build <scene.ts>    # compile a TS scene into a self-contained lesson bundle
drawtell check <scene.ts>    # type / schema / layout checks, errors as fix guides
drawtell snap <scene>        # keyframe screenshots for visual review
drawtell serve               # local web player + lesson library + LAN distribution
drawtell ls                  # list local scenes and lesson bundles
```

## Design principles

Built agent-first: text in, text out; `--json` on every command; semantic exit
codes; no interactive prompts; error messages that say what to do next. The
same rules that make a CLI good for LLM agents make it good for humans.

## License

MIT © tarslab
