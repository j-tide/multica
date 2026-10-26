## 修复基线与范围

本轮在平台私有 worktree `zjex-7-2dcd5698b005/worktree`、分支 `agent/agent/zjex-7-e7c04110b8df` 上，以冻结候选 `27ac1f4ee64b2788cefb885c2c9064425dd11cec` 为直接父提交追加修复。未改写旧候选、切换分支、修改其他工作区、推送或集成。既有 AGENTS.md 修改未纳入提交。

已下载架构审查附件 `zjex7-code-review-evidence.zip`，先在未修改的候选源码上执行附件原始复现：`pnpm --filter @multica/views exec vitest run -c .context/review.config.ts`。2 文件、4 项均通过；这些断言确认缺陷存在，不能解释为功能通过。原始输出见附带 `baseline-reproduction.log`。

## 逐项修复与证据

| 项目 | 根因与修复 | 新候选回归 |
| --- | --- | --- |
| P2 注释编辑 | 全局 hook 把滚动容器当作 annotation owner，真实 hook 的最近 owner 校验因此拒绝合法来源。改为等待来源挂载、找到真实消息 owner、验证 draft key 后交给真实 hook 编辑。 | `use-issue-chat-annotations.test.tsx` 不 mock annotation hook：真实 owner 的来源可编辑保存，离屏来源跳转挂载后可编辑；错误 owner、已改变文本均拒绝且不改动原注释。 |
| P2 失败通知重试 | Chat 的 run 分支未传递失败通知身份，去重后 `hasReply` 抑制重试。向 AgentRunComment 传递通知，复用现有 failure-notice 判断，并移除外层重复 DOM id。 | `issue-detail.test.tsx` 使用实际 AgentRunComment/InlineCommentRun，分别覆盖 failed/cancelled：单一通知深链、单一 run slot、没有重复原始通知；点击 slot 的 Retry 调用 rerun API。 |
| P2 空闲输入回收 | registry 从不移除访问过的输入。改为断开后微任务清扫，保留同次模式切换重连的节点；ReplyInput 报告实时保护状态，离屏发送完成后再次清扫。 | `retained-reply-input.test.tsx` 遍历 40 行始终仅 1 个挂载，卸载后 0。`comment-composers.test.tsx` 使用真实 ReplyInput/提交 hook/上传 gate，验证空闲回收、草稿和精确回复目标、未 debounce 落盘的文本、离屏上传完成、发送 single-flight 锁及成功后离屏回收。 |
| P3 mention 上下文 | portal 位于当前任务 context provider 之外。slot 捕获任务渲染上下文，portal 显式提供同一上下文。 | `mention-view.test.tsx` 使用真实 MentionView → IssueMentionCard，当前任务显示 “This issue”，另一任务不显示该语义，两个标识正常保留。 |

保护条件包括发送中、上传 gate、上传条目、当前组件文本、编辑器实时 Markdown，以及持久草稿中的文本、附件、注释和回复目标。服务端调用和 Tiptap 编辑器边界仍使用测试替身；注释 owner/annotation hook、输入池、ReplyInput 生命周期、提交锁、上传协调及 mention 上下文链路使用产品实现。

## 执行结果

- 受影响 views 回归：13 文件、334 项通过；core 草稿与视图偏好回归：2 文件、35 项通过；合计 15 文件、369 项。
- `pnpm typecheck`：10/10 tasks 成功。
- `pnpm lint`：7/7 tasks 成功；0 errors，views 既有 20 warnings。
- `pnpm --filter @multica/web build`：退出 0。
- `pnpm --filter @multica/desktop build`：退出 0，main/preload/renderer 构建完成；环境无 Go 且无现有 CLI binary，bundle-cli 明确跳过，未验证 CLI 打包。
- `git diff --check`：通过。

受影响回归命令：

```sh
pnpm --filter @multica/views test issues/components/retained-reply-input.test.tsx issues/components/comment-composers.test.tsx issues/hooks/use-issue-chat-annotations.test.tsx issues/components/use-comment-annotations.test.tsx issues/components/comment-annotation-selection.test.ts issues/components/issue-detail.test.tsx issues/components/comment-card.test.tsx issues/components/inline-comment-run.test.tsx issues/components/comment-runs.test.ts issues/hooks/use-issue-timeline.test.tsx issues/hooks/use-issue-detail-scroll-restore.test.tsx editor/extensions/mention-view.test.tsx issues/components/issue-mention-card.test.tsx
pnpm --filter @multica/core test issues/stores/comment-draft-store.test.ts issues/stores/issue-detail-view-store.test.ts
```

原始最终日志随评论附带。JSDOM 输出 navigation not implemented 提示，断言全部通过。首次 lint 发现临时复现文件导入 vitest 的依赖边界问题，已将复现材料移出 packages/views 后重新执行最终 lint 通过；未修改 lint 规则。

## 验证边界与交接

本轮未运行全仓 pnpm test、浏览器 E2E、Electron 运行验收或真实智能体执行；没有新增真实应用截图。构建成功不代表 Electron 验收。旧候选设计与 QA 的通过项没有转移到新候选。等待负责人统一安排架构复审和受影响设计/独立 QA 回归，父任务保持 in_progress，不进入运维集成。
