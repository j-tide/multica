## 候选与复现

本轮继续平台分支 `agent/agent/zjex-7-e7c04110b8df`，直接起点为 `81f6f89700eab904e4ac33d156d3b7c3d92e0b2c`，其父提交为冻结候选 `27ac1f4ee64b2788cefb885c2c9064425dd11cec`。本次追加提交包含上一轮架构缺陷修复的完整历史，不改写两个旧候选。平台本轮提供的隔离目录为 `zjex-7-5d95dc15ac39/worktree`；未进入其他成员工作区，既有 AGENTS.md 修改不纳入提交。

复现参考：设计初报 `01a1793f-7eb5-7694-91a1-bac10d3a8095`、完整报告 `01a17948-da89-7e54-86e3-ddaf0406e11b`（已下载 acceptance.md 与窄屏截图）、独立 QA 中段证据 `01a1794a-a181-7158-9477-d02af1217cf9`，以及补充播报要求 `01a1794a-f2cd-7bc2-a20f-b55f402c7540`。

先在 81f6f8970 的产品源码上运行真实浏览器复现：TestApiClient 经真实 API 写入 65 条长历史（加原始 3 条评论，共 68 条），无深链和查找，滚至中段后切换。旧实现返回任务标题及第一条评论，原阅读评论未恢复；浏览器断言失败，截图为 baseline-middle-before/after.png，原始输出为 baseline-browser.log。没有将设计症状直接作为根因结论。

## D1 / P1 阅读锚点

原流程在父组件 layout effect 中发一次 scrollToIndex，没有等待目标 Virtuoso 的挂载/测量反馈；后续只校正已存在的 DOM，不再请求尚未挂载的目标。无论是否找到目标，15 帧后都清除恢复请求。同时，每种模式的旧 scrollTop 恢复仍可写入同一容器。这些协议缺口共同允许列表初始化或旧恢复覆盖模式切换的位置。

修复在 `issue-detail.tsx`：

- 用响应式恢复请求持有目标模式、逐评论 ID 和相对偏移；目标列表通过 initialTopMostItemIndex 自行初始化到包含该评论的行，恢复期间不注入旧 initialScrollTop。
- 通过 itemsRendered 的 ref 信号确认目标模式已有挂载范围，再请求尚缺的评论 DOM；ref 回调不触发父组件 setState，避免列表回调和重新渲染形成反馈。
- 动态模式定位回复时展开其根线程。完成条件为实际评论存在、其偏移误差不超过 1px、评论高度与列表总高连续 3 帧稳定；不会用固定等待耗尽代替完成。目标不存在/删除时取消，用户滚动、触摸、点击或键盘操作可中断。
- 恢复期间禁用旧位置恢复和 chat 自动跟随；未消费的显式深链、新发送定位优先，讨论/评论/运行跳转及查找取消模式恢复。普通页面恢复继续使用现有 memento 流程。

新增真实浏览器回归使用中段回复、原编辑器 DOM、未发送草稿和延迟放行的真实 upload-file 请求。鼠标及键盘各执行 chat→activity→chat，逐次检查原首个可见评论和相对位置，并连续观察 35 帧；同时检查编辑器身份、草稿及回复目标，上传在四次切换后由真实 API 完成。测试另保留嵌套回复草稿/附件和逐评论深链回归。测量值和真实截图随附件提供。

## D2 / P2 窄屏消息头

原姓名、类型与时间同时参与 flex 收缩，类型和时间允许逐字换行。`comment-card.tsx` 将类型与时间设为 shrink-0 / whitespace-nowrap，姓名继续使用 min-w-0 / truncate，保留原字号和全部操作。

真实 Chrome 390×844、中文、长参与者名称、hasTouch 上下文验证：pointer:coarse 且 hover:none；姓名实际 scrollWidth 大于 clientWidth，类型与时间高度均为 16px（行高 16px），顶部一致；操作全部在视口内，触摸打开更多菜单成功，document 无横向溢出。截图为 zjex-7-touch-390-long-name.png。本轮窄屏浏览器 fixture 为成员作者，未补齐智能体/所有语言矩阵。

