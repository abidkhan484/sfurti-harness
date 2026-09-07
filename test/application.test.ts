import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from '../src/app.ts';

test('configuration accepts zero overrides, rejects malformed counts, and seals daily settings across restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sfurti-app-'));
  const config = { storage: {databasePath:join(root,'state.sqlite'),mediaDirectory:join(root,'media')}, daily:{videos:0,images:0,texts:0} };
  let app = createHarness({config,env:{DAILY_VIDEO_COUNT:'0'},clock:()=>new Date('2026-09-06T00:00:00Z')});
  try {
    const resolved:any = await app.execute({type:'config'});
    assert.equal(resolved.daily.videos,0);
    const sealed:any = await app.execute({type:'daily-snapshot'});
    assert.equal(sealed.config.daily.texts,0);
    app.close();
    app=createHarness({config:{...config,daily:{videos:1,images:1,texts:2}},env:{},clock:()=>new Date('2026-09-06T01:00:00Z')});
    const retried:any=await app.execute({type:'daily-snapshot'});
    assert.equal(retried.config.daily.texts,0);
    assert.throws(()=>createHarness({config,env:{DAILY_VIDEO_COUNT:'1x'}}),/DAILY_VIDEO_COUNT/);
  } finally { app.close(); rmSync(root,{recursive:true,force:true}); }
});

test('LLM configuration requires explicit task routes and rejects the retired global provider', async () => {
  const {loadConfig}=await import('../src/config.ts');
  assert.throws(()=>loadConfig({llm:{provider:'codex'}} as any,{}),/llm\.provider is no longer supported/);
  const config=loadConfig({llm:{taskModels:{review:{provider:'codex',model:'review-model'}}}} as any,{});
  assert.deepEqual(config.llm.taskModels.review,{provider:'codex',model:'review-model'});
});

test('durable command identity returns one snapshot after restart and rejects changed payload',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sfurti-replay-'));
  const config={storage:{databasePath:join(root,'db'),mediaDirectory:join(root,'media')}};
  let app=createHarness({config,env:{}});
  try {
    const first=await app.execute({type:'daily-snapshot',commandId:'telegram:123'});
    app.close();app=createHarness({config,env:{}});
    assert.deepEqual(await app.execute({type:'daily-snapshot',commandId:'telegram:123'}),first);
    await assert.rejects(app.execute({type:'pause',paused:true,commandId:'telegram:123'}),/different command/);
  }finally{app.close();rmSync(root,{recursive:true,force:true});}
});

test('disabled daily work produces nothing and tick ownership prevents overlapping runs',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sfurti-tick-'));
  const app=createHarness({env:{},config:{storage:{databasePath:join(root,'db'),mediaDirectory:join(root,'media')},daily:{videos:0,images:0,texts:0},posting:{windows:[{start:'09:00',end:'20:00'}],minSpacingMinutes:60,queueCsvPath:join(root,'queue.csv')}},clock:()=>new Date('2026-09-07T00:00:00Z')});
  try {
    const result=await app.execute({type:'tick'});
    assert.equal(result.produced,0);
    const status=await app.execute({type:'status'});
    assert.equal(status.artifacts.length,0);
    assert.equal(status.jobs[0].status,'complete');
  }finally{app.close();rmSync(root,{recursive:true,force:true});}
});

test('bounded ticks keep filling future dates and custom requests remain additional work',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sfurti-work-'));
  const {writeFileSync}=await import('node:fs');
  const output=join(root,'text.txt');writeFileSync(output,'আজ শিশুকে কাগজ দিয়ে নিজের কিছু বানাতে দিন।');
  const seen:string[]=[];
  const app=createHarness({env:{},config:{storage:{databasePath:join(root,'db'),mediaDirectory:join(root,'media')},daily:{videos:0,images:0,texts:1},limits:{maxTasksPerTick:2},posting:{windows:[{start:'09:00',end:'20:00'}],minSpacingMinutes:60,queueCsvPath:join(root,'queue.csv')}},clock:()=>new Date('2026-09-07T00:00:00Z'),random:()=>0,adapters:{editor:{create:async(input:any)=>{seen.push(input.artifact.origin);return{filePath:output,caption:'একসঙ্গে তৈরি করি'};}},media:{inspect:async()=>({valid:true,evidence:{}})},reviewer:{review:async()=>({passed:true,criteria:{mission:true,claims:true,context:true,age:true,bangla:true,usability:true},findings:[]})}}});
  try{
    const first=await app.execute({type:'tick'});
    assert.equal(first.produced,2);
    assert.equal(first.coverage.completeDays,2);
    const second=await app.execute({type:'tick'});
    assert.equal(second.coverage.completeDays,4);
    const custom=await app.execute({type:'request',texts:1,topic:'custom topic',requestId:'custom-once'});
    assert.equal(custom.status,'complete');
    const state=await app.execute({type:'status'});
    assert.equal(state.posts.length,4);
    assert.equal(state.artifacts.filter((a:any)=>a.origin==='custom').length,1);
    assert.equal(seen.at(-1),'custom');
    await app.execute({type:'request',texts:1,topic:'custom topic',requestId:'custom-once'});
    assert.equal(seen.length,5);
  }finally{app.close();rmSync(root,{recursive:true,force:true});}
});

