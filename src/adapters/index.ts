import { validReview, reviewSchema, type Review } from '../domain.ts';
export { validReview, type Review } from '../domain.ts';
import { AdapterError, isRecord, ProcessAdapter, type ProcessConfig } from './process.ts';
import { CodexStrategy, type CodexConfig } from './codex.ts';
import { TaskModelRouter, type TaskModelAssignments } from './llm.ts';
export { TelegramOperator } from './telegram.ts';
export { CodexStrategy } from './codex.ts';
export { TaskModelRouter, type LlmTaskType, type TaskModelAssignment, type TaskModelAssignments } from './llm.ts';
export { AdapterError, ProcessAdapter } from './process.ts';

type Data = Record<string, unknown>;
const nonempty = (value:unknown):value is string => typeof value === 'string' && value.trim().length > 0;
function checked<T>(value:unknown, validate:(value:unknown)=>value is T, operation:string, uncertain=false):T {
  if (!validate(value)) throw new AdapterError('protocol',`Invalid ${operation} result`,uncertain);
  return value;
}
export class CodexReviewer {
  strategy:TaskModelRouter;
  constructor(strategy:TaskModelRouter) { this.strategy=strategy; }
  async review(input:Data):Promise<Review & {provider:unknown}> {
    if (!isRecord(input.evidence)) throw new AdapterError('rejected','Independent review requires actual artifact evidence');
    const images = Array.isArray(input.evidence.frames) ? input.evidence.frames.map(f=> typeof f === 'string' ? f : isRecord(f) ? f.filePath : undefined) : [];
    if (images.some(f=>!nonempty(f))) throw new AdapterError('protocol','Invalid review frame path');
    // Exclude producer thread/history/self-evaluation; evaluate supplied artifact, mission and inspection evidence.
    const artifact = isRecord(input.artifact) ? input.artifact : {};
    const version = isRecord(input.version) ? input.version : {};
    const source = isRecord(input.source) ? input.source : {};
    const reviewInput = {artifact:{id:artifact.id,kind:artifact.kind,topic:artifact.topic,ageSegment:artifact.ageSegment,segments:artifact.segments},version:{number:version.number,caption:version.caption},mission:input.mission,evidence:input.evidence,source:{id:source.id,permission:source.permission,metadata:source.metadata}};
    const result = await this.strategy.structured('review',{purpose:'review',prompt:JSON.stringify(reviewInput),schema:reviewSchema,validate:validReview,signal:input.signal instanceof AbortSignal ? input.signal : undefined,images:images as string[],requiredCapabilities:images.length ? ['text','images'] : ['text']});
    return {...result.value,provider:{name:result.provider,model:result.model,usage:result.usage,capacity:result.capacity,threadId:result.threadId}};
  }
}
export class ProcessFacebook {
  process:ProcessAdapter;
  constructor(config:ProcessConfig) { this.process=new ProcessAdapter(config); }
  async bounds(now:Date) {
    return checked(await this.process.call('facebook.bounds',{now:now.toISOString()}),(v):v is {minLeadMinutes:number;maxLeadDays:number}=>isRecord(v) && typeof v.minLeadMinutes==='number' && Number.isFinite(v.minLeadMinutes) && v.minLeadMinutes>=0 && typeof v.maxLeadDays==='number' && Number.isFinite(v.maxLeadDays) && v.maxLeadDays>v.minLeadMinutes/1440,'Facebook bounds');
  }
  async submit(post:unknown) {
    return checked(await this.process.call('facebook.submit',post),(v):v is {remoteId:string;status:'scheduled'|'published';publishedAt?:string}=>isRecord(v) && nonempty(v.remoteId) && ['scheduled','published'].includes(String(v.status)) && validDate(v.publishedAt),'Facebook submit',true);
  }
  async reconcile(post:unknown) {
    return checked(await this.process.call('facebook.reconcile',post),(v):v is {status:'absent'|'unknown'|'scheduled'|'published'|'cancelled';remoteId?:string;publishedAt?:string}=>isRecord(v) && ['absent','unknown','scheduled','published','cancelled'].includes(String(v.status)) && (!['scheduled','published'].includes(String(v.status)) || nonempty(v.remoteId)) && validDate(v.publishedAt),'Facebook reconcile',true);
  }
  async cancel(post:unknown) {
    return checked(await this.process.call('facebook.cancel',post),(v):v is {status:'cancelled'|'unknown'}=>isRecord(v) && ['cancelled','unknown'].includes(String(v.status)),'Facebook cancel',true);
  }
}
function validDate(value:unknown) { return value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value))); }

