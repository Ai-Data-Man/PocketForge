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
