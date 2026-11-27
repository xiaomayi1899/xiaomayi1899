/* 引擎断言测试：从构建产物 index.html 中提取引擎代码（保证测的就是发布的），node 直接运行。
   用法：node tests/test_engine.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function engineCode(startMark, endMark) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const s = html.indexOf(startMark);
  const e = html.indexOf(endMark);
  if (s < 0 || e < 0 || e <= s) throw new Error('marker missing: ' + startMark);
  return html.slice(s + startMark.length, e);
}

(0, eval)(engineCode('/*__ENGINE_COMMON_START__*/', '/*__ENGINE_COMMON_END__*/'));
(0, eval)(engineCode('/*__ENGINE_SSQ_START__*/', '/*__ENGINE_SSQ_END__*/'));
(0, eval)(engineCode('/*__ENGINE_DLT_START__*/', '/*__ENGINE_DLT_END__*/'));

const C = globalThis.LOTTO_COMMON;
const SQ = globalThis.SSQ_ENGINE;
const DL = globalThis.DLT_ENGINE;
const ssqData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ssq.json'), 'utf8'));
const dltData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dlt.json'), 'utf8'));
const ssqRows = ssqData.rows;
const dltRows = dltData.rows;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + msg); }
}
function deepJSON(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function uniqSortedAsc(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) return false;
  return true;
}
function validReds(arr) {
  return Array.isArray(arr) && arr.length === 6 && uniqSortedAsc(arr) && arr.every(n => n >= 1 && n <= 33 && Number.isInteger(n));
}
function validFronts(arr) {
  return Array.isArray(arr) && arr.length === 5 && uniqSortedAsc(arr) && arr.every(n => n >= 1 && n <= 35 && Number.isInteger(n));
}

/* ---------- 数据 ---------- */
ok(ssqRows.length >= 100, 'ssq 数据期数 ≥100, got ' + ssqRows.length);
ok(dltRows.length >= 100, 'dlt 数据期数 ≥100, got ' + dltRows.length);
ok(ssqRows.every(r => validReds(r.red) && r.blue >= 1 && r.blue <= 16), 'ssq 行格式有效');
ok(dltRows.every(r => validFronts(r.front) && r.back.length === 2 && uniqSortedAsc(r.back) && r.back.every(n => n >= 1 && n <= 12)), 'dlt 行格式有效');
ok(ssqRows.every((r, i) => i === 0 || parseInt(ssqRows[i - 1].issue, 10) > parseInt(r.issue, 10)), 'ssq 期号严格降序');
ok(dltRows.every((r, i) => i === 0 || parseInt(dltRows[i - 1].issue, 10) > parseInt(r.issue, 10)), 'dlt 期号严格降序');
ok(Date.parse(ssqRows[0].date + 'T00:00:00Z') > Date.now() - 30 * 86400000, 'ssq 数据新鲜(<30天): ' + ssqRows[0].issue + ' ' + ssqRows[0].date);
ok(Date.parse(dltRows[0].date + 'T00:00:00Z') > Date.now() - 30 * 86400000, 'dlt 数据新鲜(<30天): ' + dltRows[0].issue + ' ' + dltRows[0].date);

/* ---------- 公共工具 ---------- */
const m1 = C.mergeRows([{ issue: '5', x: 1 }, { issue: '3', x: 2 }], [{ issue: '4', x: 9 }, { issue: '3', x: 7 }]);
ok(m1.length === 3 && m1[0].issue === '5' && m1[1].issue === '4' && m1[2].issue === '3' && m1[2].x === 7, 'mergeRows 合并/覆盖/降序: ' + JSON.stringify(m1));
ok(C.nextIssue('2026134') === '2026135', 'nextIssue ssq');
ok(C.nextIssue('26134') === '26135', 'nextIssue dlt');

