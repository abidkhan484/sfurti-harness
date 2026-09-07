import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from '../src/app.ts';

test('empty library reports actual missing daily content across 90 days', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sfurti-plan-'));
  const app = createHarness({config: {topic:'play', timezone:'Asia/Dhaka', daily:{videos:0, images:0, texts:1}, storage:{databasePath:join(root,'db.sqlite'),mediaDirectory:root}, posting:{windows:[{start:'09:00',end:'20:00'}],minSpacingMinutes:60,queueCsvPath:join(root,'queue.csv')}, reserve:{minimumDays:90}}, adapters:{}, clock:()=>new Date('2026-09-06T00:00:00Z'), random:()=>0.5});
  try {
    const coverage: any = await app.execute({type:'plan'});
    assert.equal(coverage.completeDays, 0);
    assert.equal(coverage.days.length, 90);
    assert.equal(coverage.days[0].missing.text, 1);
    assert.match(await readFile(join(root,'queue.csv'),'utf8'), /queue_id,artifact_id/);
  } finally { app.close(); }
});

import { writeFile, mkdir, rmdir } from 'node:fs/promises';
async function fixture(facebook: any = {}, override: any = {}) {
  const root=await mkdtemp(join(tmpdir(),'sfurti-planning-'));
  const output=join(root,'text.txt'); await writeFile(output,'শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।');
  let current=new Date('2026-09-06T00:00:00Z');
  const config={topic:'play',daily:{videos:0,images:0,texts:1},storage:{databasePath:join(root,'db.sqlite'),mediaDirectory:root},posting:{windows:[{start:'09:00',end:'20:00'}],minSpacingMinutes:60,queueCsvPath:join(root,'queue.csv')},...override};
  const adapters={editor:{create:async()=>({filePath:output,caption:'একসঙ্গে, তৈরি করি\n"নতুন কিছু"'})},media:{inspect:async()=>({valid:true,evidence:{text:'শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।'}})},reviewer:{review:async()=>({passed:true,criteria:{mission:true,claims:true,context:true,age:true,bangla:true,usability:true},findings:[]})},facebook};
  const app=createHarness({config,adapters,clock:()=>current,random:()=>0.25,env:{}});
  return {app,root,config,adapters,clock:()=>current,setTime:(value:string)=>{current=new Date(value);},produce:async(origin='reserve',requestId=crypto.randomUUID())=>app.execute({type:'produce',kind:'text',origin,requestId})};
}

test('90 complete dates require 90 approved artifacts and retain random times after restart',async()=>{
  const f=await fixture({}, {limits:{maxTasksPerDay:100}});
  try {
    for(let i=0;i<90;i++)await f.produce();
    await f.produce('custom');
    const result=await f.app.execute({type:'plan'});
    assert.equal(result.completeDays,90);
    const before=await f.app.execute({type:'status'});
    assert.equal(before.posts.length,90);
    await f.app.execute({type:'plan'});
    assert.deepEqual((await f.app.execute({type:'status'})).posts,before.posts);
    const csv=await readFile(join(f.root,'queue.csv'),'utf8');
    assert.ok(csv.includes('"একসঙ্গে, তৈরি করি\n""নতুন কিছু"""'));
    f.app.close();
    const resumed=createHarness({config:f.config,adapters:f.adapters,clock:f.clock,random:()=>0.9,env:{}});
    try {await resumed.execute({type:'plan'});assert.deepEqual((await resumed.execute({type:'status'})).posts,before.posts);}finally{resumed.close();}
  } catch(error) {try{f.app.close();}catch{}throw error;}
});

test('a remote success followed by timeout reconciles before another creation and preserves history',async()=>{
  let submissions=0, remote=false;
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submissions++;remote=true;throw new Error('client timeout');},reconcile:async()=>remote?{status:'scheduled',remoteId:'remote-1'}:{status:'unknown'},cancel:async()=>({status:'cancelled'})});
  try {
    await f.produce();await f.app.execute({type:'plan',days:1});
    await f.app.execute({type:'publish'});
    assert.equal((await f.app.execute({type:'status'})).posts[0].status,'uncertain');
    await f.app.execute({type:'publish'});
    assert.equal(submissions,1);
    assert.equal((await f.app.execute({type:'status'})).posts[0].status,'scheduled');
    await f.app.execute({type:'pause',paused:true});
    await f.app.execute({type:'cancel'});
    assert.equal((await f.app.execute({type:'status'})).posts[0].status,'cancelled');
    assert.match(await readFile(join(f.root,'queue.csv'),'utf8'),/cancelled,remote-1/);
  } finally {f.app.close();}
});

