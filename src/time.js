// 分钟数（自 00:00）↔ HH:MM
export function fmtTime(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseHHMM(str) {
  const [h, m] = String(str).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtSpan(min) {
  const v = Math.round(min);
  if (!v) return '0 分钟';
  return v >= 60 ? `${Math.floor(v / 60)} 小时 ${v % 60 ? `${v % 60} 分钟` : ''}` : `${v} 分钟`;
}