/* ---------- 统一评估层（量尺） ---------- */
const MT = C.METRICS;
ok(MT.comb(33, 6) === 1107568, 'C(33,6)=1,107,568, got ' + MT.comb(33, 6));
ok(MT.comb(35, 5) === 324632, 'C(35,5)=324,632, got ' + MT.comb(35, 5));
ok(MT.comb(12, 2) === 66, 'C(12,2)=66');
ok(MT.comb(27, 6) === 296010, 'C(27,6)=296,010');
/* 超几何矩：双色球红 6中6 期望/方差 */
ok(Math.abs(MT.hyperMean(33, 6, 6) - 36 / 33) < 1e-9, 'hyperMean ssq=1.0909');
ok(Math.abs(MT.hyperVar(33, 6, 6) - 6 * (6 / 33) * (27 / 33) * (27 / 32)) < 1e-9, 'hyperVar ssq≈0.7300, got ' + MT.hyperVar(33, 6, 6));
/* Brier/对数得分端点 */
ok(MT.brier([1, 0], [1, 0]) === 0 && MT.brier([0, 1], [0, 1]) === 0, 'brier 完美预测=0');
ok(Math.abs(MT.brier([0.5, 0.5], [1, 0]) - 0.25) < 1e-12, 'brier 0.5 ㈡0.25');
ok(Math.abs(MT.logScore([1, 0], [1, 0])) < 1e-6, 'logScore 完美≈0（钳位误差<1e-6）');
ok(MT.logScore([0.5, 0.5], [1, 0]) === Math.log(0.5), 'logScore 0.5=ln0.5');
ok(Math.abs(MT.twoSideP(1.96) - 0.05) < 0.003, 'twoSideP(1.96)≈0.05, got ' + MT.twoSideP(1.96).toFixed(4));
ok(Math.abs(MT.twoSideP(0) - 1) < 1e-6, 'twoSideP(0)≈1（erf 舍入误差<1e-6）');
const w1 = MT.wilsonCI(3, 10), w2 = MT.wilsonCI(0, 10), w3 = MT.wilsonCI(10, 10);
ok(w1[0] > 0 && w1[0] < 0.3 && w1[1] > 0.3 && w1[1] < 0.9, 'wilsonCI(3,10)=[' + w1[0].toFixed(3) + ',' + w1[1].toFixed(3) + ']');
ok(w2[0] === 0 && w2[1] < 0.35, 'wilsonCI(0,10) 下界0');
ok(w3[0] > 0.69 && w3[1] === 1, 'wilsonCI(10,10) 上界1');
/* 双色球奖级组合数恒等式：蓝球命中各奖级组合数之和 = C(33,6) */
const tierBlue = 1 + 162 + 5265 + 58500 + 263250 + 484380 + 296010;
ok(tierBlue === MT.comb(33, 6), 'SSQ 蓝球命中组合数恒等式 = C(33,6), got ' + tierBlue);
/* 大乐透新规奖级恒等式：后区双中的各奖级组合数之和恰 = C(35,5)（每注前区组合下后区双中恰 1 种） */
const dltB2 = 1 + 150 + 4350 + 40600 + 137025 + 142506;
ok(dltB2 === MT.comb(35, 5), 'DLT 后区双中组合数恒等式 = C(35,5), got ' + dltB2);
ok(1 + 20 + 195 + 3000 + 11100 + 127600 + 1287281 === 1429197, 'DLT 七奖级组合数合计');