test('unresolved submissions block rebuild and uncertain cancellations never resubmit',async()=>{
  let submits=0;
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submits++;throw new Error('timeout');},reconcile:async()=>({status:'unknown'})});
  try {
    await f.produce();await f.app.execute({type:'plan',startDate:'2026-09-07',days:1});await f.app.execute({type:'publish'});
    await assert.rejects(f.app.execute({type:'rebuild-plans',days:1}),/Reconcile uncertain/);
    await f.app.execute({type:'cancel'});await f.app.execute({type:'publish'});assert.equal(submits,1);
  } finally {f.app.close();}
});

test('custom scheduling is explicit and cannot satisfy recurring quota',async()=>{
  const f=await fixture();
  try {
    const artifact=await f.produce('custom');
    await f.app.execute({type:'plan',days:1});
    assert.equal((await f.app.execute({type:'status'})).posts.length,0);
    await f.app.execute({type:'schedule-custom',artifactId:artifact.id});
    assert.equal((await f.app.execute({type:'coverage',days:1})).completeDays,0);
  } finally {f.app.close();}
});

test('CSV write failure retains committed queue and can regenerate it',async()=>{
  const f=await fixture();
  try {
    await mkdir(join(f.root,'queue.csv'));
    await f.produce();await f.app.execute({type:'plan',days:1});
    const status=await f.app.execute({type:'status'});
    assert.equal(status.posts.length,1);
    assert.equal(status.meta.find((m:any)=>m.id==='queue-export').stale,true);
    await rmdir(join(f.root,'queue.csv'));
    assert.equal((await f.app.execute({type:'export-queue'})).stale,false);
    assert.ok((await readFile(join(f.root,'queue.csv'),'utf8')).includes(status.posts[0].id));
  } finally {f.app.close();}
});

test('impossible posting quota fails even with an empty library',async()=>{
  const f=await fixture({}, {daily:{videos:0,images:0,texts:2},posting:{windows:[{start:'09:00',end:'09:20'}],minSpacingMinutes:60,queueCsvPath:join(tmpdir(),crypto.randomUUID()+'.csv')}});
  try {await assert.rejects(f.app.execute({type:'plan',days:1}),/spacing conflict/);}finally{f.app.close();}
});

test('late readiness retains content for tomorrow without filling past slots',async()=>{
  const f=await fixture();
  try {
    f.setTime('2026-09-06T15:00:00Z');await f.produce();
    const result=await f.app.execute({type:'plan',days:2});
    assert.equal(result.days[0].complete,false);assert.equal(result.days[1].complete,true);
    assert.equal((await f.app.execute({type:'status'})).posts[0].date,'2026-09-07');
  }finally{f.app.close();}
});

test('distant local plans submit only inside platform bounds, then publication is reconciled',async()=>{
  let submits=0, published=false;
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submits++;return {status:'scheduled',remoteId:'r'};},reconcile:async()=>({status:published?'published':'scheduled',remoteId:'r',publishedAt:published?'2026-10-06T04:00:00Z':undefined})});
  try {
    await f.produce();await f.app.execute({type:'plan',startDate:'2026-10-06',days:1});await f.app.execute({type:'publish'});assert.equal(submits,0);
    f.setTime('2026-10-01T00:00:00Z');await f.app.execute({type:'publish'});assert.equal(submits,1);
    published=true;await f.app.execute({type:'reconcile'});assert.equal((await f.app.execute({type:'status'})).posts[0].status,'published');
  }finally{f.app.close();}
});

test('publication lease blocks a second coordinator while a remote submission is in flight',async()=>{
  let release!:(v:any)=>void, started!:()=>void, submits=0;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submits++;started();return new Promise(resolve=>{release=resolve;});},reconcile:async()=>({status:'absent'})});
  const second=createHarness({config:f.config,adapters:f.adapters,clock:f.clock,env:{}});
  try {
    await f.produce();await f.app.execute({type:'plan',days:1});
    const first=f.app.execute({type:'publish'});await entered;
    await assert.rejects(second.execute({type:'publish'}),/already owned/);
    await assert.rejects(second.execute({type:'reconcile'}),/already owned/);
    release({status:'scheduled',remoteId:'r'});await first;assert.equal(submits,1);
  }finally{second.close();f.app.close();}
});

