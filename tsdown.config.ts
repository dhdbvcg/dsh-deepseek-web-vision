import { defineConfig } from 'tsdown'

/**
 * 构建配置 —— 复刻上游 dsh-deepseek-web-login 的产物结构：
 *   lib/index.js  host 侧（Node，ESM）
 *   lib/client.js client 侧（浏览器，React 无 JSX → src/client/index.ts 里用的 createElement）
 * 两者都带 sourcemap，供 issue 排查与「还原源码」。
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outExtensions: () => ({ js: '.js' }),
    sourcemap: true,
    dts: false,
    clean: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outExtensions: () => ({ js: '.js' }),
    sourcemap: true,
    dts: false,
    clean: false,
    // client 面板 import 了 react（外部化，由 DSH 客户端运行时提供），不打包进去
    external: ['react'],
  },
])