function extractArtifactPaths(event: unknown): string[] | undefined {
  if (!isRecord(event)) return undefined;
  if (typeof event.filePath === 'string') return [event.filePath];
  if (isRecord(event.result) && typeof event.result.filePath === 'string') return [event.result.filePath];
  if (Array.isArray(event.posts)) {
    const paths = event.posts.filter(isRecord).map(p => p.filePath).filter((p): p is string => typeof p === 'string');
    return paths.length ? paths : undefined;
  }
  return undefined;
}

/** Adapters are enabled only by explicit config. No credentials, installations, or calls are implicit. */
export function createConfiguredAdapters(integrations:Record<string,unknown> = {}, llmConfig: {taskModels?:TaskModelAssignments} = {}) {
  const processFor = (name:string) => integrations[name] === undefined ? undefined : new ProcessAdapter(integrations[name] as ProcessConfig);
  const editor=processFor('editor'),media=processFor('media'),discovery=processFor('discovery'),reviewer=processFor('reviewer'),hermes=processFor('hermes');
  const codex=integrations.codex === undefined ? undefined : new CodexStrategy(integrations.codex as CodexConfig);
  const llm=codex ? new TaskModelRouter(llmConfig.taskModels,{codex}) : undefined;
  const telegramConfig=integrations.telegram;
  if (telegramConfig !== undefined && (!isRecord(telegramConfig) || typeof telegramConfig.operatorUserId !== 'string' || !/^[1-9]\d*$/.test(telegramConfig.operatorUserId))) throw new AdapterError('configuration','Telegram requires a positive operatorUserId string');
  const telegram = isRecord(telegramConfig) ? {operatorUserId:telegramConfig.operatorUserId as string,transport:telegramConfig.transport === undefined ? undefined : new ProcessAdapter(telegramConfig.transport as ProcessConfig)} : undefined;
  return {
    llm,hermes,telegram,
    capacity:{check:async()=>({remaining:null})},
    editor:editor ? {create:async(input:unknown)=>checked(await editor.call('editor.create',input),(v):v is {filePath:string;caption:string;segments?:unknown[]}=>isRecord(v) && nonempty(v.filePath) && typeof v.caption === 'string' && (v.segments === undefined || Array.isArray(v.segments)),'editor.create')} : undefined,
    media:media ? {inspect:async(input:unknown)=>checked(await media.call('media.inspect',input),(v):v is Data & {valid:boolean;evidence:Data}=>isRecord(v) && typeof v.valid === 'boolean' && isRecord(v.evidence),'media.inspect')} : undefined,
    discovery:discovery ? {discover:async(input:unknown)=>checked(await discovery.call('discovery.discover',input),(v):v is {keywords:Data[];sources:Data[];matches:Data[]}=>isRecord(v) && Array.isArray(v.keywords) && v.keywords.every(k=>isRecord(k) && nonempty(k.query) && nonempty(k.language) && nonempty(k.intent)) && Array.isArray(v.sources) && v.sources.every(s=>isRecord(s) && nonempty(s.id) && nonempty(s.title)) && Array.isArray(v.matches) && v.matches.every(m=>isRecord(m) && nonempty(m.keywordId) && nonempty(m.sourceId)),'discovery.discover')} : undefined,
    reviewer:reviewer ? {review:async(input:unknown)=>checked(await reviewer.call('reviewer.review',input),validReview,'reviewer.review')} : llm ? new CodexReviewer(llm) : undefined,
    facebook:integrations.facebook === undefined ? undefined : new ProcessFacebook(integrations.facebook as ProcessConfig),
    delivery:telegram?.transport ? {send:async(event:unknown,delivery?:{idempotencyKey?:string;signal?:AbortSignal})=>{ await telegram.transport!.call('telegram.deliver',{chatId:telegram.operatorUserId,idempotencyKey:delivery?.idempotencyKey,signal:delivery?.signal,text:JSON.stringify(event),artifactPaths:extractArtifactPaths(event)}); }} : undefined,
  };
}