/* ---------- 双色球引擎 ---------- */
const rec1 = SQ.recommend(ssqRows);
const rec2 = SQ.recommend(ssqRows);
ok(deepJSON(rec1, rec2), 'SSQ recommend 确定性（两次完全一致）');
ok(validReds(rec1.finalRed), 'SSQ finalRed 6个唯一升序1-33: ' + JSON.stringify(rec1.finalRed));
ok(rec1.finalBlue >= 1 && rec1.finalBlue <= 16, 'SSQ finalBlue 1-16: ' + rec1.finalBlue);
ok(rec1.per.length === 55, 'SSQ 55 式, got ' + rec1.per.length);
rec1.per.forEach(f => {
  ok(validReds(f.red), 'SSQ ' + f.id + ' red 有效: ' + JSON.stringify(f.red));
  ok(f.blue >= 1 && f.blue <= 16, 'SSQ ' + f.id + ' blue 有效');
  ok(Number.isInteger(f.pick) && f.pick >= 1 && f.pick <= 33, 'SSQ ' + f.id + ' pick 有效: ' + f.pick);
  ok(Number.isInteger(f.pickB) && f.pickB >= 1 && f.pickB <= 16, 'SSQ ' + f.id + ' pickB 有效: ' + f.pickB);
  ok(typeof f.why === 'string' && f.why.length > 10, 'SSQ ' + f.id + ' why 存在');
});
let voteSum = 0;
for (const k in rec1.votes) voteSum += rec1.votes[k];
ok(voteSum === 55, 'SSQ 主区总票数=55式×1票=55, got ' + voteSum);
let blueVoteSum = 0;
for (const k in rec1.blueVotes) blueVoteSum += rec1.blueVotes[k];
ok(blueVoteSum === 55, 'SSQ 蓝球总票数=55, got ' + blueVoteSum);
/* 一票制：finalRed ⊆ 各式 pick ∪ Borda 补位；votes 与 pick 计数一致 */
const pickSet = rec1.per.map(f => f.pick);
ok(rec1.finalRed.every(n => pickSet.indexOf(n) >= 0 || rec1.bordaRed.indexOf(n) >= 0), 'SSQ finalRed ⊆ 各式pick ∪ Borda补位');
ok(rec1.finalRed.every(n => !rec1.votes[n] || rec1.per.filter(f => f.pick === n).length === rec1.votes[n]), 'SSQ votes 与 pick 计数一致');
ok((rec1.blueVotes[rec1.finalBlue] || 0) >= 1, 'SSQ finalBlue 有票');
ok(rec1.maxRedVotes >= 1 && rec1.maxRedVotes <= 55, 'SSQ maxRedVotes 合理: ' + rec1.maxRedVotes);
/* 结构护栏抽检：和值不脱离 μ±4σ（一票制下 argmax 可能取边缘号） */
const sum = rec1.finalRed.reduce((a, b) => a + b, 0);
ok(Math.abs(sum - rec1.mu) <= 4 * rec1.sd, 'SSQ finalRed 和值在 μ±4σ 内: sum=' + sum + ' mu=' + rec1.mu);

