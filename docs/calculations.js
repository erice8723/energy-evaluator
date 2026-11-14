/**
 * calculations.js
 * 儲能系統核心財務計算純函式
 * 所有結果均由公式即時計算，不得硬寫。
 */

'use strict';

// ══════════════════════════════════════════════════════════
//  1. 設備規格計算
// ══════════════════════════════════════════════════════════

/**
 * 計算 PCS 總功率
 * @param {number} pcs50qty   - 50 kW PCS 數量
 * @param {number} pcs100qty  - 100 kW PCS 數量
 * @returns {number} PCS 總功率（kW）
 */
function calcPcsPower(pcs50qty, pcs100qty) {
  return 50 * pcs50qty + 100 * pcs100qty;
}

/**
 * 計算電池總容量
 * @param {number} bat128qty  - 128 kWh 電池數量
 * @param {number} bat256qty  - 256 kWh 電池數量
 * @returns {number} 電池總容量（kWh）
 */
function calcBatteryCapacity(bat128qty, bat256qty) {
  return 128 * bat128qty + 256 * bat256qty;
}

// ══════════════════════════════════════════════════════════
//  2. 每日可用電量與充電購電量
// ══════════════════════════════════════════════════════════

/**
 * 第 n 年容量保留率（第 1 年不衰減，第 n 年為 (1-rate)^(n-1)）
 * @param {number} year          - 第幾年（1 起算）
 * @param {number} degradeRate   - 年衰減率（0–1，例如 0.02 代表 2%）
 * @returns {number} 容量保留率（0–1）
 */
function capacityRetentionRate(year, degradeRate) {
  if (year <= 1) return 1;
  return Math.pow(1 - degradeRate, year - 1);
}

/**
 * 計算第 n 年每日放電量
 * 每日放電量 = min(PCS功率 × 放電時數, 電池容量 × DOD × 容量保留率)
 * 注意：放電量為 AC 端可供電量（已含效率，見充電端公式）
 * @param {number} pcsPower      - PCS 總功率（kW）
 * @param {number} dischargeHours - 放電時數（h）
 * @param {number} batteryCapacity - 電池總容量（kWh）
 * @param {number} dod           - 放電深度（0–1）
 * @param {number} retention     - 容量保留率（0–1）
 * @returns {number} 每日放電量（kWh）
 */
function calcDailyDischarge(pcsPower, dischargeHours, batteryCapacity, dod, retention) {
  const pcsLimit = pcsPower * dischargeHours;
  const batLimit = batteryCapacity * dod * retention;
  return Math.min(pcsLimit, batLimit);
}

/**
 * 計算每日充電購電量
 * 每日充電購電量 = 每日放電量 / 往返效率（RTE）
 * 效率僅套用一次（統一於充電端），不重複扣除。
 * @param {number} dailyDischarge - 每日放電量（kWh）
 * @param {number} rte            - 往返效率（0–1）
 * @returns {number} 每日充電購電量（kWh）
 */
function calcDailyCharge(dailyDischarge, rte) {
  if (rte <= 0) return Infinity;
  return dailyDischarge / rte;
}

// ══════════════════════════════════════════════════════════
//  3. 年度流動節費
// ══════════════════════════════════════════════════════════

/**
 * 計算第 n 年年度流動節費
 * = (每日放電量 × 尖峰電價 - 每日充電購電量 × 離峰電價) × 年度運轉天數
 * 負值不強制歸零。
 *
 * @param {number} dailyDischarge  - 每日放電量（kWh）
 * @param {number} dailyCharge     - 每日充電購電量（kWh）
 * @param {number} peakRate        - 尖峰電價（NT$/kWh）
 * @param {number} offPeakRate     - 離峰電價（NT$/kWh）
 * @param {number} operatingDays   - 年度運轉天數
 * @returns {number} 年度流動節費（NT$）
 */
function calcAnnualFlowSaving(dailyDischarge, dailyCharge, peakRate, offPeakRate, operatingDays) {
  const dailyNet = dailyDischarge * peakRate - dailyCharge * offPeakRate;
  return dailyNet * operatingDays;
}

// ══════════════════════════════════════════════════════════
//  4. 15 年現金流計算
// ══════════════════════════════════════════════════════════

