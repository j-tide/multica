## 修复内容与基线

本轮修复模式切换时原偏移超出滚动范围导致的恢复挂起。目标已挂载、列表就绪且几何稳定后，恢复到最近可达位置并释放恢复、保存及跟随门禁。

平台起点为 `174f00d329c585f2405d028c336b6f259200c286`，分支保持 `agent/agent/zjex-7-e7c04110b8df`，仅追加本项修复。未改写起点历史、提交既有 AGENTS.md、修改其他成员工作区、推送、合并或部署。annotation 等已关闭问题未修改实现。本轮对应派发评论 `01a1798d-bedd-7144-8d59-5cd2abab51b8`，审查附件来自 `01a1798b-aba3-7a87-9511-4943d5427f38`。

## 原始复现与根因

先下载 final-incremental-review-evidence.zip，在未修改的起点产品源码上原样执行：

```sh
pnpm --filter @multica/views exec vitest run -c .context/final-review.config.ts
```

附件 2 文件、5 项通过，其中 1 项确认挂起缺陷存在，其余为对照检查。这不是修复通过；baseline-reproduction.log 保留原始结果。新增正向边界回归在修复前为 4 项失败、4 项通过（另有旧用例因筛选跳过），见 regression-red.log。

原逻辑要求实际偏移误差归零，才允许连续稳定后结束。要求 scrollTop=1000、可滚范围最大 800 时，浏览器持续夹取为 800，误差始终非零；循环继续写入并保持 modeAnchor，关联的保存与跟随继续被挂起。

## 实现

- `issue-detail.tsx`：从实际目标 DOM 计算其内容坐标与期望位置，把期望位置限制在 `[0, scrollHeight - clientHeight]` 范围内；只在当前值与最近可达位置相差超过 1px 时写入。
- 完成条件同时包含真实目标存在、目标模式列表已报告挂载，以及目标内容坐标、目标高度、列表总高和视口高度连续 3 帧稳定。列表未就绪、目标缺失或几何仍变化时继续等待；滚动边界本身不会被当作未完成。
- `use-issue-chat-scroll.ts`：解除挂起时，若没有显式暂停，根据现有 80px 规则重新判断是否已在底部，衔接后续消息跟随。显式深链/导航暂停继续有效。
- 用户取消、深链、新发送和查找的优先级沿用现有路径。没有新增恢复超时或无条件清除请求。

## 回归证据

实际 IssueDetail 配合受控 Virtuoso 就绪信号、布局和原生范围语义的 scrollTop 替身：

| 场景 | 检查 |
| --- | --- |
| 普通可达位置 | 恢复到 1000，清除恢复请求，随后 35 帧无新增写入。 |
| 页尾饱和 | 期望 1000、最大 800，完成于 800；保存和跟随门禁释放。 |
| 顶部饱和 | 期望 -80，完成于 0，后续无持续写入。 |
| 布局缩短及异步变化 | 总高、目标高度、目标内容位置和视口高度变化期间保持请求，稳定后完成于新边界 700。 |
| 未就绪与用户取消 | 就绪前观察 20 帧无提前写入；wheel 取消后即使列表随后就绪，也不再执行原恢复。 |
| 深链 / 新发送 | 等待期间显式深链及真实提交 hook 接受的新评论定位优先，原恢复取消。 |
| 保存 / 跟随 | 边界完成后 API 数据追加触发跟随；离开再进入恢复已保存的 1000。独立 hook 用例确认显式暂停仍阻止跟随。 |

以上为组件集成证据，布局和 Virtuoso 是替身。真实浏览器另经 TestApiClient 创建实际任务、同线程评论，使用真实页面、Virtuoso、DOM 几何和 API/WS：

- 顶部边界：实际 top=0、要求=0，稳定后连续 35 帧滚动写入为 0。负目标饱和由上述受控集成验证，未将此浏览器零偏移场景描述成负偏移。
- 页尾不可达：实际期望 4725.25px、最大 4717px，最终 top=4717，稳定后连续 35 帧写入为 0。采样委托浏览器原生 scrollTop getter/setter，仅在 JS 中计数，没有 mock 几何或夹取行为。
- 页尾场景先在群聊真实入口选择精确回复目标，再切回动态并持有正文草稿、同一编辑器及挂起的实际上传；边界切换后目标、正文和编辑器身份保持。远端新评论继续跟随，状态区没有新增未读计数；上传放行后真实 API 成功，附件保留且仍在 80px 范围。
- 中段鼠标、键盘四次双向切换，各观察 35 帧，原可见评论偏移 -109.25px，最大误差均为 0px。旧注释入口、深链、新消息状态、触控头等现有 Web 回归也在本轮重新执行。

浏览器日志含实际尺寸、要求位置、可达范围和空闲写入计数；boundary-top / boundary-bottom 截图为本轮真实应用。首次观测脚本有参数作用域及就绪定位问题，未完成的自有测试 runner 已终止；随后改用不修改 DOM 属性的计数、真实群聊回复入口及实际评论就绪检查。中间尝试没有计作通过，最终结果以 browser-regression.log 为准。

## 修改范围与交接

最终检查：

- `pnpm --filter @multica/views test issues/components/issue-detail.test.tsx issues/hooks/use-issue-chat-scroll.test.tsx`：2 文件、123 项通过，其中新增 8 项组件场景及 2 项跟随/显式暂停场景。
- 上述两文件加 use-issue-detail-scroll-restore、retained-reply-input、comment-composers 的定向回归：5 文件、193 项通过。
- `pnpm test`：7/7 tasks 成功（3 个缓存命中），802 文件、9,849 项通过。
- `pnpm typecheck`：10/10 tasks 成功；`pnpm lint`：7/7 tasks 成功，0 errors、views 既有 20 warnings。
- `pnpm exec playwright test -c .context/browser.config.ts e2e/issue-chat-view.spec.ts --global-timeout 240000`：8 项通过。局部配置继承根配置，仅指定 testDir=../e2e、channel=chrome；全局超时只约束测试进程，没有用于产品恢复逻辑。
- Web 与 Desktop build 均退出 0，Desktop 包含实际 CLI 编译复制及 main/preload/renderer 构建；保留现有 CSS highlight 与动态/静态混合导入等非阻断提示。
- `git diff --check`：通过。原始日志和真实截图随评论附带。

迭代中也修正了 Query 集成测试的数据通知等待：确认新评论实际出现在视图后，再推进跟随帧。没有将尚未处理 Query 通知时的中间断言当作产品失败结论。

相对 174f00d 的产品修改仅为 `issue-detail.tsx` 和 `use-issue-chat-scroll.ts`；测试修改为对应两个既有测试文件及 e2e/issue-chat-view.spec.ts，本文件记录证据。没有修改 annotation、输入池、API 或数据库逻辑。

环境为本轮私有 worktree-719：API 18799 / Web 13719 / PostgreSQL 55919、数据库 multica_worktree_719。使用 make worktree-env 生成配置、make up C=api,web 管理数据库和服务；没有启用 daemon 或真实智能体执行。测试数据由 TestApiClient 管理。收尾通过本轮 registry 的 make down 及 pg_ctl 停止服务。

开发自测不替代新候选的边界增量复审、设计复验及独立 QA。未执行本轮 Electron 原生窗口/tab、实体移动设备、实体读屏器或异步大图完整矩阵；不继承 174f00d 的并行验收结论。父任务保持 in_progress，不交付运维集成。
