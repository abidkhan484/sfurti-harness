import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, statfsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from './store.ts';
import { loadConfig, type Config } from './config.ts';
import { today, type Command, type Context } from './types.ts';

export interface HarnessOptions {
  config?: Partial<Config>|Record<string,unknown>;
  env?:NodeJS.ProcessEnv;
  adapters?: Record<string,any>;
  clock?:()=>Date;
  random?:()=>number;
}
export function createHarness(options:HarnessOptions={}) {
  const config=loadConfig(options.config, options.env);
  const store=new Store(config.storage.databasePath);
  mkdirSync(config.storage.mediaDirectory,{recursive:true});
  const missionText=readFileSync(new URL('../docs/mission.md',import.meta.url),'utf8');
  const ctx:Context={store,config,adapters:options.adapters??{},now:options.clock??(()=>new Date()),random:options.random??Math.random,id:randomUUID,
    mission:{text:missionText,version:createHash('sha256').update(missionText).digest('hex')},
    async notify(event) {
      const record={id:randomUUID(),event,status:'pending',createdAt:ctx.now().toISOString()};
      store.put('notifications',record);
      if(ctx.adapters.delivery?.send) {
        try { await ctx.adapters.delivery.send(event); store.put('notifications',{...record,status:'sent'}); }
        catch(error) {store.put('notifications',{...record,lastError:String(error)});}
      }
    },
  };
  function snapshot() {
    return store.transaction(()=>{
      const date=today(ctx);
      const previous=store.get('plans',date);
      if(previous?.snapshotSealed) return previous;
      return store.put('plans',{...previous,id:date,date,config:structuredClone(config),snapshotSealed:true,createdAt:ctx.now().toISOString()});
    });
  }
  async function execute(command:Command):Promise<any> {
    if(!command||typeof command.type!=='string') throw new Error('A command type is required');
    switch(command.type) {
      case 'config': return structuredClone(config);
      case 'daily-snapshot': return snapshot();
      case 'status': return Object.fromEntries(['artifacts','posts','plans','sources','jobs','tasks','meta','notifications','reviews','segments','keywords','matches'].map(name=>[name,store.all(name)]));
      case 'pending-sources': return store.all('sources').filter(s=>!s.permission);
      case 'artifact': {
        const artifact=store.get('artifacts',command.artifactId);
        if(!artifact) throw new Error('Artifact not found');
        return artifact;
      }
      case 'storage': case 'cleanup-preview': {
        const files:Array<{path:string;bytes:number}>=[];
        function walk(path:string) {for(const entry of readdirSync(path,{withFileTypes:true})) {
          const file=join(path,entry.name);
          if(entry.isDirectory()) walk(file);
          else if(entry.isFile()) files.push({path:file,bytes:statSync(file).size});
        }}
        walk(config.storage.mediaDirectory);
        const fs=statfsSync(config.storage.mediaDirectory);
        return {files,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),freeBytes:fs.bavail*fs.bsize,deletionEnabled:false};
      }
      case 'discover': case 'register-source': case 'produce': case 'retry-artifact': {
        const {production}=await import('./production.ts');
        if(command.origin==='daily') {
          const plan=snapshot();
          return production({...ctx,config:plan.config},{...command,date:plan.date,topic:plan.config.topic});
        }
        return production(ctx,command);
      }
      case 'plan': case 'coverage': case 'publish': case 'reconcile': case 'cancel': case 'pause': case 'export-queue': case 'rebuild-plans': case 'schedule-custom': {
        const {planning}=await import('./planning.ts');
        return planning(ctx,command);
      }
      default: throw new Error(`Unknown command: ${command.type}`);
    }
  }
  return {execute,close:()=>store.close()};
}