## D3 / P2 新消息状态播报

旧页面只有视觉按钮，现有 toast live region 不接收新消息计数。保留常驻的独立空状态区，使用 role=status、aria-live=polite、aria-atomic=true，只宣告现有去重计数，不把历史列表放入 live region，不移动焦点。

新增 IssueDetail 真实 DOM / Query 集成测试：异步初次加载状态区为空；历史阅读收到一个新 ID 后状态仅更新一次；后续编辑、反应和重连式重复快照不增加或重复更新宣告，焦点和 scrollTop 保持。真实浏览器另经 API→WS 验证 “1 new message” 状态、原焦点、历史位置及跳到最新后的 80px 跟随，截图为 zjex-7-history-unread-status.png。未运行 VoiceOver/NVDA 或实体读屏器，不能将这些检查称为读屏器实测。

## 上一轮架构缺陷关联

上一轮修复报告为 `artifacts/zjex-7/review-fixes.md`。本轮全仓测试重新覆盖：真实 annotation hook/消息 owner 的合法与拒绝路径、失败/取消通知去重且保留 Retry、40 行离屏空闲输入回收、草稿/上传/发送锁/精确回复目标保护，以及当前任务 mention 上下文。没有把旧候选结论直接继承为新候选验收。

## 验证命令与环境

隔离环境 worktree-939：API 19019、Web 13939、PostgreSQL 55939、数据库 multica_worktree_939。使用 make worktree-env 生成配置，再显式指向本轮独立启动的 PostgreSQL；由 make up C=api,web ARGS=--ephemeral 创建数据库、迁移和启动服务。本轮未启动 daemon 或真实智能体执行。CLI 仅从源码编译打包。

- `pnpm test`：7/7 tasks 成功（3 个缓存命中），802 文件、9,836 项通过。
- `pnpm typecheck`：10/10 tasks 成功。
- `pnpm lint`：7/7 tasks 成功，0 errors；views 既有 20 warnings。
- 受影响 views 回归：14 文件、342 项通过；core 草稿/视图偏好：2 文件、35 项通过，合计 377 项，另有独立原始日志。
- `pnpm exec playwright test -c .context/browser.config.ts e2e/issue-chat-view.spec.ts`：5 项通过。局部配置仅继承根配置、指定 testDir=../e2e 及 channel=chrome；同一 spec 可在装有项目 Chromium 的环境用根配置执行。项目 Chromium 下载遭遇 TLS 连接错误，本地使用已安装的真实 Google Chrome，无页面/API mock。
- 中段目标/回复上下文的加强断言另行执行：1 项通过，四次切换各连续 35 帧，原偏移 -109.25px，最大误差均为 0px；每次均核对回复提示和持久化精确目标 ID，日志为 browser-context-proof.log。
- `pnpm --filter @multica/web build` 与 `pnpm --filter @multica/desktop build` 均退出 0，最终原始日志随附件提供；Desktop 本轮具有 Go 1.26.9，实际编译并打包 darwin/arm64 CLI、main/preload/renderer。构建有现有 CSS highlight、动态/静态混合导入等非阻断提示。
- `git diff --check`：通过。

检查针对本轮最终产品源码执行。中间尝试暴露的未就绪参数、列表回调重渲染、测试整页导航丢失内存记录、触控 context 配置问题已修正；最终结果以附带最终日志为准。测试数据由 TestApiClient 清理，测试环境最终通过本轮 registry 的 make down 停止，并停止本轮 PostgreSQL。

## 交接边界

本轮提供开发自测、真实 Web 截图和源码候选；未执行 Electron 原生窗口/tab 的新候选验收、实体触控设备、实体读屏器、异步大图加载矩阵。Web 与构建结果不代表 Electron 通过。新候选仍待负责人统一安排架构复审、设计复验和独立 QA；父任务保持 in_progress，不进入运维集成。未推送、合并或部署。
