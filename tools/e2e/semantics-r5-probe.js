// r5/S1 词汇母句探针（裁决 docs/verdicts/2026-09-19-capability-semantics-r5 §2.2/§3/§6-S1）
// 断言面（S1 验收①②③ 的机器化）：
//   ① 妻子面旧词清零——本事|插件|本领=0；「技能」仅存活于折叠技术区（技能从哪进货 details）与 slash 隐藏 alias；
//      手法=HTML 段剥 <!-- --> 注释并整块摘除技术区 details；脚本段状态机剥 // 与 /* */ 注释（区分字符串字面量，
//      注释里的旧词=代码面合法存活不计数）。
//   ② 三母句逐字在场（§2.2 原文 contains 断言——S3 追加尾句不破坏）+ 三 h3。
//   ③ slash /手艺 主入口 + alias 保 技能/jineng/skills 隐藏别名 + /手艺· 动态前缀 + fallback desc；
//      台账徽章「✨ 手艺」/chips/来源句/made fnote 指路句。
// 单跑：node tools/e2e/semantics-r5-probe.js（无桥无网络，秒级）
'use strict';
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat.tpl.html', 'utf8');
let pass = 0, fail = 0;
function ck(name, cond, detail) {
    if (cond) { console.log('PASS: ' + name); pass++; }
    else { console.log('FAIL: ' + name + (detail !== undefined && detail !== '' ? '  | ' + String(detail).slice(0, 160) : '')); fail++; }
}

// ---- 分段：HTML（含字符串型 UI 文案）与脚本 ----
const scriptStart = html.indexOf('<script>');
ck('模板含 <script> 分段锚', scriptStart > 0);
const htmlPart = html.slice(0, scriptStart);
const scriptPart = html.slice(scriptStart);

// HTML 注释剥离（代码面注释不计数）；<style> 块=CSS 代码面整体摘除（非妻子可见文案）
const htmlNoBody = htmlPart.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<!--[\s\S]*?-->/g, '');
// 技术区白名单块（折叠 details：技能从哪进货——「技能」词汇的合法居所，裁决 §3 词汇表）
const tzRe = /<details class="tz"[\s\S]*?技术设置：技能从哪进货[\s\S]*?<\/details>/;
const tz = htmlNoBody.match(tzRe);
ck('技术区（技能从哪进货）在场可定位（词汇表豁免块）', !!tz);
const htmlWife = tz ? htmlNoBody.replace(tz[0], '') : htmlNoBody;

// ---- ① 妻子面旧词清零 ----
// 白名单先例（裁决 §3 词汇表）：slash alias 表保留旧词作隐藏别名（输入可搜到不展示）——本事/技能 同门。
const OK_ALIAS = l => /alias:\[[^\]]*'本事'/.test(l);
function wifeZero(seg, w) {
    if (seg === htmlWife) return seg.indexOf(w) < 0;
    return seg.split('\n').every(l => l.indexOf(w) < 0 || (w === '本事' && OK_ALIAS(l)));
}
const BAD = [['本事', htmlWife], ['插件', htmlWife], ['本领', htmlWife], ['本事', scriptNoC()], ['插件', scriptNoC()], ['本领', scriptNoC()]];
for (const [w, seg] of BAD) ck('妻子面旧词清零：' + (seg === htmlWife ? 'HTML段' : '脚本段') + '「' + w + '」=0（alias 隐藏别名除外）', wifeZero(seg, w), hit(seg, w));
// 「技能」白名单：技术区字符串（技能源）、agent 面系统备注串（版本管理技能先存一版——发给模型，妻子不见）、
// slash alias 数组里的隐藏别名（'技能'）
const OK_SKILL = l => /技能源|版本管理技能先存一版/.test(l) || /alias:\[[^\]]*'技能'/.test(l);
const skillLines = scriptNoC().split('\n').map((l, i) => [i, l]).filter(([, l]) => l.indexOf('技能') >= 0);
ck('脚本段「技能」仅存活于技能源技术区字符串/agent 面备注/隐藏 alias', skillLines.every(([, l]) => OK_SKILL(l)),
    skillLines.filter(([, l]) => !OK_SKILL(l)).map(([i, l]) => 'L' + i + ':' + l.trim().slice(0, 60)).join(' ; '));
ck('HTML 段（摘技术区后）「技能」=0', htmlWife.indexOf('技能') < 0, hit(htmlWife, '技能'));

