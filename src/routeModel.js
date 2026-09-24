// 参观路线台 · 数据模型与路线规划算法（纯函数，不依赖 React，可单测）
//
// 图模型：点位(nodes) + 通道(passages，无向边)。
// 通道登记：类型（平层/坡道/台阶/电梯）、净宽、长度、电梯状态、临时封闭。
// 展项登记：停留时长、同时容纳人数；团体预约与已确认导览单都会占用容量。
// 导览单：confirmed = 冻结并占用时段；改期先置回 draft（释放原时段）再重排。

export const STORE_KEY = 'route-desk-v1';
export const OPEN_MIN = 9 * 60;        // 开馆 09:00
export const CLOSE_MIN = 17 * 60;      // 闭馆 17:00
export const SPEED_M_PER_MIN = 45;     // 轮椅推行均速
export const ELEVATOR_MIN = 3;         // 电梯候乘 + 运行
export const ENTRANCE_ID = 'gate';     // 路线起终点：入口

export const KIND_LABEL = { flat: '平层通道', ramp: '坡道', stairs: '台阶', elevator: '电梯' };

export const todayStr = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
export const toHM = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function seedState() {
  const today = todayStr();
  return {
    settings: { wheelchairWidth: 75 }, // 轮椅所需净宽（cm）
    nodes: [
      { id: 'gate',   name: '东门入口',      kind: 'entrance', floor: '1F' },
      { id: 'lobby',  name: '一层大厅',      kind: 'junction', floor: '1F' },
      { id: 'hallA',  name: 'A01 · 主展厅',  kind: 'hall',     floor: '1F' },
      { id: 'hallB',  name: 'B02 · 纸上时间', kind: 'hall',    floor: '1F' },
      { id: 'lift1f', name: '电梯厅 · 1F',   kind: 'lift',     floor: '1F' },
      { id: 'lift2f', name: '电梯厅 · 2F',   kind: 'lift',     floor: '2F' },
      { id: 'hallC',  name: 'C01 · 新媒介',  kind: 'hall',     floor: '2F' },
      { id: 'hallD',  name: 'D01 · 露台展厅', kind: 'hall',    floor: '2F' },
    ],
    passages: [
      { id: 'p1',  from: 'gate',   to: 'lobby',  kind: 'flat',     width: 180, length: 12, closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p2',  from: 'lobby',  to: 'hallA',  kind: 'flat',     width: 150, length: 8,  closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p3',  from: 'lobby',  to: 'hallB',  kind: 'flat',     width: 140, length: 15, closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p4',  from: 'lobby',  to: 'lift1f', kind: 'flat',     width: 120, length: 10, closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p5',  from: 'lift1f', to: 'lift2f', kind: 'elevator', width: 110, length: 0,  closed: false, closedReason: '', elevatorStatus: 'running' },
      { id: 'p6',  from: 'lift2f', to: 'hallC',  kind: 'flat',     width: 130, length: 10, closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p7',  from: 'hallC',  to: 'hallD',  kind: 'ramp',     width: 95,  length: 18, closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p8',  from: 'lobby',  to: 'lift2f', kind: 'stairs',   width: 160, length: 0,  closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p9',  from: 'lift2f', to: 'hallD',  kind: 'flat',     width: 70,  length: 8,  closed: false, closedReason: '', elevatorStatus: null },
      { id: 'p10', from: 'hallA',  to: 'hallB',  kind: 'flat',     width: 110, length: 6,  closed: true,  closedReason: '地胶养护，预计 17:00 恢复', elevatorStatus: null },
    ],
    exhibits: [
      { id: 'ex1', title: '潮汐之后',   nodeId: 'hallA', dwell: 25, capacity: 6 },
      { id: 'ex2', title: '未寄出的信', nodeId: 'hallB', dwell: 20, capacity: 4 },
      { id: 'ex3', title: '柔软的边界', nodeId: 'hallC', dwell: 30, capacity: 8 },
      { id: 'ex4', title: '风中的标尺', nodeId: 'hallD', dwell: 15, capacity: 3 },
    ],
    groupBookings: [
      { id: 'g1', exhibitId: 'ex3', date: today, start: '10:00', end: '10:40', size: 7, name: '春田小学参观团' },
      { id: 'g2', exhibitId: 'ex2', date: today, start: '14:00', end: '14:30', size: 4, name: '社区读书会' },
    ],
    tours: [],
  };
}

export function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && Array.isArray(raw.passages) && Array.isArray(raw.exhibits)) return raw;
  } catch { /* 数据损坏时回退到种子数据 */ }
  return seedState();
}

