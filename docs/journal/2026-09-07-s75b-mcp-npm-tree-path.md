# s75b: MCP 商店安装 npm 解析树内优先（v0.9.11 台账 P2）

## 缺陷
chat-bridge.tpl.js:2180 `npm.cmd` 裸命令名走 PATH。目标机=企业零权限 Windows，PATH 未必有 npm（s73 实录：打包栈受限令牌必失败）；交付树自带 node+npm（bin/node-v22/node-v22.21.1-win-x64/npm.cmd）。

## 修法（最小 diff，1 行→4 行）
npm 解析改为**树内绝对路径优先，PATH 回落**：桥跑在树内 node 上（pc command=树内 node.exe），`path.dirname(process.execPath)` 同目录的 npm.cmd 存在即用（win32 走 shell，绝对路径自裹引号防空格路径）；否则回落原裸名。tpl+bin 同步（bootstrap 物化=逐字复制，cmp 校验过）。

## 实证（全 node 直连，非 Bash curl）
- **树内分支**：解析探针打印 execFile 实收值=`"C:\...\node-v22.21.1-win-x64\npm.cmd"`（带引号绝对路径）；产品路径 POST /api/mcpstore 装 sequential-thinking 25s 完成（vendor 三件齐+config.yaml 块写入）。
- **意外收获=缺陷活体复现**：当前 dev 栈桥进程 PATH 竟无 npm——强制回落分支（临时 `false &&`，跑完即还原）安装失败，错误态干净（stage=error+cmd 人话报错，桥不崩 healthz 200）。即旧代码在当前栈上本来就会失败，修复非理论。
- **回落分支矩阵**（同款 execFile 调用形态）：PATH 含 npm → OK npm v11.9.0；PATH 无 npm → 同款"不是内部或外部命令"。回落语义=旧代码原样。
- **清理**：终态走产品卸载路径，grep config.yaml mcp-sequential-thinking=0 匹配，vendor 目录消失。

## 回归
e2e-chat 48/48 + fuzz 143/143 不降线。

## 边界与暴露
- 只改 chat-bridge.tpl.js（bin/chat-bridge.js 物化同步，gitignore 不入库）。npm 代理 env 未动。mcp-catalog/协议未动。
- **同族裸命令扫描（报告不动，超范围）**：curl:766（技能市场远程拉取）、cmd:1405（OS 版本探针）、reg:1418（IE 代理探测）、powershell:1934/2964（外部打开/剪贴板）、explorer.exe:2444（资源管理器定位）——均 System32/PATH 族，失败面为对应功能降级非崩溃。绝对路径族（GOOSE/PG_DUMP/FAUCET/pc/update-runner）无此问题。
- config.yaml 工作树现为卸载后状态（mcp-sequential-thinking 块移除=产品写入），与 permission.yaml 同属运行时漂移，未入 commit。
