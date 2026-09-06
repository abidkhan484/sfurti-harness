import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from '../src/app.ts';

function fixture(overrides: Record<string, any> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sfurti-production-'));
  const output = join(dir, 'post.txt');
  writeFileSync(output, 'শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।');
  const corrections: any[] = [];
  const adapters = {
    editor: { create: async (input: any) => { corrections.push(input); return { filePath: output, caption: 'একসঙ্গে তৈরি করি' }; } },
    media: { inspect: async () => ({ valid: true, evidence: { text: 'শিশুকে নিজের হাতে কিছু তৈরি করতে দিন।' } }) },
    reviewer: { review: async () => ({ passed: true, criteria: { mission: true, claims: true, context: true, age: true, bangla: true, usability: true }, findings: [] }) },
    ...overrides,
  };
  const app = createHarness({config: {storage: {databasePath: join(dir, 'db.sqlite'), mediaDirectory: dir}, topic:'সৃজনশীলতা', daily:{videos:0, images:0,texts:1}, posting:{queueCsvPath:join(dir,'queue.csv')}}, adapters} as any);
  return {app, adapters, dir, corrections};
}

test('custom production approves actual Bangla text, retains mission and never schedules it', async () => {
  const {app} = fixture();
  const result: any = await app.execute({type:'produce',kind:'text',origin:'custom',requestId:'request-1'});
  assert.equal(result.status, 'approved');
  assert.equal(result.versions.length, 1);
  const state: any = await app.execute({type:'status'});
  assert.equal(state.posts.length, 0);
  assert.equal(state.artifacts.length, 1);
  const again: any = await app.execute({type:'produce',kind:'text',origin:'custom',requestId:'request-1'});
  assert.equal(again.id, result.id);
  app.close();
});
