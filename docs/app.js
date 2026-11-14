/**
 * app.js
 * 介面互動、表單驗證、結果更新
 */

'use strict';

// ══════════════════════════════════════════════════════════
//  預設參數
// ══════════════════════════════════════════════════════════
const DEFAULTS = {
  pcs50qty: 1,
  pcs100qty: 1,
  bat128qty: 1,
  bat256qty: 1,
  dod: 80,
  rte: 90,
  degradeRate: 2,
  dischargeHours: 4,
  operatingDays: 300,
  peakRate: DEFAULT_TARIFF.peakRate,
  offPeakRate: DEFAULT_TARIFF.offPeakRate,
  originalAnnualBill: 6000000,
  annualBasicSaving: 120000,
  initialCost: 8000000,
  annualOM: 80000,
  annualInsurance: 40000,
  investmentYears: 15,
  splitRatio: '80:20',
};

// ══════════════════════════════════════════════════════════
//  欄位驗證規則
// ══════════════════════════════════════════════════════════
const FIELD_RULES = {
  pcs50qty:          { min: 0, max: 99,       label: '50 kW PCS 數量',  unit: '台', integer: true },
  pcs100qty:         { min: 0, max: 99,       label: '100 kW PCS 數量', unit: '台', integer: true },
  bat128qty:         { min: 0, max: 99,       label: '128 kWh 電池數量', unit: '組', integer: true },
  bat256qty:         { min: 0, max: 99,       label: '256 kWh 電池數量', unit: '組', integer: true },
  dod:               { min: 50, max: 100,     label: 'DOD 放電深度',    unit: '%' },
  rte:               { min: 50, max: 100,     label: '往返效率（RTE）', unit: '%' },
  degradeRate:       { min: 0, max: 10,       label: '年度衰減率',      unit: '%' },
  dischargeHours:    { min: 0.5, max: 12,     label: '每日放電時數',    unit: 'h' },
  operatingDays:     { min: 1, max: 365,      label: '年度運轉天數',    unit: '天', integer: true },
  peakRate:          { min: 0.01, max: 99.99, label: '尖峰電價',        unit: 'NT$/kWh' },
  offPeakRate:       { min: 0.01, max: 99.99, label: '離峰電價',        unit: 'NT$/kWh' },
  originalAnnualBill:{ min: 1, max: 999999999,label: '原年度總電費',    unit: 'NT$' },
  annualBasicSaving: { min: 0, max: 999999999,label: '年度基本電費節省估算', unit: 'NT$' },
  initialCost:       { min: 1, max: 999999999,label: '初始建置成本',    unit: 'NT$' },
  annualOM:          { min: 0, max: 999999999,label: '年度維運費',      unit: 'NT$' },
  annualInsurance:   { min: 0, max: 999999999,label: '年度保險費',      unit: 'NT$' },
  investmentYears:   { min: 1, max: 50,       label: '投資年限',        unit: '年', integer: true },
};

// ══════════════════════════════════════════════════════════
//  狀態物件
// ══════════════════════════════════════════════════════════
let state = { ...DEFAULTS };
let recalcTimer = null;

