"use client";
import { useEffect, useState } from 'react';
import { Billing } from "./billing";
import { Team } from "./team";
import { api, type CurrentUser } from '../lib/api';
import { addDays, command, companyDay, monday, type Allocation, type Catalog, type Named } from '../lib/operations';

export function Operations({ me }: { me: CurrentUser }) {
  const [tab, setTab] = useState('');
  return <section className="operations" aria-label="Operação">
    <nav className="operation-tabs" aria-label="Áreas de trabalho">
      <button onClick={() => setTab('planning')} aria-pressed={tab === 'planning'}>Distribuição</button>
      <button onClick={() => setTab('team')} aria-pressed={tab === 'team'}>Equipa e pendências</button>
      {me.role === 'admin' && <button onClick={() => setTab('billing')} aria-pressed={tab === 'billing'}>Preços e rascunhos</button>}
      {me.role === 'admin' && <button onClick={() => setTab('catalog')} aria-pressed={tab === 'catalog'}>Cadastros</button>}
    </nav>
    {tab === 'billing' ? <Billing key={me.id + tab} me={me}/> : tab === 'team' ? <Team key={me.id + tab} me={me}/> : tab && <CatalogArea key={me.id + tab} me={me} planning={tab === 'planning'} />}
  </section>;
}
export function Choices({ items, empty = 'Selecionar…' }: { items: Named[] | {id:number; name:string}[]; empty?: string }) {
  return <><option value="">{empty}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</>;
}
function CatalogArea({ me, planning }: { me: CurrentUser; planning: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Catalog>('/catalog', me.id, controller.signal).then(setCatalog).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [me.id, revision]);
  return <>{error && <p role="alert">{error}</p>}{!catalog ? <p>A carregar cadastros…</p> : planning ? <Planning me={me} catalog={catalog}/> : <CatalogEditor me={me} catalog={catalog} refresh={() => refresh(n => n + 1)}/>}</>;
}
function CatalogEditor({ me, catalog, refresh }: { me: CurrentUser; catalog: Catalog; refresh: () => void }) {
  const [kind, setKind] = useState<'workers'|'trades'|'clients'|'sites'>('workers');
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const item = catalog[kind].find(i => i.id === editing);
  async function save(form: HTMLFormElement) {
    setBusy(true); setMessage('');
    const data = Object.fromEntries(new FormData(form));
    const payload = { ...data, active: data.active === 'on', ...Object.fromEntries(['tradeId','clientId','userId'].filter(k => data[k]).map(k => [k, Number(data[k])])) };
    try { await command(me.id, '/catalog/' + kind + (editing ? '/' + editing : ''), editing ? 'PATCH' : 'POST', payload); setEditing(null); form.reset(); refresh(); setMessage('Cadastro guardado.'); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return <div><h2>Cadastros da empresa</h2>
    <label>Cadastro<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setEditing(null); }}><option value="workers">Trabalhadores</option><option value="trades">Ofícios</option><option value="clients">Clientes</option><option value="sites">Obras</option></select></label>
    <form className="operation-form" key={kind + String(editing)} onSubmit={e => { e.preventDefault(); void save(e.currentTarget); }}>
      <label>Nome<input name="name" required maxLength={500} defaultValue={item?.name}/></label>
      <label><input type="checkbox" name="active" defaultChecked={item?.active ?? true}/> Ativo</label>
      {kind === 'workers' && <><label>Ofício habitual<select name="tradeId" required defaultValue={item && 'tradeId' in item ? String(item.tradeId) : ''}><Choices items={catalog.trades.filter(t => t.active)}/></select></label><label>Utilizador<select name="userId" defaultValue={item && 'userId' in item ? String(item.userId ?? '') : ''}><Choices items={catalog.users.filter(u => u.role === 'worker')} empty="Sem utilizador"/></select></label></>}
      {kind === 'clients' && <><label>NIF<input name="taxId" defaultValue={item && 'taxId' in item ? String(item.taxId) : ''}/></label><label>Utilizador cliente<select name="userId" defaultValue={item && 'userId' in item ? String(item.userId ?? '') : ''}><Choices items={catalog.users.filter(u=>u.role==='client')} empty="Sem utilizador"/></select></label></>}
      {kind === 'sites' && <><label>Cliente<select name="clientId" required defaultValue={item && 'clientId' in item ? String(item.clientId ?? '') : ''}><Choices items={catalog.clients.filter(c => c.active)}/></select></label><label>Local<input name="location" defaultValue={item && 'location' in item ? String(item.location) : ''}/></label></>}
      <button className="primary" disabled={busy}>{editing ? 'Guardar alterações' : 'Criar'}</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancelar</button>}
    </form>
    {message && <p role="status">{message}</p>}
    <ul className="record-list">{catalog[kind].map(i => <li key={i.id}><span>{i.name} · {i.active ? 'Ativo' : 'Inativo'}</span><button onClick={() => setEditing(i.id)}>Editar {i.name}</button></li>)}</ul>
    <h3>Responsabilidade por obra</h3><form className="operation-form" onSubmit={async e => { e.preventDefault(); const f=e.currentTarget; const data=Object.fromEntries(new FormData(f)); setBusy(true); try { await command(me.id,'/catalog/responsibilities','POST',{...data,siteId:Number(data.siteId),userId:Number(data.userId)}); refresh(); setMessage('Responsabilidade guardada.'); } catch(error) { setMessage((error as Error).message); } finally { setBusy(false); } }}>
      <label>Obra<select name="siteId" required><Choices items={catalog.sites}/></select></label><label>Encarregado<select name="userId" required><Choices items={catalog.users.filter(u => u.role === 'foreman')}/></select></label>
      <label>Desde<input name="startsOn" type="date" required/></label><label>Até<input name="endsOn" type="date"/></label><button disabled={busy}>Guardar responsabilidade</button>
    </form>
    <ul>{catalog.responsibilities.map(r => <li key={r.id}>{catalog.sites.find(s=>s.id===r.siteId)?.name} · {catalog.users.find(u=>u.id===r.userId)?.name} · {r.startsOn.slice(0,10)} até {r.endsOn?.slice(0,10) ?? 'sem fim'}</li>)}</ul>
  </div>;
}
function Planning({ me, catalog }: { me: CurrentUser; catalog: Catalog }) {
  const today=companyDay(me.time_zone);
  const [week,setWeek]=useState(monday(today)), [cells,setCells]=useState<Allocation[]>([]), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [revision,refresh]=useState(0);
  const [edit,setEdit]=useState<{workerId:number;day:string;siteId?:number;tradeId?:number|null}|null>(null);
  useEffect(()=>{ const c=new AbortController(); api<Allocation[]>('/planning?week='+week,me.id,c.signal).then(setCells).catch(e=>{if(!c.signal.aborted)setMessage(e.message);}); return ()=>c.abort(); },[me.id,week,revision]);
  const days=Array.from({length:7},(_,i)=>addDays(week,i));
  return <div><h2>Distribuição semanal</h2><div className="operation-tabs"><button onClick={()=>setWeek(addDays(week,-7))}>Semana anterior</button><strong>{week}</strong><button onClick={()=>setWeek(addDays(week,7))}>Semana seguinte</button><button disabled={busy} onClick={async()=>{setBusy(true);try {const r=await command<{copied:number;skipped:{reason:string}[]}>(me.id,'/planning/copy','POST',{week});setMessage(`${r.copied} células copiadas. ${r.skipped.map(s=>s.reason).join(' ')}`);refresh(n=>n+1);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Copiar semana anterior</button></div>
    <div className="table-scroll"><table><thead><tr><th>Trabalhador</th>{days.map(d=><th key={d}>{d.slice(5)}</th>)}</tr></thead><tbody>{catalog.workers.filter(w=>w.active).map(w=><tr key={w.id}><th>{w.name}</th>{days.map(day=>{const cell=cells.find(c=>c.workerId===w.id&&c.day.startsWith(day));return <td key={day}><button disabled={day<today} onClick={()=>setEdit({workerId:w.id,day,siteId:cell?.siteId,tradeId:cell?.tradeId})}>{cell ? catalog.sites.find(s=>s.id===cell.siteId)?.name : 'Livre'}{cell?.tradeId && <small>{catalog.trades.find(t=>t.id===cell.tradeId)?.name}</small>}</button></td>;})}</tr>)}</tbody></table></div>
    {edit && <form className="operation-form" key={edit.workerId+edit.day} onSubmit={async e=>{e.preventDefault();setBusy(true);const data=Object.fromEntries(new FormData(e.currentTarget));try{await command(me.id,'/planning','PUT',{workerId:edit.workerId,day:edit.day,siteId:Number(data.siteId),tradeId:data.tradeId?Number(data.tradeId):null});setEdit(null);refresh(n=>n+1);setMessage('Distribuição guardada.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}}>
      <p>{catalog.workers.find(w=>w.id===edit.workerId)?.name} · {edit.day}</p><label>Obra<select name="siteId" required defaultValue={edit.siteId??''}><Choices items={catalog.sites.filter(s=>s.active)}/></select></label><label>Ofício<select name="tradeId" defaultValue={edit.tradeId??''}><Choices items={catalog.trades.filter(t=>t.active)} empty="Ofício habitual"/></select></label><button disabled={busy}>Guardar distribuição</button><button type="button" onClick={()=>setEdit(null)}>Cancelar</button>
    </form>}{message && <p role="status">{message}</p>}
  </div>;
}
