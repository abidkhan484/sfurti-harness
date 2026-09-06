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
