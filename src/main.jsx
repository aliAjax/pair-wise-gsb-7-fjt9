import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import RouteDesk from './RouteDesk.jsx';
import {loadJSON,seedBookings,seedExhibits,seedPassages,seedSpots} from './data.js';

const loadExhibits=()=>{
  const raw=loadJSON('guide-exhibits',seedExhibits);
  const fallbackDwell=[10,8,12];
  // 兼容旧数据：补全停留时长与容纳人数
  return raw.map((x,i)=>({
    ...x,
    dwellMin:Number.isFinite(+x.dwellMin)?+x.dwellMin:fallbackDwell[i%3],
    capacity:Number.isFinite(+x.capacity)?+x.capacity:12,
  }));
};

function App(){
 const [exhibits,setExhibits]=useState(loadExhibits);
 const [spots,setSpots]=useState(()=>loadJSON('guide-spots',seedSpots));
 const [passages,setPassages]=useState(()=>loadJSON('guide-passages',seedPassages));
 const [bookings,setBookings]=useState(()=>loadJSON('guide-bookings',seedBookings));
 const [tours,setTours]=useState(()=>loadJSON('guide-tours',[]));
 const [selected,setSelected]=useState(exhibits[0]?.id);
 const [view,setView]=useState('edit');const [filter,setFilter]=useState('全部');
 const [form,setForm]=useState({title:'',room:'',type:'装置',desc:'',audio:'',dwellMin:10,capacity:12});
 const [notice,setNotice]=useState('');
 const notify=m=>setNotice(m);
 useEffect(()=>{const t=setTimeout(()=>setNotice(''),2600);return ()=>clearTimeout(t)},[notice]);
 useEffect(()=>localStorage.setItem('guide-exhibits',JSON.stringify(exhibits)),[exhibits]);
 useEffect(()=>localStorage.setItem('guide-spots',JSON.stringify(spots)),[spots]);
 useEffect(()=>localStorage.setItem('guide-passages',JSON.stringify(passages)),[passages]);
 useEffect(()=>localStorage.setItem('guide-bookings',JSON.stringify(bookings)),[bookings]);
 useEffect(()=>localStorage.setItem('guide-tours',JSON.stringify(tours)),[tours]);

 const visible=useMemo(()=>filter==='全部'?exhibits:exhibits.filter(x=>x.status===filter),[exhibits,filter]);
 const current=exhibits.find(x=>x.id===selected)||exhibits[0];
 const add=()=>{if(!form.title.trim())return;const item={...form,id:Date.now(),dwellMin:+form.dwellMin||10,capacity:+form.capacity||12,status:'草稿',color:['#e6b45d','#ef8f84','#83b9b1','#9ba7dc'][exhibits.length%4]};setExhibits([...exhibits,item]);setSelected(item.id);setForm({title:'',room:'',type:'装置',desc:'',audio:'',dwellMin:10,capacity:12});setNotice('展项已保存为草稿');};
 const update=(k,v)=>setExhibits(exhibits.map(x=>x.id===current.id?{...x,[k]:v}:x));
 const publish=()=>{update('status',current.status==='已发布'?'草稿':'已发布');setNotice(current.status==='已发布'?'已撤回发布':'已发布，访客预览已更新');};
 const exportData=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(exhibits,null,2)],{type:'application/json'}));a.download='exhibition-guide.json';a.click();setNotice('已导出展项数据');};

 if(view==='visitor') return <div className="visitor"><header><div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div><button className="ghost" onClick={()=>setView('edit')}>返回编辑</button></header><main className="visitor-main"><span className="eyebrow">VISITOR GUIDE / 2024</span><h1>沿着作品，<em>走进</em>另一种时间。</h1><p className="lead">当你靠近一件作品，它的故事就开始流动。选择一个展项开始探索。</p><div className="visitor-grid">{exhibits.filter(x=>x.status==='已发布').map(x=><article className="visitor-card" key={x.id} onClick={()=>{setSelected(x.id);setView('detail')}}><div className="art" style={{background:x.color}}><span>{String(x.id).padStart(2,'0')}</span><i>↗</i></div><div className="card-meta"><small>{x.room}</small><h3>{x.title}</h3><p>{x.desc}</p></div></article>)}</div></main></div>;
 if(view==='detail'&&current)return <div className="visitor"><header><div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div><button className="ghost" onClick={()=>setView('visitor')}>← 全部展项</button></header><main className="detail"><div className="detail-art" style={{background:current.color}}><span>{String(current.id).padStart(2,'0')}</span></div><div className="detail-copy"><span className="eyebrow">{current.room} / {current.type}</span><h1>{current.title}</h1><p>{current.desc}</p>{current.audio&&<button className="audio" onClick={()=>setNotice('正在播放导览音频…')}>▶ 播放语音导览</button>}<div className="qr"><div className="qr-box">▦</div><div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div></div></div></main>{notice&&<div className="toast">{notice}</div>}</div>;

 const navBtn=(key,icon,label,badge)=>(
   <button className={view===key?'active':''} onClick={()=>setView(key)}>{icon} <span>{label}</span>{badge!=null&&<b>{badge}</b>}</button>
 );

 return <div className="app"><aside><div className="brand"><span className="mark">M</span><span>展览工作台</span></div><div className="side-label">当前项目</div><div className="project"><span className="project-dot"></span><div><strong>潮汐之后</strong><small>2024 春季展</small></div><span>⌄</span></div><nav>
   {navBtn('edit','▧','展项内容',exhibits.length)}
   {navBtn('routes','⌁','参观路线台')}
   <button>◉ <span>二维码</span></button>
 </nav><div className="side-foot"><button>⚙ 设置</button><small>已自动保存 · 刚刚</small></div></aside>
 <main className="workspace">
 {view==='routes'?(
   <>
   <header className="topbar"><div><span className="eyebrow">ACCESSIBLE ROUTING</span><h1>参观路线台</h1></div><div className="top-actions"><button className="secondary" onClick={()=>setView('visitor')}>◉ 访客预览</button></div></header>
   <RouteDesk exhibits={exhibits} spots={spots} setSpots={setSpots} passages={passages} setPassages={setPassages} bookings={bookings} setBookings={setBookings} tours={tours} setTours={setTours} notify={notify}/>
   </>
 ):(
 <>
 <header className="topbar"><div><span className="eyebrow">EXHIBITION BUILDER</span><h1>展项内容</h1></div><div className="top-actions"><button className="secondary" onClick={exportData}>↓ 导出 JSON</button><button className="secondary" onClick={()=>setView('visitor')}>◉ 访客预览</button><button className="primary" onClick={publish}>{current?.status==='已发布'?'撤回发布':'发布更新'} <span>↗</span></button></div></header><div className="content"><section className="list-pane"><div className="list-head"><div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div><button className="add-btn" onClick={()=>document.querySelector('.form-panel').scrollIntoView({behavior:'smooth'})}>＋ 添加展项</button></div><div className="filters">{['全部','已发布','草稿'].map(x=><button className={filter===x?'selected':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div><div className="exhibit-list">{visible.map(x=><button className={'exhibit-row '+(selected===x.id?'chosen':'')} key={x.id} onClick={()=>setSelected(x.id)}><span className="thumb" style={{background:x.color}}>{String(x.id).padStart(2,'0')}</span><span className="row-copy"><strong>{x.title}</strong><small>{x.room} · {x.type} · 停留{x.dwellMin}′ · 容{x.capacity}人</small></span><span className={'status '+(x.status==='已发布'?'live':'draft')}>{x.status}</span><span className="chev">›</span></button>)}</div></section><section className="form-panel"><div className="panel-title"><div><span className="eyebrow">EDIT EXHIBIT</span><h2>编辑展项</h2></div><span className={'status '+(current?.status==='已发布'?'live':'draft')}>{current?.status}</span></div>{current&&<div className="editor"><label>展项标题<input value={current.title} onChange={e=>update('title',e.target.value)}/></label><div className="two"><label>所在展厅<input value={current.room} onChange={e=>update('room',e.target.value)}/></label><label>内容类型<select value={current.type} onChange={e=>update('type',e.target.value)}><option>装置</option><option>档案</option><option>互动</option><option>绘画</option></select></label></div><div className="two"><label>建议停留时长（分钟）<input type="number" min="1" value={current.dwellMin} onChange={e=>update('dwellMin',Math.max(1,+e.target.value||1))}/></label><label>同时容纳人数<input type="number" min="1" value={current.capacity} onChange={e=>update('capacity',Math.max(1,+e.target.value||1))}/></label></div><label>展项介绍<textarea rows="5" value={current.desc} onChange={e=>update('desc',e.target.value)}/></label><label>语音导览 URL<input value={current.audio} placeholder="https://…" onChange={e=>update('audio',e.target.value)}/><small className="hint">访客扫描二维码后可播放；停留时长与容纳人数用于参观路线台排期</small></label><div className="preview-block"><div className="preview-heading"><span>二维码预览</span><button onClick={()=>setNotice('二维码链接已复制')}>复制链接</button></div><div className="qr-preview"><div className="qr-box big">▦</div><div><strong>展项-{String(current.id).padStart(3,'0')}</strong><small>/guide/{current.id}</small></div></div></div></div>}<div className="new-form"><div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div><div className="two"><input placeholder="展项标题" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input placeholder="展厅编号" value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/></div><div className="two"><input type="number" min="1" placeholder="停留时长(分)" value={form.dwellMin} onChange={e=>setForm({...form,dwellMin:e.target.value})}/><input type="number" min="1" placeholder="容纳人数" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/></div><textarea placeholder="一句话介绍…" rows="2" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/><button className="primary full" onClick={add}>保存新展项</button></div></section></div>
 </>
 )}
 </main>{notice&&<div className="toast">{notice}</div>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
