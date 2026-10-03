// s108/ef1 前端悬空补帧逻辑探针（ui-logic-probe 同款手法：从 chat.tpl.html 原文提取 handler，vm 桩沙盒执行）
// 覆盖：
//   D1 dangling_turn 帧 → 消息流内一条 role=status 说明（不 banner 不 alert）+「再问一次」钮在场
//   D2 钮点击（lastUserMsg 有值、非 busy）→ 原文回输入框 + submit() 复用既有发送路径 + 说明行移除
//   D3 busy 时点击 → 不发；lastUserMsg 空 → 摘钮不发（「直接重新说一遍」出路在文案里）
//   D4 回放 user_message_chunk → lastUserMsg 记账（页面重开场景的数据源）
'use strict';
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(__dirname + '/../../forge/conf/templates/chat.tpl.html', 'utf8'); // s108 返工(qa P2-1): 原差一级 ENOENT
function grab(re, label) { const m = html.match(re); if (!m) { console.error('NOT FOUND: ' + label); process.exit(1); } return m[0]; }
let pass = 0, fail = 0;
function ck(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); cond ? pass++ : fail++; }

const danglingSrc = grab(/if\(m\.sys==='dangling_turn'\)\{[\s\S]+?\n      return; \}/, 'dangling_turn handler');
const replaySrc = grab(/else if\(u\.sessionUpdate==='user_message_chunk'\)\{[^\n]+\n/, 'user_message_chunk replay branch').replace(/^else\s+/, '');

// ---- 桩 DOM/沙盒 ----
function mkEl(tag) {
    return { tagName: String(tag).toUpperCase(), className: '', attrs: {}, children: [], _text: '',
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
        appendChild(c) { this.children.push(c); return c; }, remove() { this._removed = true; },
        set textContent(v) { this._text = String(v); }, get textContent() { return this._text + this.children.map(c => c.textContent).join(''); } };
}
function mkStub() {
    const chat = { children: [], appendChild(el) { this.children.push(el); }, scrollTop: 0, scrollHeight: 100 };
    const state = { busy: false, lastUserMsg: null, submitted: [] };
    const ctx = {
        chat, nearBottom: () => true,
        get busy() { return state.busy; }, set busy(v) { state.busy = v; },
        get lastUserMsg() { return state.lastUserMsg; }, set lastUserMsg(v) { state.lastUserMsg = v; },
        txt: { value: '' },
        submit() { state.submitted.push(ctx.txt.value); },
        addMsg: () => mkEl('div'),
        document: { createElement: t => mkEl(t) },
        console,
    };
    return { chat, state, ctx, run: (src) => vm.runInNewContext('(function(){' + src + String.fromCharCode(10) + '})()', ctx) };
}
const FRAME = { sys: 'dangling_turn', text: '刚才你发的那条消息还没回完，服务刚好重启了一下，这条回答没有完成。可以点『再问一次』，或者直接重新说一遍。' };

// D1/D2
{
    const s = mkStub();
    s.run('const m = ' + JSON.stringify(FRAME) + ';\n' + danglingSrc);
    const el = s.chat.children[s.chat.children.length - 1];
    ck('D1 note appended to message flow', !!el);
    ck('D1 role=status (not banner/alert)', el && el.attrs.role === 'status');
    ck('D1 verdict wording', el && el._text.includes('还没回完') && el._text.includes('再问一次'));
    const btn = el && el.children.find(c => c.tagName === 'BUTTON');
    ck('D1 retry button present', !!btn);
    ck('D1 button label', btn && btn.textContent === '再问一次');
    ck('D1 zero submit on render', s.state.submitted.length === 0);
    s.state.lastUserMsg = '只回复两个字：收到';
    s.state.busy = false;
    btn.onclick();
    ck('D2 click resends last user message via submit path', s.state.submitted.length === 1 && s.state.submitted[0] === '只回复两个字：收到');
    ck('D2 note removed after click', el._removed === true);
}
// D3
{
    const s = mkStub();
    s.run('const m = ' + JSON.stringify(FRAME) + ';\n' + danglingSrc);
    const el = s.chat.children[s.chat.children.length - 1];
    const btn = el.children.find(c => c.tagName === 'BUTTON');
    s.state.lastUserMsg = 'hi'; s.state.busy = true;
    btn.onclick();
    ck('D3a busy click does not submit', s.state.submitted.length === 0);
    s.state.busy = false; s.state.lastUserMsg = null;
    btn.onclick();
    ck('D3b no-message click removes button, no submit', s.state.submitted.length === 0 && btn._removed === true);
}
// D4 回放记账（同沙盒内：replay 后开帧点击应发回放值）
{
    const s = mkStub();
    s.run('const u = ' + JSON.stringify({ sessionUpdate: 'user_message_chunk', content: { text: '帮我搭个小应用' } }) + ';\n' + replaySrc);
    ck('D4 replay records lastUserMsg', s.state.lastUserMsg === '帮我搭个小应用');
    s.run('const m = ' + JSON.stringify(FRAME) + ';\n' + danglingSrc);
    const el = s.chat.children[s.chat.children.length - 1];
    const btn = el.children.find(c => c.tagName === 'BUTTON');
    s.state.busy = false;
    btn.onclick();
    ck('D4 replayed message feeds the retry button', s.state.submitted.length === 1 && s.state.submitted[0] === '帮我搭个小应用');
}
// 源锚
ck('src anchor msgbtn class (pendingRetry 先例同族)', /className='msgbtn'/.test(danglingSrc));
ck('src anchor msg agent info', /className='msg agent info'/.test(danglingSrc));
ck('src anchor live lastUserMsg 记账', /lastUserMsg=t;/.test(html));
ck('src anchor replay 记账', /lastUserMsg=u\.content\.text;/.test(replaySrc));
ck('src anchor 会话切换同清', /lastOrig=null; lastUserMsg=null;/.test(html));

console.log('ef1-uiarm: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
