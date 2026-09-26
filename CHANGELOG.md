# Changelog

本项目遵循大致语义化版本；日期为本地时间。

## 0.2.2 — 2026-09-26

### 修：client 产物形态错误导致 client 图整片加载失败

症状：DSH web 界面显示「Failed to load plugins」，`@deepseek-ai/dsh-client-hmr` 等一长串
client 模块全部报 `loaded without registering "…" via __ModuleLoader__.load`。

根因：DSH 的 client 模块系统要求每个 bundle **自己调用**
`window.__ModuleLoader__.load({ id, factory })` 注册工厂（factory 以 `require` 拿依赖、
`module.exports` 吐导出）。上游的 `lib/client.js` 就是这个形态（CJS 转换 + 包装层）；
本 fork 0.2.0/0.2.1 用 tsdown 默认 ESM 产出 client，没有任何注册调用 —— loader 加载脚本后
找不到注册项，图启动失败连累所有 bundle 报错。

修法（`tsdown.config.ts`）：client 构建改为 `format: 'cjs'`（react 外部化成 `require`），
banner 打开 `__ModuleLoader__.load` 包装并声明局部 `module`/`exports`，footer 返回导出
—— 与上游产物形态同构。⚠️ banner 里**不要**声明 react：rolldown 的 CJS 输出会自己生成
`let react = require("react")`，banner 再来一份就是重复声明 SyntaxError（实测踩到）。

本地以模拟 `__ModuleLoader__` 的加载冒烟验证：注册 id 正确、导出 `apply`/`inject: ["slots"]`。

## 0.2.1 — 2026-09-26

### 新：中文思考与回答（默认开启）

实测反馈：网页端模型对英文输入经常**整段英文思考、英文作答**。现在默认在 system 头部注入
语言指令：**推理过程与最终回答都用中文**；代码/命令/路径/报错日志/专有名词保持原样；
无论用户用什么语言提问都坚持中文（实测英文提问 → 中文推理 + 中文回答）。

- 新配置 `responseLanguage`（默认 `'zh'`；`'off'` 关闭，或传 `en`/`ja`/… 其它语言）。
- 指令同时作用于**续写轮**（auto-continue / 工具重试）的 prompt。

### 撤销 npm 发布准备

`@dhdbvcg/…` 的包名与 `publishConfig` 已撤回（恢复 `dsh-deepseek-web-vision` + `private: true`），
安装仍走 GitHub 源（`github:dhdbvcg/dsh-deepseek-web-vision`）。

## 0.2.0 — 2026-09-25

### fork 首发：基于上游 0.1.77，修复并硬化图片输入（识图）链路

上游 `dsh-deepseek-web-login` 0.1.77 的图片功能在两类真实环境里不可用，且失败原因在界面上不可见。
本版本修了 5 处（全部带真实接口实测证据，详见 README）：

1. **修：multipart 在"宿主 fetch 被换成另一份 undici"时退化成 `[object FormData]`**
   → `HTTP 400: Invalid boundary for multipart/form-data request`，图片静默降级。
   新增 `buildMultipartImageBody()`：自建 multipart 字节流（显式 boundary/content-length），
   与 fetch 实现、Blob/FormData 归属解耦；`uploadImageFile` 改为删除**所有大小写变体**的 `content-type`。

2. **修：上传是异步的（PENDING → PARSING → SUCCESS，实测 ~1s），未就绪就被引用**
   → `code 9: invalid ref file id` 整轮失败，界面看不出原因。
   新增 `waitForUploadedFileReady()`：上传后轮询 `fetch_files` 等 `SUCCESS`；
   `FAILED`/`REJECTED`/`audit reject` 走「降级为纯文本 + 明确告知」。

3. **修：状态查询接口的突发限流（`code 40029 TOO_MANY_REQUESTS`）**
   先等 900ms 再查（新图通常只需 2 次查询）、间隔 ×1.6 退避（上限 3s、总预算 25s）、
   限流/429/5xx/网络抖动一律可重试。

4. **修：缓存 file_id 失效导致整轮 `code 9`**
   复用缓存前先确认仍 `SUCCESS`；明确失效才重传；"没问着"（限流/超时）仍按原引用使用。
   `ImageUploadCache` 新增 `delete()`。

5. **改：只发本轮的图**
   旧行为把整段历史的图（最近 24 张）全部重新上传 —— 「发一张图，把之前发给其它模型的图也传给了网页端」。
   现在 `collectRequestImageRefs()` 只收集**本轮**的图（用户刚发的 + 本轮工具刚返回的），
   历史图在 prompt 里留 `[earlier image omitted]` 占位；
   新配置 `keepHistoryImages`（默认 0，0~24）可额外附带最近 N 张历史图。
   续写（transcript 以 assistant 结尾）时边界自动退到最后一个用户内容段。

### 不冲突设计（与上游可并存）

包名/仓库 `dsh-deepseek-web-vision`、插件 id、provider 路由 `deepseek-web-vision`、
数据目录 `~/.dsh/deepseek-web-vision/`、HTTP 前缀 `/deepseek-web-vision/api`、
Electron 分区 `persist:dsh-deepseek-web-vision`、更新检查仓库 —— 全部换新。
