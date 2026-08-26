# 2026-08-25 s15 — 两 bug 实证修复 + 三轮代码审查 loop（安全边界闭合）

## 起点：用户 /goal
1. 恢复 ZCode 自带浏览器（IAB 卡死，Edge 能开）→ 旧标签全空，新建标签即恢复。
2. bug1 解释功能「想想…」后无反应 → 裸 WS 探针实证桥接回路正常，根因是前端弹层挂在 `<summary>` 内被 `.card{overflow:hidden}` 整体裁剪——改 position:fixed 挂 body、按按钮矩形定位（ef2599b）。
3. bug2 PLM 会话 md 表格不渲染 → 重放事件序列探针实证：**ACP 回放末尾不发 stop 事件**，最后气泡停在 live 态永不 mdRender。openSession 在 session/load 完成时补 endStream()（更新先于 load 响应到达已由事件轨迹证实）。DOM 验证表格渲染为 `<table class="mdtab">`。

## 审查 loop（requesting-code-review 技能）

### Round1（全代码 8 维度）：2 Critical + 8 Important + 10 Minor，全部核实属实
- C1 CSWSH：WS 无 Origin 校验，任意网页可驱动 test_model 外带 API key
- C2 preview 存储型 XSS：marked 未消毒 + iframe srcdoc 无 sandbox
- I1 删会话不解绑工作区（清理承诺死锁）；I2 外链无防环+遍历跟随 junction；I3 目录删除无快照；I4 已删文件 UI 无找回入口；I5 /open 与 copy_artifact shell 注入；I6 innerHTML 注入面；I7 持久化非原子写（断电截断归零）；I8 rpc FIFO 错配

### Round2（验证+抓新）：12/14 确认修复，抓出 5 新问题
- **R2-C1 /artifact 直开绕过**：html/svg 以 text/html 内联返回，preview 下载锚点点击=同源脚本执行，Origin 白名单被穿透，key 外带链复活 → Content-Disposition: attachment + nosniff + 锚点 download 属性 + pdf 改 window.open
- R2-I1 listDir 预算未递减（死代码）；R2-I2 package.sh 许可证指向 min.js 而非 LICENSE 文本；R2-I3 preview 其余 sink（err div/mammoth/xlsx sheet 名）；R2-I7 save_config 漏改 atomicWrite
- 修复过程自身引入 TDZ bug（const ext 声明顺序），运行时空响应暴露后修正——教训：slice 插码必须检查声明顺序，node --check 不抓 TDZ

### Round3：Ready=Yes。6/6 核验通过、0 Critical/Important；仅剩 2 个外观 Minor（catch 兜底转义、一行缩进）已顺手清掉（72b9786）

## 工程方法沉淀
- heredoc 补丁含 `\\n` 时会被转义层吃成真实换行——反斜杠场景一律用切片替换法（定位锚点+索引切割），不做字面量长串匹配
- 裸 WS 探针是验证桥协议的第一工具：事件序列、cid 回显（乱序并发按 id 结算实证）、explain 往返全部靠它定案，浏览器自动化只做最终视觉确认
- 审查子代理两轮抓到的最值钱问题是同一条攻击链的两个半截（C1 入口+C2 落点+R2-C1 绕过）——单看任何一轮都以为修完了

## 交付状态
- commits: ef2599b → 53d0592 → 255d162 → 72b9786
- 八维度终评（round3）：安全边界/数据完整性/正确性/性能/兼容性/许可合规/可维护性/用户体验 全部通过
- DOMPurify 3.2.4 (Apache-2.0) vendored，许可证全文入 vendor-licenses 并登记 package.sh