/**
 * 建立第 0–15 年完整現金流陣列（投資方視角）
 *
 * @param {Object} params
 * @param {number} params.pcsPower          - PCS 總功率（kW）
 * @param {number} params.batteryCapacity   - 電池總容量（kWh）
 * @param {number} params.dod               - 放電深度（0–1）
 * @param {number} params.rte               - 往返效率（0–1）
 * @param {number} params.degradeRate       - 年衰減率（0–1）
 * @param {number} params.dischargeHours    - 放電時數（h）
 * @param {number} params.operatingDays     - 年度運轉天數
 * @param {number} params.peakRate          - 尖峰電價（NT$/kWh）
 * @param {number} params.offPeakRate       - 離峰電價（NT$/kWh）
 * @param {number} params.investorRatio     - 投資方分潤比例（0–1）
 * @param {number} params.annualOM          - 年度維運費（NT$）
 * @param {number} params.annualInsurance   - 年度保險費（NT$）
 * @param {number} params.initialCost       - 初始建置成本（NT$）
 * @param {number} params.annualBasicSaving - 年度基本電費節省估算（NT$，全數歸業主）
 * @param {number} params.ownerRatio        - 業主分潤比例（0–1）
 * @param {number} params.originalAnnualBill - 原年度總電費（NT$）
 * @param {number} [params.years]           - 計算年限（預設 15）
 * @returns {Array<Object>} 逐年現金流明細陣列
 */
function buildCashFlows(params) {
  const {
    pcsPower, batteryCapacity, dod, rte, degradeRate,
    dischargeHours, operatingDays,
    peakRate, offPeakRate,
    investorRatio, annualOM, annualInsurance, initialCost,
    annualBasicSaving, ownerRatio, originalAnnualBill,
    years = 15,
  } = params;

  const rows = [];

  // 第 0 年：初始投資
  rows.push({
    year: 0,
    retention: 1,
    dailyDischarge_kWh: 0,
    dailyCharge_kWh: 0,
    annualFlowSaving: 0,
    investorShare: 0,
    annualOM: 0,
    annualInsurance: 0,
    investorNetCF: -Math.abs(initialCost),
    cumulativeCF: -Math.abs(initialCost),
    ownerSaving: 0,
  });

  let cumulative = -Math.abs(initialCost);

  for (let y = 1; y <= years; y++) {
    const retention = capacityRetentionRate(y, degradeRate);
    const dailyDischarge = calcDailyDischarge(pcsPower, dischargeHours, batteryCapacity, dod, retention);
    const dailyCharge = calcDailyCharge(dailyDischarge, rte);
    const annualFlowSaving = calcAnnualFlowSaving(dailyDischarge, dailyCharge, peakRate, offPeakRate, operatingDays);
    const investorShare = annualFlowSaving * investorRatio;
    const investorNetCF = investorShare - annualOM - annualInsurance;
    cumulative += investorNetCF;

    // 業主：流動節費分潤 + 基本電費節省
    const ownerFlowShare = annualFlowSaving * ownerRatio;
    const ownerSaving = ownerFlowShare + annualBasicSaving;

    rows.push({
      year: y,
      retention,
      dailyDischarge_kWh: dailyDischarge,
      dailyCharge_kWh: dailyCharge,
      annualFlowSaving,
      investorShare,
      annualOM,
      annualInsurance,
      investorNetCF,
      cumulativeCF: cumulative,
      ownerSaving,
    });
  }

  return rows;
}

// ══════════════════════════════════════════════════════════
//  5. IRR 計算（二分法）
// ══════════════════════════════════════════════════════════

/**
 * 計算 NPV
 * @param {number[]} cashFlows  - 現金流陣列（索引 0 為第 0 年）
 * @param {number}   rate       - 折現率
 * @returns {number}
 */