// ---- ② 三母句逐字（§2.2 原文）+ 三 h3 ----
const M_EXT = '这些是它出厂就长在身上的：数据库、浏览器、长期记忆。只能开和关——关上哪个，它这次就不用哪个（重启数字员工后生效）。添不了新的，也拆不掉。想给它添工具，去「🔌 工具」；想看它学会的做法，去「🧩 手艺」。';
const M_MCP = '这里是从工具目录给它添的外接工具。跟出厂自带的不一样：这些是后来装的，装一个多一件家伙，不用了可以卸掉。带「官方」牌的是官方出品，其余是自己加的。装、卸、开和关都在这里（重启数字员工后生效）。';
const M_SK  = '这些是教它怎么干活的做法册：有出厂带的，有从市场装的，还有它干活时自己学会的。工具说的是「它有什么」，做法说的是「它怎么干」——聊天里说到相关的活儿它会自己用；也可以点「让它现在用」。';
ck('母句①自带的（mpane-ext fnote 逐字）', htmlNoBody.indexOf(M_EXT) >= 0);
ck('母句②工具（mpane-mcp fnote 逐字）', htmlNoBody.indexOf(M_MCP) >= 0);
ck('母句③手艺（skills-modal fnote 逐字，contains——S3 追加尾句不破坏）', htmlNoBody.indexOf(M_SK) >= 0);
ck('h3：自带的（出厂长在它身上）', htmlNoBody.indexOf('自带的（出厂长在它身上）') >= 0);
ck('h3：工具（后来添的外接家伙）', htmlNoBody.indexOf('工具（后来添的外接家伙）') >= 0);
ck('h3：🧩 小 forge 的手艺（它学会的做法）', htmlNoBody.indexOf('🧩 小 forge 的手艺（它学会的做法）') >= 0);
ck('tab：🧠 自带的', htmlNoBody.indexOf('>🧠 自带的<') >= 0);
ck('tab：🔌 工具', htmlNoBody.indexOf('>🔌 工具<') >= 0);
ck('弹窗 tab：它的手艺', htmlNoBody.indexOf('>它的手艺<') >= 0);
ck('弹窗 tab：＋ 去市场学新做法', htmlNoBody.indexOf('＋ 去市场学新做法') >= 0);

// ---- ③ slash 双入口 + 台账词汇 ----
const js = scriptNoC();
ck('slash /手艺 主入口（desc=看它学会的做法）', /cmd:'\/手艺'[^}]*desc:'看它学会的做法'/.test(js));
ck('slash /手艺 alias 保旧词隐藏别名（skills/jineng/技能）', /cmd:'\/手艺', alias:\['skills','jineng','技能'\]/.test(js));
ck('slash /管理 alias 保 本事 隐藏别名', /cmd:'\/管理', alias:\[[^\]]*'本事'/.test(js));
ck('slash /管理 desc 去「本事」（自带的开关…）', /cmd:'\/管理'[^}]*desc:'自带的开关\/记忆\/定时任务'/.test(js));
ck('技能动态命令前缀 /手艺·', js.indexOf("cmd:'/手艺·'") >= 0);
ck('skillCmds fallback desc=让它按学会的做法来做', js.indexOf('让它按学会的做法来做') >= 0);
ck('请按手艺 X 的流程（use/run 两处家族词）', js.indexOf('请按手艺 ') >= 0);
ck('台账徽章 ✨ 手艺（MADE_KIND_ZH+chips）', (js.match(/'✨ 手艺'/g) || []).length >= 2);
ck('台账来源句=它干活时自己学会的做法', js.indexOf('它干活时自己学会的做法') >= 0);
ck('made fnote 指路=做法在「🧩 手艺」', htmlNoBody.indexOf('做法在「🧩 手艺」') >= 0);
ck('技术区措辞：自己加的工具（技术）+ 工具目录', htmlNoBody.indexOf('自己加的工具（技术）') >= 0 && htmlNoBody.indexOf('在工具目录里找') >= 0);

