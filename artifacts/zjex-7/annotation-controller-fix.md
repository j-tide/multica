## 本轮范围与基线

平台起点为 `7c71281140efa6f2c6a5929dbf93b2c76dc7f028`，分支保持 `agent/agent/zjex-7-e7c04110b8df`，追加提交而不改写起始历史。汇总比较基线为 `81f6f89700eab904e4ac33d156d3b7c3d92e0b2c`。当前平台隔离目录为 `zjex-7-a3cae9f7921d/worktree`；既有 AGENTS.md 修改未提交，未修改其他成员工作区、推送、合并或部署。

本轮处理架构增量报告 `01a17958-463f-749f-9635-12ea3c1cb0f4` / 派发评论 `01a1795a-74af-7ddb-8f6f-5edcdbc79fbb` 的 annotation 双控制器 P2；同时覆盖先前 `01a1794a-f2cd-7bc2-a20f-b55f402c7540` 的新消息播报要求。P1 锚点、P2 窄屏头及播报代码已在起点中，未重复实现。原重试、回收与 mention 问题按架构报告保持代码/组件层面关闭，不以此宣称最终 QA 通过。

## 先复现，再修复

下载 `incremental-review-evidence.zip`，在未修改的起点产品源码上原样运行附件 annotation 复现：

```sh
pnpm --filter @multica/views exec vitest run -c .context/incremental-review.config.ts
```

1 文件、2 项通过，断言的是标记由 1 变 2、同时存在两个编辑器及旧 note 覆盖新 note。这是缺陷存在的证据，不是修复通过。对应 baseline-reproduction.log。81f6f8970 到平台起点 7c7128114 的三个注释控制器相关源码文件 diff 为空，另有一致性 JSON。随后补真实行 popup / 跨行引用入口的回归，在修复前 3 项失败、4 项通过（regression-red.log），再实施修复。

根因：全局 useIssueChatAnnotations 和实际 IssueChatComment 各实例化 useCommentAnnotations；将全局 cardRef 指向真实 owner 仅修复了来源验证，两个实例仍各有 editor.annotation.note、标记和保存闭包。上一轮 SourceRow 测试没有渲染 owner.popup，遗漏了这条双写路径，本轮已补齐。

## 单一编辑来源

- 全局 hook 只保留来源查找、虚拟行挂载等待、draftKey/owner 校验与编辑请求，不再创建 annotation hook 或持有 popup/editor/save 状态。
- 来源行的真实 useCommentAnnotations 控制器在自己的 DOM owner 上注册编辑请求监听；请求不冒泡，只有实际编辑成功才确认。卸载或禁用时移除监听。跨行入口通过找到的 owner 将编辑交给这一实例，仍执行原文 Range 校验。
- 同一注释重复打开时沿用该实例尚未保存的 note，避免入口切换把正在输入的内容重置为 store 旧值；保存继续走唯一的原有确认逻辑。
- IssueChatComment 的行级 popup 完整保留。IssueDetail 移除的是已不再存在的第二个全局 popup，并非隐藏行级 popup 规避问题。
- 真实浏览器额外暴露来源标记 z-20 被讨论导航 z-30 遮挡，真实鼠标点击被拦截；仅将注释标记提升到 z-40，编辑 popup 仍为 z-50。新增浏览器回归使用实际鼠标点击标记，不使用 force click 或成功 mock。

## 关键验证

组件集成使用实际 IssueChatComment、ReplyAnnotations、行级 annotation hook、popup 与 draft store。仅将无关 CommentRow 正文简化为可选择来源 DOM，没有 mock 注释成功返回：

- 已挂载与初始离屏来源均可从另一回复的真实引用入口返回编辑；标记始终 1 个，Comment textarea 始终 1 个。
- 改写 note 后点击真实行标记，仍为同一个编辑器和未保存内容；保存后重新打开读到新值。
- 再次保存更新值后，向旧的已移除 textarea 派发保存事件不会覆盖新值；来源卸载/重挂载后仍读到最新保存内容，回复正文保留。
- 实际 owner 不匹配或原文改变仍拒绝；原四项有效/离屏/owner/原文回归保留，且 SourceRow 现在渲染完整 owner.popup。

真实浏览器新增场景经 TestApiClient、真实 API 和真实 Web 页面创建注释；在 35 条长历史之后的同线程回复处，通过引用入口回到已卸载的原消息，验证唯一标记/编辑器、真实行标记重复打开不重置输入、保存重开内容和返回回复后的持久草稿。后续 8 条历史为目标交互留出空间。截图为 annotation-single-owner / annotation-retained-draft；没有启动真实 agent。