/* ---------- 量化层（SSQ） ---------- */
let pSumR = 0, pSumB = 0, pAllPos = true;
rec1.per.forEach(f => {
  if (!f.pRed || !f.pBlue) { pAllPos = false; return; }
  for (let n = 1; n <= 33; n++) { const p = f.pRed[n]; if (!(p > 0 && p < 6)) pAllPos = false; pSumR += p || 0; }
  for (let b = 1; b <= 16; b++) { const p = f.pBlue[b]; if (!(p > 0 && p < 1)) pAllPos = false; pSumB += p || 0; }
});
ok(pAllPos, 'SSQ 概率向量全部在开区间内');
ok(Math.abs(pSumR / rec1.per.length - 6) < 2e-3, 'SSQ ΣpRed 校准=6, got ' + (pSumR / rec1.per.length).toFixed(4));
ok(Math.abs(pSumB / rec1.per.length - 1) < 2e-3, 'SSQ ΣpBlue 校准=1, got ' + (pSumB / rec1.per.length).toFixed(4));
ok(validReds(rec1.bordaRed) && rec1.bordaBlue >= 1 && rec1.bordaBlue <= 16, 'SSQ Borda 注有效: ' + JSON.stringify(rec1.bordaRed) + '+' + rec1.bordaBlue);
ok(Array.isArray(rec1.notes) && rec1.notes.length === 3, 'SSQ 多注=3');
rec1.notes.forEach((t, i) => ok(validReds(t), 'SSQ 多注 ' + i + ' 有效: ' + JSON.stringify(t)));
for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
  const ov = rec1.notes[a].filter(n => rec1.notes[b].indexOf(n) >= 0).length;
  ok(ov <= 2, 'SSQ 注间重叠≤2: ' + a + ',' + b + '=' + ov);
}
ok(deepJSON(rec1.notes[0], rec1.finalRed), 'SSQ 注1=票选推荐');
/* 加权 Borda：等权=无权；权重向量保序可用 */
const eqW = rec1.per.map(() => 1 / 11);
ok(deepJSON(SQ.bordaTop(rec1.per, 33, 6, 'pRed').sort((a, b) => a - b), rec1.bordaRed), 'SSQ bordaTop 复算一致');
const wb1 = SQ.bordaTop(rec1.per, 33, 6, 'pRed', eqW);
ok(validReds(wb1.slice().sort((a, b) => a - b)), 'SSQ 加权 Borda 有效: ' + JSON.stringify(wb1));
const wBias = rec1.per.map((_, i) => (i === 0 ? 0.9 : 0.1 / 10));
const wb2 = SQ.bordaTop(rec1.per, 33, 6, 'pRed', wBias);
ok(deepJSON(wb2, SQ.bordaTop(rec1.per, 33, 6, 'pRed', wBias)), 'SSQ 加权 Borda 确定性');
ok(SQ.tiltProbs(Object.fromEntries(Array.from({ length: 33 }, (_, i) => [i + 1, 1])), 33, 6), 'tiltProbs 可调用');
const flatP = SQ.tiltProbs((() => { const m = {}; for (let n = 1; n <= 33; n++) m[n] = 1; return m; })(), 33, 6);
let flatSum = 0; for (const k in flatP) flatSum += flatP[k];
ok(Math.abs(flatSum - 6) < 1e-3, 'tiltProbs 常量分数→均匀校准 Σ=6, got ' + flatSum.toFixed(4));

/* 复盘 */
const rp1 = SQ.replay(ssqRows, 15);
const rp2 = SQ.replay(ssqRows, 15);
ok(deepJSON(rp1, rp2), 'SSQ replay 确定性');
ok(rp1.length >= 10, 'SSQ replay ≥10 期, got ' + rp1.length);
rp1.forEach(e => {
  ok(e.redHits >= 0 && e.redHits <= 6, 'SSQ replay 命中数界内 ' + e.issue);
  ok(e.blueHit === 0 || e.blueHit === 1, 'SSQ replay 蓝球命中 0/1');
  ok(e.rec.per.length === 55, 'SSQ replay rec 含 55 式');
  ok(e.rec.per.every(pf => pf.pRed && pf.pBlue), 'SSQ replay rec 含概率向量 ' + e.issue);
  ok(e.formulaHits.every(fh => (fh.hits === 0 || fh.hits === 1) && (fh.blueHit === 0 || fh.blueHit === 1)), 'SSQ replay 单号命中 0/1 ' + e.issue);
});
/* 交叉验证：replay[0].rec 必须等于 recommend(去掉最新一期后的数据) */
const cross = SQ.recommend(ssqRows.slice(1));
ok(deepJSON(rp1[0].rec, cross), 'SSQ replay[0].rec ≡ recommend(开奖前数据)');
/* 命中数与实际开奖手工核对 */
const act = rp1[0].actual;
let manual = 0;
for (const n of act.red) if (cross.finalRed.indexOf(n) >= 0) manual++;
ok(manual === rp1[0].redHits, 'SSQ replay 命中手工核对: ' + manual + ' vs ' + rp1[0].redHits);

/* 短数据保护 */
let threw = false;
try { SQ.recommend(ssqRows.slice(0, 10)); } catch (e) { threw = true; }
ok(threw, 'SSQ 数据不足应抛错');

