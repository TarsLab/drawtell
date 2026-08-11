import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// dev 下也能 ?scene= 取课包:/bundles/* → 仓库根 bundles/(drawtell serve 的最小镜像)
function bundlesMiddleware(): Plugin {
  const root = fileURLToPath(new URL('./bundles', import.meta.url));
  return {
    name: 'drawtell-bundles',
    configureServer(server) {
      server.middlewares.use('/bundles', (req, res, next) => {
        void (async () => {
          const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
          const abs = resolve(root, `.${pathname}`);
          if (!abs.startsWith(root + sep)) {
            next();
            return;
          }
          try {
            const data = await readFile(abs);
            res.setHeader('Content-Type', pathname.endsWith('.json') ? 'application/json' : 'application/octet-stream');
            res.end(data);
          } catch {
            next();
          }
        })();
      });
    },
  };
}

// dev/build 的目标是打磨台页(src/web),也是 drawtell serve 的静态资源;
// 播放引擎(src/player)以 TS 源码被内部消费,不打库
export default defineConfig({
  root: 'src/web',
  publicDir: '../../public',
  plugins: [bundlesMiddleware()],
  // excalidraw FAQ:修复 "process is not defined"
  define: { 'process.env.IS_PREACT': JSON.stringify('false') },
  server: { host: true, port: 5175 },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
