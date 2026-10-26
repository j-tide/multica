# ZJEX-7 开发候选验证

本记录是开发自测证据；架构审查、设计验收、独立 QA 和 Electron 交互验收仍待研发负责人统一派发。未推送、创建 PR、合并或部署；任务保持 in_progress。候选提交 SHA 见本轮任务回贴。

## 基线与范围

仓库与完整基线核对见 [baseline.md](baseline.md)。Git common directory 为 `/Users/iamzjt/Desktop/my/myapp/multica/.git`，当前平台分支为 `agent/agent/zjex-7-e7c04110b8df`，从 `ec91ce3c809c7030572acdf6dc90cb67d85c0ed2` 追加提交。设计、架构与本任务基线为同父提交，相关任务源码无差异。已有 AGENTS.md 修改未改动、未暂存。

实现共享详情页的动态/群聊模式、本地持久化偏好、全局时间消息投影、5 分钟视觉分组、真实身份与回复摘要、运行记录去重、逐评论定位、80px 跟随、新消息计数和模式/任务/工作区/入口隔离的滚动恢复。顶层输入保持挂载；回复输入以话题草稿键保留实例，保护正文、上传、回复对象与发送中的锁。Markdown、权限及评论操作继续使用原有实现。

主要修改：

- `packages/core/issues/stores/`：详情模式偏好、显式回复目标及恢复校验、配套单测。
- `packages/views/issues/components/`：模式菜单、纯投影、共享消息行、保留回复输入、详情页接线与回归测试。
- `packages/views/issues/hooks/`：新消息跟随与初始化/定位优先级、跨虚拟消息的注释编辑、配套测试。
- `packages/views/locales/{en,fr,ja,ko,zh-Hans,zh-Hant}/issues.json`：全部共享语言与复数文案。
- `e2e/fixtures.ts`、`e2e/issue-chat-view.spec.ts`：TestApiClient 回复 fixture 及真实应用回归。

无后端 API、数据库、智能体调度、右侧业务区或原生 mobile 改动。

## 最终有效检查

| 命令 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | exit 0，10/10 tasks |
| `pnpm lint` | exit 0，7/7 tasks；已有 warnings 保留，本任务文件无新增警告 |
| `pnpm test` | exit 0，7/7 workspaces；802 个测试文件、9,823 项测试通过 |
| `pnpm --filter @multica/web build` | exit 0；存在原有 CSS `::highlight` 工具链警告 |
| `pnpm --filter @multica/desktop build` | exit 0；包括实际 Go CLI 打包；存在原有 dynamic import 警告 |
| `pnpm exec playwright test -c .context/playwright.zjex7.config.ts e2e/comments.spec.ts e2e/issue-chat-view.spec.ts` | exit 0，5 passed（最终一轮约 1.1 分钟） |
| 草稿切换 E2E `--repeat-each=3` | exit 0，3 passed |
| `git diff --check` | 通过 |

全量测试明细：core 2,348；views 6,394；desktop 709；web 290；docs 19；ui 17；ui-lab 46。测试覆盖偏好恢复及非法值、分组/排序/系统边界、投影父关系与输出去重、失败/删除/解决记录、输入实例与发送锁、显式回复目标、清空正文后的回复上下文与附件、注释原文定位、80px 边界、重复事件/历史回补、初始化及导航优先级；原有评论组件和滚动恢复测试也在全量测试中执行。

## 浏览器环境及限制

通过 `make up C=api,web ARGS=--ephemeral` 使用 worktree-392：API 18472、Web 13392、数据库 `multica_worktree_392`。数据库由托管脚本通过本 worktree 的 DATABASE_URL 创建和迁移；没有复制主 checkout 的 .env。开发机缺少 Go/PostgreSQL 时补齐了工具链，以任务目录内的 PostgreSQL cluster 支持验证。未启动 agent daemon、未执行真实 agent CLI。