function npv(cashFlows, rate) {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/**
 * 以二分法求 IRR（內部報酬率）
 * @param {number[]} cashFlows  - 完整現金流陣列（含第 0 年負值）
 * @param {number}   [maxIter]  - 最大迭代次數（預設 1000）
 * @param {number}   [tol]      - 收斂容差（預設 1e-6）
 * @returns {{ irr: number|null, converged: boolean, message: string }}
 */
function calcIRR(cashFlows, maxIter = 1000, tol = 1e-6) {
  // 檢查是否有符號變化（必要條件）
  const hasNeg = cashFlows.some(cf => cf < 0);
  const hasPos = cashFlows.some(cf => cf > 0);

  if (!hasNeg || !hasPos) {
    return {
      irr: null,
      converged: false,
      message: '現金流全為正值或全為負值，無法計算 IRR。請確認輸入參數（初始投資成本或年度收益）是否正確。',
    };
  }

  // 搜尋有效區間 [lo, hi]
  let lo = -0.9999;
  let hi = 100.0;

  // 確認 lo, hi 兩端 NPV 符號相反
  const npvLo = npv(cashFlows, lo);
  const npvHi = npv(cashFlows, hi);

  if (npvLo * npvHi > 0) {
    // 嘗試擴大搜尋範圍
    hi = 500;
    if (npv(cashFlows, lo) * npv(cashFlows, hi) > 0) {
      return {
        irr: null,
        converged: false,
        message: 'IRR 超出可計算範圍（-99.99%～50000%），請確認現金流結構是否合理。',
      };
    }
  }

  // 二分法迭代
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(cashFlows, mid);

    if (Math.abs(npvMid) < tol || (hi - lo) / 2 < tol) {
      return { irr: mid, converged: true, message: '' };
    }

    if (npv(cashFlows, lo) * npvMid < 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return {
    irr: (lo + hi) / 2,
    converged: false,
    message: `IRR 在 ${maxIter} 次迭代後未完全收斂（|Δr| ≥ 1e-6），結果僅供參考。建議確認輸入參數是否合理。`,
  };
}

// ══════════════════════════════════════════════════════════
//  6. 投資回收年限（線性內插）
// ══════════════════════════════════════════════════════════

/**
 * 計算投資回收年限
 * 累計現金流首次由負轉為非負時，以線性內插計算精確年份。
 * @param {Object[]} cashFlowRows  - buildCashFlows() 回傳的陣列
 * @returns {{ payback: number|null, converged: boolean, message: string }}
 */
function calcPayback(cashFlowRows) {
  for (let i = 1; i < cashFlowRows.length; i++) {
    const prev = cashFlowRows[i - 1];
    const curr = cashFlowRows[i];

    if (prev.cumulativeCF < 0 && curr.cumulativeCF >= 0) {
      // 線性內插
      const frac = -prev.cumulativeCF / (curr.cumulativeCF - prev.cumulativeCF);
      const payback = prev.year + frac;
      return { payback, converged: true, message: '' };
    }
    // 若第 0 年已為正（不合理但防呆）
    if (i === 1 && curr.cumulativeCF >= 0 && cashFlowRows[0].cumulativeCF >= 0) {
      return { payback: 0, converged: true, message: '' };
    }
  }

  return {
    payback: null,
    converged: false,
    message: `在 ${cashFlowRows.length - 1} 年投資期限內，累計現金流未轉為正值，投資尚未回收。`,
  };
}

// ══════════════════════════════════════════════════════════
//  7. 業主節費摘要
// ══════════════════════════════════════════════════════════

/**
 * 計算業主首年節費及節費比例
 * @param {number} firstYearFlowSaving  - 首年流動節費（NT$）
 * @param {number} ownerRatio           - 業主分潤比例（0–1）
 * @param {number} annualBasicSaving    - 年度基本電費節省估算（NT$）
 * @param {number} originalAnnualBill   - 原年度總電費（NT$）
 * @returns {{ ownerAnnualSaving: number, ownerSavingRatio: number }}
 */
function calcOwnerSavings(firstYearFlowSaving, ownerRatio, annualBasicSaving, originalAnnualBill) {
  const ownerAnnualSaving = firstYearFlowSaving * ownerRatio + annualBasicSaving;
  const ownerSavingRatio = originalAnnualBill > 0
    ? (ownerAnnualSaving / originalAnnualBill) * 100
    : 0;
  return { ownerAnnualSaving, ownerSavingRatio };
}

// ══════════════════════════════════════════════════════════
//  8. 輸入驗證工具函式
// ══════════════════════════════════════════════════════════

/**
 * 驗證數值是否在指定範圍內
 * @param {*}      value  - 輸入值
 * @param {number} min    - 最小值（含）
 * @param {number} max    - 最大值（含）
 * @returns {boolean}
 */
function inRange(value, min, max) {
  const n = parseFloat(value);
  return !isNaN(n) && isFinite(n) && n >= min && n <= max;
}

/**
 * 驗證正整數
 * @param {*} value
 * @returns {boolean}
 */
function isPositiveInt(value) {
  const n = parseInt(value, 10);
  return !isNaN(n) && n >= 0 && String(n) === String(value).trim();
}
