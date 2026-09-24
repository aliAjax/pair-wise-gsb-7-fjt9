// 轮椅参观路线排程
//
// 输入：节点、通道、选定的展项停留点、开始时间、轮椅尺寸、日期、访客人数、已有占用
// 输出：可行 → 逐段路径 + 时间轴（被团体占住则等待避让）
//       不可行 → 保留访客选择，逐段指出断开的通道与原因

import { TRAVEL_MIN, WHEELCHAIR_WIDTH } from './data.js';

// 单条通道对轮椅访客的阻断原因；可通行返回 null
export function blockReason(p, chairWidth = WHEELCHAIR_WIDTH) {
  if (p.closed) return '临时封闭';
  if (p.ptype === '台阶') return '台阶无坡道，轮椅不可通行';
  if (p.ptype === '电梯' && p.lift === '检修') return '电梯检修停用';
  if (Number(p.width) < chairWidth) return `净宽 ${p.width}cm 小于轮椅所需 ${chairWidth}cm`;
  return null;
}

// 无向图邻接表：adj.get(id) = [{ to, p, blocked, reason }]
export function buildGraph(spots, passages, chairWidth) {
  const adj = new Map(spots.map(s => [s.id, []]));
  for (const p of passages) {
    if (!adj.has(p.from) || !adj.has(p.to)) continue;
    const reason = blockReason(p, chairWidth);
    for (const [a, b] of [[p.from, p.to], [p.to, p.from]]) {
      adj.get(a).push({ to: b, p, blocked: reason !== null, reason });
    }
  }
  return adj;
}

// 轮椅可行最短路（按通过耗时 Dijkstra），返回 { edges, totalMin } 或 null
export function shortestFeasible(adj, from, to) {
  if (from === to) return { edges: [], totalMin: 0 };
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const seen = new Set();
  const pq = [[0, from]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    if (u === to) break;
    for (const e of adj.get(u) || []) {
      if (e.blocked) continue;
      const nd = d + (TRAVEL_MIN[e.p.ptype] ?? 2);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { edge: e, from: u });
        pq.push([nd, e.to]);
      }
    }
  }
  if (!prev.has(to) && from !== to) return null;
  const edges = [];
  let cur = to;
  while (cur !== from) {
    const step = prev.get(cur);
    if (!step) return null;
    edges.unshift(step.edge);
    cur = step.from;
  }
  return { edges, totalMin: dist.get(to) };
}

// 忽略一切通行限制的最少换通道数路径（BFS），用于在断线时指出"断开的通道"
export function shortestHop(adj, from, to) {
  if (from === to) return [];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const u = q.shift();
    for (const e of adj.get(u) || []) {
      if (!prev.has(e.to)) {
        prev.set(e.to, { edge: e, from: u });
        q.push(e.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const edges = [];
  let cur = to;
  while (cur !== from) {
    const step = prev.get(cur);
    edges.unshift(step.edge);
    cur = step.from;
  }
  return edges;
}

// 区间是否重叠（半开区间 [from,to)）
const overlap = (aF, aT, bF, bT) => aF < bT && bF < aT;

// 展项当前已占用窗口：团体预订 + 已冻结导览单，且同日
function occupantWindows(exhibitId, date, occupants) {
  return (occupants || []).filter(o => String(o.exhibitId) === String(exhibitId) && o.date === date);
}

// 在 planAt 尝试停留 dwellMin；若被团体/其他导览占住（含人数超限），等到窗口结束。
// 返回 { startMin, endMin, waits:[{partyName,untilMin}] }
function scheduleStop(planAt, dwellMin, windows, partySize) {
  let start = planAt;
  const waits = [];
  for (let guard = 0; guard < 50; guard++) {
    const end = start + dwellMin;
    const blocking = windows.filter(w => {
      if (!overlap(start, end, w.fromMin, w.toMin)) return false;
      // 该时段剩余可容纳人数不足：人满的团体占用同样需要避让
      const left = (w.capacity ?? Infinity) - (w.size ?? 0);
      return partySize > left;
    });
    if (!blocking.length) break;
    const until = Math.max(...blocking.map(w => w.toMin));
    waits.push({ partyName: blocking.map(w => w.partyName).join('、'), untilMin: until });
    start = until;
  }
  return { startMin: start, endMin: start + dwellMin, waits };
}

/**
 * @param stops  按访客意愿顺序排列的节点 id（含入口、展项节点…）
 * @param opts   { date, startMin, chairWidth, partySize, occupants:[{exhibitId,date,fromMin,toMin,size,capacity,partyName}] }
 * @param exhibitById 展项查找表，用于停留时长 / 容纳人数
 */
export function planRoute(spots, passages, stops, opts, exhibitById) {
  const {
    date,
    startMin = 9 * 60 + 30,
    chairWidth = WHEELCHAIR_WIDTH,
    partySize = 1,
    occupants = [],
  } = opts;

  const adj = buildGraph(spots, passages, chairWidth);
  const legs = [];

  // 1) 逐段做可达性检查；任何一段断开都保留全部选择并指出断开的通道
  for (let i = 0; i < stops.length - 1; i++) {
    const [from, to] = [stops[i], stops[i + 1]];
    const route = shortestFeasible(adj, from, to);
    if (!route) {
      const hop = shortestHop(adj, from, to);
      legs.push({
        index: i, from, to,
        feasible: false,
        // 无限制最短通道链上的阻断边，即导致这一段断开的通道
        broken: hop ? hop.filter(e => e.blocked) : null,
        noPathAtAll: hop === null,
      });
    } else {
      legs.push({ index: i, from, to, feasible: true, edges: route.edges, travelMin: route.totalMin });
    }
  }

  const brokenLegs = legs.filter(l => !l.feasible);
  if (brokenLegs.length) {
    return { feasible: false, legs, brokenLegs, timeline: [] };
  }

  // 2) 全程可达 → 排出含避让等待的时间轴
  const nodeById = new Map(spots.map(s => [s.id, s]));
  const timeline = [];
  let clock = startMin;

  stops.forEach((nodeId, i) => {
    const node = nodeById.get(nodeId);
    const ex = node?.exhibitId != null ? exhibitById.get(String(node.exhibitId)) : null;

    if (i > 0) {
      const leg = legs[i - 1];
      timeline.push({
        kind: 'walk', key: `w${i}`, from: stops[i - 1], to: nodeId,
        startMin: clock, endMin: clock + leg.travelMin, edges: leg.edges,
      });
      clock += leg.travelMin;
    }

    if (ex) {
      const windows = occupantWindows(ex.id, date, occupants);
      const { startMin: s, endMin: e, waits } = scheduleStop(clock, ex.dwellMin, windows, partySize);
      timeline.push({
        kind: 'stop', key: `s${i}`, nodeId, exhibitId: ex.id, title: ex.title,
        room: ex.room, dwellMin: ex.dwellMin, capacity: ex.capacity,
        planMin: clock, startMin: s, endMin: e, waits,
      });
      clock = e;
    }
  });

  return { feasible: true, legs, timeline, endMin: clock };
}
