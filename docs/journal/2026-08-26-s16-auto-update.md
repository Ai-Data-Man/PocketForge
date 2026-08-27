# 2026-08-26 s16 — P30 自动升级系统（ADR-0009）全链路验证

## 设计定型（用户两次裁决补强）
1. 整包下载 + 按文件 sha256 差量应用；data/ 天然无状态（package.sh 排除），覆盖=无损。
2. 状态 schema 演进管线：_schema 版本戳+注册表幂等步骤+迁移前留档；降级拒碰。契约新增 §3.5：改 schema 必须同提交带迁移。
3. 现成件调研（research/08）：安装器家族全部踩零污染红线 → 自研 detached 薄壳，吸收 VS Code 范式。

## 实现落点
- forge/VERSION = 版本唯一真相源（package.sh 写入 git describe）；hello 帧、/api/update/* 均带真版本
- bin/update-runner.js：定位(GitHub release / 离线暂存)→sha256→解压(**保护区外** .pf-update-unpack)→停栈(**按端口强杀残余桥**)→差量应用(备份+manifest)→重启→**版本感知 healthz**→失败回滚
- 桥四端点 status/check/upload/start + 设置面板「关于与升级」区块(检查/一键/离线上传带进度)
- 状态 schema 迁移框架入桥(workspace-map/archive/.forge 注册表)+ readJson 助手

## 验证实录（VERIFIED-RUN）
- 正向 v0.9.0-test→v0.9.1-new: 273MB 包 17598 文件,差量 2改8增6删,VERSION 更新,栈自动恢复
- 回滚演练 v0.9.2-broken(chat-bridge 埋 throw): apply 后版本感知检查判败→自动回滚→杀残留桥→VERSION 还原→栈恢复 ✓
- 过程抓出的坑全部固化进代码: 解压目录移出保护区;pc shutdown 遗留监听进程按端口强杀;healthz 必须校验目标版本(老桥 200 差点误判成功);35K 文件哈希加心跳进度

## 教训
- bash heredoc 写含反斜杠的补丁必被转义层撕碎——一律 python 锚点切片替换(s15 已教训过,s16 又栽一次;已刻进肌肉记忆)
- detached 升级器的状态文件是升级期间唯一真相源,每步必须先写盘再执行
- "健康"的定义必须随上下文升级:部署类场景 200 不够,要校验目标版本

## 追加：UI 视觉系统重写（P30b）
用户两次裁决：基础 UI 质感不足 + 第一版主题系统昼模式选中态看不清 → 整体打回重做。

**根因（取证）**：第一版主题 CSS 全是自引用坏变量(``--acc:var(--acc)``)，浏览器丢弃整块；灯色 token 全部失效 → 选中态退回默认 tint，对比度不足。

**重做**：
- CSS 从零写：三层令牌(色板→语义 light/dark→组件)、8pt 间距网格、四级圆角、三级投影、聚焦环、滚动条美化
- 昼/夜：`:root[data-ui]` 切换 + 跟随系统；4 皮肤(苔原绿/靛青蓝/暮山紫/石墨)= 主色覆盖，各自昼夜两套深浅
- **选中态=实色底+反色字**(会话项/tab/chip/模型项)，不再依赖浅 tint 猜
- 字号 s/m/l × 密度 紧凑/标准/宽松，设置面板外观区块全量控制，顶栏 ◐ 快速轮回
- 桥主页面加 no-cache 头(否则 IAB 缓存旧 JS，调试浪费数轮)

**过程抓出的真实 bug**：order 数组残留旧值 day/night 导致模式循环恒等于 light；renderThemeUI 未同步 select 值；#stop 缺 display:none 常驻显示；CSS 重写把 #pane-cur/#pane-all 的 flex:1+滚动规则丢光 → 切浏览全部整个右栏塌陷(用户实测报的 bug)。

**教训**：大段 CSS 重写必须对照旧文件逐条清单核对容器规则，别只补视觉规则漏布局规则；主题系统第一版的自引用变量是低级错，写 token 时先跑一遍 getComputedStyle 验证。
