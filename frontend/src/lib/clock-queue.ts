import { api } from './api';
export interface LocalEvent { id: string; shiftId: string; siteId: number; kind: 'in'|'out'; occurredAt: string; userId: number }
export interface ActiveShift { shiftId: string; siteId: number; startAt: string }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('fonsat-clock-v1',1);
    request.onupgradeneeded=()=>{ const db=request.result; const events=db.createObjectStore('events',{keyPath:'id'});events.createIndex('userId','userId');db.createObjectStore('sessions',{keyPath:'userId'}); };
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(new Error('Não foi possível abrir a fila local. A marcação não foi registada.'));
  });
}
async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction)=>IDBRequest<T>):Promise<T> {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);const request=work(tx);let result:T;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Falha no armazenamento local. Tente novamente.'));};});
}
export const queuedEvents=(userId:number)=>transaction<LocalEvent[]>(['events'],'readonly',tx=>tx.objectStore('events').index('userId').getAll(userId));
export const readShift=(userId:number)=>transaction<{userId:number;active:ActiveShift|null}|undefined>(['sessions'],'readonly',tx=>tx.objectStore('sessions').get(userId));
export const saveShift=(userId:number,active:ActiveShift|null)=>transaction(['sessions'],'readwrite',tx=>tx.objectStore('sessions').put({userId,active}));
export async function enqueue(event:LocalEvent,active:ActiveShift|null) {
  await transaction(['events','sessions'],'readwrite',tx=>{tx.objectStore('sessions').put({userId:event.userId,active});return tx.objectStore('events').add(event);});
}
const flushing=new Map<number,Promise<{pending:number;message:string}>>();
export function flushQueue(userId:number, signal?:AbortSignal) {
  const running=flushing.get(userId); if(running)return running;
  const run=(async()=>{
    const all=await queuedEvents(userId); let message='';
    for(let offset=0;offset<all.length;offset+=100){
      const batch=all.slice(offset,offset+100);
      const response=await api<{results:{id:string;accepted:boolean;message?:string}[]}>('/attendance/sync',userId,signal,{method:'POST',body:JSON.stringify({events:batch.map(({userId:_,...e})=>e)})});
      const accepted=response.results.filter(r=>r.accepted && batch.some(e=>e.id===r.id)).map(r=>r.id);
      if(accepted.length)await transaction(['events'],'readwrite',tx=>{for(const id of accepted.slice(0,-1))tx.objectStore('events').delete(id);return tx.objectStore('events').delete(accepted[accepted.length-1]);});
      message=response.results.filter(r=>!r.accepted).map(r=>r.message).join(' ');
    }
    return {pending:(await queuedEvents(userId)).length,message};
  })().finally(()=>flushing.delete(userId));
  flushing.set(userId,run);return run;
}
