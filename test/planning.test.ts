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
