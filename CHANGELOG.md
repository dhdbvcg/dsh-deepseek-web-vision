# Changelog

本项目遵循大致语义化版本；日期为本地时间。

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
