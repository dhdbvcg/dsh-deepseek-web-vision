<div align="center">

# dsh-deepseek-web-vision

**把 chat.deepseek.com 网页版接进 DSH（DeepSeek Harness）：用浏览器登录态（不是 API Key）驱动 agent —— 修复并硬化了图片理解（识图）链路。**

[![License](https://img.shields.io/badge/license-Apache--2.0-263146?style=flat-square&labelColor=0b1220)](LICENSE)
[![Provider](https://img.shields.io/badge/provider-deepseek--web--vision-06b6d4?style=flat-square&labelColor=0b1220)](#与上游的差异)
[![Status](https://img.shields.io/badge/status-unofficial%20%C2%B7%20use%20at%20your%20own%20risk-ef4444?style=flat-square&labelColor=0b1220)](#免责声明)

</div>

---

## 这是什么

这是 [`cv-superding/dsh-deepseek-web-login`](https://github.com/cv-superding/dsh-deepseek-web-login)
的**独立分支（fork）**：把 chat.deepseek.com 网页版作为 DSH 的 LLM provider（浏览器登录态捕获 +
PoW 求解 + SSE 流式 + 提示词协议工具调用），并**修复了图片输入（识图）在真实环境里的一整串故障**。

与上游的关系、以及为什么要 fork，见 [与上游的差异](#与上游的差异)。

## 安装

```bash
# 方式 A：从本仓库直接装配（推荐）
dsh plugin --profile web add github:dhdbvcg/dsh-deepseek-web-vision

# 方式 B：克隆后本地装配
git clone https://github.com/dhdbvcg/dsh-deepseek-web-vision.git
dsh plugin --profile web add ./dsh-deepseek-web-vision
```

> 本仓库**提交了构建产物 `lib/`**，两种方式都不需要本地构建；要自己构建就 `npm ci && npm run build`。

装好后重启 DSH，到「设置 → DeepSeek 网页版（识图版）」里用浏览器窗口登录一次即可。
模型选择器里会出现 **provider = `deepseek-web-vision`** 下的两个模型：

| 模型 id | 说明 |
| --- | --- |
| `deepseek-chat` | 网页「快速模式」，thinking 关 |
| `deepseek-reasoner` | 网页「快速模式」，thinking 开（推理流作为思考块回传） |

## 这个 fork 修了什么（都带实测证据）

上游的识图功能在两类真实环境里**完全不可用**，而且失败得悄无声息或原因不明。本 fork 修了 5 处：

### 1. multipart 被"另一个 undici"打成字符串 → HTTP 400

宿主的 `globalThis.fetch` 会被别的插件换成**另一份 undici 实例**的 fetch
（实测：`@opencode2dsh/dsh-plugin` 的出口路由 / ip-pool 一启用就这么干）。上游用
`new FormData()` + `new Blob()`（Node 内置那份）拼 multipart，跨实例传 body 时那份 fetch
认不出它，把 body 当字符串发出去 —— 服务端收到 `text/plain` 的 `[object FormData]`（17 字节），
回 `HTTP 400: Invalid boundary for multipart/form-data request`。

**修法**：自建 multipart 字节流（显式 boundary + content-length），与 fetch 实现、
Blob/FormData 归属完全解耦；同时删掉**所有大小写变体**的 `content-type`。

### 2. 上传是异步的，文件没就绪就被引用 → `code 9: invalid ref file id`

上传返回 `status: PENDING`，服务端随后才 `PARSING → SUCCESS`（实测约 1 秒）。
上游上传完**立刻**引用，整轮失败，界面只有一句看不出原因的 `code 9`。

**修法**：上传后轮询 `GET /api/v0/file/fetch_files?file_ids=…` 等到 `SUCCESS` 再用；
`FAILED`/`REJECTED`/`audit reject` 走「降级为纯文本 + 明确告知用户」通道。

### 3. 状态查询接口有突发限流 → `code 40029 TOO_MANY_REQUESTS`

300ms 固定间隔轮询会把查询接口打限流。

**修法**：先等 900ms 再查（实测 ~1s 就绪）、间隔 ×1.6 退避（上限 3s，总预算 25s）、
限流/429/5xx/网络抖动一律当**可重试**；一张新图通常只需 **2 次**查询。

### 4. 缓存的 file_id 失效会让整轮失败

上传缓存（`attachmentId → fileId`，2 小时 TTL）里的 id 也可能失效（服务端清理、审核改判）。

**修法**：复用缓存前先确认它仍 `SUCCESS`；**明确失效**才丢弃缓存重新上传；
限流/超时这类"没问着"的情况仍按原引用使用（重传只会雪上加霜）。

### 5. 会把**整段历史**的图片都发给网页端

上游把整段对话里出现过的图（按 `maxRefImages` 留最近 24 张）全部重新上传 ——
「只发一张图，却把之前所有轮次、甚至之前用别的 provider 时发过的图一起传给了 DeepSeek」。

**修法**：**只发本轮的图** —— 你刚发的那条消息里的图 + 本轮工具刚返回的图（截图 / `read_image`）；
更早的历史图不上传，prompt 里只留 `[earlier image omitted]` 占位。
想「接着问刚才那张图」，把 `keepHistoryImages` 设成 1~2（见下）。

### 实测

用一张**猜不出来**的图（绿底白字「7391」）走真实接口验证：

| 用例 | 结果 |
| --- | --- |
| 新图（上传 → PARSING → SUCCESS → 提问） | ✅「数字=7391，背景=绿色」，1 次上传、2 次查询 |
| 缓存命中轮 | ✅ 同样答对，仅 1 次确认查询 |
| 人为注入 2 次 `40029` 限流 | ✅ 自动退避重试后成功 |
| 对照：不等就绪直接引用 | ❌ `code 9 invalid ref file id` |
| 历史图 + 新图混合会话 | ✅ 只上传新图，历史图显示 `[earlier image omitted]` |

## 配置

设置页（`设置 → DeepSeek 网页版（识图版）`）的「防风控」标签里新增滑块：

| 配置（`~/.dsh/deepseek-web-vision/gate.json`） | 默认 | 说明 |
| --- | --- | --- |
| `keepHistoryImages` | `0` | 除「本轮的图」外，额外附带最近几张历史图片。`0` = 只发本轮；1~2 适合「接着问刚才那张图」 |
| `maxRefImages` | `24` | 单次请求 `ref_file_ids` 的硬上限（防 `code 10 too many ref file`），语义与上游一致 |

## 与上游的差异（不冲突设计）

本 fork 是**独立插件**，所有对外标识都已换新，可与原版并存：

| | 上游 | 本 fork |
| --- | --- | --- |
| npm 包 / 仓库 | `dsh-deepseek-web-login` | `dsh-deepseek-web-vision` |
| 插件 id（cordis 行） | `dsh-deepseek-web-login` | `dsh-deepseek-web-vision` |
| provider 路由 | `deepseek-web` | `deepseek-web-vision` |
| 数据目录 | `~/.dsh/web-login/` | `~/.dsh/deepseek-web-vision/` |
| HTTP API 前缀 | `/deepseek-web-login/api` | `/deepseek-web-vision/api` |
| Electron 分区 | `persist:dsh-deepseek-web-login` | `persist:dsh-deepseek-web-vision` |
| 设置页标签 | DeepSeek 网页登录 | DeepSeek 网页版（识图版） |
| 更新检查仓库 | 上游 | 本仓库 |

其余（PoW、SSE 解析、工具调用协议、账号库、会话清理等）与上游同源。

## 开发

```bash
npm ci          # 安装开发依赖（tsdown + typescript）
npm run build   # 构建产物到 lib/（index.js + client.js，均带 sourcemap）
```

源码结构（`src/`）：`index.ts`（host 入口 + 设置页 API）、`adapter.ts`（LLM 适配器 +
图片上传编排）、`webapi.ts`（网页端私有接口客户端：PoW/会话/上传/补全）、`protocol.ts`
（提示词协议与流式解析）、`gate.ts`（防风控节流）、`client/index.ts`（client 设置面板）等。

## 免责声明

非官方插件，与 DeepSeek 官方无关；使用你自己的网页版登录态调用网页端私有接口，
风险自担（账号被限流/封禁的可能性请参考上游 README 的「已知限制」）。

## 许可与致谢

- 本 fork 遵循 [Apache-2.0](LICENSE)；原始实现版权归
  [cv-superding (Ding Li)](https://github.com/cv-superding/dsh-deepseek-web-login) 所有，
  详见 [NOTICE](NOTICE)。
- 感谢上游作者的出色工作 —— 本 fork 的全部基础（架构、协议实现、工程细节）都来自上游，
  这里只做了识图链路的修复与硬化。
