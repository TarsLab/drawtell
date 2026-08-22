/**
 * drawtell serve:一个进程覆盖两个场景——打磨预览与局域网分发(iPad 取课包)。
 * 静态资源 = 构建产物 dist/web(随 drawtell 检出目录走);课包 = 运行目录的 bundles/。
 * 零依赖,node:http;不做缓存与压缩(家庭局域网,简单可靠优先)。
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_ROOT = fileURLToPath(new URL('../../dist/web', import.meta.url));

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
}

/** 目录清单:serve 首页与将来 ls 共用的数据源 */
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
      out.push({ id: scene.id, title: scene.title, model: scene.model, template: scene.template, steps: manifest.steps?.length ?? 0 });
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

export async function serve({ port, bundlesDir, json, title }: ServeOptions): Promise<never> {
  const { port: actual } = await startServer({ port, bundlesDir, title });
  const bundlesRoot = resolve(bundlesDir);
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  if (json) {
    console.log(JSON.stringify({ listening: true, port: actual, urls: [`http://localhost:${actual}/`, ...lan.map((a) => `http://${a}:${actual}/`)], bundles: bundlesRoot }));
  } else {
    console.log(`drawtell serve — 播放器 http://localhost:${actual}/`);
    console.log(`  课包目录 ${bundlesRoot}(URL:/bundles/<id>/,清单:/api/bundles)`);
    for (const a of lan) console.log(`  局域网  http://${a}:${actual}/(iPad 用这个)`);
    console.log('  Ctrl+C 停止');
  }
  return new Promise<never>(() => {});
}
