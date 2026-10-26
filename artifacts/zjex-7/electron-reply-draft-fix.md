## 基线与范围

本轮在平台分支 `agent/agent/zjex-7-e7c04110b8df`、起点 `02126a4de3dbb20c7f75b409c039ff3a0a51a79e` 继续追加。`174f00d329c585f2405d028c336b6f259200c286` 是其直接父提交，既有滚动边界修复完整保留。未改写平台历史、提交既有 AGENTS.md、操作他人工作区或服务、推送、合并、部署。

对应派发：`01a17993-c57e-782c-913e-9eba75486e2a`。先下载 QA 完整附件 `01a1799c-8843-719a-a8de-6fa485809fc6`，读取其补充结果与原生复现代码。本轮只修复 QA-03 及它要求覆盖的上传失败恢复，不重新修改已关闭的 annotation、重试、mention 或输入池实现。

## 复现与根因

先临时载入 174f00d 的两个滚动产品文件，使产品源码与冻结候选一致，再编译 development main/preload/renderer，运行 QA 原生复现脚本。HEAD 始终保持 02126a4de；健康端点显示这个平台 HEAD，没有把它冒称为 174f00d。复现后恢复两个文件原样，未提交临时基线内容。

实际 Electron 44.9.3 窗口中，刚输入并挂起真实上传时：切换前 editor 有 `Native race note immediate-0`，draft.content 为空、附件为 uploading；整 tab 卸载再返回，正文消失、占位仍在。真实上传放行 HTTP 200 后只有附件链接，正文没有恢复。已落盘正文对照则完整保留。原始结果 `baseline-results.json` 的 `lost=true` 是缺陷证据，不是修复通过。

原因是 ReplyInput 使用 100ms debounced onUpdate，但没有启用编辑器已有的 `flushPendingOnUnmount`。内部 tab 切换卸载详情，不触发 window pagehide 或 document hidden；父组件清理仅移除监听，ContentEditor 默认丢弃待发更新。于是文本从未进入内存 store，也没有可持久化的值；独立上传协调器保住占位及目标，返回后自然只有占位。不是存储写入慢，也不是输入池内的虚拟行切换。无上传丢失对照见 QA 原始数据；本轮修复后另行实测无上传路径。检查功能前基线 ec91ce3c 的源码也有相同的 100ms/default-false 组合，但未运行该旧版本 Electron，不据此声称已证明引入版本。

第一条正向组件回归修复前失败；原生原始结果的“正文应保留”断言也失败。仅启用卸载刷新后，原生矩阵又发现上传失败路径：store 删除上传记录，但原上传回调只能清理已销毁的旧 editor，返回后重建的占位留下，发送继续被锁住。先补 hook 回归并记录失败，再修复当前占位的失败清理。

## 修改

- `reply-input.tsx`：仅有 draftKey 的回复编辑器启用已有卸载刷新；缓存最后一次文档更新，在清理阶段写回原键。没有新增延时或改 debounce。
- `content-editor.tsx`：现有 `settleUploadPlaceholder` 接受 null 表示失败，复用现有 `removeUploadNode`，只删除指定 upload ID；成功仍按原逻辑替换节点。
- `use-coordinated-uploads.ts`：原来源已卸载且该上传仍属于原草稿时，经现有 registryKey 查找当前已登记 editor，清理失败占位。未改变上传协调器、草稿 store、编辑器或输入池所有权，没有新增 store/registry。
- 两个既有测试文件：回复整 tab 卸载后的未落盘文本保留；失败上传仅清理重开来源的占位、不触碰其他 owner。编辑器缓存销毁前文本的规范测试继续执行。

## 真实 Electron 回归

本轮隔离 worktree-735：API 18815、Web 13735、PostgreSQL 55935，数据库 `multica_worktree_735`。数据通过 TestApiClient 新建，未用他人环境。Electron 使用原生 BrowserWindow、真实键盘和应用 tab 控件；CLI 是测试替身，独立 home/appData，daemon autoStart=false。没有启动真实 agent CLI 或真实任务执行。

最终 16/16 矩阵通过：短任务及 65 条历史长列表，各覆盖刚输入/已落盘正文 × 无上传/上传返回后成功/上传返回后失败，并额外覆盖刚输入正文、上传在 tab 离开期间成功或失败。另有 4/4 嵌套回复通过：短/长列表 × 上传成功/失败，核对实际嵌套目标而非根评论 ID。

