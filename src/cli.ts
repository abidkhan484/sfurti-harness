#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from './config.ts';
import { createHarness } from './app.ts';
import { createConfiguredAdapters } from './adapters/index.ts';
import type { Command } from './types.ts';

const {positionals,values}=parseArgs({allowPositionals:true,options:{json:{type:'string'},topic:{type:'string'},age:{type:'string'},language:{type:'string'},videos:{type:'string'},images:{type:'string'},texts:{type:'string'},schedule:{type:'boolean'},date:{type:'string'},days:{type:'string'},'youtube-id':{type:'string'},file:{type:'string'},'permission-file':{type:'string'},reason:{type:'string'},destination:{type:'string'},paused:{type:'boolean'},'request-id':{type:'string'}}});
const name=positionals[0]??'help';
const help=`Sfurti harness (Node 24+)
  npm run sfurti -- config validate
  npm run sfurti -- doctor | status | storage | cleanup-preview
  npm run sfurti -- command --json '{"type":"coverage"}'
  npm run sfurti -- request --topic "..." --texts 1 [--schedule]
  npm run sfurti -- source register --youtube-id ID --file PATH --permission-file PATH
  npm run sfurti -- plan [--days 90] | tick | publish | reconcile | export-queue
  npm run sfurti -- pause [--paused] | resume
  npm run sfurti -- retry ARTIFACT_ID --reason "..."
  npm run sfurti -- backup --destination PATH
  npm run sfurti -- start
Set SFURTI_CONFIG or copy config/harness.example.json to config/harness.json.
Source permission JSON must include evidencePath, scope array, and applicable restrictions/expiry.
Use command --json for all application commands, including selected post cancellation.
`;
if(name==='help') {console.log(help);process.exit(0);}
try {
  const env={...process.env};
  if(!env.SFURTI_CONFIG&&existsSync('./config/harness.json')) env.SFURTI_CONFIG='./config/harness.json';
  const config=loadConfig({},env);
  const adapters=createConfiguredAdapters(config.integrations, config.llm);
  const app=createHarness({config,env:{},adapters});
  let closed=false;
  const close=()=>{if(!closed){closed=true;app.close();}};
  try {
    if(name==='start') {
      const doctor=await app.execute({type:'doctor'});
      if(!doctor.ready) throw new Error(`Setup incomplete: ${doctor.missing.join(', ')}`);
      let stop=false;
      for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{stop=true;});
      await app.execute({type:'export-queue'});
      while(!stop) {
        try {
          const cycle=await app.execute({type:'service-cycle'});
          if(Object.keys(cycle.errors).length) console.error(JSON.stringify(cycle.errors));
        } catch(error) {console.error(String(error));}
        if(!stop) await delay(config.limits.tickMs);
      }
    } else {
      let command:Command;
      if(name==='command') command=JSON.parse(values.json??readFileSync(0,'utf8'));
      else if(name==='config') command={type:'config'};
      else if(name==='request') command={type:'request',topic:values.topic,ageSegment:values.age,videos:Number(values.videos??0),images:Number(values.images??0),texts:Number(values.texts??0),schedule:values.schedule===true,requestId:values['request-id']};
      else if(name==='source'&&positionals[1]==='register') command={type:'register-source',sourceId:values['youtube-id'],language:values.language,filePath:values.file,permission:JSON.parse(readFileSync(values['permission-file']??'','utf8'))};
      else if(name==='sources'&&positionals[1]==='pending') command={type:'pending-sources'};
      else if(name==='retry') command={type:'retry-artifact',artifactId:positionals[1],reason:values.reason};
      else if(name==='pause'||name==='resume') command={type:'pause',paused:name==='pause'};
      else command={type:name,startDate:values.date,...(values.days?{days:Number(values.days)}:{}),destination:values.destination};
      console.log(JSON.stringify(await app.execute(command),null,2));
    }
  } finally {close();}
} catch(error) {console.error(String(error));process.exitCode=1;}
