import { defineConfig } from 'vite';

// dev/build 的目标是打磨台页(src/web),将来演进为 drawtell serve 的静态资源;
// 播放引擎(src/player)以 TS 源码被内部消费,不打库
export default defineConfig({
  root: 'src/web',
  publicDir: '../../public',
  // excalidraw FAQ:修复 "process is not defined"
  define: { 'process.env.IS_PREACT': JSON.stringify('false') },
  server: { host: true, port: 5175 },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