// ---- 通行判定 ----

// 返回 null 表示轮椅可通行，否则返回 { reason, advice }
export function blockedInfo(p, wheelchairWidth) {
  if (p.closed) return { reason: `临时封闭${p.closedReason ? `：${p.closedReason}` : ''}`, advice: '等待恢复通行，或解除封闭后重新排路线' };
  if (p.kind === 'stairs') return { reason: '台阶通道，轮椅不可通行', advice: '需坡道或电梯替代，轮椅请改道' };
  if (p.width < wheelchairWidth) return { reason: `净宽 ${p.width}cm ＜ 轮椅所需 ${wheelchairWidth}cm`, advice: '轮椅无法通过，需改走更宽的通道' };
  if (p.kind === 'elevator' && p.elevatorStatus !== 'running') return { reason: '电梯停用（检修）', advice: '联系工程部恢复电梯，或改期参观楼上展厅' };
  return null;
}
export const isPassable = (p, wheelchairWidth) => !blockedInfo(p, wheelchairWidth);

const edgeMin = p => (p.kind === 'elevator' ? ELEVATOR_MIN : Math.max(1, Math.round(p.length / SPEED_M_PER_MIN)));

// ---- 最短路（图很小，O(n²) Dijkstra 足够）----

function dijkstra(nodes, passages, source) {
  const dist = {}, prev = {};
  nodes.forEach(n => { dist[n.id] = Infinity; });
  dist[source] = 0;
  const done = new Set();
  for (;;) {
    let u = null;
    for (const n of nodes) if (!done.has(n.id) && (u === null || dist[n.id] < dist[u])) u = n.id;
    if (u === null || dist[u] === Infinity) break;
    done.add(u);
    for (const p of passages) {
      const v = p.from === u ? p.to : p.to === u ? p.from : null;
      if (!v || done.has(v)) continue;
      const w = edgeMin(p);
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = { node: u, passage: p }; }
    }
  }
  return { dist, prev };
}

function pathOf(dij, source, target) {
  const out = [];
  let cur = target;
  while (cur !== source) {
    const step = dij.prev[cur];
    if (!step) break;
    out.unshift(step.passage);
    cur = step.node;
  }
  return out;
}

// ---- 容量：团体预约 + 已确认（冻结）导览单共同占用展项时段 ----

export function occupiedIntervals(state, exhibitId, date) {
  const iv = [];
  for (const g of state.groupBookings) {
    if (g.exhibitId === exhibitId && g.date === date) {
      iv.push({ start: toMin(g.start), end: toMin(g.end), size: g.size, label: g.name || '团体预约' });
    }
  }
  for (const t of state.tours) {
    if (t.status !== 'confirmed' || t.date !== date) continue;
    for (const v of t.visits) {
      if (v.exhibitId === exhibitId) iv.push({ start: v.start, end: v.end, size: t.partySize, label: `导览单 · ${t.name}` });
    }
  }
  return iv;
}

// 候选窗口 [s, e) 是否容得下 partySize；容不下则返回可重试的最早时刻，容得下返回 null
function capacityConflict(state, ex, date, s, e, partySize) {
  const iv = occupiedIntervals(state, ex.id, date).filter(i => i.start < e && i.end > s);
  if (!iv.length) return null;
  const cuts = new Set([s, e]);
  iv.forEach(i => { cuts.add(Math.max(s, i.start)); cuts.add(Math.min(e, i.end)); });
  const pts = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < pts.length - 1; i++) {
    const mid = (pts[i] + pts[i + 1]) / 2;
    const blocking = iv.filter(x => x.start <= mid && x.end > mid);
    const load = partySize + blocking.reduce((a, x) => a + x.size, 0);
    if (load > ex.capacity) return Math.max(...blocking.map(x => x.end));
  }
  return null;
}

// ---- 展项参观顺序 ----

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([x, ...p]);
  });
  return out;
}

function nearestNeighbor(dij, exhibits) {
  const left = [...exhibits];
  const seq = [];
  let cur = ENTRANCE_ID;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((e, i) => { const d = dij[cur].dist[e.nodeId]; if (d < bd) { bd = d; bi = i; } });
    cur = left[bi].nodeId;
    seq.push(...left.splice(bi, 1));
  }
  return seq;
}

