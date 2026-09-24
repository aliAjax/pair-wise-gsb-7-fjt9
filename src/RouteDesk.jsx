import React, { useMemo, useState } from 'react';
import { LIFT_STATUS, PASSAGE_TYPES, WHEELCHAIR_WIDTH, todayStr } from './data.js';
import { blockReason, planRoute } from './planner.js';
import { fmtSpan, fmtTime, parseHHMM } from './time.js';

const edgeText = p => `${p.ptype} · 净宽 ${p.width}cm${p.ptype === '电梯' ? ` · 电梯${p.lift}` : ''}${p.closed ? ' · 临时封闭' : ''}`;

function EdgeChip({ p }) {
  return (
    <span className={'r-chip' + (blockReason(p) ? ' bad' : '')}>
      {p.ptype} · {p.width}cm
      {p.ptype === '电梯' && <em className={p.lift === '检修' ? 'lift-down' : 'lift-up'}>电梯{p.lift}</em>}
      {p.closed && <em className="closed-tag">封闭</em>}
    </span>
  );
}

export default function RouteDesk({ exhibits, spots, setSpots, passages, setPassages, bookings, setBookings, tours, setTours, notify }) {
  const [tab, setTab] = useState('plan');
  const [draft, setDraft] = useState({
    date: todayStr(), startHHMM: '09:30', chairWidth: WHEELCHAIR_WIDTH, partySize: 1,
    stopIds: [], returnToEntrance: true,
  });
  const setD = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const exhibitById = new Map(exhibits.map(x => [String(x.id), x]));
  const nameOf = id => spots.find(s => s.id === id)?.name ?? id;
  const exhibitSpots = spots.filter(s => s.exhibitId != null);

  // 占用窗口 = 团体预订 + 已冻结导览单（同日、人满即避让）
  const occupants = useMemo(() => {
    const list = bookings.map(b => ({
      exhibitId: b.exhibitId, date: b.date, fromMin: b.fromMin, toMin: b.toMin,
      size: b.size, capacity: exhibitById.get(String(b.exhibitId))?.capacity ?? Infinity,
      partyName: `团体 · ${b.partyName}`,
    }));
    for (const t of tours.filter(t => t.status === 'confirmed')) {
      for (const s of t.timeline.filter(x => x.kind === 'stop')) {
        list.push({
          exhibitId: s.exhibitId, date: t.date, fromMin: s.startMin, toMin: s.endMin,
          size: t.partySize, capacity: s.capacity, partyName: `导览单 ${t.code}`,
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, tours, exhibits]);

  const routeStops = useMemo(
    () => ['entrance', ...draft.stopIds, ...(draft.returnToEntrance && draft.stopIds.length ? ['entrance'] : [])],
    [draft.stopIds, draft.returnToEntrance],
  );

  const result = useMemo(() => {
    if (!draft.stopIds.length || !spots.find(s => s.id === 'entrance')) return null;
    return planRoute(spots, passages, routeStops, {
      date: draft.date, startMin: parseHHMM(draft.startHHMM),
      chairWidth: Number(draft.chairWidth) || WHEELCHAIR_WIDTH,
      partySize: Number(draft.partySize) || 1, occupants,
    }, exhibitById);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, passages, routeStops, draft, occupants]);

  const addStop = id => setD('stopIds', [...draft.stopIds, id]);
  const removeStop = i => setD('stopIds', draft.stopIds.filter((_, j) => j !== i));
  const moveStop = (i, dir) => {
    const j = i + dir, arr = [...draft.stopIds];
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setD('stopIds', arr);
  };

  const confirmGuide = () => {
    if (!result?.feasible) return;
    const frozenTimeline = result.timeline.map(x => x.kind === 'walk'
      ? { ...x, edges: undefined, edgeTexts: x.edges.map(e => edgeText(e.p)), fromName: nameOf(x.from), toName: nameOf(x.to) } : x);
    const tour = {
      id: 't' + Date.now(),
      code: 'TR-' + Date.now().toString(36).toUpperCase().slice(-5),
      status: 'confirmed',
      frozenAt: new Date().toISOString(),
      date: draft.date, startMin: parseHHMM(draft.startHHMM),
      chairWidth: Number(draft.chairWidth), partySize: Number(draft.partySize) || 1,
      stops: routeStops,
      stopNames: routeStops.map(nameOf),
      timeline: frozenTimeline, endMin: result.endMin,
    };
    setTours([tour, ...tours]);
    notify(`导览单 ${tour.code} 已冻结，时段已锁定`);
    setD('stopIds', []);
    setTab('tours');
  };

  const reschedule = t => {
    setTours(tours.map(x => x.id === t.id ? { ...x, status: 'released', releasedAt: new Date().toISOString() } : x));
    const stops = t.stops.slice(1);
    const back = stops.length > 1 && stops[stops.length - 1] === 'entrance';
    setDraft({
      date: t.date, startHHMM: fmtTime(t.startMin), chairWidth: t.chairWidth ?? WHEELCHAIR_WIDTH,
      partySize: t.partySize, stopIds: back ? stops.slice(0, -1) : stops, returnToEntrance: back,
    });
    notify('改期前已先释放原时段，可重新排期');
    setTab('plan');
  };

  const closedCount = passages.filter(p => p.closed || (p.ptype === '电梯' && p.lift === '检修')).length;

  return (
    <div className="route-desk">
      <div className="r-subnav">
        {[['plan', '排路线'], ['passages', '通道与节点'], ['bookings', '团体占用'], ['tours', '导览单']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
        <span className="r-stat">{spots.length} 节点 · {passages.length} 通道{closedCount ? ` · ${closedCount} 处停用/封闭` : ''}</span>
      </div>

      {tab === 'plan' && (
        <div className="r-grid">
          <section className="r-card">
            <h3>访客与出发设置</h3>
            <div className="r-formrow">
              <label>参观日期<input type="date" value={draft.date} onChange={e => setD('date', e.target.value)} /></label>
              <label>开始时间<input type="time" value={draft.startHHMM} onChange={e => setD('startHHMM', e.target.value)} /></label>
            </div>
            <div className="r-formrow">
              <label>轮椅所需净宽（cm）<input type="number" min="60" max="150" value={draft.chairWidth} onChange={e => setD('chairWidth', e.target.value)} /></label>
              <label>访客人数<input type="number" min="1" max="40" value={draft.partySize} onChange={e => setD('partySize', e.target.value)} /></label>
            </div>
            <label className="r-check"><input type="checkbox" checked={draft.returnToEntrance} onChange={e => setD('returnToEntrance', e.target.checked)} /> 参观结束后返回一层入口</label>

            <h3 className="r-mt">展项停留点（按意愿排序）</h3>
            {draft.stopIds.length === 0 && <p className="r-empty">还没有选择展项。从下方加入想参观的展项，系统会据此排轮椅可达路线。</p>}
            <ol className="r-stops">
              {draft.stopIds.map((id, i) => {
                const sp = spots.find(s => s.id === id);
                const ex = sp ? exhibitById.get(String(sp.exhibitId)) : null;
                return (
                  <li key={id}>
                    <span className="r-idx">{i + 1}</span>
                    <div><strong>{sp?.name}</strong>{ex && <small>停留 {ex.dwellMin} 分钟 · 同时容纳 {ex.capacity} 人</small>}</div>
                    <span className="r-stopbtns">
                      <button onClick={() => moveStop(i, -1)} disabled={i === 0}>↑</button>
                      <button onClick={() => moveStop(i, 1)} disabled={i === draft.stopIds.length - 1}>↓</button>
                      <button className="r-del" onClick={() => removeStop(i)}>移除</button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="r-pick">
              {exhibitSpots.filter(s => !draft.stopIds.includes(s.id)).map(s => {
                const ex = exhibitById.get(String(s.exhibitId));
                return <button key={s.id} onClick={() => addStop(s.id)}>＋ {s.name}{ex && <em>{ex.dwellMin}′·{ex.capacity}人</em>}</button>;
              })}
              {exhibitSpots.length === 0 && <small className="r-empty">当前节点未关联展项，可在「通道与节点」中登记。</small>}
            </div>
          </section>

          <section className="r-card">
            <h3>排出的参观路线</h3>
            {!result && <p className="r-empty">选择至少一个展项后，这里会给出可达路线与时间安排。</p>}
            {result && !result.feasible && (
              <div className="r-broken">
                <div className="r-broken-head">⚠ 当前安排没有轮椅可行路线</div>
                <p className="r-keep">已保留你的展项选择，以下通道导致断开：</p>
                {result.brokenLegs.map(leg => (
                  <div className="r-leg" key={leg.index}>
                    <div className="r-leg-title">{nameOf(leg.from)} → {nameOf(leg.to)}</div>
                    {leg.noPathAtAll && <p className="r-reason">两点之间没有登记任何通道。</p>}
                    {!leg.noPathAtAll && leg.broken.map((e, i) => (
                      <div className="r-badrow" key={i}>
                        <EdgeChip p={e.p} />
                        <span className="r-reason">{e.reason}</span>
                      </div>
                    ))}
                    {!leg.noPathAtAll && leg.broken.length === 0 && <p className="r-reason">存在通道但均不满足轮椅通行条件。</p>}
                  </div>
                ))}
              </div>
            )}
            {result?.feasible && (
              <>
                <ol className="r-timeline">
                  {result.timeline.map(x => x.kind === 'walk' ? (
                    <li className="tl-walk" key={x.key}>
                      <span className="tl-time">{fmtTime(x.startMin)}–{fmtTime(x.endMin)}</span>
                      <div>
                        <strong>{nameOf(x.from)} → {nameOf(x.to)}</strong>
                        <small>途经 {x.edges.length} 段通道 · {fmtSpan(x.endMin - x.startMin)}</small>
                        <div className="r-chips">{x.edges.map((e, i) => <EdgeChip key={i} p={e.p} />)}</div>
                      </div>
                    </li>
                  ) : (
                    <li className="tl-stop" key={x.key}>
                      <span className="tl-time">{fmtTime(x.startMin)}–{fmtTime(x.endMin)}</span>
                      <div>
                        <strong>{x.title}</strong>
                        <small>{x.room} · 停留 {x.dwellMin} 分钟 · 同时容纳 {x.capacity} 人</small>
                        {x.waits.map((w, i) => (
                          <p className="r-wait" key={i}>⏖ {fmtTime(x.planMin)} 到 {w.partyName} 占用，等待至 {fmtTime(w.untilMin)} 再进入</p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="r-endline">
                  预计 {fmtTime(result.endMin)} 结束
                  · 全程 {fmtSpan(result.endMin - parseHHMM(draft.startHHMM))}
                </div>
                <button className="primary full" onClick={confirmGuide}>确认并冻结导览单</button>
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'passages' && <PassagesTab spots={spots} setSpots={setSpots} passages={passages} setPassages={setPassages} exhibits={exhibits} notify={notify} />}
      {tab === 'bookings' && <BookingsTab exhibits={exhibits} bookings={bookings} setBookings={setBookings} />}
      {tab === 'tours' && <ToursTab tours={tours} reschedule={reschedule} />}
    </div>
  );
}

/* ---------------- 通道与节点 ---------------- */

function PassagesTab({ spots, setSpots, passages, setPassages, exhibits, notify }) {
  const [pf, setPf] = useState({ ptype: '平路', width: 120, lift: '运行', closed: false, note: '', from: '', to: '' });
  const [editId, setEditId] = useState(null);
  const [sf, setSf] = useState({ name: '', kind: '展厅', exhibitId: '' });

  const savePassage = () => {
    if (!pf.from || !pf.to) return notify('请选择通道两端的节点');
    if (pf.from === pf.to) return notify('通道两端不能是同一节点');
    if (!(Number(pf.width) > 0)) return notify('请填写有效的净宽');
    const payload = {
      from: pf.from, to: pf.to, ptype: pf.ptype, width: Number(pf.width),
      lift: pf.ptype === '电梯' ? pf.lift : '', closed: !!pf.closed, note: pf.note.trim(),
    };
    if (editId) {
      setPassages(passages.map(p => p.id === editId ? { ...p, ...payload } : p));
      notify('通道已更新');
    } else {
      setPassages([...passages, { ...payload, id: 'p' + Date.now() }]);
      notify('通道已登记');
    }
    setPf({ ptype: '平路', width: 120, lift: '运行', closed: false, note: '', from: '', to: '' });
    setEditId(null);
  };
  const editPassage = p => { setEditId(p.id); setPf({ ...p, lift: p.lift || '运行' }); };
  const toggleClosed = p => setPassages(passages.map(x => x.id === p.id ? { ...x, closed: !x.closed } : x));
  const toggleLift = p => setPassages(passages.map(x => x.id === p.id ? { ...x, lift: x.lift === '运行' ? '检修' : '运行' } : x));
  const delPassage = id => { setPassages(passages.filter(p => p.id !== id)); if (editId === id) setEditId(null); };

  const addSpot = () => {
    if (!sf.name.trim()) return;
    setSpots([...spots, {
      id: 'n' + Date.now(), name: sf.name.trim(), kind: sf.kind,
      exhibitId: sf.exhibitId ? Number(sf.exhibitId) : undefined,
    }]);
    setSf({ name: '', kind: '展厅', exhibitId: '' });
    notify('节点已登记');
  };
  const delSpot = id => {
    if (passages.some(p => p.from === id || p.to === id)) return notify('该节点仍被通道引用，请先删除相关通道');
    setSpots(spots.filter(s => s.id !== id));
  };

  return (
    <div className="r-grid wide">
      <section className="r-card">
        <h3>通道登记（{passages.length}）</h3>
        <p className="r-hint">登记坡道或台阶、净宽与电梯状态；临时封闭的通道会从轮椅路线中排除。</p>
        <div className="r-formrow">
          <label>起点<select value={pf.from} onChange={e => setPf({ ...pf, from: e.target.value })}><option value="">选择节点…</option>{spots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>终点<select value={pf.to} onChange={e => setPf({ ...pf, to: e.target.value })}><option value="">选择节点…</option>{spots.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>
        <div className="r-formrow">
          <label>通道类型<select value={pf.ptype} onChange={e => setPf({ ...pf, ptype: e.target.value })}>{PASSAGE_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          <label>净宽（cm）<input type="number" min="50" value={pf.width} onChange={e => setPf({ ...pf, width: e.target.value })} /></label>
          {pf.ptype === '电梯' && (
            <label>电梯状态<select value={pf.lift} onChange={e => setPf({ ...pf, lift: e.target.value })}>{LIFT_STATUS.map(t => <option key={t}>{t}</option>)}</select></label>
          )}
        </div>
        <label>备注（如检修原因）<input value={pf.note} onChange={e => setPf({ ...pf, note: e.target.value })} placeholder="例如：电梯例行检修，今日停用" /></label>
        <label className="r-check"><input type="checkbox" checked={pf.closed} onChange={e => setPf({ ...pf, closed: e.target.checked })} /> 临时封闭（施工/活动占用）</label>
        <button className="primary" onClick={savePassage}>{editId ? '保存修改' : '登记通道'}</button>
        {editId && <button className="secondary r-inline-btn" onClick={() => { setEditId(null); setPf({ ptype: '平路', width: 120, lift: '运行', closed: false, note: '', from: '', to: '' }); }}>取消编辑</button>}

        <ul className="r-p-list">
          {passages.map(p => (
            <li key={p.id} className={blockReason(p) ? 'is-bad' : ''}>
              <div className="r-p-main">
                <strong>{spots.find(s => s.id === p.from)?.name ?? p.from} ↔ {spots.find(s => s.id === p.to)?.name ?? p.to}</strong>
                <div className="r-chips"><EdgeChip p={p} /></div>
                {p.note && <small className="r-note">{p.note}</small>}
                {blockReason(p) && <small className="r-reason">{blockReason(p)}</small>}
              </div>
              <div className="r-p-actions">
                <button onClick={() => editPassage(p)}>编辑</button>
                {p.ptype === '电梯' && <button onClick={() => toggleLift(p)}>{p.lift === '检修' ? '恢复运行' : '报检修'}</button>}
                <button onClick={() => toggleClosed(p)}>{p.closed ? '解除封闭' : '临时封闭'}</button>
                <button className="r-del" onClick={() => delPassage(p.id)}>删除</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="r-card">
        <h3>节点登记（{spots.length}）</h3>
        <p className="r-hint">入口、展厅与中转点；展厅节点可关联一个展项，排路线时自动读取停留时长与容纳人数。</p>
        <label>节点名称<input value={sf.name} onChange={e => setSf({ ...sf, name: e.target.value })} placeholder="例如：D03 · 雕塑厅" /></label>
        <div className="r-formrow">
          <label>类型<select value={sf.kind} onChange={e => setSf({ ...sf, kind: e.target.value })}><option>入口</option><option>展厅</option><option>中转</option></select></label>
          <label>关联展项<select value={sf.exhibitId} onChange={e => setSf({ ...sf, exhibitId: e.target.value })}><option value="">无</option>{exhibits.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
        </div>
        <button className="primary" onClick={addSpot}>登记节点</button>
        <ul className="r-s-list">
          {spots.map(s => (
            <li key={s.id}>
              <div><strong>{s.name}</strong><small>{s.kind}{s.exhibitId != null && ` · ${exhibits.find(x => String(x.id) === String(s.exhibitId))?.title ?? '展项已删除'}`}</small></div>
              <button className="r-del" onClick={() => delSpot(s.id)}>删除</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------------- 团体占用 ---------------- */

function BookingsTab({ exhibits, bookings, setBookings }) {
  const [bf, setBf] = useState({ exhibitId: '', date: todayStr(), fromHHMM: '09:00', toHHMM: '10:00', partyName: '', size: '' });
  const exCap = bf.exhibitId ? exhibits.find(x => String(x.id) === String(bf.exhibitId))?.capacity : null;

  const add = () => {
    if (!bf.exhibitId) return;
    const fromMin = parseHHMM(bf.fromHHMM), toMin = parseHHMM(bf.toHHMM);
    if (toMin <= fromMin) return;
    setBookings([...bookings, {
      id: 'b' + Date.now(), exhibitId: Number(bf.exhibitId), date: bf.date,
      fromMin, toMin, partyName: bf.partyName.trim() || '团体', size: Number(bf.size) > 0 ? Number(bf.size) : exCap,
    }]);
    setBf({ ...bf, exhibitId: '', partyName: '', size: '' });
  };

  return (
    <div className="r-grid">
      <section className="r-card">
        <h3>登记团体占用时段</h3>
        <p className="r-hint">团体在该时段整包展项，轮椅路线会自动避开：能等待则顺延，顺序可在排路线页调整。</p>
        <label>展项<select value={bf.exhibitId} onChange={e => setBf({ ...bf, exhibitId: e.target.value })}><option value="">选择展项…</option>{exhibits.map(x => <option key={x.id} value={x.id}>{x.title}（容纳 {x.capacity} 人）</option>)}</select></label>
        <div className="r-formrow">
          <label>日期<input type="date" value={bf.date} onChange={e => setBf({ ...bf, date: e.target.value })} /></label>
          <label>开始<input type="time" value={bf.fromHHMM} onChange={e => setBf({ ...bf, fromHHMM: e.target.value })} /></label>
          <label>结束<input type="time" value={bf.toHHMM} onChange={e => setBf({ ...bf, toHHMM: e.target.value })} /></label>
        </div>
        <div className="r-formrow">
          <label>团体名称<input value={bf.partyName} onChange={e => setBf({ ...bf, partyName: e.target.value })} placeholder="例如：晨光研学团" /></label>
          <label>人数{exCap != null && <em className="r-cap-hint">该展项可容纳 {exCap} 人，留空按包场处理</em>}<input type="number" min="1" value={bf.size} onChange={e => setBf({ ...bf, size: e.target.value })} /></label>
        </div>
        <button className="primary" onClick={add}>登记占用</button>
      </section>
      <section className="r-card">
        <h3>已登记时段（{bookings.length}）</h3>
        <ul className="r-b-list">
          {[...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.fromMin - b.fromMin).map(b => {
            const ex = exhibits.find(x => String(x.id) === String(b.exhibitId));
            return (
              <li key={b.id}>
                <div>
                  <strong>{ex?.title ?? '展项已删除'}</strong>
                  <small>{b.date} · {fmtTime(b.fromMin)}–{fmtTime(b.toMin)} · {b.partyName} · {b.size} 人{ex ? ` / 容 ${ex.capacity}` : ''}</small>
                </div>
                <button className="r-del" onClick={() => setBookings(bookings.filter(x => x.id !== b.id))}>删除</button>
              </li>
            );
          })}
          {bookings.length === 0 && <li className="r-empty">暂无团体占用。</li>}
        </ul>
      </section>
    </div>
  );
}

/* ---------------- 导览单 ---------------- */

function ToursTab({ tours, reschedule }) {
  const TourCard = ({ t }) => (
    <div className={'r-tour ' + t.status}>
      <div className="r-tour-head">
        <strong>{t.code}</strong>
        {t.status === 'confirmed'
          ? <span className="status live">❄ 已冻结</span>
          : <span className="status draft">已释放 · 改期</span>}
      </div>
      <small className="r-note">{t.date} · {fmtTime(t.startMin)} 出发 · {t.partySize} 人 · 轮椅净宽 {t.chairWidth ?? WHEELCHAIR_WIDTH}cm</small>
      <ol className="r-frozen-tl">
        {t.timeline.map(x => x.kind === 'walk' ? (
          <li key={x.key} className="tl-walk">
            <span className="tl-time">{fmtTime(x.startMin)}–{fmtTime(x.endMin)}</span>
            <div><strong>{x.fromName} → {x.toName}</strong>
              {(x.edgeTexts || []).map((txt, i) => <span className="r-chip" key={i}>{txt}</span>)}
            </div>
          </li>
        ) : (
          <li key={x.key} className="tl-stop">
            <span className="tl-time">{fmtTime(x.startMin)}–{fmtTime(x.endMin)}</span>
            <div><strong>{x.title}</strong><small>停留 {x.dwellMin} 分钟 · 容纳 {x.capacity} 人{x.waits.length ? ` · 已避让 ${x.waits.length} 个团体时段` : ''}</small></div>
          </li>
        ))}
      </ol>
      <div className="r-endline">预计 {fmtTime(t.endMin)} 结束</div>
      {t.status === 'confirmed' && <button className="secondary" onClick={() => reschedule(t)}>改期（先释放此时段）</button>}
    </div>
  );
  const confirmed = tours.filter(t => t.status === 'confirmed');
  const released = tours.filter(t => t.status === 'released');
  return (
    <div className="r-grid wide">
      <section className="r-card">
        <h3>已冻结导览单（{confirmed.length}）</h3>
        {confirmed.length === 0 && <p className="r-empty">确认后的导览单会冻结在这里，其占用时段同时参与路线避让。</p>}
        {confirmed.map(t => <TourCard key={t.id} t={t} />)}
      </section>
      {released.length > 0 && (
        <section className="r-card">
          <h3>改期记录（{released.length}）</h3>
          {released.map(t => <TourCard key={t.id} t={t} />)}
        </section>
      )}
    </div>
  );
}