/* ---------- 大乐透引擎 ---------- */
const d1 = DL.recommend(dltRows);
const d2 = DL.recommend(dltRows);
ok(deepJSON(d1, d2), 'DLT recommend 确定性');
ok(validFronts(d1.finalFront), 'DLT finalFront 5个唯一升序1-35: ' + JSON.stringify(d1.finalFront));
ok(d1.finalBack.length === 2 && uniqSortedAsc(d1.finalBack) && d1.finalBack.every(n => n >= 1 && n <= 12), 'DLT finalBack 2个唯一升序1-12: ' + JSON.stringify(d1.finalBack));
ok(d1.per.length === 55, 'DLT 55 式, got ' + d1.per.length);
d1.per.forEach(f => {
  ok(validFronts(f.front), 'DLT ' + f.id + ' front 有效: ' + JSON.stringify(f.front));
  ok(f.back.length === 2 && uniqSortedAsc(f.back) && f.back.every(n => n >= 1 && n <= 12), 'DLT ' + f.id + ' back 有效');
  ok(Number.isInteger(f.pick) && f.pick >= 1 && f.pick <= 35, 'DLT ' + f.id + ' pick 有效: ' + f.pick);
  ok(Number.isInteger(f.pickB) && f.pickB >= 1 && f.pickB <= 12, 'DLT ' + f.id + ' pickB 有效: ' + f.pickB);
});
let dvSum = 0;
for (const k in d1.votes) dvSum += d1.votes[k];
ok(dvSum === 55, 'DLT 前区总票数=55式×1票=55, got ' + dvSum);
let dbSum = 0;
for (const k in d1.blueVotes) dbSum += d1.blueVotes[k];
ok(dbSum === 55, 'DLT 后区总票数=55, got ' + dbSum);
/* 一票制：finalFront/finalBack ⊆ 各式 pick ∪ Borda 补位 */
const dPickSet = d1.per.map(f => f.pick);
ok(d1.finalFront.every(n => dPickSet.indexOf(n) >= 0 || d1.bordaFront.indexOf(n) >= 0), 'DLT finalFront ⊆ 各式pick ∪ Borda补位');
const dPickBSet = d1.per.map(f => f.pickB);
ok(d1.finalBack.every(n => dPickBSet.indexOf(n) >= 0 || d1.bordaBack.indexOf(n) >= 0), 'DLT finalBack ⊆ 各式pickB ∪ Borda补位');
ok((d1.blueVotes[d1.finalBack[0]] || 0) >= 1 && (d1.blueVotes[d1.finalBack[1]] || 0) >= 1, 'DLT finalBack 有票');

/* ---------- 量化层（DLT） ---------- */
let dSumR = 0, dSumB = 0, dAllPos = true;
d1.per.forEach(f => {
  if (!f.pRed || !f.pBlue) { dAllPos = false; return; }
  for (let n = 1; n <= 35; n++) { const p = f.pRed[n]; if (!(p > 0 && p < 5)) dAllPos = false; dSumR += p || 0; }
  for (let b = 1; b <= 12; b++) { const p = f.pBlue[b]; if (!(p > 0 && p < 2)) dAllPos = false; dSumB += p || 0; }
});
ok(dAllPos, 'DLT 概率向量全部在开区间内');
ok(Math.abs(dSumR / d1.per.length - 5) < 2e-3, 'DLT ΣpRed 校准=5, got ' + (dSumR / d1.per.length).toFixed(4));
ok(Math.abs(dSumB / d1.per.length - 2) < 2e-3, 'DLT ΣpBlue 校准=2, got ' + (dSumB / d1.per.length).toFixed(4));
const dBoF = d1.bordaFront, dBoB = d1.bordaBack;
ok(validFronts(dBoF), 'DLT Borda 前区有效: ' + JSON.stringify(dBoF));
ok(dBoB.length === 2 && uniqSortedAsc(dBoB) && dBoB.every(n => n >= 1 && n <= 12), 'DLT Borda 后区有效');
ok(Array.isArray(d1.notes) && d1.notes.length === 3, 'DLT 多注=3');
d1.notes.forEach((t, i) => ok(validFronts(t), 'DLT 多注 ' + i + ' 有效: ' + JSON.stringify(t)));
for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
  const ov = d1.notes[a].filter(n => d1.notes[b].indexOf(n) >= 0).length;
  ok(ov <= 2, 'DLT 注间重叠≤2: ' + a + ',' + b + '=' + ov);
}
ok(deepJSON(d1.notes[0], d1.finalFront), 'DLT 注1=票选推荐');

