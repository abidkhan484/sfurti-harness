import type { Context, Command } from './types.ts';
import { createHash } from 'node:crypto';
import { today } from './types.ts';
import { production } from './production.ts';

type Execute = (command:Command)=>Promise<any>;
const kinds = {video:'videos',image:'images',text:'texts'} as const;

/** Durable jobs own intent; each produced artifact owns its independently recoverable stages. */
export async function request(ctx:Context, command:Command, execute:Execute) {
  const id=command.requestId??ctx.id();
  if(typeof id!=='string'||!id) throw new Error('Request ID required');
  let job=ctx.store.get('jobs',id);
  const counts={video:command.videos??(command.kind==='video'?1:0),image:command.images??(command.kind==='image'?1:0),text:command.texts??(command.kind==='text'?1:0)};
  if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)||Object.values(counts).reduce((a,b)=>a+b,0)===0) throw new Error('Custom request requires positive content counts');
  if(Object.values(counts).reduce((a,b)=>a+b,0)>ctx.config.limits.maxTasksPerTick) throw new Error('Custom request exceeds configured workload; split into bounded requests');
  const fingerprint=createHash('sha256').update(JSON.stringify({counts,topic:command.topic,ageSegment:command.ageSegment,sourceId:command.sourceId,segments:command.segments,schedule:command.schedule===true})).digest('hex');
  if(job&&job.fingerprint!==fingerprint) throw new Error('Request ID belongs to different custom work');
  if(!job) job=ctx.store.put('jobs',{id,fingerprint,origin:'custom',status:'pending',counts,command:{...command,requestId:id},createdAt:ctx.now().toISOString()});
  if(job.status==='complete') return job;
  // Tick is the single serialized workload owner; custom work remains separate from daily targets.
  await tick(ctx,{type:'tick',customOnly:true},execute);
  return ctx.store.get('jobs',id);
}

