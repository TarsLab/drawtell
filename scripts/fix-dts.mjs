/**
 * tsc 的 rewriteRelativeImportExtensions 只改写 .js 产物,d.ts 里的 './x.ts(x)'
 * 原样保留——消费方 tsc(没开 allowImportingTsExtensions)解析不了。
 * 这里把 dist 下 d.ts 的相对说明符统一改写成 .js(与产物文件对齐)。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.d.ts')) yield p;
  }
}

let fixed = 0;
for (const dir of ['dist/cli', 'dist/core', 'dist/player', 'dist/schema', 'dist/glyphs']) {
  for await (const file of walk(dir)) {
    const src = await readFile(file, 'utf8');
    const out = src.replace(/(['"])(\.{1,2}\/[^'"]*)\.tsx?\1/g, '$1$2.js$1');
    if (out !== src) {
      await writeFile(file, out);
      fixed++;
    }
  }
}
console.log(`fix-dts: ${fixed} 个 d.ts 的相对说明符已改写为 .js`);