function bestOrder(dij, exhibits) {
  if (exhibits.length < 2) return exhibits;
  if (exhibits.length > 8) return nearestNeighbor(dij, exhibits); // 阶乘爆炸时退化为最近邻
  const cost = seq => {
    let c = dij[ENTRANCE_ID].dist[seq[0].nodeId];
    for (let i = 1; i < seq.length; i++) c += dij[seq[i - 1].nodeId].dist[seq[i].nodeId];
    return c + dij[seq[seq.length - 1].nodeId].dist[ENTRANCE_ID];
  };
  let best = null, bestC = Infinity;
  for (const seq of permutations(exhibits)) {
    const c = cost(seq);
    if (c < bestC) { bestC = c; best = seq; }
  }
  return best;
}

// ---- 时间模拟：沿顺序走，被占住的展项时段自动错开 ----

function simulate(state, order, { date, startMin, partySize }, dij) {
  let t = startMin, cur = ENTRANCE_ID;
  const legs = [], visits = [];
  for (const ex of order) {
    const d = dij[cur];
    legs.push({ from: cur, to: ex.nodeId, minutes: d.dist[ex.nodeId], path: pathOf(d, cur, ex.nodeId) });
    t += d.dist[ex.nodeId];
    let s = t, guard = 0;
    for (;;) {
      if (s + ex.dwell > CLOSE_MIN) return { ok: false, reason: 'capacity', fullExhibit: ex, legs, visits };
      const retry = capacityConflict(state, ex, date, s, s + ex.dwell, partySize);
      if (retry === null) break;
      s = retry;
      if (++guard > 500) return { ok: false, reason: 'capacity', fullExhibit: ex, legs, visits };
    }
    visits.push({ exhibitId: ex.id, nodeId: ex.nodeId, start: s, end: s + ex.dwell, wait: s - t });
    t = s + ex.dwell;
    cur = ex.nodeId;
  }
  const d = dij[cur];
  legs.push({ from: cur, to: ENTRANCE_ID, minutes: d.dist[ENTRANCE_ID], path: pathOf(d, cur, ENTRANCE_ID) });
  t += d.dist[ENTRANCE_ID];
  if (t > CLOSE_MIN) return { ok: false, reason: 'closing', legs, visits, endMin: t };
  return { ok: true, legs, visits, endMin: t };
}

// ---- 主入口：排路线 ----

export function planRoute(state, { date, startMin, exhibitIds, partySize }) {
  const W = state.settings.wheelchairWidth;
  const start = Math.max(startMin, OPEN_MIN);
  const exById = Object.fromEntries(state.exhibits.map(e => [e.id, e]));
  const chosen = [...new Set(exhibitIds)].map(id => exById[id]).filter(Boolean);
  if (!chosen.length) return { ok: false, reason: 'empty' };

  const open = state.passages.filter(p => isPassable(p, W));
  const fromGate = dijkstra(state.nodes, open, ENTRANCE_ID);
  const reachable = new Set(state.nodes.filter(n => fromGate.dist[n.id] < Infinity).map(n => n.id));

  // 不可达：保留选择，并指出横在可达区与不可达区之间的断开通道
  const unreachableEx = chosen.filter(e => !reachable.has(e.nodeId));
  if (unreachableEx.length) {
    const breaks = state.passages
      .filter(p => !isPassable(p, W) && reachable.has(p.from) !== reachable.has(p.to))
      .map(p => ({ passage: p, ...blockedInfo(p, W) }));
    return { ok: false, reason: 'unreachable', unreachableEx, breaks };
  }

  const nodeIds = [...new Set([ENTRANCE_ID, ...chosen.map(e => e.nodeId)])];
  const dij = Object.fromEntries(nodeIds.map(id => [id, dijkstra(state.nodes, open, id)]));
  const order = bestOrder(dij, chosen);
  const sim = simulate(state, order, { date, startMin: start, partySize }, dij);
  if (!sim.ok) return { ...sim, order };
  return { ok: true, order, ...sim };
}

// ---- 导览单：确认冻结 / 改期释放 / 取消 ----

export function confirmTour(state, draft) {
  const id = draft.id || `t${Date.now().toString(36)}`;
  const tour = { ...draft, id, status: 'confirmed', confirmedAt: Date.now() };
  return { ...state, tours: [...state.tours.filter(t => t.id !== id), tour] };
}

// 改期第一步：先释放原时段（回到 draft，不再占用容量）
export function releaseTour(state, id) {
  return { ...state, tours: state.tours.map(t => (t.id === id ? { ...t, status: 'draft' } : t)) };
}

export function removeTour(state, id) {
  return { ...state, tours: state.tours.filter(t => t.id !== id) };
}