export async function tick(ctx:Context, command:Command, execute:Execute) {
  const owner=ctx.id();
  const id='coordinator';
  const acquired=ctx.store.transaction(()=>{
    const previous=ctx.store.get('jobs',id);
    if(previous?.status==='running'&&Date.parse(previous.leaseUntil)>ctx.now().getTime()) return false;
    ctx.store.put('jobs',{id,origin:'coordinator',status:'running',owner,leaseUntil:new Date(ctx.now().getTime()+ctx.config.limits.leaseMs).toISOString()});
    return true;
  });
  if(!acquired) return {status:'busy',produced:0};
  let heartbeatFailed=false;
  const renew=()=>ctx.store.transaction(()=>{
    const job=ctx.store.get('jobs',id);
    if(job?.owner!==owner) throw new Error('Coordinator ownership lost');
    ctx.store.put('jobs',{...job,leaseUntil:new Date(ctx.now().getTime()+ctx.config.limits.leaseMs).toISOString()});
  });
  const heartbeat=setInterval(()=>{try{renew();}catch{heartbeatFailed=true;/* Ownership loss detected; fenced at next explicit guardedRenew(). */}},Math.max(100,Math.floor(ctx.config.limits.leaseMs/3)));
  const guardedRenew=()=>{if(heartbeatFailed)throw new Error('Coordinator ownership lost (heartbeat failed)');renew();};
  let produced=0, attempted=0;
  const failures:string[]=[];
  try {
    const pending=ctx.store.all('jobs').filter(j=>j.origin==='custom'&&['pending','running'].includes(j.status));
    for(const job of pending) {
      guardedRenew();
      const results=[];
      for(const kind of Object.keys(kinds) as Array<keyof typeof kinds>) {
        for(let index=0;index<job.counts[kind];index++) {
          if(attempted>=ctx.config.limits.maxTasksPerTick) break;
          attempted++;
          const artifact:any=await production(ctx,{...job.command,type:'produce',origin:'custom',kind,requestId:`${job.id}:${kind}:${index}`});
          results.push(artifact.id);
          if(artifact.status==='approved') {
            produced++;
            if(job.command.schedule===true) await execute({type:'schedule-custom',artifactId:artifact.id,date:job.command.date});
          }
        }
      }
      ctx.store.transaction(()=>{
        const artifacts=ctx.store.all('artifacts').filter(a=>typeof a.requestId==='string'&&a.requestId.startsWith(`${job.id}:`));
        const expected=Object.values(job.counts as Record<string,number>).reduce((a,b)=>a+b,0);
        const complete=artifacts.length===expected&&artifacts.every(a=>['approved','failed'].includes(a.status));
        ctx.store.put('jobs',{...job,status:complete?'complete':'pending',artifactIds:artifacts.map(a=>a.id)});
      });
    }
    if(command.customOnly) return {status:'complete',produced,attempted,failures};
    const date=today(ctx);
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:ctx.config.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(ctx.now());
    const opportunityId=`daily-opportunity:${date}:${time}`;
    const dailyDue=ctx.store.transaction(()=>{
      if(command.daily!==true&&(!ctx.config.daily.productionTimes.includes(time)||ctx.store.get('meta',opportunityId)))return false;
      ctx.store.put('meta',{id:opportunityId,date,time,forced:command.daily===true,consumedAt:ctx.now().toISOString()});
      return true;
    });
    const snapshot=dailyDue?await execute({type:'daily-snapshot'}):ctx.store.get('plans',date);
    let coverage=await execute({type:'plan'});
    await reportSelections(ctx,date);
    // Plan farther when approved coverage reaches the minimum; the floor never caps production.
    const enabled=ctx.config.daily.videos+ctx.config.daily.images+ctx.config.daily.texts>0;
    const days=enabled&&coverage.completeDays>=ctx.config.reserve.minimumDays ? Math.min(3650,Math.max(ctx.config.reserve.minimumDays+1,ctx.store.all('plans').filter(p=>p.date>=today(ctx)).length+1)):ctx.config.reserve.minimumDays;
    if(days>coverage.days.length) coverage=await execute({type:'plan',days});
    // Pre-load read-only snapshots; refresh after each production write to see new data.
    let allArtifacts:any[]=ctx.store.all('artifacts');
    let allSources:any[]=ctx.store.all('sources');
    let allSegments:any[]=ctx.store.all('segments');
    const refreshSnapshots=()=>{allArtifacts=ctx.store.all('artifacts');allSources=ctx.store.all('sources');allSegments=ctx.store.all('segments');};
    let discoveryAttempted=false;
    for(const day of coverage.days) {
      if(attempted>=ctx.config.limits.maxTasksPerTick) break;
      const isToday=day.date===today(ctx);
      if(isToday&&!dailyDue)continue;
      const effective=isToday?snapshot!.config:ctx.config;
      for(const kind of Object.keys(kinds) as Array<keyof typeof kinds>) {
        const accepted=allArtifacts.filter(a=>a.date===day.date&&a.kind===kind&&a.topic===effective.topic&&a.status==='approved'&&a.origin!=='custom').length;
        for(let slot=0;slot<(day.missing?.[kind]??0);slot++) {
          if(attempted>=ctx.config.limits.maxTasksPerTick) break;
          guardedRenew();
          const requestId=`daily:${day.date}:${kind}:${accepted+slot}:${effective.topic}`;
          const existing=allArtifacts.find(a=>a.requestId===requestId);
          if(existing?.status==='failed') continue; // Explicit retry owns exhausted candidates.
          let source:any;
          if(kind==='video'&&!existing) {
            const eligible=()=>allSources.find(s=>s.status==='cleared'&&s.metadata?.qualified===true&&
              (s.metadata.topic===effective.topic||s.metadata.topics?.includes(effective.topic))&&s.metadata.segments?.length&&
              !allArtifacts.some(a=>a.date===day.date&&a.status!=='failed'&&a.sourceIds?.includes(s.id))&&
              !allSegments.some(segment=>segment.sourceId===s.id&&s.metadata.segments.some((s:any)=>s.startMs<segment.endMs&&segment.startMs<s.endMs)));
            source=eligible();
            if(!source&&!discoveryAttempted&&ctx.adapters.discovery) {
              discoveryAttempted=true;attempted++;
              await production(ctx,{type:'discover',topic:effective.topic});
              refreshSnapshots();
              source=eligible();
            }
            if(!source) {failures.push(`${day.date}: no qualified cleared video source`);break;}
          }
          attempted++;
          const artifact:any=await production({...ctx,config:effective},{type:'produce',kind,origin:isToday?'daily':'reserve',date:day.date,topic:effective.topic,requestId,sourceId:existing?.sourceIds[0]??source?.id,segments:existing?.segments??source?.metadata.segments});
          refreshSnapshots();
          if(artifact.status==='approved') produced++;
          if(artifact.status==='deferred') return {status:'deferred',produced,attempted,reason:artifact.reason};
          if(artifact.status==='failed') failures.push(`${artifact.id}: ${artifact.lastError}`);
        }
      }
      // Re-query missing quotas after each package to avoid overproducing accepted work.
    }
    coverage=await execute({type:'plan',days});
    await reportSelections(ctx,date);
    const uniqueFailures=[...new Set(failures)].sort();
    const digest=createHash('sha256').update(JSON.stringify({completeDays:coverage.completeDays,missing:coverage.days.map((d:any)=>[d.date,d.missing]),failures:uniqueFailures})).digest('hex');
    if(produced>0||ctx.store.get('meta','reserve-summary')?.digest!==digest) {
      await ctx.notify({type:'reserve-summary',produced,completeDays:coverage.completeDays,failures:uniqueFailures});
      ctx.store.put('meta',{id:'reserve-summary',digest,reportedAt:ctx.now().toISOString()});
    }
    return {status:'complete',produced,attempted,coverage,failures:[...new Set(failures)]};
  } catch(error) {
    await ctx.notify({type:'coordinator-failed',message:String(error)});
    throw error;
  } finally {
    clearInterval(heartbeat);
    const job=ctx.store.get('jobs',id);
    if(job?.owner===owner) ctx.store.put('jobs',{...job,status:'complete',leaseUntil:ctx.now().toISOString(),produced,attempted});
  }
}

async function reportSelections(ctx:Context,date:string) {
  if(!ctx.store.get('plans',date)?.snapshotSealed)return;
  const posts=ctx.store.all('posts').filter(p=>p.date===date&&p.origin!=='custom'&&!['cancelled','failed'].includes(p.status)).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)).map(p=>{
    const artifact=ctx.store.get('artifacts',p.artifactId)!;
    return {artifactId:p.artifactId,scheduledAt:p.scheduledAt,filePath:artifact.filePath,caption:artifact.caption};
  });
  if(!posts.length)return;
  const digest=createHash('sha256').update(JSON.stringify(posts)).digest('hex'), id=`daily-selected:${date}`;
  if(ctx.store.get('meta',id)?.digest===digest)return;
  await ctx.notify({type:'daily-selected',date,posts});
  ctx.store.put('meta',{id,digest,reportedAt:ctx.now().toISOString()});
}
