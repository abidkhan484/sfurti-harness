import test from 'node:test';
import assert from 'node:assert/strict';
import { AdapterError, ProcessAdapter } from '../src/adapters/process.ts';
import { TelegramOperator } from '../src/adapters/telegram.ts';

test('external process treats user input as data and returns Unicode intact', async () => {
  const adapter = new ProcessAdapter({ executable: process.execPath, args: ['-e', `let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({protocol:'sfurti/1',ok:true,result:JSON.parse(s).payload})))`] });
  assert.deepEqual(await adapter.call('render', { text: 'বাংলা; $(exit 1)' }), { text: 'বাংলা; $(exit 1)' });
});
test('external process timeout has an uncertain outcome and bounded output is enforced', async () => {
  const stalled = new ProcessAdapter({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 40 });
  await assert.rejects(stalled.call('submit', {}), (e: unknown) => e instanceof AdapterError && e.kind === 'timeout' && e.uncertain);
  const noisy = new ProcessAdapter({ executable: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(2000))'], maxOutputBytes: 1000 });
  await assert.rejects(noisy.call('submit', {}), (e: unknown) => e instanceof AdapterError && e.kind === 'output_limit' && e.uncertain);
});
test('Telegram rejects group and foreign operator requests before application execution', async () => {
  const commands: unknown[] = [];
  const operator = new TelegramOperator({ operatorUserId: '42', app: { execute: async command => { commands.push(command); return 'done'; } } });
  assert.equal(await operator.dispatch({ message: { from: { id: 42 }, chat: { id: -1, type: 'group' }, text: '{"type":"status"}' } }), undefined);
  assert.equal(await operator.dispatch({ message: { from: { id: 7 }, chat: { id: 7, type: 'private' }, text: '{"type":"status"}' } }), undefined);
  assert.equal(commands.length, 0);
  assert.equal(await operator.dispatch({ message: { from: { id: 42 }, chat: { id: 42, type: 'private' }, text: '{"type":"status"}' } }), 'done');
  assert.deepEqual(commands, [{type: 'status'}]);
});
