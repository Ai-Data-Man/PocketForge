# s104 会话记录：思考内容展示(可折叠) + 从零安装反复测试

日期：2026-09-29 ｜ 主控（章程拉起闲时会话）｜ 分支 experimental/delivery-v1，commit 46b6281→4b538b1 已 push

## 主线1 思考内容展示(可折叠)——wire 诚实化

- 取证 research/47（三臂 VERIFIED-RUN）：goose 解析**零模型名门控**（mock 三名 31/31/31 帧逐字节一致；部署二进制实为 1.50.0）；真凶=用户侧 9router fork v0.5.81 在「思考键×system」联合条件下掐 reasoning 流（4/4 差分）；现行栈 0 帧真因链=subscribe 池首跨模型污染种子全局 lastThinkOverride→glm 轮注入→掐流。矛盾裁决：research/44 与 s103 QA 双真（fork effort 透传上线翻转行为）；r46「goose 丢推理」证伪。
- 裁决 2026-09-29-thinking-display-wire-honesty.md（PM 红队五处修订全采：F4 事实分级/探测-退键否决/V2 已知交互/V3 告诫句/分裂面 59-75 触发器）。
- 工程 V1/V2/V5（15/15 套绿）+V3/V4 文档。QA 终验 PASS（变异双向咬合+活体补钉 **1426 帧/首帧 6.8s/effort=''**）。
- 从零冷装端到端：三轮真会话+面板流式（507 字符英文思考）+回合即弃+工具回合全链（建账/台账/回链）。中继推理流有逐请求方差（归 V4）。

## 主线2 从零安装反复测试（三轮）

- R1（iat 4939be0e 冷装游历）：F1 快钮双份/F2 标签瞬态「未设置」→35b62c5 修；探针 settle 等待。撤案四条（守卫提示在/快捷 chip 只填不发/选择器错/RUM=IAB 宿主）。
- R2（净冷装验证+升级路径）：F1/F2 修复实证；升级装（robocopy 覆盖）数据保留；抓出 F3 配置流静默半保存（providers 帧竞态→两路全哑→401 死循环）→396e855 自动建档修；F4 池空误报→4b538b1 submit 前置守卫。C5 探针随迁。
- 环境纪律：C:\PF-TEST 三轮后全清零；dev 栈经 PFdrill2 恢复。

## 教训

- 改守卫族行为必须 grep 全探针面（C5 搭车断言漏跑到回归才红）。
- IAB 自动化：alert() 不弹显→JS 阻塞零 CPU 僵死——探针须预置 alert/confirm 覆写；中文 .cmd 文件名走 8.3 短名。
- 手动覆盖升级：Expand-Archive -Force 慢到不可用（7min 超时）→先解压新目录再 cmd /c robocopy /E。
- 停 dev 栈正确序再实证：先 schtasks /End PFdrill2 再 pc -p <port> down。

## 遗留

- STATE 留档清单（QA P3-1/P4 族+观察项+用户侧 V4 证据包三件：推理方差/量级衰减/秒级 401）。
- 用户侧 fork 修复后复核触发器（裁决 §6）。
