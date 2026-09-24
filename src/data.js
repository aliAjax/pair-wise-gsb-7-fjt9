// 参观路线台 —— 数据模型、种子数据与持久化
//
// 图模型：
//   节点 spots  = 入口 / 展厅(中转点) / 展项(exhibitId 关联展项内容)
//   通道 passages = 连接两个节点的无向边：坡道或台阶、净宽、电梯状态、临时封闭
// 轮椅通行条件（任一不满足即断开）：
//   1. 通道未被临时封闭
//   2. 通道类型不是「台阶」
//   3. 类型为「电梯」时电梯状态必须为「运行」
//   4. 净宽 >= 轮椅尺寸（净宽低于轮椅尺寸不能走）

export const WHEELCHAIR_WIDTH = 90; // cm，轮椅通行所需最小净宽（含余量）

export const PASSAGE_TYPES = ['平路', '坡道', '台阶', '电梯'];
export const LIFT_STATUS = ['运行', '检修'];

// 轮椅经过不同通道的预算耗时（分钟）
export const TRAVEL_MIN = { 平路: 1, 坡道: 3, 台阶: 2, 电梯: 2 };

const seedExhibits = [
  { id: 1, title: '潮汐之后', room: 'A01 · 主展厅', type: '装置', desc: '一件记录海岸线变化的沉浸式影像装置。', audio: '', status: '已发布', color: '#e6b45d', dwellMin: 10, capacity: 15 },
  { id: 2, title: '未寄出的信', room: 'B02 · 纸上时间', type: '档案', desc: '来自三代人的手写信件与声音档案。', audio: '', status: '草稿', color: '#ef8f84', dwellMin: 8, capacity: 12 },
  { id: 3, title: '柔软的边界', room: 'C01 · 新媒介', type: '互动', desc: '观众的移动会改变墙面上的光影。', audio: '', status: '已发布', color: '#83b9b1', dwellMin: 12, capacity: 10 },
];

// 场馆节点：入口、三个展厅（含展项）、连接层
export const seedSpots = [
  { id: 'entrance', name: '一层大厅 · 入口', kind: '入口' },
  { id: 'hall-a', name: 'A01 · 主展厅', kind: '展厅', exhibitId: 1 },
  { id: 'hall-b', name: 'B02 · 纸上时间', kind: '展厅', exhibitId: 2 },
  { id: 'hall-c', name: 'C01 · 新媒介', kind: '展厅', exhibitId: 3 },
  { id: 'landing-2f', name: '二层连廊', kind: '中转' },
];

export const seedPassages = [
  { id: 'p1', from: 'entrance', to: 'hall-a', ptype: '平路', width: 180, lift: '', closed: false, note: '' },
  { id: 'p2', from: 'hall-a', to: 'landing-2f', ptype: '电梯', width: 110, lift: '检修', closed: false, note: '电梯例行检修，今日停用' },
  { id: 'p3', from: 'hall-a', to: 'landing-2f', ptype: '台阶', width: 160, lift: '', closed: false, note: '主楼梯' },
  { id: 'p4', from: 'landing-2f', to: 'hall-b', ptype: '坡道', width: 95, lift: '', closed: false, note: '缓坡，坡度 1:16' },
  { id: 'p5', from: 'landing-2f', to: 'hall-c', ptype: '坡道', width: 85, lift: '', closed: false, note: '侧厅临时坡道（净宽偏窄）' },
  { id: 'p6', from: 'hall-b', to: 'hall-c', ptype: '平路', width: 150, lift: '', closed: false, note: '' },
];

// 团体占用：团体在某日期某时段整包某展项，轮椅访客需避开（等待或调整顺序）
export const seedBookings = [
  { id: 'b1', exhibitId: 1, date: todayStr(), fromMin: 9 * 60, toMin: 10 * 60, partyName: '晨光研学团', size: 15 },
];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export { seedExhibits };
