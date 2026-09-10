/**
 * drawtell serve:一个进程覆盖两个场景——打磨预览与局域网分发(iPad 取课包)。
 * 静态资源 = 构建产物 dist/web(随 drawtell 检出目录走);课包 = 工作区 paths.bundles(--bundles 覆盖)。
 * 零依赖,node:http;不做缓存与压缩(家庭局域网,简单可靠优先)。
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { redactDeep } from './workspace.ts';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_ROOT = fileURLToPath(new URL('../../dist/web', import.meta.url));

/**
 * 字体目录:npm 包不带 dist/web/fonts(13MB,Xiaolai 占 12MB),从 @excalidraw/excalidraw 的 dist/prod/fonts 现取
 * (它是 peer,装了播放器的应用一定有);仓库检出里 pnpm build 会把同一份拷到 dist/web/fonts。
 */
export function fontsRoot(): string | null {
  const local = join(WEB_ROOT, 'fonts');
  try {
    const pkg = createRequire(import.meta.url).resolve('@excalidraw/excalidraw/package.json');
    return join(dirname(pkg), 'dist', 'prod', 'fonts');
  } catch {
    return local;
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

export interface ServeOptions {
  port: number;
  bundlesDir: string;
  json: boolean;
  title?: string;
  /** --json 里一并回报的工作区信息(workspaceReport),由 main 传入 */
  report?: Record<string, string>;
}

/** 课包清单:/api/bundles 的数据源(ls 自己读 manifest,不经这里) */
async function listBundles(root: string): Promise<Array<Record<string, unknown>>> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const id of entries.sort()) {
    try {
      const scene = JSON.parse(await readFile(join(root, id, 'scene.json'), 'utf8')) as Record<string, unknown>;
      const manifest = JSON.parse(await readFile(join(root, id, 'manifest.json'), 'utf8')) as { steps?: unknown[] };
      out.push({ id: scene.id, title: scene.title, model: scene.model, template: scene.template, subject: scene.subject, steps: manifest.steps?.length ?? 0 });
    } catch {
      // 不是课包目录,跳过
    }
  }
  return out;
}

async function sendFile(res: ServerResponse, root: string, pathname: string): Promise<void> {
  const abs = resolve(root, `.${pathname}`);
  if (abs !== root && !abs.startsWith(root + sep)) {
    res.writeHead(403).end('403');
    return;
  }
  try {
    const s = await stat(abs);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': MIME[extname(abs)] ?? 'application/octet-stream' });
    res.end(await readFile(abs));
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found', path: pathname, hint: '课包路径形如 /bundles/<id>/scene.json;清单看 /api/bundles' }));
  }
}

export interface StartOptions {
  /** 0 = 随机空闲端口(snap 的临时实例) */
  port: number;
  bundlesDir: string;
  /** 孩子端界面标题(工作区 drawtell.json 的 title),/api/config 转出;缺省 drawtell */
  title?: string;
}

export async function startServer({ port, bundlesDir, title = 'drawtell' }: StartOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const bundlesRoot = resolve(bundlesDir);
  const fonts = (await stat(join(WEB_ROOT, 'fonts')).catch(() => null)) ? null : fontsRoot();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (pathname === '/api/config') {
      // 孩子端没有品牌:标题是家长在工作区 drawtell.json 里的配置
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ title }));
    } else if (pathname === '/api/bundles') {
      void listBundles(bundlesRoot).then((list) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(list, null, 2));
      });
    } else if (pathname.startsWith('/bundles/')) {
      void sendFile(res, bundlesRoot, pathname.slice('/bundles'.length));
    } else if (pathname.startsWith('/fonts/') && fonts) {
      void sendFile(res, fonts, pathname.slice('/fonts'.length));
    } else {
      void sendFile(res, WEB_ROOT, pathname === '/' ? '/index.html' : pathname);
    }
  });

  await new Promise<void>((res, rej) => {
    server.on('error', rej);
    server.listen(port, '0.0.0.0', () => res());
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise((res) => server.close(() => res())),
  };
}

export async function serve({ port, bundlesDir, json, title, report }: ServeOptions): Promise<never> {
  const { port: actual } = await startServer({ port, bundlesDir, title });
  const bundlesRoot = resolve(bundlesDir);
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  if (json) {
    console.log(JSON.stringify(redactDeep({ listening: true, port: actual, urls: [`http://localhost:${actual}/`, ...lan.map((a) => `http://${a}:${actual}/`)], bundles: bundlesRoot, title, ...(report ?? {}) })));
  } else {
    console.log(`drawtell serve — 播放器 http://localhost:${actual}/`);
    console.log(`  课包目录 ${bundlesRoot}(URL:/bundles/<id>/,清单:/api/bundles)`);
    for (const a of lan) console.log(`  局域网  http://${a}:${actual}/(iPad 用这个)`);
    console.log('  Ctrl+C 停止');
  }
  return new Promise<never>(() => {});
}