test('backup retains a restorable command snapshot and doctor reports missing live setup',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sfurti-backup-'));
  const config={storage:{databasePath:join(root,'db'),mediaDirectory:join(root,'media')}};
  const app=createHarness({config,env:{}});
  try{
    const sealed=await app.execute({type:'daily-snapshot'});
    const backup=await app.execute({type:'backup',destination:join(root,'backup')});
    assert.ok(backup.databaseBytes>0);
    assert.equal((await app.execute({type:'doctor'})).ready,false);
    const restored=createHarness({config:{storage:{databasePath:join(root,'backup','sfurti.sqlite'),mediaDirectory:join(root,'backup','media')}},env:{}});
    try{assert.deepEqual((await restored.execute({type:'status'})).plans[0],sealed);}finally{restored.close();}
  }finally{app.close();rmSync(root,{recursive:true,force:true});}
});

test('pending Telegram results drain after restart without regenerating work or duplicating delivery keys',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sfurti-outbox-'));
  const config={storage:{databasePath:join(root,'db'),mediaDirectory:join(root,'media')}};
  const deliveries:any[]=[];
  let app=createHarness({config,env:{},adapters:{delivery:{send:async()=>{throw new Error('offline');}}}});
  try{
    await app.execute({type:'daily-snapshot',commandId:'telegram:909'});
    assert.equal((await app.execute({type:'status'})).notifications[0].status,'pending');
    app.close();
    app=createHarness({config,env:{},adapters:{delivery:{send:async(event:any,options:any)=>{deliveries.push({event,...options});}}}});
    assert.equal((await app.execute({type:'drain-notifications'})).sent,1);
    await app.execute({type:'daily-snapshot',commandId:'telegram:909'});
    assert.equal(deliveries.length,1);
    assert.ok(deliveries[0].idempotencyKey);
    assert.equal((await app.execute({type:'status'})).plans.length,1);
  }finally{app.close();rmSync(root,{recursive:true,force:true});}
});

test('Telegram and discovery outages do not stop publication of ready custom content',async()=>{
  const root=mkdtempSync(join(tmpdir(),'sfurti-independent-'));
  const {writeFileSync}=await import('node:fs');
  const output=join(root,'text.txt');writeFileSync(output,'আজ শিশুর সঙ্গে তৈরি করি।');
  let submitted=0;
  const app=createHarness({env:{},config:{storage:{databasePath:join(root,'db'),mediaDirectory:join(root,'media')},daily:{videos:1,images:0,texts:0},posting:{windows:[{start:'09:00',end:'20:00'}],minSpacingMinutes:60,queueCsvPath:join(root,'queue.csv')}},clock:()=>new Date('2026-09-07T00:00:00Z'),random:()=>0,adapters:{
    telegram:{operatorUserId:'42',transport:{call:async()=>{throw new Error('Telegram offline');}}},
    discovery:{discover:async()=>{throw new Error('Discovery offline');}},
    editor:{create:async()=>({filePath:output,caption:'তৈরি করি'})},media:{inspect:async()=>({valid:true,evidence:{}})},reviewer:{review:async()=>({passed:true,criteria:{mission:true,claims:true,context:true,age:true,bangla:true,usability:true},findings:[]})},
    facebook:{bounds:async()=>({minLeadMinutes:10,maxLeadDays:7}),submit:async()=>{submitted++;return{status:'scheduled',remoteId:'remote'};},reconcile:async()=>({status:'unknown'})},
  }});
  try{
    const artifact=await app.execute({type:'produce',kind:'text',origin:'custom'});
    await app.execute({type:'schedule-custom',artifactId:artifact.id});
    const cycle=await app.execute({type:'service-cycle'});
    assert.match(cycle.errors.telegram,/offline/);
    assert.match(cycle.errors.production,/offline/);
    assert.equal(submitted,1);
  }finally{app.close();rmSync(root,{recursive:true,force:true});}
});
