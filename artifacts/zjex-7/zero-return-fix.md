## 顶部离开返回：独立复现与根因

基线 `ba0470f0f384572c434b54bb69d87e175f997e56`，分支 `agent/agent/zjex-7-e7c04110b8df`。本轮仅处理顶部返回旧中段的新现象，不用它替代原第 435 行的归因或关闭其他门禁。

先读取设计师首次失败，再下载补充附件 `01a17a1b-8f1c-7790-aa2f-5edfadde2613`。设计记录实际 click capture 时同任务当前节点 connected=true、top=0，返回规范 URL 第0帧仍0，第1帧起4200，持续到第59帧。该观测没有持有旧容器，也没有直接推测私有缓存来源。

本轮纯基线真实 Chrome 复现：55条长历史、实际嵌套回复目标、已落盘正文；先在4475px中段离开返回，原评论/偏移保留，再用真实鼠标滚轮回到0，立即经任务列表点击同任务 UUID 链接返回，恢复到旧4475px，顶部评论离开视口。点击日志确认来源完整 key、当前连接节点及 top=0；不是只在点击前设置了一个 scrollTop 数值。直接从列表使用浏览器 Back 返回规范编号路径的同条件对照通过。

初版脚本在滚轮派发后过早采集中段锚点，实际滚动随后才完成，导致中段准备失败。已保留该脚本失败，不归为产品缺陷；修正为等待非零滚动实际发生、初始几何连续稳定后才建立阅读锚点。顶部阶段仍是确认首次到0后立即离开，没有增加顶部固定等待。

随后临时在 Web provider 和 shared restore hook 加入仅记录内存事件的只读观测；保持所有判断、返回值和优先级，诊断代码已恢复、未提交。基线 UUID 路径保存链如下（同一页面 performance.now，毫秒）：

| 时间 | 实际保存/读取 |
| --- | --- |
| 6118.7 | 用户滚轮到0，shared 缓存保存0。 |
| 6252.7 | 真实离开 click，来源规范路径、完整任务 key、当前节点 connected=true、top=0；provider 的 save 被调用，但原代码删除该路径记录。 |
| 6326.2 | 来源卸载，shared 再次保存0。 |
| 6510.8 | 返回 UUID 路径，provider 读到该路径此前留下的4475。 |
| 6559.5 | UUID restore 为 target=4475 / overrideTop=4475 / cached=0，旧平台记录覆盖正确0。 |
| 7019.4 | UUID→编号交接，shared 已被更新为4475。 |
| 7022.5–7072.8 | 编号路径因0被删除而无记录；restore 回退到 shared 的4475。 |

根因是把有效的0位置当成“未捕获”。不同 URL 拼写仍各自保存记录：UUID 过渡路径先引入旧中段，规范路径缺少权威0，不能纠正被覆盖的 shared 缓存。shared 本来保存了0，不能归因于用户没滚到顶部、滚动事件未到或草稿输入池。

## 最小修复与失败回归

- 唯一产品修改在 `apps/web/platform/scroll-restoration.tsx`：保存 `{top: Math.max(0, scrollTop), height}`，保留显式0；不再把0删除为 undefined。Map、路径/key、捕获时序、1000ms保护和 `overrideTop ?? cached ?? 0` 优先级均未修改，没有新存储、延时、重试或别名合并机制。
- 更新原 provider 的零位置断言，使公开 `useRestoredScrollOffset` 应返回0而非“无记录”。修前 **2项失败/10项通过**，修后 **12项通过**；并非仅凭这层测试排除实际问题。
- `e2e/issue-chat-view.spec.ts` 新增 UUID 链接与浏览器 Back 两条真实路径。每条都先验证非零中段，再真实滚轮到0、立即离开返回，核对同任务当前连接容器及原评论；中段/顶部各35帧 connected/visible、偏移误差小于2px，并核对完整已落盘正文与精确 nested target，最后重新滚到回复区核对实际 editor 正文。

修后纯产品代码的两条场景 **2/2通过**；只读诊断两条 **2/2通过**，UUID和编号阶段均记录 `target=0 / overrideTop=0 / cached=0`，有效0没有再被当作缺失。随后移除全部临时诊断，完整最终 E2E **10/10通过**：UUID及Back两条的非零4475位置保留，顶部离开 click均为0，返回的首评论偏移355.75px；各70帧均连接可见、最大误差0。正文和精确嵌套回复目标断言通过，没有 mock编辑器/成功API、强制点击或直接写scrollTop到0。

## 实际检查与交接

- `pnpm exec playwright test -c .context/browser.config.ts e2e/issue-chat-view.spec.ts --global-timeout 300000`：**10/10通过**，含原有8项，未用单项重跑替代整组。
- `pnpm --filter @multica/web test`：**37文件/298项通过**；Web typecheck、lint、build退出0。lint为0 errors、1条既有login hook warning。
- shared restore/platform定向回归 **2文件/14项通过**；E2E独立TypeScript和基础规则ESLint、`git diff --check`通过。
- shared、Desktop、后端产品文件与ba0470f内容一致。未重复无关全量monorepo、Go或Desktop构建/原生矩阵，不把Web结果当Electron验收。新的Web零位置语义需受影响复审和独立QA。

隔离环境worktree-174：API18254/Web13174/PostgreSQL55174，仅TestApiClient自建数据，没有真实agent CLI/daemon。7个自建fixture workspace已通过TestApiClient删除并查库确认；浏览器/API/Web/PostgreSQL关闭，三个端口无监听。既有AGENTS.md未修改或提交，未操作他人工作区/服务、push/main/合并/部署，父任务保持in_progress。本报告为开发自测，最终设计与独立QA关闭由负责人统一安排。