const drp1 = DL.replay(dltRows, 15);
const drp2 = DL.replay(dltRows, 15);
ok(deepJSON(drp1, drp2), 'DLT replay 确定性');
ok(drp1.length >= 10, 'DLT replay ≥10 期, got ' + drp1.length);
drp1.forEach(e => {
  ok(e.frontHits >= 0 && e.frontHits <= 5, 'DLT replay 前区命中界内 ' + e.issue);
  ok(e.backHits >= 0 && e.backHits <= 2, 'DLT replay 后区命中界内 ' + e.issue);
  ok(e.rec.per.every(pf => pf.pRed && pf.pBlue), 'DLT replay rec 含概率向量 ' + e.issue);
  ok(e.formulaHits.every(fh => (fh.hits === 0 || fh.hits === 1) && (fh.backHits === 0 || fh.backHits === 1)), 'DLT replay 单号命中 0/1 ' + e.issue);
});
const dcross = DL.recommend(dltRows.slice(1));
ok(deepJSON(drp1[0].rec, dcross), 'DLT replay[0].rec ≡ recommend(开奖前数据)');
const dact = drp1[0].actual;
let dmanual = 0;
for (const n of dact.front) if (dcross.finalFront.indexOf(n) >= 0) dmanual++;
ok(dmanual === drp1[0].frontHits, 'DLT replay 命中手工核对');

/* 两引擎独立性：公式命名空间互不相同 */
const sqIds = SQ.FORMULAS.map(f => f.id), dIds = DL.FORMULAS.map(f => f.id);
ok(sqIds.length === 55 && dIds.length === 55, '两引擎各 55 式');
ok(new Set(sqIds).size === 55 && new Set(dIds).size === 55, '公式 id 无重复');
['s9', 's10', 's11', 's12', 's13', 's14', 's15'].forEach(id => ok(sqIds.indexOf(id) >= 0, 'SSQ 含 ' + id));
['d9', 'd10', 'd11', 'd12', 'd13', 'd14', 'd15'].forEach(id => ok(dIds.indexOf(id) >= 0, 'DLT 含 ' + id));
['s16', 's19', 's24', 's31', 's40', 's47', 's55'].forEach(id => ok(sqIds.indexOf(id) >= 0, 'SSQ 扩容含 ' + id));
['d16', 'd19', 'd24', 'd31', 'd40', 'd44', 'd55'].forEach(id => ok(dIds.indexOf(id) >= 0, 'DLT 扩容含 ' + id));

/* 新增式性能与确定性回归 */
const _t0 = Date.now();
const _rp1 = SQ.replay(ssqRows, 15);
const _rp2 = DL.replay(dltRows, 15);
const _ms = Date.now() - _t0;
ok(deepJSON(_rp1, SQ.replay(ssqRows, 15)), '新增式后 SSQ replay 仍确定性');
ok(deepJSON(_rp2, DL.replay(dltRows, 15)), '新增式后 DLT replay 仍确定性');
ok(_ms < 20000, '双彩种复盘耗时 <20s, got ' + _ms + 'ms');

/* 引擎版本与量化 API */
ok(SQ.version === '2026f1' && DL.version === '2026f1', '两引擎版本 2026f1, got ' + SQ.version + '/' + DL.version);
ok(typeof SQ.bordaTop === 'function' && typeof SQ.multiNotes === 'function', 'SSQ 量化 API 导出');
ok(typeof DL.bordaTop === 'function' && typeof DL.multiNotes === 'function', 'DLT 量化 API 导出');
/* 30 期窗口多注放宽保护：小数据下不崩 */
const smallNotes = SQ.multiNotes(Array.from({ length: 33 }, (_, i) => i + 1), 6, 2, 3);
ok(smallNotes.length === 3 && smallNotes.every(t => t.length === 6), 'multiNotes 全池 fallback 正常');

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
