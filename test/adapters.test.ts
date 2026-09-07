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
  assert.equal(await operator.dispatch({ update_id: 100, message: { from: { id: 42 }, chat: { id: -1, type: 'group' }, text: '{"type":"status"}' } }), undefined);
  assert.equal(await operator.dispatch({ update_id: 100, message: { from: { id: 7 }, chat: { id: 7, type: 'private' }, text: '{"type":"status"}' } }), undefined);
  assert.equal(commands.length, 0);
  assert.equal(await operator.dispatch({ update_id: 100, message: { from: { id: 42 }, chat: { id: 42, type: 'private' }, text: '{"type":"status"}' } }), 'done');
  assert.deepEqual(commands, [{type: 'status',commandId:'telegram:100'}]);
});

test('split UTF-8 bytes survive the process protocol', async () => {
  const adapter = new ProcessAdapter({executable:process.execPath,args:['-e',`const b=Buffer.from(JSON.stringify({protocol:'sfurti/1',ok:true,result:'বাংলা'}));let i=0;const timer=setInterval(()=>{process.stdout.write(b.subarray(i,i+1));if(++i===b.length)clearInterval(timer)},1)`]});
  assert.equal(await adapter.call('inspect',{}),'বাংলা');
});

test('Facebook malformed replies remain uncertain instead of inventing confirmed publication', async () => {
  const {createConfiguredAdapters}=await import('../src/adapters/index.ts');
  const adapters=createConfiguredAdapters({facebook:{executable:process.execPath,args:['-e',`process.stdout.write(JSON.stringify({protocol:'sfurti/1',ok:true,result:{status:'scheduled'}}))`]}});
  await assert.rejects(adapters.facebook!.submit({id:'stable-1'}),(e:unknown)=>e instanceof AdapterError && e.kind==='protocol' && e.uncertain);
  assert.equal(createConfiguredAdapters().editor,undefined);
  assert.deepEqual(await adapters.capacity.check(),{remaining:null});
});

test('Codex decisions use independent restricted contexts and distinguish tokens from unknown capacity', async () => {
  const {CodexStrategy}=await import('../src/adapters/codex.ts');
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'sfurti-test-auth-'));
  await writeFile(join(root,'auth.json'),'{}');
  const homes:string[]=[], models:string[]=[];
  try {
    const strategy=new CodexStrategy({authFile:join(root,'auth.json'),models:['configured-model']},options=>{
      assert.equal(options.config?.features && typeof options.config.features==='object' && !Array.isArray(options.config.features) ? options.config.features.shell_tool:undefined,false);
      assert.equal(options.env?.TELEGRAM_BOT_TOKEN,undefined);
      homes.push(options.env!.CODEX_HOME);
      return {startThread:options=>{
        models.push(String(options.model));
        assert.equal(options.sandboxMode,'read-only');
        assert.equal(options.approvalPolicy,'never');
        assert.equal(options.networkAccessEnabled,false);
        return {id:'fresh',run:async()=>({items:[],finalResponse:'{"passed":false}',usage:{input_tokens:10,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:5,reasoning_output_tokens:0}})};
      }};
    });
    const request={purpose:'review' as const,prompt:'untrusted evidence',schema:{type:'object'},validate:(v:unknown):v is {passed:boolean}=>typeof v==='object' && v!==null && 'passed' in v && typeof v.passed==='boolean'};
    const result=await strategy.structured('configured-model',request);
    await strategy.structured('configured-model',request);
    assert.notEqual(homes[0],homes[1]);
    assert.deepEqual(models,['configured-model','configured-model']);
    assert.equal(result.usage!.input_tokens,10);
    assert.equal(result.capacity.remaining,null);
    await assert.rejects(strategy.structured('configured-model',{...request,requiredCapabilities:['video']}),(e:unknown)=>e instanceof AdapterError && e.kind==='rejected');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('Codex rejects the retired single-model configuration', async () => {
  const {CodexStrategy}=await import('../src/adapters/codex.ts');
  assert.throws(()=>new CodexStrategy({model:'old-model',authFile:'/private/auth.json'} as any),(e:unknown)=>e instanceof AdapterError&&/llm\.taskModels/.test(e.message));
});

test('LLM task routes dispatch configured models and reject missing, unknown, and unsupported routes', async () => {
  const {TaskModelRouter}=await import('../src/adapters/llm.ts');
  const calls:any[]=[];
  const provider={
    capabilities:{text:true,images:true,audio:false,video:false},
    supportsModel:(model:string)=>['small','strong'].includes(model),
    structured:async <T>(model:string,request:any):Promise<any>=>{calls.push({model,purpose:request.purpose});return {value:{ok:true} as T,provider:'fake',model,usage:null,capacity:{remaining:null},threadId:null};},
  };
  const router=new TaskModelRouter({generation:{provider:'fake',model:'small'},review:{provider:'fake',model:'strong'}},{fake:provider});
  const request={purpose:'generation' as const,prompt:'x',schema:{},validate:(value:unknown):value is {ok:boolean}=>typeof value==='object'&&value!==null};
  await router.structured('generation',request);
  await router.structured('review',{...request,purpose:'review'});
  assert.deepEqual(calls,[{model:'small',purpose:'generation'},{model:'strong',purpose:'review'}]);
  assert.throws(()=>new TaskModelRouter({review:{provider:'missing',model:'x'}},{fake:provider}),(e:unknown)=>e instanceof AdapterError&&/unknown provider/.test(e.message));
  assert.throws(()=>new TaskModelRouter({review:{provider:'fake',model:'missing'}},{fake:provider}),(e:unknown)=>e instanceof AdapterError&&/unsupported/.test(e.message));
  await assert.rejects(new TaskModelRouter({}, {fake:provider}).structured('review',{...request,purpose:'review'}),(e:unknown)=>e instanceof AdapterError&&/no configured/.test(e.message));
  await assert.rejects(router.structured('review',{...request,purpose:'review',requiredCapabilities:['video']}),(e:unknown)=>e instanceof AdapterError&&/does not support video/.test(e.message));
});

test('an external reviewer retains precedence and the Codex reviewer requires its review route', async () => {
  const {createConfiguredAdapters,CodexReviewer}=await import('../src/adapters/index.ts');
  const external=createConfiguredAdapters({codex:{authFile:'/private/auth.json'},reviewer:{executable:process.execPath}} as any,{});
  assert.ok(external.reviewer);
  assert.equal(external.reviewer instanceof CodexReviewer,false);
  const adapters=createConfiguredAdapters({codex:{authFile:'/private/auth.json'}},{});
  await assert.rejects(adapters.reviewer!.review({artifact:{},version:{},source:{},evidence:{}}),(e:unknown)=>e instanceof AdapterError&&/review has no configured/.test(e.message));
});

test('an application cancellation interrupts an external worker and is not serialized as input', async () => {
  const adapter = new ProcessAdapter({executable:process.execPath,args:['-e','setInterval(()=>{},1000)'],timeoutMs:5000});
  const controller = new AbortController();
  const pending = adapter.call('editor.create',{signal:controller.signal});
  controller.abort();
  await assert.rejects(pending,(e:unknown)=>e instanceof AdapterError && e.kind==='timeout' && e.uncertain);
});