// ---- ④ 桥侧用户面段（qa2/P2-1：QA 用 curl 活体证伪 faucet-db desc 带「本事」，探针扫描面从 chat.tpl.html 扩到桥模板）----
// 手法=audit-r5-probe 取桥文件同款：提取 LABELS / MCP_CATALOG / handleSkillstore 回执三段，剥注释后扫字符串面
// （注释里的旧词=代码面合法存活不计数）。三段内 技能/插件 无豁免居所（技术区「技能源」串与 agent 面均不在段内）。
const bridge = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat-bridge.tpl.js', 'utf8');
const BRIDGE_BAD = ['本事', '本领', '插件', '技能'];
function bridgeZero(segName, seg) {
    for (const w of BRIDGE_BAD) {
        const i = seg.indexOf(w);
        if (i >= 0) return '「' + w + '」@ ' + seg.slice(Math.max(0, i - 40), i + 40);
    }
    return '';
}
const labelsSeg = stripJsComments((bridge.match(/const LABELS = \{[\s\S]*?\n        \};/) || [''])[0]);
const mcpSeg = stripJsComments((bridge.match(/const MCP_CATALOG = \[[\s\S]*?\n\];/) || [''])[0]);
const skillSeg = stripJsComments((bridge.match(/function handleSkillstore\(req, res, url\) \{[\s\S]*?\n\}\n\nasync function handleHttp/) || [''])[0]);
ck('桥段可定位：LABELS / MCP_CATALOG / skillstore 回执', !!labelsSeg && !!mcpSeg && !!skillSeg);
ck('桥 LABELS 段旧词清零（本事|本领|插件|技能）', !bridgeZero('LABELS', labelsSeg), bridgeZero('LABELS', labelsSeg));
ck('桥 MCP_CATALOG 段旧词清零', !bridgeZero('MCP_CATALOG', mcpSeg), bridgeZero('MCP_CATALOG', mcpSeg));
ck('桥 skillstore 回执段旧词清零', !bridgeZero('skillstore', skillSeg), bridgeZero('skillstore', skillSeg));
// 欢迎页=妻子面首屏（qa2/P2-1 顺手清扫面）：纯 HTML 零注释剥离，四旧词直接清零
const welcome = fs.readFileSync(__dirname + '/../../forge/conf/templates/welcome.tpl.html', 'utf8');
ck('欢迎页旧词清零（本事|本领|插件|技能）', !bridgeZero('welcome', welcome), bridgeZero('welcome', welcome));

// ---- ⑤ 活体断言：GET /api/extensions 四行 desc 零旧词（QA curl 证伪形态进断言；桥不在线=SKIP 不计数）----
(function live() {
    const http = require('http');
    const base = process.env.PF_BRIDGE || 'http://127.0.0.1:8790';
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        console.log('semantics-r5-probe: PASS=' + pass + ' FAIL=' + fail);
        process.exit(fail ? 1 : 0);
    };
    const skip = () => { console.log('SKIP: 活体 /api/extensions 断言（桥不在线，离线单跑模式）'); finish(); };
    const req = http.get(base + '/api/extensions', res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            let rows = null;
            try { rows = JSON.parse(body); } catch {}
            const ok4 = Array.isArray(rows) && rows.length === 4 && rows.every(r => typeof r.name === 'string' && typeof r.desc === 'string');
            ck('活体 /api/extensions 四行形状（含 name/desc 字符串）', ok4, body.slice(0, 120));
            if (ok4) {
                const hitW = rows.map(r => [r.name, r.desc].join(' ')).map(s => BRIDGE_BAD.filter(w => s.indexOf(w) >= 0)).filter(a => a.length);
                ck('活体 /api/extensions desc 零旧词（本事|本领|插件|技能）', hitW.length === 0, JSON.stringify(hitW));
            }
            finish();
        });
    });
    req.setTimeout(2500, () => { try { req.destroy(); } catch {} skip(); });
    req.on('error', skip);
})();

// ---- 工具函数 ----
function hit(seg, w) { const i = seg.indexOf(w); return i < 0 ? '' : seg.slice(Math.max(0, i - 40), i + 40); }
function scriptNoC() { return stripJsComments(scriptPart); }
// 状态机剥 JS 注释：字符串（' " `）优先于注释判定；正则字面量不识别（本模板无含 // 的正则字符串面风险——
// 探针断言粒度为行级白名单，个别正则字面量内 // 误剥只可能造成漏报方向的保守偏差，不产生假绿）
function stripJsComments(src) {
    let out = '', i = 0, n = src.length;
    while (i < n) {
        const c = src[i], c2 = src[i + 1];
        if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (c === '\'' || c === '"' || c === '`') {
            const q = c; out += c; i++;
            while (i < n) {
                if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
                out += src[i];
                if (src[i] === q) { i++; break; }
                i++;
            }
            continue;
        }
        out += c; i++;
    }
    return out;
}
// 汇总与退出由上方活体块 finish() 收口（离线时 2.5s 超时 SKIP 兜底，不悬挂）