test('configuration changes rebuild future local rows, preserve confirmed schedules and sealed today, and omit integration secrets',async()=>{
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:1}),submit:async()=>({status:'scheduled',remoteId:'r'}),reconcile:async()=>({status:'scheduled',remoteId:'r'})},{integrations:{secret:'secret-value'}});
  try {
    await f.app.execute({type:'daily-snapshot'});
    for(let i=0;i<3;i++)await f.produce();await f.app.execute({type:'plan',days:3});await f.app.execute({type:'publish'});
    const before=await f.app.execute({type:'status'});assert.equal(before.posts[0].status,'scheduled');
    const changed=createHarness({config:{...f.config,topic:'new-topic'},adapters:f.adapters,clock:f.clock,env:{}});
    try {
      await changed.execute({type:'plan',days:3});
      const status=await changed.execute({type:'status'});
      assert.equal(status.plans.find((p:any)=>p.date==='2026-09-06').config.topic,'play');
      assert.equal(status.posts.find((p:any)=>p.id===before.posts[0].id).status,'scheduled');
      assert.equal(status.posts.filter((p:any)=>p.status==='cancelled').length,2);
      assert.equal(JSON.stringify(status.plans).includes('secret-value'),false);
      assert.equal(status.artifacts.length,3);
    }finally{changed.close();}
  }finally{f.app.close();}
});

test('changed artifact bytes block publication after planning',async()=>{
  let submits=0;
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submits++;return {status:'scheduled',remoteId:'r'};}});
  try {
    const artifact=await f.produce();await f.app.execute({type:'plan',days:1});await writeFile(artifact.filePath,'changed');
    await f.app.execute({type:'publish'});assert.equal(submits,0);
    assert.equal((await f.app.execute({type:'status'})).posts[0].status,'failed');
  }finally{f.app.close();}
});

test('daily clips use distinct sources and recheck changed permission before submission',async()=>{
  let submissions=0;
  const f=await fixture({bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submissions++;return {status:'scheduled',remoteId:`r${submissions}`};}},{daily:{videos:2,images:0,texts:0}});
  try {
    const video=join(f.root,'video.mp4'),frame=join(f.root,'frame.png'),permission=join(f.root,'permission.md');
    await writeFile(video,'controlled video fixture');await writeFile(frame,'controlled frame fixture');await writeFile(permission,'Editing and Facebook use authorized');
    (f.adapters.editor as any).create=async()=>({filePath:video,caption:'কাগজ দিয়ে তৈরি করি'});
    (f.adapters.media as any).inspect=async()=>({valid:true,width:1080,height:1920,durationSeconds:35,evidence:{frames:[{filePath:frame,timeMs:1000}],transcript:'কাগজ দিয়ে তৈরি করি',audio:{intelligible:true,coverage:'Full audio'},coverage:'Sampled frame with transcript',limitations:'Visual inspection sampled'}});
    for(const id of ['source-a','source-b'])await f.app.execute({type:'register-source',language:'bn',sourceId:id,filePath:video,permission:{scope:['edit','facebook'],evidencePath:permission,expiresAt:'2026-09-10T00:00:00Z'}});
    for(const [sourceId,startMs] of [['source-a',0],['source-a',35000],['source-b',0]] as const) {
      const result=await f.app.execute({type:'produce',kind:'video',origin:'reserve',sourceId,segments:[{startMs,endMs:startMs+35000}]});assert.equal(result.status,'approved');
    }
    const coverage=await f.app.execute({type:'plan',days:2});assert.equal(coverage.days[0].complete,true);assert.equal(coverage.days[1].missing.video,1);
    const state=await f.app.execute({type:'status'}), selected=state.posts.filter((p:any)=>p.date==='2026-09-06');
    assert.equal(new Set(selected.map((p:any)=>state.artifacts.find((a:any)=>a.id===p.artifactId).sourceIds[0])).size,2);
    assert.ok(Math.abs(Date.parse(selected[0].scheduledAt)-Date.parse(selected[1].scheduledAt))>=3600000);
    await f.app.execute({type:'register-source',language:'bn',sourceId:'source-a',filePath:video,permission:{scope:['edit','facebook'],evidencePath:permission,expiresAt:'2026-09-06T01:00:00Z'}});
    await f.app.execute({type:'publish'});assert.equal(submissions,1);
    assert.equal((await f.app.execute({type:'status'})).posts.filter((p:any)=>p.status==='failed').length,2);
  }finally{f.app.close();}
});
