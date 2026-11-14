/**
 * sample-data.js
 * 模擬 AMI 用電資料（示範用途，非真實客戶資料）
 * 資料特性：30 天、15 分鐘間隔、工業用電典型負載特性
 * 尖峰時段（09:00–22:00）需量約為離峰時段 2 倍
 */

'use strict';

// ── 模擬 AMI 資料摘要（供介面顯示用）──────────────────────────────────
const SAMPLE_AMI_SUMMARY = {
  label: '【模擬資料】台灣工業用電典型負載（示範用）',
  note: '以下為系統內建示範資料，非真實 AMI 資料，僅供功能展示與測試使用。',
  period: '2024/01/01 ~ 2024/01/30（30 天）',
  interval: '15 分鐘',
  totalRecords: 2880,
  peakDemand_kW: 320,        // 尖峰需量
  offPeakDemand_kW: 155,     // 離峰需量
  dailyAvgConsumption_kWh: 4200, // 日均用電量
  totalConsumption_kWh: 126000,  // 全期總用電量
  peakHours: '09:00–22:00',
  offPeakHours: '22:00–09:00',
  peakOffPeakRatio: 2.06,    // 尖峰/離峰需量比
};

// ── 模擬每日負載曲線（96 個 15 分鐘時槽的典型需量 kW）──────────────────
// 以工業廠房用電為基礎：早班 08:00 升載，22:00 降載，午間略降
(function buildSampleLoadProfile() {
  const slots = 96; // 24h × 4
  const profile = [];

  for (let i = 0; i < slots; i++) {
    const hour = i / 4; // 小時（0–23.75）
    let load;

    if (hour < 1) {
      // 00:00–01:00 深夜低谷
      load = 100 + Math.sin(i * 0.3) * 10;
    } else if (hour < 7) {
      // 01:00–07:00 夜間維持
      load = 95 + Math.sin(i * 0.2) * 8;
    } else if (hour < 9) {
      // 07:00–09:00 早班啟動升載
      load = 95 + (hour - 7) / 2 * 180 + Math.random() * 15;
    } else if (hour < 12) {
      // 09:00–12:00 上午尖峰
      load = 275 + Math.sin((hour - 9) * Math.PI / 3) * 45 + Math.random() * 20;
    } else if (hour < 13.5) {
      // 12:00–13:30 午休略降
      load = 240 + Math.sin((hour - 12) * Math.PI) * 30 + Math.random() * 15;
    } else if (hour < 17) {
      // 13:30–17:00 下午尖峰
      load = 290 + Math.sin((hour - 13.5) * Math.PI / 3.5) * 30 + Math.random() * 20;
    } else if (hour < 20) {
      // 17:00–20:00 傍晚降載
      load = 240 + Math.sin((hour - 17) * Math.PI / 3) * 25 + Math.random() * 18;
    } else if (hour < 22) {
      // 20:00–22:00 夜間仍有生產
      load = 180 + Math.sin((hour - 20) * Math.PI / 2) * 20 + Math.random() * 12;
    } else {
      // 22:00–24:00 夜班低載
      load = 110 + Math.sin((hour - 22) * Math.PI) * 15 + Math.random() * 10;
    }

    profile.push(Math.round(Math.max(80, load)));
  }

  SAMPLE_AMI_SUMMARY.loadProfile_kW = profile;
  SAMPLE_AMI_SUMMARY.loadProfile_labels = Array.from({ length: slots }, (_, i) => {
    const h = Math.floor(i / 4).toString().padStart(2, '0');
    const m = ((i % 4) * 15).toString().padStart(2, '0');
    return `${h}:${m}`;
  });
})();

// ── 月別用電量分布（示範）────────────────────────────────────────────────
const SAMPLE_MONTHLY_USAGE = [
  { month: '1月',  kWh: 126000 },
  { month: '2月',  kWh: 112000 },
  { month: '3月',  kWh: 118000 },
  { month: '4月',  kWh: 124000 },
  { month: '5月',  kWh: 138000 },
  { month: '6月',  kWh: 152000 },
  { month: '7月',  kWh: 165000 },
  { month: '8月',  kWh: 168000 },
  { month: '9月',  kWh: 148000 },
  { month: '10月', kWh: 130000 },
  { month: '11月', kWh: 122000 },
  { month: '12月', kWh: 128000 },
];

// ── 預設電價（示範，請勿視為台電現行正式電價）────────────────────────────
const DEFAULT_TARIFF = {
  source: '示範費率（參考台電高壓時間電價，非現行正式電價，請依實際費率調整）',
  peakRate: 4.08,      // 尖峰電價 NT$/kWh（示範值）
  offPeakRate: 1.68,   // 離峰電價 NT$/kWh（示範值）
};