## 相对 81f6f8970 的汇总修改

| 文件 | 修改 |
| --- | --- |
| packages/views/issues/components/issue-detail.tsx | 目标列表就绪和逐评论几何恢复、恢复优先级、独立 unread status；移除第二个全局 annotation popup。 |
| packages/views/issues/components/issue-detail.test.tsx | 真实 DOM / Query 计数宣告，初次加载、编辑、反应与重复快照不误播，焦点/位置保持。 |
| packages/views/issues/components/comment-card.tsx | 窄屏类型/时间不压缩、不换行，姓名截断。 |
| packages/views/issues/components/use-comment-annotations.tsx | 实际 owner 接收编辑请求，唯一编辑状态和保存来源，重复打开保留未保存 note。 |
| packages/views/issues/components/comment-selection-bubble.tsx | 来源标记置于讨论导航之上，真实指针可点击。 |
| packages/views/issues/hooks/use-issue-chat-annotations.tsx | 跨虚拟行挂载/校验后交给真实 owner，不再构造第二个控制器。 |
| packages/views/issues/hooks/use-issue-chat-annotations.test.tsx | 补齐 owner.popup，实际消息行和跨行引用入口集成回归。 |
| e2e/issue-chat-view.spec.ts | 中段双向切换、回复/草稿/上传、390px 触控、新消息状态，以及真实注释跨虚拟行和保存回归。 |
| artifacts/zjex-7/reading-anchor-fixes.md、annotation-controller-fix.md | 设计整改与本轮注释修复的独立证据记录。 |

## 检查与交接

最终结果：

- `pnpm test`：7/7 tasks 成功（3 个缓存命中），802 文件、9,839 项通过。
- `pnpm typecheck`：10/10 tasks 成功；`pnpm lint`：7/7 tasks 成功，0 errors、views 既有 20 warnings。
- 受影响 views：15 文件、350 项通过；core 草稿/视图偏好：2 文件、35 项通过，共 385 项。定向 annotation 两文件 27 项通过。
- `pnpm exec playwright test -c .context/browser.config.ts e2e/issue-chat-view.spec.ts`：6 项通过，使用实际 Google Chrome。局部配置继承根配置并仅指定 testDir=../e2e、channel=chrome，随日志提供；没有 API/页面 mock。
- `pnpm --filter @multica/web build`、`PATH="工具链路径:$PATH" pnpm --filter @multica/desktop build`：均退出 0，包含现有 CSS highlight、动态/静态混合导入等非阻断提示。
- `git diff --check`：通过。

浏览器回归也重新验证 D1–D3：四次中段鼠标/键盘模式切换，各观察 35 帧，原评论偏移 -109.25px、最大误差 0px；草稿、回复目标和真实挂起上传保留；390px 中文触控姓名截断、身份/时间单行且操作可用；新消息只宣告唯一计数，焦点和历史位置保持。迭代时曾在返回页面后仅凭 scrollTop 达标便追加评论，遇到位置变化；现增加返回后的实际评论挂载、相对位置及连续 35 帧检查后再执行历史阅读断言，最终整组通过，不把该中间尝试写成通过。

环境 worktree-477：API 18557 / Web 13477 / PostgreSQL 55911，数据库 multica_worktree_477，由本轮 make worktree-env / make up 管理。测试由 TestApiClient 建立和清理数据，未启 daemon/真实智能体；本轮 registry 的 make down 及本轮 PostgreSQL 均已停止。旧截图文件保持原样，本轮截图作为评论附件和证据包提供。

本轮原始日志随评论附件提供，最终命令结果以最终日志为准。CLI 补核包含 Desktop build 的实际 go build / bundled 路径、资源文件 Mach-O arm64 检查、运行资源内 CLI 的 --version，以及 codesign --verify 成功。源二进制与资源副本哈希不同是 bundle-cli.mjs 对副本执行 macOS ad-hoc 签名的结果，不将它们宣称为相同字节。构建发生在起点加本轮 diff 的工作树上，版本字符串仍包含起点 SHA 和 dirty，不能写作已运行最终提交 SHA 的二进制。

此前 D1–D3 的细节及边界见 reading-anchor-fixes.md。本轮重跑受影响回归及浏览器检查，不直接继承旧候选的设计/QA 结论。aria/DOM 测试不是实体读屏器实测；未运行 VoiceOver/NVDA、实体触控设备、新候选 Electron 原生窗口/tab、Windows/Linux 或真实智能体集成。CLI 编译打包和 Web 检查不能替代这些验收。

等待负责人统一安排汇总候选增量架构复审、设计复验与独立 QA；父任务保持 in_progress，不交付运维集成。
