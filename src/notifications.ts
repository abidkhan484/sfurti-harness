import { createHash } from 'node:crypto';
import type { Context } from './types.ts';
import { today } from './types.ts';

export async function enqueueNotification(ctx:Context,event:unknown) {
  const id=createHash('sha256').update(`${today(ctx)}:${JSON.stringify(event)}`).digest('hex');
  ctx.store.transaction(()=>{
    if(!ctx.store.get('notifications',id)) ctx.store.put('notifications',{id,event,status:'pending',createdAt:ctx.now().toISOString(),attempts:0});
  });
  await drainNotifications(ctx,id);
}

/** Transports must deduplicate idempotencyKey when a response is lost after delivery. */
export async function drainNotifications(ctx:Context,onlyId?:string) {
  if(!ctx.adapters.delivery?.send) return {sent:0,pending:ctx.store.all('notifications').filter(n=>n.status!=='sent').length};
  let sent=0;
  const candidates=ctx.store.all('notifications').filter(n=>n.status!=='sent'&&(!onlyId||n.id===onlyId)).slice(0,ctx.config.limits.maxTasksPerTick);
  for(const candidate of candidates) {
    const owner=ctx.id();
    const record=ctx.store.transaction(()=>{
      const fresh=ctx.store.get('notifications',candidate.id)!;
      if(fresh.status==='sent'||(fresh.status==='sending'&&Date.parse(fresh.leaseUntil)>ctx.now().getTime())) return undefined;
      return ctx.store.put('notifications',{...fresh,event:fresh.event,status:'sending',owner,attempts:fresh.attempts+1,leaseUntil:new Date(ctx.now().getTime()+ctx.config.limits.leaseMs).toISOString()});
    });
    if(!record) continue;
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    let lastError:string|undefined;
    try {
      await Promise.race([
        ctx.adapters.delivery.send(record.event,{idempotencyKey:record.id,signal:controller.signal}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Delivery timeout; transport must reconcile the same idempotency key'));},ctx.config.limits.taskTimeoutMs);}),
      ]);
      sent++;
    } catch(error) {lastError=String(error);}
    finally {if(timer)clearTimeout(timer);}
    ctx.store.transaction(()=>{
      if(ctx.store.get('notifications',record.id)?.owner===owner) ctx.store.put('notifications',{...record,status:lastError?'pending':'sent',lastError,owner:null});
    });
  }
  return {sent,pending:ctx.store.all('notifications').filter(n=>n.status!=='sent').length};
}