每条均核对：

1. fresh 路径切换前，真实 editor JSON 有正文，内存和持久化正文尚为空；persisted 路径则先确认已有正文。
2. tab 离开后原 editor 不存在，内存与持久化正文一致且完整；返回后正文、精确目标及尚在上传的占位保留。
3. 成功实际 HTTP 200、附件 ID 与正文链接保留；失败由路由显式返回 503，失败占位清除、正文不丢、发送门禁解除。无上传、上传失败均不绑定附件。
4. 后续发送只有一次 POST；201 返回的正文与 parent_id 正确；再 GET 服务端列表按本次唯一正文标记匹配，只有一条记录。成功路径绑定且仅绑定一个附件。发送后再跨 tab，已发送草稿不会复活。

20 条结果均记录实际 editor 文档、内存 store、持久化值、各阶段上传及目标、接受的记录 ID 和 POST 次数。为读取内存 store，诊断 renderer 临时增加只读全局引用；没有替换 store、拦截写入或 mock editor/成功 API。此诊断导出已恢复，未提交；最后标准 Desktop build 不含诊断导出。结果 JSON、原生截图和完整脚本在附件包，fixture token、profiles/storage-state 和数据库不在包内。

期间脚本曾错误等待发送后已关闭的 editor、等待已被产品删除的 failed 记录、未滚到虚拟化的嵌套目标、重复使用诊断 profile。相关失败没有计入通过；修正定位/断言并使用每轮唯一 profile 后完整重跑。终止过确切的自有诊断 Node/Electron PID，并与 daemon PID 区分，没有按可执行名清理。

## 检查及边界

- `pnpm --filter @multica/views test issues/components/issue-detail.test.tsx issues/hooks/use-issue-chat-scroll.test.tsx issues/components/comment-composers.test.tsx issues/components/retained-reply-input.test.tsx editor/content-editor.test.tsx editor/use-coordinated-uploads.test.tsx`：6 文件 / 222 项通过，包含滚动边界、门禁释放与显式暂停。
- `pnpm test`：802 文件 / 9,851 项通过，7/7 tasks，3 个缓存任务；不是把缓存项说成全部重新执行。
- `pnpm typecheck`：10/10 成功，6 个缓存；`pnpm lint`：7/7 成功，6 个缓存，views 既有 20 warnings、0 errors。五个修改代码/测试文件另行 ESLint 通过。
- Web build、Desktop build 均退出 0。Desktop 包含实际 Go 1.26.9 CLI 编译和资源复制、main/preload/renderer；资源是 Mach-O arm64，codesign verify 通过。构建版本为 `02126a4de-dirty`，不是声称最终提交 SHA 已进入该二进制。
- 既有滚动边界 P2 的产品差异仍是 `174f00d..02126a4de`；本轮未修改这两个产品文件。两项根因和原始证据见同目录 `scroll-boundary-fix.md`，新候选仍须复审。
- `pnpm exec playwright test -c .context/browser.config.ts e2e/issue-chat-view.spec.ts --global-timeout 240000`：7/8 通过，不能写整组 PASS。顶部要求/最终均为 0，页尾要求 4725.25、最大/最终 4717，两项稳定后各观察 35 帧、0 次写入；草稿/上传/目标、鼠标/键盘中段切换、annotation 和 390px 均通过。失败在历史阅读用例离开任务再返回后，第 435 行原评论不在视口，虽然前一条 scrollTop 断言已经满足。未更改产品或测试，单独 `--grep 'keeps historical' --repeat-each 3 --trace on --global-timeout 180000` 结果 3/3 通过（22.5 / 21.1 / 21.8 秒）。首次失败原因尚未锁定，仍按间歇性未决结果移交，重跑通过不抵消失败，也不拿数值恢复代替阅读锚点验收。本轮未扩展修改既有路由恢复代码。
- `git diff --check` 通过。以上是开发自测；未执行 Windows/Linux、实体读屏器、真实 daemon/agent 集成或最终人工 Review，独立 QA 和架构复审结论不由本报告代替。父任务保持 in_progress，不进入运维交付。

本轮原生 fixture workspace 已经 TestApiClient 删除，API 日志确认 DELETE 204。自有 Electron/浏览器、API/Web、PostgreSQL 均已停止，18815/13735/55935 无监听；没有留下待采集的后台任务。