默认 Playwright 命令首次因 Chromium 1208 缺失失败；官方浏览器下载又遇到 ECONNRESET。因此使用已安装的 Google Chrome for Testing 147.0.7727.15（Chromium revision 1217），仅在忽略目录 `.context` 内覆盖 executablePath，未改变仓库 Playwright 配置或跳过用例。

临时配置等价于：

```ts
import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "../playwright.config";
export default defineConfig({
  ...base,
  testDir: resolve(process.cwd(), "e2e"),
  use: { ...base.use, launchOptions: {
    executablePath: "/Users/iamzjt/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  } },
});
```

浏览器验证了真实应用中的顶层草稿与偏好恢复、嵌套回复及真实上传文件跨模式保留、逐评论深链、模式切换可见锚点、Web 列表返回恢复、历史新消息不打断、点击到最新和近底跟随；390px 无 document 横向溢出。使用 TestApiClient 的隔离账号与无智能体分配的任务，全部为测试数据。

证据图均为实际 Web 应用，非设计原型、非 Electron：

- [Web 浅色](../../output/playwright/zjex-7-web-chat.png)
- [Web 深色](../../output/playwright/zjex-7-web-dark.png)
- [Web 390px](../../output/playwright/zjex-7-web-narrow.png)
- [Web 回复上下文](../../output/playwright/zjex-7-web-reply-before.png)

验证后已执行 `make down`，并停止本任务 PostgreSQL cluster。完整有效检查日志随任务回贴附件提供。

## 留给独立验收的矩阵

Electron 实际窗口、桌面 tab 恢复、inbox/peek 入口、异步大图变高、长代码/表格/长文件名、多角色权限及失败重试的完整浏览器矩阵尚未独立验收。多作者和运行输出/失败/去重语义已由单测覆盖，本轮没有运行真实智能体验证。现有接口的历史上限保持不变。共享回复输入池按详情任务生命周期释放，其保留与虚拟化交互应作为架构 Review 重点。

开发自测通过不替代最终人工 Review 或 QA；PR 由运维集成人在后续审查通过后交付。

## 完整修改清单

```text
artifacts/zjex-7/baseline.md
artifacts/zjex-7/verification.md
e2e/fixtures.ts
e2e/issue-chat-view.spec.ts
output/playwright/zjex-7-web-chat.png
output/playwright/zjex-7-web-dark.png
output/playwright/zjex-7-web-narrow.png
output/playwright/zjex-7-web-reply-before.png
packages/core/issues/stores/comment-draft-store.test.ts
packages/core/issues/stores/comment-draft-store.ts
packages/core/issues/stores/index.ts
packages/core/issues/stores/issue-detail-view-store.test.ts
packages/core/issues/stores/issue-detail-view-store.ts
packages/views/issues/components/comment-card.tsx
packages/views/issues/components/issue-chat-comment.tsx
packages/views/issues/components/issue-chat-projection.test.ts
packages/views/issues/components/issue-chat-projection.ts
packages/views/issues/components/issue-detail-view-menu.test.tsx
packages/views/issues/components/issue-detail-view-menu.tsx
packages/views/issues/components/issue-detail.test.tsx
packages/views/issues/components/issue-detail.tsx
packages/views/issues/components/reply-input.tsx
packages/views/issues/components/retained-reply-input.test.tsx
packages/views/issues/components/retained-reply-input.tsx
packages/views/issues/hooks/use-issue-chat-annotations.test.tsx
packages/views/issues/hooks/use-issue-chat-annotations.tsx
packages/views/issues/hooks/use-issue-chat-scroll.test.tsx
packages/views/issues/hooks/use-issue-chat-scroll.ts
packages/views/locales/en/issues.json
packages/views/locales/fr/issues.json
packages/views/locales/ja/issues.json
packages/views/locales/ko/issues.json
packages/views/locales/zh-Hans/issues.json
packages/views/locales/zh-Hant/issues.json
```
