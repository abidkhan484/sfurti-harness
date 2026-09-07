import type { Command,Context } from './types.ts';
import { TelegramOperator } from './adapters/telegram.ts';

/** Each lifecycle progresses even if an unrelated integration is unavailable. */
export async function serviceCycle(ctx:Context,execute:(command:Command)=>Promise<any>) {
  const errors:Record<string,string>={};
  const results:Record<string,unknown>={};
  const attempt=async(name:string,work:()=>Promise<unknown>)=>{
    try{results[name]=await work();}catch(error){errors[name]=String(error);}
  };
  const telegram=ctx.adapters.telegram;
  if(telegram?.transport) await attempt('telegram',async()=>{
    const operator=new TelegramOperator({...telegram,app:{execute}});
    const updates=await telegram.transport.call('telegram.poll',{});
    if(!Array.isArray(updates)||updates.length>100) throw new Error('Telegram poll must return at most 100 updates');
    for(const update of updates) {
      try{await operator.dispatch(update);}catch(error){errors[`telegram:${update?.update_id}`]=String(error);}
    }
  });
  await attempt('production',()=>execute({type:'tick'}));
  await attempt('publication',()=>execute({type:'publish'}));
  await attempt('notifications',()=>execute({type:'drain-notifications'}));
  return {results,errors};
}