// ══════════════════════════════════════════════════════════
//  工具：格式化數字
// ══════════════════════════════════════════════════════════
function fmt(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtNT(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return 'NT$ ' + fmt(n);
}

function fmtPct(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return fmt(n, decimals) + '%';
}

// ══════════════════════════════════════════════════════════
//  欄位驗證
// ══════════════════════════════════════════════════════════
function validateField(id, value) {
  const rule = FIELD_RULES[id];
  if (!rule) return { valid: true };

  const raw = String(value).trim();
  if (raw === '') return { valid: false, msg: `${rule.label} 不可為空白。` };

  const n = parseFloat(raw);
  if (isNaN(n) || !isFinite(n)) return { valid: false, msg: `${rule.label} 必須為數值。` };
  if (rule.integer && !Number.isInteger(n)) return { valid: false, msg: `${rule.label} 必須為整數。` };
  if (n < rule.min || n > rule.max) {
    return { valid: false, msg: `${rule.label} 必須介於 ${rule.min} 至 ${rule.max} ${rule.unit}。` };
  }
  return { valid: true };
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  const errEl = document.getElementById(`err-${id}`);
  if (el) el.classList.add('input-error');
  if (errEl) errEl.textContent = msg;
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  const errEl = document.getElementById(`err-${id}`);
  if (el) el.classList.remove('input-error');
  if (errEl) errEl.textContent = '';
}

function validateAll() {
  let allValid = true;
  for (const id of Object.keys(FIELD_RULES)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const result = validateField(id, el.value);
    if (!result.valid) {
      showFieldError(id, result.msg);
      allValid = false;
    } else {
      clearFieldError(id);
    }
  }
  return allValid;
}

// ══════════════════════════════════════════════════════════
//  讀取表單 → 更新 state
// ══════════════════════════════════════════════════════════
function readForm() {
  for (const id of Object.keys(FIELD_RULES)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const rule = FIELD_RULES[id];
    const n = rule.integer ? parseInt(el.value, 10) : parseFloat(el.value);
    if (!isNaN(n)) state[id] = n;
  }
  const ratioEl = document.getElementById('splitRatio');
  if (ratioEl) state.splitRatio = ratioEl.value;
}

// ══════════════════════════════════════════════════════════
//  核心計算與 UI 更新
// ══════════════════════════════════════════════════════════
function recalculate() {
  if (!validateAll()) return;
  readForm();

  // 分潤比例解析
  const [invPct, ownPct] = state.splitRatio === '70:30' ? [70, 30] : [80, 20];
  const investorRatio = invPct / 100;
  const ownerRatio = ownPct / 100;

  // 設備規格
  const pcsPower = calcPcsPower(state.pcs50qty, state.pcs100qty);
  const batteryCapacity = calcBatteryCapacity(state.bat128qty, state.bat256qty);

  if (pcsPower === 0) {
    showGlobalMsg('PCS 總功率為 0 kW，請至少設定一台 PCS 設備。');
    return;
  }
  if (batteryCapacity === 0) {
    showGlobalMsg('電池總容量為 0 kWh，請至少設定一組電池。');
    return;
  }
  clearGlobalMsg();

  // 轉換百分比為小數
  const dod = state.dod / 100;
  const rte = state.rte / 100;
  const degradeRate = state.degradeRate / 100;

  // 建立現金流（同時計算兩種分潤）
  const cfParams = {
    pcsPower, batteryCapacity, dod, rte, degradeRate,
    dischargeHours: state.dischargeHours,
    operatingDays: state.operatingDays,
    peakRate: state.peakRate,
    offPeakRate: state.offPeakRate,
    investorRatio,
    annualOM: state.annualOM,
    annualInsurance: state.annualInsurance,
    initialCost: state.initialCost,
    annualBasicSaving: state.annualBasicSaving,
    ownerRatio,
    originalAnnualBill: state.originalAnnualBill,
    years: state.investmentYears,
  };

  const cfRows = buildCashFlows(cfParams);

  // 另算另一種分潤供比較
  const altRatio = state.splitRatio === '80:20' ? '70:30' : '80:20';
  const [altInvPct, altOwnPct] = altRatio === '70:30' ? [70, 30] : [80, 20];
  const cfRowsAlt = buildCashFlows({
    ...cfParams,
    investorRatio: altInvPct / 100,
    ownerRatio: altOwnPct / 100,
  });

  // 提取投資方現金流陣列（for IRR）
  const cfArray = cfRows.map(r => r.investorNetCF);
  const cfArrayAlt = cfRowsAlt.map(r => r.investorNetCF);

  // IRR
  const irrResult = calcIRR(cfArray);
  const irrResultAlt = calcIRR(cfArrayAlt);

  // 回收年限
  const paybackResult = calcPayback(cfRows);
  const paybackResultAlt = calcPayback(cfRowsAlt);

  // 首年流動節費
  const firstYearRow = cfRows[1] || {};
  const firstYearFlowSaving = firstYearRow.annualFlowSaving || 0;

  // 業主節費
  const ownerResult = calcOwnerSavings(
    firstYearFlowSaving, ownerRatio,
    state.annualBasicSaving, state.originalAnnualBill
  );

  // ── 更新 UI ───────────────────────────────────────────
  updateKpiCards({
    pcsPower, batteryCapacity,
    firstYearFlowSaving,
    irrResult, paybackResult,
    ownerResult,
    investorRatio, ownerRatio,
    invPct, ownPct,
  });

  updateSplitComparison({
    cfRows, cfRowsAlt,
    irrResult, irrResultAlt,
    paybackResult, paybackResultAlt,
    invPct, ownPct, altInvPct, altOwnPct,
    ownerRatio, altOwnPct: altOwnPct / 100,
    annualBasicSaving: state.annualBasicSaving,
  });

  updateCashFlowTable(cfRows, invPct, ownPct);
  renderCashFlowChart(cfRows);
}

// ══════════════════════════════════════════════════════════
//  KPI 卡片更新
// ══════════════════════════════════════════════════════════
function updateKpiCards(d) {
  setText('kpi-pcs', `${fmt(d.pcsPower)} kW`);
  setText('kpi-battery', `${fmt(d.batteryCapacity)} kWh`);
  setText('kpi-flow-saving', fmtNT(d.firstYearFlowSaving));
  setText('kpi-basic-saving', fmtNT(state.annualBasicSaving));

  // IRR
  if (d.irrResult.converged) {
    setText('kpi-irr', fmtPct(d.irrResult.irr * 100));
    setText('kpi-irr-note', '');
  } else {
    setText('kpi-irr', '無法計算');
    setText('kpi-irr-note', d.irrResult.message);
  }

  // 回收年限
  if (d.paybackResult.converged) {
    setText('kpi-payback', `${fmt(d.paybackResult.payback, 2)} 年`);
    setText('kpi-payback-note', '');
  } else {
    setText('kpi-payback', `${state.investmentYears} 年內未回收`);
    setText('kpi-payback-note', d.paybackResult.message);
  }

  // 業主節費
  setText('kpi-owner-saving', fmtNT(d.ownerResult.ownerAnnualSaving));
  setText('kpi-owner-ratio', fmtPct(d.ownerResult.ownerSavingRatio));

  // 分潤比例顯示
  setText('kpi-split-label', `當前分潤比例：投資方 ${d.invPct}% ／ 業主 ${d.ownPct}%`);
}

// ══════════════════════════════════════════════════════════
//  分潤比較表更新
// ══════════════════════════════════════════════════════════
function updateSplitComparison(d) {
  const tbody = document.getElementById('split-compare-body');
  if (!tbody) return;

  const rows = [
    ['分潤比例（投資方：業主）',
      `${d.invPct}:${d.ownPct}`, `${d.altInvPct}:${d.altOwnPct}`],
    ['投資方 IRR',
      d.irrResult.converged ? fmtPct(d.irrResult.irr * 100) : '無法計算',
      d.irrResultAlt.converged ? fmtPct(d.irrResultAlt.irr * 100) : '無法計算'],
    ['投資回收年限',
      d.paybackResult.converged ? `${fmt(d.paybackResult.payback, 2)} 年` : '未回收',
      d.paybackResultAlt.converged ? `${fmt(d.paybackResultAlt.payback, 2)} 年` : '未回收'],
    ['業主首年節費（流動）',
      fmtNT((d.cfRows[1]?.annualFlowSaving || 0) * (d.ownPct / 100) + state.annualBasicSaving),
      fmtNT((d.cfRowsAlt[1]?.annualFlowSaving || 0) * (d.altOwnPct / 100) + state.annualBasicSaving)],
  ];

  tbody.innerHTML = rows.map(([label, v1, v2]) =>
    `<tr><td>${label}</td><td>${v1}</td><td>${v2}</td></tr>`
  ).join('');
}

// ══════════════════════════════════════════════════════════
//  逐年現金流表格
// ══════════════════════════════════════════════════════════
function updateCashFlowTable(cfRows, invPct, ownPct) {
  const tbody = document.getElementById('cashflow-tbody');
  if (!tbody) return;

  tbody.innerHTML = cfRows.map(row => {
    const retPct = row.year === 0 ? '—' : fmtPct(row.retention * 100);
    return `<tr class="${row.investorNetCF < 0 ? 'cf-negative' : 'cf-positive'}">
      <td>${row.year}</td>
      <td>${retPct}</td>
      <td>${row.year === 0 ? '—' : fmt(row.dailyDischarge_kWh, 1)}</td>
      <td>${row.year === 0 ? '—' : fmtNT(row.annualFlowSaving)}</td>
      <td>${fmtNT(row.investorShare || (row.year === 0 ? -Math.abs(state.initialCost) : 0))}</td>
      <td>${row.year === 0 ? '—' : fmtNT(-(row.annualOM + row.annualInsurance))}</td>
      <td class="${row.investorNetCF < 0 ? 'text-neg' : 'text-pos'}">${fmtNT(row.investorNetCF)}</td>
      <td class="${row.cumulativeCF < 0 ? 'text-neg' : 'text-pos'}">${fmtNT(row.cumulativeCF)}</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  SVG 累計現金流圖表
// ══════════════════════════════════════════════════════════
function renderCashFlowChart(cfRows) {
  const container = document.getElementById('cashflow-chart');
  if (!container) return;

  const W = container.clientWidth || 700;
  const H = 260;
  const PAD = { top: 20, right: 20, bottom: 40, left: 80 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const cfs = cfRows.map(r => r.cumulativeCF);
  const years = cfRows.map(r => r.year);
  const maxY = Math.max(...cfs, 0);
  const minY = Math.min(...cfs, 0);
  const rangeY = maxY - minY || 1;

  function xPos(year) {
    return PAD.left + (year / (cfRows.length - 1)) * plotW;
  }
  function yPos(val) {
    return PAD.top + (1 - (val - minY) / rangeY) * plotH;
  }

  // 折線點
  const points = cfRows.map(r => `${xPos(r.year).toFixed(1)},${yPos(r.cumulativeCF).toFixed(1)}`).join(' ');

  // 零軸
  const zeroY = yPos(0).toFixed(1);

  // Y 軸刻度
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const val = minY + (rangeY * i) / tickCount;
    return { val, y: yPos(val) };
  });

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="累計現金流走勢圖">
  <defs>
    <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#00d4ff" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <!-- 背景格線 -->
  ${yTicks.map(t => `<line x1="${PAD.left}" y1="${t.y.toFixed(1)}" x2="${W - PAD.right}" y2="${t.y.toFixed(1)}" stroke="#2a3a4a" stroke-width="1"/>`).join('\n  ')}
  <!-- 零軸 -->
  <line x1="${PAD.left}" y1="${zeroY}" x2="${W - PAD.right}" y2="${zeroY}" stroke="#ff6b6b" stroke-width="1.5" stroke-dasharray="6,3"/>
  <!-- Y 軸標籤 -->
  ${yTicks.map(t => `<text x="${PAD.left - 8}" y="${(t.y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#8899aa">${(t.val / 10000).toFixed(0)}萬</text>`).join('\n  ')}
  <!-- X 軸標籤 -->
  ${cfRows.filter(r => r.year % 3 === 0 || r.year === cfRows.length - 1).map(r =>
    `<text x="${xPos(r.year).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#8899aa">第${r.year}年</text>`
  ).join('\n  ')}
  <!-- 填充區域 -->
  <polygon points="${PAD.left},${yPos(0).toFixed(1)} ${points} ${(W - PAD.right).toFixed(1)},${yPos(0).toFixed(1)}" fill="url(#cfGrad)"/>
  <!-- 折線 -->
  <polyline points="${points}" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- 資料點 -->
  ${cfRows.map(r => `<circle cx="${xPos(r.year).toFixed(1)}" cy="${yPos(r.cumulativeCF).toFixed(1)}" r="4" fill="${r.cumulativeCF >= 0 ? '#4ade80' : '#ff6b6b'}" stroke="#0a1628" stroke-width="1.5">
    <title>第${r.year}年：${fmtNT(r.cumulativeCF)}</title>
  </circle>`).join('\n  ')}
  <!-- Y 軸線 -->
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#3a4a5a" stroke-width="1.5"/>
  <!-- 軸標籤 -->
  <text x="10" y="${(H / 2).toFixed(0)}" text-anchor="middle" font-size="11" fill="#8899aa" transform="rotate(-90,10,${(H / 2).toFixed(0)})">累計現金流（萬元）</text>
</svg>`;

  container.innerHTML = svg;
}

// ══════════════════════════════════════════════════════════
//  模擬 AMI 摘要顯示
// ══════════════════════════════════════════════════════════
function renderAmiSummary() {
  const el = document.getElementById('ami-summary');
  if (!el) return;
  const s = SAMPLE_AMI_SUMMARY;
  el.innerHTML = `
    <div class="ami-badge">⚠ ${s.note}</div>
    <div class="ami-grid">
      <div class="ami-item"><span class="ami-label">資料期間</span><span class="ami-value">${s.period}</span></div>
      <div class="ami-item"><span class="ami-label">資料間隔</span><span class="ami-value">${s.interval}（共 ${s.totalRecords.toLocaleString()} 筆）</span></div>
      <div class="ami-item"><span class="ami-label">尖峰需量</span><span class="ami-value highlight">${fmt(s.peakDemand_kW)} kW</span></div>
      <div class="ami-item"><span class="ami-label">離峰需量</span><span class="ami-value">${fmt(s.offPeakDemand_kW)} kW</span></div>
      <div class="ami-item"><span class="ami-label">尖/離峰比</span><span class="ami-value">${s.peakOffPeakRatio}</span></div>
      <div class="ami-item"><span class="ami-label">日均用電量</span><span class="ami-value">${fmt(s.dailyAvgConsumption_kWh)} kWh</span></div>
      <div class="ami-item"><span class="ami-label">全期總用電量</span><span class="ami-value">${fmt(s.totalConsumption_kWh)} kWh</span></div>
      <div class="ami-item"><span class="ami-label">尖峰時段</span><span class="ami-value">${s.peakHours}</span></div>
    </div>`;

  renderLoadProfileChart();
}

function renderLoadProfileChart() {
  const el = document.getElementById('ami-chart');
  if (!el || !SAMPLE_AMI_SUMMARY.loadProfile_kW) return;

  const data = SAMPLE_AMI_SUMMARY.loadProfile_kW;
  const labels = SAMPLE_AMI_SUMMARY.loadProfile_labels;
  const W = el.clientWidth || 680;
  const H = 160;
  const PAD = { top: 10, right: 10, bottom: 28, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const maxV = Math.max(...data);
  const pts = data.map((v, i) =>
    `${(PAD.left + (i / (data.length - 1)) * plotW).toFixed(1)},${(PAD.top + (1 - v / maxV) * plotH).toFixed(1)}`
  ).join(' ');

  // X 軸每 4 小時一個標籤
  const xLabels = [0, 16, 32, 48, 64, 80, 95].map(i => ({
    x: PAD.left + (i / (data.length - 1)) * plotW,
    label: labels[i],
  }));

  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="典型日負載曲線">
  <polyline points="${PAD.left},${(PAD.top + plotH).toFixed(1)} ${pts} ${(PAD.left + plotW).toFixed(1)},${(PAD.top + plotH).toFixed(1)}" fill="rgba(0,212,255,0.15)"/>
  <polyline points="${pts}" fill="none" stroke="#00d4ff" stroke-width="1.5"/>
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${(PAD.top + plotH).toFixed(1)}" stroke="#3a4a5a" stroke-width="1"/>
  <line x1="${PAD.left}" y1="${(PAD.top + plotH).toFixed(1)}" x2="${(PAD.left + plotW).toFixed(1)}" y2="${(PAD.top + plotH).toFixed(1)}" stroke="#3a4a5a" stroke-width="1"/>
  ${xLabels.map(l => `<text x="${l.x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8899aa">${l.label}</text>`).join('\n  ')}
  <text x="${PAD.left - 6}" y="${(PAD.top + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#8899aa">${fmt(maxV)}</text>
  <text x="8" y="${(H / 2).toFixed(0)}" font-size="10" fill="#8899aa" transform="rotate(-90,8,${(H / 2).toFixed(0)})">需量 kW</text>
</svg>`;
}

// ══════════════════════════════════════════════════════════
//  全域提示訊息
// ══════════════════════════════════════════════════════════
function showGlobalMsg(msg) {
  const el = document.getElementById('global-msg');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearGlobalMsg() {
  const el = document.getElementById('global-msg');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ══════════════════════════════════════════════════════════
//  重設預設值
// ══════════════════════════════════════════════════════════
function resetDefaults() {
  state = { ...DEFAULTS };
  for (const [id, rule] of Object.entries(FIELD_RULES)) {
    const el = document.getElementById(id);
    if (el) el.value = DEFAULTS[id];
    clearFieldError(id);
  }
  const ratioEl = document.getElementById('splitRatio');
  if (ratioEl) ratioEl.value = DEFAULTS.splitRatio;
  recalculate();
}

// ══════════════════════════════════════════════════════════
//  事件綁定（防抖：300 ms）
// ══════════════════════════════════════════════════════════
function bindEvents() {
  const inputs = document.querySelectorAll('.param-input');
  inputs.forEach(el => {
    el.addEventListener('input', () => {
      const { id, value } = el;
      const result = validateField(id, value);
      if (!result.valid) {
        showFieldError(id, result.msg);
      } else {
        clearFieldError(id);
      }
      clearTimeout(recalcTimer);
      recalcTimer = setTimeout(recalculate, 300);
    });
    el.addEventListener('blur', recalculate);
  });

  const selects = document.querySelectorAll('.param-select');
  selects.forEach(el => {
    el.addEventListener('change', recalculate);
  });

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) resetBtn.addEventListener('click', resetDefaults);
}

// ══════════════════════════════════════════════════════════
//  初始化
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  renderAmiSummary();
  bindEvents();
  recalculate();
});
