import { defineConfig } from 'tsdown'

/**
 * 构建配置 —— 复刻上游 dsh-deepseek-web-login 的产物结构：
 *
 * lib/index.js  host 侧（Node，ESM）——由 DSH 以普通 ESM import 加载。
 *
 * lib/client.js 浏览器侧。⚠️ 它**不是**普通 ESM：DSH 的 client 模块系统要求每个 bundle
 * 自己调用 `window.__ModuleLoader__.load({ id, factory })` 注册工厂，factory 里用
 * `require("react")` 拿依赖、`module.exports` 吐导出（DSH 会按模块图 require 依赖包）。
 * 上游就是这么产出的（CJS 转换 + banner/footer 包一层）。0.2.0/0.2.1 曾错误地产出纯 ESM，
 * 导致 client 图整片加载失败（"loaded without registering … via __ModuleLoader__.load"）。
 *
 * 做法：format 'cjs' 让 rolldown 把 ESM 源转成 CJS（react 外部化成 require），
 * 再用 banner 声明局部 `module`/`exports` 并打开 `__ModuleLoader__.load` 包装、
 * footer 返回导出 —— 与上游产物的形态同构。
 */
const CLIENT_BANNER = [
  'window.__ModuleLoader__.load({',
  '\tid: "dsh-deepseek-web-vision",',
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  // 注意：不要在这里声明 react —— rolldown 的 CJS 输出会自己生成 `let react = require("react")`，
  // banner 里再声明一份就是重复声明 SyntaxError（0.2.1 实测踩到）。react 走 external。
].join('\n')
const CLIENT_FOOTER = [
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '//# sourceMappingURL=client.js.map',
].join('\n')

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
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    outExtensions: () => ({ js: '.js' }),
    sourcemap: true,
    dts: false,
    clean: false,
    // react 由 DSH 的 client 模块系统供给（factory 的 require 参数），不打包进去
    external: ['react'],
    banner: CLIENT_BANNER,
    footer: CLIENT_FOOTER,
  },
])
