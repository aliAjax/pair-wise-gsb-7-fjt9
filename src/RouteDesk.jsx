import React, { useEffect, useMemo, useState } from 'react';
import {
  STORE_KEY, OPEN_MIN, CLOSE_MIN, KIND_LABEL, ENTRANCE_ID,
  loadState, todayStr, toMin, toHM,
  blockedInfo, isPassable, planRoute, occupiedIntervals,
  confirmTour, releaseTour, removeTour,
} from './routeModel.js';

const nid = p => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`;

export default function RouteDesk({ onBack }) {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('plan');
  const [notice, setNotice] = useState('');

  // 排路线表单（规划失败也保留选择，方便通道恢复后直接重排）
  const [form, setForm] = useState({ date: todayStr(), start: '09:30', partySize: 2, exhibitIds: [] });
  const [result, setResult] = useState(null);
  const [rescheduleId, setRescheduleId] = useState(null);

  // 登记表单
  const [pForm, setPForm] = useState({ from: 'gate', to: 'lobby', kind: 'flat', width: 120, length: 10 });
  const [exForm, setExForm] = useState({ title: '', nodeId: 'hallA', dwell: 20, capacity: 6 });
  const [gForm, setGForm] = useState({ exhibitId: 'ex1', date: todayStr(), start: '10:00', end: '10:40', size: 10, name: '' });

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const W = state.settings.wheelchairWidth;
  const nodeName = id => (state.nodes.find(n => n.id === id) || {}).name || id;
  const exById = useMemo(() => Object.fromEntries(state.exhibits.map(e => [e.id, e])), [state.exhibits]);
  const blocked = state.passages.filter(p => !isPassable(p, W));
  const startMin = Math.max(toMin(form.start || '09:00'), OPEN_MIN);

  // ---- 排路线 ----
  const generate = () => {
    const r = planRoute(state, {
      date: form.date,
      startMin,
      exhibitIds: form.exhibitIds,
      partySize: Number(form.partySize) || 1,
    });
    setResult(r);
    if (!r.ok) setNotice('暂时没有可行路线，已保留你的展项选择');
  };

  const toggleExhibit = id => setForm(f => ({
    ...f,
    exhibitIds: f.exhibitIds.includes(id) ? f.exhibitIds.filter(x => x !== id) : [...f.exhibitIds, id],
  }));

  // ---- 导览单 ----
  const confirm = () => {
    if (!result?.ok) return;
    const wasReschedule = Boolean(rescheduleId);
    setState(s => confirmTour(s, {
      id: rescheduleId || undefined,
      name: `轮椅导览 · ${form.partySize}人 · ${toHM(startMin)} 出发`,
      date: form.date,
      startMin,
      partySize: Number(form.partySize) || 1,
      exhibitIds: [...form.exhibitIds],
      visits: result.visits,
      legs: result.legs.map(l => ({ from: l.from, to: l.to, minutes: l.minutes, path: l.path.map(p => p.id) })),
      endMin: result.endMin,
    }));
    setRescheduleId(null);
    setResult(null);
    setNotice(wasReschedule ? '改期完成：原时段已释放，新导览单已冻结' : '导览单已确认冻结，展项时段开始占用');
    setTab('tours');
  };

  const reschedule = tour => {
    setState(s => releaseTour(s, tour.id)); // 改期先释放原时段
    setForm({ date: tour.date, start: toHM(tour.startMin), partySize: tour.partySize, exhibitIds: [...tour.exhibitIds] });
    setRescheduleId(tour.id);
    setResult(null);
    setTab('plan');
    setNotice(`已释放原时段（${tour.date} ${toHM(tour.startMin)}），请重新生成路线后确认`);
  };

  const cancelTour = tour => {
    if (!window.confirm(`确定取消「${tour.name}」？其占用的展项时段将一并释放。`)) return;
    setState(s => removeTour(s, tour.id));
    if (rescheduleId === tour.id) setRescheduleId(null);
    setNotice('导览单已取消，占用时段已释放');
  };

  // ---- 通道登记 ----
  const updPassage = (id, k, v) => setState(s => ({
    ...s,
    passages: s.passages.map(p => {
      if (p.id !== id) return p;
      const next = { ...p, [k]: v };
      if (k === 'kind' && v === 'elevator' && !next.elevatorStatus) next.elevatorStatus = 'running';
      if (k === 'kind' && v !== 'elevator') next.elevatorStatus = null;
      return next;
    }),
  }));

  const addPassage = () => {
    if (pForm.from === pForm.to) { setNotice('通道两端不能是同一个点位'); return; }
    setState(s => ({
      ...s,
      passages: [...s.passages, {
        id: nid('p'), from: pForm.from, to: pForm.to, kind: pForm.kind,
        width: Number(pForm.width) || 0, length: Number(pForm.length) || 0,
        closed: false, closedReason: '',
        elevatorStatus: pForm.kind === 'elevator' ? 'running' : null,
      }],
    }));
    setNotice('通道已登记');
  };

  // ---- 展项与团体 ----
  const updExhibit = (id, k, v) => setState(s => ({
    ...s, exhibits: s.exhibits.map(e => (e.id === id ? { ...e, [k]: v } : e)),
  }));

  const addExhibit = () => {
    if (!exForm.title.trim()) { setNotice('请填写展项名称'); return; }
    setState(s => ({
      ...s,
      exhibits: [...s.exhibits, {
        id: nid('ex'), title: exForm.title.trim(), nodeId: exForm.nodeId,
        dwell: Math.max(1, Number(exForm.dwell) || 1), capacity: Math.max(1, Number(exForm.capacity) || 1),
      }],
    }));
    setExForm({ ...exForm, title: '' });
    setNotice('展项已登记');
  };

  const addBooking = () => {
    if (toMin(gForm.start) >= toMin(gForm.end)) { setNotice('团体时段的结束要晚于开始'); return; }
    setState(s => ({
      ...s,
      groupBookings: [...s.groupBookings, {
        id: nid('g'), exhibitId: gForm.exhibitId, date: gForm.date,
        start: gForm.start, end: gForm.end,
        size: Math.max(1, Number(gForm.size) || 1), name: gForm.name.trim() || '团体预约',
      }],
    }));
    setNotice('团体预约已登记，排路线时会自动错开');
  };

  const delBooking = id => setState(s => ({ ...s, groupBookings: s.groupBookings.filter(g => g.id !== id) }));

  const sortedTours = [...state.tours].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);

  return (
    <div className="rd">
      <header className="rd-top">
        <div>
          <button className="ghost" onClick={onBack}>← 返回展项内容</button>
          <span className="eyebrow rd-eyebrow">ACCESSIBLE ROUTE DESK</span>
          <h1>参观路线台</h1>
          <div className="rd-tabs">
            <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>排路线</button>
            <button className={tab === 'passages' ? 'on' : ''} onClick={() => setTab('passages')}>通道登记</button>
            <button className={tab === 'exhibits' ? 'on' : ''} onClick={() => setTab('exhibits')}>展项接待</button>
            <button className={tab === 'tours' ? 'on' : ''} onClick={() => setTab('tours')}>导览单{state.tours.length ? ` · ${state.tours.length}` : ''}</button>
          </div>
        </div>
        <div className="rd-summary">
          <span className={'badge ' + (blocked.length ? 'no' : 'ok')}>
            {blocked.length ? `当前 ${blocked.length} 条通道轮椅不可通行` : '全部通道轮椅可通行'}
          </span>
          <small>开馆 {toHM(OPEN_MIN)} – {toHM(CLOSE_MIN)} · 轮椅净宽 {W}cm</small>
        </div>
      </header>

      <main className="rd-body">
        {tab === 'plan' && (
          <>
            <div className="rd-grid">
              <section className="rd-card">
                <h3>{rescheduleId ? '改期重排（原时段已释放）' : '排一条轮椅路线'}</h3>
                <div className="rd-row">
                  <label>参观日期
                    <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                  </label>
                  <label>入馆时间
                    <input type="time" value={form.start} min={toHM(OPEN_MIN)} max={toHM(CLOSE_MIN)}
                      onChange={e => setForm({ ...form, start: e.target.value })} />
                  </label>
                </div>
                <div className="rd-row">
                  <label>同行人数（含轮椅访客）
                    <input type="number" min="1" max="20" value={form.partySize}
                      onChange={e => setForm({ ...form, partySize: e.target.value })} />
                  </label>
                  <label>轮椅所需净宽（cm）
                    <input type="number" min="50" max="200" value={W}
                      onChange={e => setState(s => ({ ...s, settings: { ...s.settings, wheelchairWidth: Number(e.target.value) || 75 } }))} />
                  </label>
                </div>
                <h4>选择要看的展项</h4>
                <div className="ex-check">
                  {state.exhibits.map(ex => {
                    const occupied = occupiedIntervals(state, ex.id, form.date);
                    const sel = form.exhibitIds.includes(ex.id);
                    return (
                      <label key={ex.id} className={sel ? 'sel' : ''}>
                        <input type="checkbox" checked={sel} onChange={() => toggleExhibit(ex.id)} />
                        <span>
                          <strong>《{ex.title}》</strong> · {nodeName(ex.nodeId)}
                          <small>停留 {ex.dwell} 分钟 · 同时容纳 {ex.capacity} 人</small>
                          {occupied.length > 0 && (
                            <small>
                              {occupied.map((o, i) => (
                                <span className="chip" key={i}>{o.label} {toHM(o.start)}–{toHM(o.end)} · {o.size}人</span>
                              ))}
                            </small>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="rd-actions" style={{ marginTop: 16 }}>
                  <button className="primary" disabled={!form.exhibitIds.length} onClick={generate}>
                    生成轮椅路线
                  </button>
                  {rescheduleId && (
                    <button className="secondary" onClick={() => { setRescheduleId(null); setNotice('已放弃改期，导览单仍为「改期中」，可到导览单页继续处理'); }}>
                      放弃改期
                    </button>
                  )}
                </div>
                {!form.exhibitIds.length && <div className="rd-note">先勾选展项再生成路线。</div>}
              </section>

              <section className="rd-card">
                <h3>当前通行状态</h3>
                {blocked.length === 0 && <div className="rd-empty">全部通道对轮椅开放（净宽 ≥ {W}cm）。</div>}
                {blocked.map(p => {
                  const b = blockedInfo(p, W);
                  return (
                    <div className="rd-blocked" key={p.id}>
                      <div>
                        <strong>{nodeName(p.from)} ↔ {nodeName(p.to)}</strong>
                        <small>{KIND_LABEL[p.kind]} · 净宽 {p.width}cm</small>
                      </div>
                      <span className="badge no">{b.reason}</span>
                    </div>
                  );
                })}
                <div className="rd-note">
                  排路线时自动绕开：临时封闭、台阶、净宽低于 {W}cm、电梯停用的通道；
                  被团体或已确认导览单占住的展项时段会自动错开。
                </div>
              </section>
            </div>

            {result && !result.ok && result.reason === 'unreachable' && (
              <section className="rd-card rd-warn">
                <h3>暂时没有可行的轮椅路线</h3>
                <p className="rd-p">
                  已保留你选择的 {form.exhibitIds.length} 个展项。处理下列断开的通道后，直接点「重新生成」即可。
                </p>
                <h4>无法到达的展项</h4>
                <div>{result.unreachableEx.map(ex => <span className="chip" key={ex.id}>《{ex.title}》 · {nodeName(ex.nodeId)}</span>)}</div>
                <h4>断开的通道（{result.breaks.length}）</h4>
                {result.breaks.length === 0
                  ? <div className="rd-empty">可达区与不可达区之间没有通道相连，请到「通道登记」补录。</div>
                  : (
                    <table className="rd-table">
                      <thead><tr><th>通道</th><th>类型</th><th>断开原因</th><th>处理建议</th></tr></thead>
                      <tbody>
                        {result.breaks.map(b => (
                          <tr key={b.passage.id}>
                            <td>{nodeName(b.passage.from)} ↔ {nodeName(b.passage.to)}</td>
                            <td>{KIND_LABEL[b.passage.kind]}</td>
                            <td><span className="badge no">{b.reason}</span></td>
                            <td className="rd-advice">{b.advice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                <div className="rd-actions" style={{ marginTop: 14 }}>
                  <button className="secondary" onClick={generate}>重新生成</button>
                  <button className="secondary" onClick={() => setTab('passages')}>去处理通道 →</button>
                </div>
              </section>
            )}

            {result && !result.ok && result.reason === 'capacity' && (
              <section className="rd-card rd-warn">
                <h3>当天排不下</h3>
                <p className="rd-p">
                  《{result.fullExhibit.title}》在 {toHM(OPEN_MIN)}–{toHM(CLOSE_MIN)} 内没有容得下 {form.partySize} 人的时段
                  （容量 {result.fullExhibit.capacity} 人，被团体或已确认导览单占满）。
                  已保留你的展项选择，可以改日期、减少展项，或先到「导览单」释放时段。
                </p>
                <div className="rd-actions">
                  <button className="secondary" onClick={generate}>重新生成</button>
                  <button className="secondary" onClick={() => setTab('tours')}>查看导览单 →</button>
                </div>
              </section>
            )}

            {result && !result.ok && result.reason === 'closing' && (
              <section className="rd-card rd-warn">
                <h3>超出闭馆时间</h3>
                <p className="rd-p">
                  按当前安排回到入口约 {toHM(result.endMin)}，晚于闭馆 {toHM(CLOSE_MIN)}。
                  已保留你的展项选择，请提前入馆时间或减少展项。
                </p>
                <div className="rd-actions"><button className="secondary" onClick={generate}>重新生成</button></div>
              </section>
            )}

            {result?.ok && (
              <section className="rd-card">
                <h3>可行路线 · 预计 {toHM(result.endMin)} 返回入口</h3>
                <div className="timeline">
                  <div className="tl-step">
                    <div className="tl-rail"><span className="tl-dot" /><span className="tl-line" /></div>
                    <div className="tl-body"><strong>{toHM(startMin)} · {nodeName(ENTRANCE_ID)} 出发</strong></div>
                  </div>
                  {result.visits.map((v, i) => {
                    const leg = result.legs[i];
                    const ex = exById[v.exhibitId];
                    return (
                      <React.Fragment key={v.exhibitId}>
                        <div className="tl-step">
                          <div className="tl-rail"><span className="tl-line" /></div>
                          <div className="tl-body">
                            <small>
                              步行 {leg.minutes} 分钟
                              {leg.path.length > 0 && ` · ${leg.path.map(p => `${KIND_LABEL[p.kind]}（净宽${p.width}cm）`).join(' → ')}`}
                            </small>
                          </div>
                        </div>
                        <div className="tl-step">
                          <div className="tl-rail"><span className="tl-dot amber" /><span className="tl-line" /></div>
                          <div className="tl-body">
                            <strong>{toHM(v.start)}–{toHM(v.end)} · 《{ex.title}》</strong>
                            <small>{nodeName(v.nodeId)} · 停留 {ex.dwell} 分钟 · 本团 {form.partySize} 人 / 容纳 {ex.capacity} 人</small>
                            {v.wait > 0 && <small className="wait">为避开已占用时段，等候 {v.wait} 分钟</small>}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div className="tl-step">
                    <div className="tl-rail"><span className="tl-line" /></div>
                    <div className="tl-body"><small>步行 {result.legs[result.legs.length - 1].minutes} 分钟 · 返回入口</small></div>
                  </div>
                  <div className="tl-step">
                    <div className="tl-rail"><span className="tl-dot" /></div>
                    <div className="tl-body"><strong>{toHM(result.endMin)} · 回到{nodeName(ENTRANCE_ID)}</strong></div>
                  </div>
                </div>
                <div className="rd-actions" style={{ marginTop: 16 }}>
                  <button className="primary" onClick={confirm}>确认导览单（确认后冻结）</button>
                  <button className="secondary" onClick={() => setResult(null)}>重新调整</button>
                </div>
                <div className="rd-note">
                  确认后导览单冻结，展项时段开始占用；如需改期，会「先释放原时段」再重排。
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'passages' && (
          <section className="rd-card">
            <h3>通道登记</h3>
            <p className="rd-p">
              登记每条通道的类型（坡道/台阶/平层/电梯）、净宽与电梯状态；临时封闭直接勾选并注明原因。
              判定列按当前轮椅净宽 <strong>{W}cm</strong> 实时计算。
            </p>
            <table className="rd-table">
              <thead>
                <tr><th>通道</th><th>类型</th><th>净宽 cm</th><th>长度 m</th><th>电梯状态</th><th>临时封闭</th><th>轮椅判定</th><th /></tr>
              </thead>
              <tbody>
                {state.passages.map(p => {
                  const b = blockedInfo(p, W);
                  return (
                    <tr key={p.id}>
                      <td className="rd-nowrap">{nodeName(p.from)} ↔ {nodeName(p.to)}</td>
                      <td>
                        <select value={p.kind} onChange={e => updPassage(p.id, 'kind', e.target.value)}>
                          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                      <td className="rd-num"><input type="number" min="0" value={p.width} onChange={e => updPassage(p.id, 'width', Number(e.target.value))} /></td>
                      <td className="rd-num"><input type="number" min="0" value={p.length} onChange={e => updPassage(p.id, 'length', Number(e.target.value))} /></td>
                      <td>
                        {p.kind === 'elevator' ? (
                          <select value={p.elevatorStatus || 'running'} onChange={e => updPassage(p.id, 'elevatorStatus', e.target.value)}>
                            <option value="running">运行中</option>
                            <option value="down">停用检修</option>
                          </select>
                        ) : '—'}
                      </td>
                      <td>
                        <label className="rd-inline">
                          <input type="checkbox" checked={p.closed} onChange={e => updPassage(p.id, 'closed', e.target.checked)} /> 封闭
                        </label>
                        {p.closed && (
                          <input placeholder="封闭原因 / 预计恢复" value={p.closedReason}
                            onChange={e => updPassage(p.id, 'closedReason', e.target.value)} />
                        )}
                      </td>
                      <td>{b ? <span className="badge no">{b.reason}</span> : <span className="badge ok">可通行</span>}</td>
                      <td><button className="btn-s danger" onClick={() => setState(s => ({ ...s, passages: s.passages.filter(x => x.id !== p.id) }))}>删</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h4>补录通道</h4>
            <div className="rd-row">
              <label>起点
                <select value={pForm.from} onChange={e => setPForm({ ...pForm, from: e.target.value })}>
                  {state.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </label>
              <label>终点
                <select value={pForm.to} onChange={e => setPForm({ ...pForm, to: e.target.value })}>
                  {state.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </label>
              <label>类型
                <select value={pForm.kind} onChange={e => setPForm({ ...pForm, kind: e.target.value })}>
                  {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label>净宽 cm<input type="number" min="0" value={pForm.width} onChange={e => setPForm({ ...pForm, width: e.target.value })} /></label>
              <label>长度 m<input type="number" min="0" value={pForm.length} onChange={e => setPForm({ ...pForm, length: e.target.value })} /></label>
              <button className="primary" onClick={addPassage}>登记通道</button>
            </div>
          </section>
        )}

        {tab === 'exhibits' && (
          <div className="rd-grid">
            <section className="rd-card">
              <h3>展项接待登记</h3>
              <table className="rd-table">
                <thead><tr><th>展项</th><th>所在展厅</th><th>停留时长（分）</th><th>同时容纳（人）</th><th /></tr></thead>
                <tbody>
                  {state.exhibits.map(ex => (
                    <tr key={ex.id}>
                      <td className="rd-nowrap">《{ex.title}》</td>
                      <td>
                        <select value={ex.nodeId} onChange={e => updExhibit(ex.id, 'nodeId', e.target.value)}>
                          {state.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                        </select>
                      </td>
                      <td className="rd-num"><input type="number" min="1" value={ex.dwell} onChange={e => updExhibit(ex.id, 'dwell', Math.max(1, Number(e.target.value) || 1))} /></td>
                      <td className="rd-num"><input type="number" min="1" value={ex.capacity} onChange={e => updExhibit(ex.id, 'capacity', Math.max(1, Number(e.target.value) || 1))} /></td>
                      <td><button className="btn-s danger" onClick={() => setState(s => ({ ...s, exhibits: s.exhibits.filter(x => x.id !== ex.id) }))}>删</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4>登记新展项</h4>
              <div className="rd-row">
                <label>展项名称<input value={exForm.title} placeholder="如：风中的标尺" onChange={e => setExForm({ ...exForm, title: e.target.value })} /></label>
                <label>所在展厅
                  <select value={exForm.nodeId} onChange={e => setExForm({ ...exForm, nodeId: e.target.value })}>
                    {state.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </label>
                <label>停留（分）<input type="number" min="1" value={exForm.dwell} onChange={e => setExForm({ ...exForm, dwell: e.target.value })} /></label>
                <label>容纳（人）<input type="number" min="1" value={exForm.capacity} onChange={e => setExForm({ ...exForm, capacity: e.target.value })} /></label>
                <button className="primary" onClick={addExhibit}>登记展项</button>
              </div>
            </section>

            <section className="rd-card">
              <h3>团体预约（占住展项时段）</h3>
              {state.groupBookings.length === 0 && <div className="rd-empty">暂无团体预约。</div>}
              {state.groupBookings.length > 0 && (
                <table className="rd-table">
                  <thead><tr><th>展项</th><th>日期</th><th>时段</th><th>人数</th><th>名称</th><th /></tr></thead>
                  <tbody>
                    {state.groupBookings.map(g => (
                      <tr key={g.id}>
                        <td className="rd-nowrap">《{exById[g.exhibitId]?.title || g.exhibitId}》</td>
                        <td>{g.date}</td>
                        <td>{g.start}–{g.end}</td>
                        <td>{g.size}</td>
                        <td>{g.name}</td>
                        <td><button className="btn-s danger" onClick={() => delBooking(g.id)}>删</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <h4>登记团体预约</h4>
              <div className="rd-row">
                <label>展项
                  <select value={gForm.exhibitId} onChange={e => setGForm({ ...gForm, exhibitId: e.target.value })}>
                    {state.exhibits.map(ex => <option key={ex.id} value={ex.id}>《{ex.title}》</option>)}
                  </select>
                </label>
                <label>日期<input type="date" value={gForm.date} onChange={e => setGForm({ ...gForm, date: e.target.value })} /></label>
                <label>开始<input type="time" value={gForm.start} onChange={e => setGForm({ ...gForm, start: e.target.value })} /></label>
                <label>结束<input type="time" value={gForm.end} onChange={e => setGForm({ ...gForm, end: e.target.value })} /></label>
                <label>人数<input type="number" min="1" value={gForm.size} onChange={e => setGForm({ ...gForm, size: e.target.value })} /></label>
                <label>名称<input value={gForm.name} placeholder="如：春田小学" onChange={e => setGForm({ ...gForm, name: e.target.value })} /></label>
                <button className="primary" onClick={addBooking}>登记预约</button>
              </div>
              <div className="rd-note">团体人数计入展项容量；剩余容量不足的时段，轮椅路线会自动错开。</div>
            </section>
          </div>
        )}

        {tab === 'tours' && (
          <div className="rd-tours">
            {sortedTours.length === 0 && (
              <section className="rd-card rd-empty">还没有导览单。到「排路线」生成并确认后会出现在这里。</section>
            )}
            {sortedTours.map(t => (
              <section className="tour-card" key={t.id}>
                <div className="tour-head">
                  <h4>{t.name}</h4>
                  {t.status === 'confirmed'
                    ? <span className="badge ok">已冻结 · 时段占用中</span>
                    : <span className="badge hold">改期中 · 原时段已释放</span>}
                </div>
                <div className="tour-visits">
                  <span>{t.date} · {toHM(t.startMin)} 出发 · 预计 {toHM(t.endMin)} 返回 · {t.partySize} 人</span>
                  {t.visits.map((v, i) => (
                    <span key={i}>{toHM(v.start)}–{toHM(v.end)} · 《{exById[v.exhibitId]?.title || v.exhibitId}》 @ {nodeName(v.nodeId)}</span>
                  ))}
                </div>
                <div className="rd-actions">
                  {t.status === 'confirmed' ? (
                    <>
                      <button className="btn-s dark" onClick={() => reschedule(t)}>改期（先释放原时段）</button>
                      <button className="btn-s danger" onClick={() => cancelTour(t)}>取消导览单</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-s dark" onClick={() => {
                        setForm({ date: t.date, start: toHM(t.startMin), partySize: t.partySize, exhibitIds: [...t.exhibitIds] });
                        setRescheduleId(t.id);
                        setResult(null);
                        setTab('plan');
                      }}>继续排程</button>
                      <button className="btn-s danger" onClick={() => cancelTour(t)}>删除</button>
                    </>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
