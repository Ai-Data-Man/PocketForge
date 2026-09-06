// qa 2026-09-06 第三轮返工桩测（P2-1/P2-2/P2-3/P3-6/P3-5 钉子），19 ck，秒级，无桥无网络。
// 手法（同 badge-esc-probe）：从模板原文逐字提取函数源码在桩沙盒执行（防"测试副本与产品漂移"）：
//   exppop 6 ck：30 个 delta 帧复用同一气泡 document click 监听器恒 1；关后再开仍 1；点气泡内不关；双卡=2。
//   sync-dirty 5 ck：busy 窗内二次调用置脏即返回（不并发跑）；收尾补跑一轮；期间又来真请求→第三轮；静止后不活锁。
//   sync-degrade 7 ck：坏源跳过+失败清单；好源照常合并；人话警告入 stateWarnings 且不泄路径；全坏→throw+旧缓存保留；恢复轮清警告。
//   explain-error 2 ck：非 SSE 分支识别 j.error 回「解释失败: <人话>」（源码钉子）。
//   unpack-clean 1 ck：update-runner finally 清 unpack 残留树（源码钉子；843MB 实体残留另行手清留痕）。
// 已挂 fuzz-chat.sh；单跑：node tools/e2e/qa3-round3-probe.js
'use strict';
const FSS = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = FSS.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'chat.tpl.html'), 'utf8');
const bridge = FSS.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'chat-bridge.tpl.js'), 'utf8');
const runner = FSS.readFileSync(path.join(ROOT, 'forge', 'conf', 'templates', 'update-runner.tpl.js'), 'utf8');
function grab(src, re, what) {
    const m = src.match(re);
    if (!m) { console.error('NOT FOUND: ' + what + '（模板结构漂移，先改探针）'); process.exit(1); }
    return m[0];
}
let pass = 0, fail = 0;
function ck(name, cond, detail) {
    if (cond) { console.log('PASS ' + name); pass++; }
    else { console.log('FAIL ' + name + (detail !== undefined ? ' — ' + detail : '')); fail++; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(cond, ms) {
    const t0 = Date.now();
    while (!cond()) { if (Date.now() - t0 > ms) return false; await sleep(10); }
    return true;
}

// ================================ P2-1: showExpPop 监听器恒 1 ================================
const expSrc = grab(html, /function showExpPop\(card,text\)\{[\s\S]*?\n\}/, 'showExpPop()');
function popEnv() {
    const clicks = [];
    const body = { appendChild(el) { el.parentNode = body; } };
    const doc = {
        createElement: () => ({ style: {}, textContent: '', onclick: null, offsetHeight: 50,
            contains(t) { return t === this; }, remove() { this.parentNode = null; } }),
        body,
        addEventListener: (t, h) => { if (t === 'click') clicks.push(h); },
        removeEventListener: (t, h) => { const i = clicks.indexOf(h); if (i >= 0) clicks.splice(i, 1); },
    };
    return { doc, clicks };
}
const anchor = { getBoundingClientRect: () => ({ left: 10, bottom: 100 }) };
const mkCard = () => ({ querySelector: () => anchor, _exppop: null });
{
    const { doc, clicks } = popEnv();
    const showExpPop = new Function('document', 'innerHeight', 'setTimeout', expSrc + '; return showExpPop;')(doc, 600, fn => fn()); // setTimeout 同步化：监听器立即可见
    const card = mkCard();
    for (let i = 1; i <= 30; i++) showExpPop(card, '帧' + i); // 模拟 30 个 tool_explanation_delta 帧复用同一气泡
    ck('P2-1 30 delta 帧后 document click 监听器恒 1', clicks.length === 1, 'clicks=' + clicks.length);
    const pop1 = card._exppop;
    showExpPop(card, '帧31');
    ck('P2-1 气泡元素跨帧稳定（不重建不叠加）', card._exppop === pop1 && pop1.textContent === '帧31', 'text=' + pop1.textContent);
    clicks[0]({ target: {} }); // 点气泡外 → 关闭
    ck('P2-1 点外关闭后监听器归 0、气泡摘除', clicks.length === 0 && card._exppop === null, 'clicks=' + clicks.length + ' pop=' + card._exppop);
    for (let i = 1; i <= 5; i++) showExpPop(card, '再开' + i); // 关后再开（新气泡）
    ck('P2-1 关后再开监听器仍恒 1', clicks.length === 1, 'clicks=' + clicks.length);
    clicks[0]({ target: card._exppop }); // 点气泡内部 → 不关
    ck('P2-1 点气泡内部不关闭（监听器仍在）', clicks.length === 1 && card._exppop !== null, 'clicks=' + clicks.length);
    const card2 = mkCard();
    showExpPop(card2, '另一张卡');
    ck('P2-1 双卡双气泡=2 个监听器（一泡一监听器语义）', clicks.length === 2, 'clicks=' + clicks.length);
}

// ================================ P2-2/P2-3: 技能同步引擎（提取真源码桩测） ================================
const warnSrc = grab(bridge, /function warnSkillFetchFailures\(failed\) \{[\s\S]*?\n\}/, 'warnSkillFetchFailures()');
const fetchSrc = grab(bridge, /async function fetchAllRemoteSkills\(failedOut\) \{[\s\S]*?\n\}/, 'fetchAllRemoteSkills()');
const syncSrc = grab(bridge, /async function syncRemoteSkills\(\) \{[\s\S]*?\n\}/, 'syncRemoteSkills()');

function buildEngine(cfg) {
    // cfg: { sources, gh(url)->listing|null, ghDelayMs }
    const stateWarnings = [];
    const writes = []; // 每次 writeSkillManifest 落下的 skills dir 清单
    let ghGoodCalls = 0; // 主源 ghJson 调用数 = 完整轮数刻度
    const engineSrc = 'let skillSyncBusy=false, skillSyncDirty=false;\n' + warnSrc + '\n' + fetchSrc + '\n' + syncSrc
        + '\n; return { fetchAllRemoteSkills, syncRemoteSkills, warnSkillFetchFailures, flags: () => ({ skillSyncBusy, skillSyncDirty }) };';
    const api = new Function('readSkillSources', 'ghJson', 'ghText', 'parseSkillMeta', 'fileNameSafe', 'FSS', 'atomicWrite', 'path', 'SKILL_CACHE',
        'stateWarnings', 'readSkillManifest', 'mergeSkillManifest', 'writeSkillManifest', 'translateSkillManifest', 'console', engineSrc)(
        () => cfg.sources,
        async url => {
            if (url.includes(cfg.mainRepo)) { ghGoodCalls++; await sleep(cfg.ghDelayMs); return cfg.ghMain(); }
            await sleep(5);
            return cfg.ghOther(url);
        },
        async () => '---\nbody\n',
        (raw, fb) => ({ name: fb, description: 'stub 说明', body: raw }),
        () => true,
        { mkdirSync() {} },
        () => {},
        { join: (...a) => a.join('/') },
        '/cache',
        stateWarnings,
        () => null,
        (oldM, skills) => ({ _schema: 2, fetched_at: 't0', translating: false, skills }),
        m => writes.push(m.skills.map(s => s.dir).join(',')),
        async () => {},
        { log() {}, warn() {} },
    );
    return { ...api, stateWarnings, writes, rounds: () => ghGoodCalls, setSources: a => { cfg.sources = a; } };
}
const GOOD = { repo: 'good/src', branch: 'main', subdir: 'skills', enabled: true };
const BAD = { repo: 'bad/dest', branch: 'main', subdir: 'skills', enabled: true };
const LISTING = [{ type: 'dir', name: 'alpha' }, { type: 'dir', name: 'beta' }, { type: 'file', name: 'x.md' }];

// ---- P2-3：坏源降级 / 人话警告 / 全坏保留旧缓存 / 恢复轮清警告（7 ck，同步顺序执行无 busy 交叠）----
(async () => {
    const e1 = buildEngine({ sources: [GOOD, BAD], mainRepo: GOOD.repo, ghMain: () => LISTING, ghOther: () => null, ghDelayMs: 5 });
    const failed = [];
    const skills = await e1.fetchAllRemoteSkills(failed);
    ck('P2-3 坏源跳过：只回好源技能（dir 过滤后 alpha/beta）', skills.map(s => s.dir).join(',') === 'alpha,beta', JSON.stringify(skills.map(s => s.dir)));
    ck('P2-3 失败清单收到坏源 repo 短名', failed.length === 1 && failed[0] === BAD.repo, JSON.stringify(failed));
    await e1.syncRemoteSkills();
    const w1 = e1.stateWarnings.filter(x => x.indexOf('技能源 ') === 0);
    ck('P2-3 sync 收尾写人话警告（含坏源短名+「可能是地址写错了」）', w1.length === 1 && w1[0].indexOf(BAD.repo) >= 0 && w1[0].indexOf('可能是地址写错了') >= 0, JSON.stringify(w1));
    ck('P2-3 警告不泄内部路径/上游 URL（无 C: 无 http）', w1.every(x => !x.includes('C:') && !x.includes('http')), JSON.stringify(w1));
    ck('P2-3 好源技能照常合并落缓存（API 层半程成功）', e1.writes.length >= 1 && e1.writes[e1.writes.length - 1] === 'alpha,beta', JSON.stringify(e1.writes));
    const e2 = buildEngine({ sources: [GOOD, BAD], mainRepo: GOOD.repo, ghMain: () => null, ghOther: () => null, ghDelayMs: 5 });
    await e2.syncRemoteSkills(); // 全坏：整轮失败
    const w2 = e2.stateWarnings.filter(x => x.indexOf('技能源 ') === 0);
    ck('P2-3 全部源失败：保留旧缓存整体失败语义（writeSkillManifest 零调用）+ 双源警告照写', e2.writes.length === 0 && w2.length === 2 && e2.flags().skillSyncBusy === false, JSON.stringify({ writes: e2.writes.length, w: w2 }));
    let threw = false;
    try { await e2.fetchAllRemoteSkills([]); } catch (err) { threw = String(err.message).includes('全部不可达'); }
    ck('P2-3 全坏时 fetchAllRemoteSkills 本体 throw（供首拉路径走旧失败分支）', threw);
    const e3 = buildEngine({ sources: [GOOD, BAD], mainRepo: GOOD.repo, ghMain: () => LISTING, ghOther: () => null, ghDelayMs: 5 });
    await e3.syncRemoteSkills(); // 产生坏源警告
    e3.setSources([GOOD, GOOD]); // 坏源修好（同款好源顶替）
    await e3.syncRemoteSkills(); // 恢复轮
    ck('P2-3 成功轮自动清旧失败警告（同进程自愈）', e3.stateWarnings.filter(x => x.indexOf('技能源 ') === 0).length === 0, JSON.stringify(e3.stateWarnings));

    // ---- P2-2：busy 窗内置脏 + 收尾补跑 + 真变更可续轮 + 不活锁（5 ck）----
    const e4 = buildEngine({ sources: [GOOD, BAD], mainRepo: GOOD.repo, ghMain: () => LISTING, ghOther: () => null, ghDelayMs: 300 });
    e4.syncRemoteSkills(); // 第 1 轮（主源 300ms 慢 = busy 窗）
    await sleep(50); // 进窗
    const inWin = e4.flags();
    e4.syncRemoteSkills(); // busy 期间来的请求：置脏即返回
    ck('P2-2 busy 窗内标志位正确（busy=true）', inWin.skillSyncBusy === true, JSON.stringify(inWin));
    ck('P2-2 busy 期二次调用立即返回不并发（轮数仍 1、dirty 置位）', e4.rounds() === 1 && e4.flags().skillSyncDirty === true, 'rounds=' + e4.rounds() + ' flags=' + JSON.stringify(e4.flags()));
    const got2 = await waitFor(() => e4.rounds() >= 2, 1500);
    ck('P2-2 收尾补跑一轮（dirty 清零后第 2 轮真跑）', got2 && e4.rounds() === 2, 'rounds=' + e4.rounds());
    await sleep(500); // 静止观察
    ck('P2-2 无新请求则第 2 轮后不活锁（轮数不涨、标志归零）', e4.rounds() === 2 && e4.flags().skillSyncBusy === false && e4.flags().skillSyncDirty === false, 'rounds=' + e4.rounds() + ' flags=' + JSON.stringify(e4.flags()));
    const e5 = buildEngine({ sources: [GOOD, BAD], mainRepo: GOOD.repo, ghMain: () => LISTING, ghOther: () => null, ghDelayMs: 300 });
    e5.syncRemoteSkills(); // 轮 1
    await sleep(50);
    e5.syncRemoteSkills(); // 轮 1 busy 期 → 脏
    await waitFor(() => e5.rounds() >= 2, 1500); // 轮 2（补跑）开跑
    await sleep(30); // 进轮 2 busy 窗
    e5.syncRemoteSkills(); // 轮 2 busy 期又有真请求 → 再置脏
    const got3 = await waitFor(() => e5.rounds() >= 3, 1500);
    ck('P2-2 补跑轮 busy 期真请求不丢（触发第 3 轮）', got3 && e5.rounds() === 3, 'rounds=' + e5.rounds());

    // ---- P3-6 / P3-5 源码钉子 ----
    ck('P3-6 解释非 SSE 分支识别 j.error 回「解释失败:」人话（源码钉子）', /if \(j && j\.error\)/.test(bridge) && /解释失败: '/.test(bridge));
    ck('P3-5 update-runner finally 清 data/updates/unpack 残留树（源码钉子）', /finally \{[\s\S]*unpack[\s\S]*?rmSync/.test(runner) && !/stage = 'done'[\s\S]{0,120}rmSync\(unpack/.test(runner));

    console.log('qa3-round3-probe: PASS=' + pass + ' FAIL=' + fail);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR:', e); process.exit(1); });
