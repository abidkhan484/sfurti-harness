import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Context, Command } from './types.ts';

type RecordData = Record<string, any> & { id: string };
export type Segment = { startMs: number; endMs: number };
export type Artifact = RecordData & { kind: 'video'|'image'|'text'; origin: 'daily'|'custom'|'reserve'; topic: string; ageSegment: string; status: string; sourceIds: string[]; createdAt: string; versions: RecordData[] };
const criteria = ['mission', 'claims', 'context', 'age', 'bangla', 'usability'];

function validFile(path: unknown): { bytes: number; sha256: string } {
  if (typeof path !== 'string' || !statSync(path).isFile() || !statSync(path).size) throw new Error('A nonempty artifact or evidence file is required');
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function assertPermission(source: any, now: Date) {
  if (!source?.permission?.scope || !source?.permission?.evidencePath || !source.filePath) throw new Error('Source requires registered permission and an authorized file');
  if (source.permission.expiresAt && (!Number.isFinite(Date.parse(source.permission.expiresAt)) || Date.parse(source.permission.expiresAt) <= now.getTime())) throw new Error('Source permission expired or invalid');
  validFile(source.permission.evidencePath);
  validFile(source.filePath);
}
function intervals(value: unknown): Segment[] {
  if (!Array.isArray(value) || !value.length || value.some(s => !Number.isInteger(s.startMs) || !Number.isInteger(s.endMs) || s.startMs < 0 || s.endMs <= s.startMs)) throw new Error('Original source intervals are required');
  const sorted = [...value].sort((a,b) => a.startMs-b.startMs);
  if (sorted.some((s,i) => i > 0 && s.startMs < sorted[i-1].endMs)) throw new Error('Source intervals overlap within this clip');
  return sorted;
}
function problem(version: number, criterion: string, evidence: string, correction: string) {
  return {version, location:'artifact', criterion, evidence, correction, acceptanceCondition:correction};
}
async function inspect(ctx: Context, artifact: Artifact, version: any, source: any) {
  const findings: any[] = [];
  let evidence: any = {};
  try {
    version.integrity = validFile(version.filePath);
    if (!ctx.adapters.media?.inspect) throw new Error('Independent media inspection adapter unavailable');
    const inspected = await ctx.adapters.media.inspect({filePath:version.filePath, kind:artifact.kind, source, segments:artifact.segments});
    evidence = inspected.evidence ?? {};
    if (inspected.valid !== true) throw new Error('Media inspection rejected file');
    if (artifact.kind === 'text') {
      evidence.text = readFileSync(version.filePath, 'utf8');
      if (!/[\u0980-\u09ff]/u.test(evidence.text)) throw new Error('Bangla text is missing');
    } else if (artifact.kind === 'image') {
      if (!Array.isArray(evidence.frames) || !evidence.frames.length) throw new Error('Image review evidence is missing');
      for (const frame of evidence.frames) validFile(typeof frame === 'string' ? frame : frame.filePath);
    } else {
      if (!(inspected.durationSeconds >= 30 && inspected.durationSeconds <= 60) || !(inspected.width > 0) || Math.abs(inspected.width / inspected.height - 9/16) > .015) throw new Error('Reel must be vertical 9:16 and 30–60 seconds');
      if (!Array.isArray(evidence.frames) || !evidence.frames.length || typeof evidence.transcript !== 'string' || !evidence.transcript.trim() || evidence.audio?.intelligible !== true || !evidence.audio?.coverage) throw new Error('Timestamped frame, transcript and audio inspection evidence required');
      for (const frame of evidence.frames) validFile(typeof frame === 'string' ? frame : frame.filePath);
      if (!evidence.coverage || !evidence.limitations) throw new Error('Video review coverage and limitations must be recorded');
    }
  } catch (error) { findings.push(problem(version.number, 'usability', String(error), 'Provide a valid Bangla artifact and complete independent inspection evidence')); }
  if (ctx.adapters.reviewer === ctx.adapters.editor || !ctx.adapters.reviewer?.review) findings.push(problem(version.number,'independence','No independent reviewer','Use a separate reviewer adapter'));
  if (findings.length) return { passed:false, findings, evidence };
  const review = await ctx.adapters.reviewer.review({ artifact, version, evidence, mission:ctx.mission, source });
  const failed = criteria.filter(key => review?.criteria?.[key] !== true);
  const malformed = !Array.isArray(review?.findings) || review.findings.some((f:any) => f.version !== version.number || !f.location || !f.criterion || !f.evidence || !f.correction || !f.acceptanceCondition);
  if (malformed) findings.push(problem(version.number,'review-schema','Malformed review findings','Return version, location, criterion, evidence, correction and acceptanceCondition for each finding'));
  for (const key of failed) if (!review?.findings?.some((f:any) => f.criterion === key)) findings.push(problem(version.number,key,'Hard requirement missing or rejected',`Supply evidence satisfying ${key}`));
  return { ...review, passed:review?.passed === true && !failed.length && !malformed && !review.findings.length, findings:[...(Array.isArray(review?.findings) ? review.findings : []), ...findings], evidence };
}

export async function production(ctx: Context, command: Command): Promise<unknown> {
  const store = ctx.store;
  if (command.type === 'discover') {
    if (!ctx.adapters.discovery?.discover) throw new Error('Discovery adapter is not configured');
    const batchId = ctx.id();
    const topic = command.topic ?? ctx.config.topic;
    const result = await ctx.adapters.discovery.discover({topic, mission:ctx.mission, language:'bn', untrustedSourceContent:true});
    if (!Array.isArray(result?.keywords) || !Array.isArray(result.sources)) throw new Error('Malformed discovery result');
    const keywords = result.keywords.map((keyword:any) => {
      if (!keyword.query || !keyword.language || !keyword.intent) throw new Error('Keyword requires query, language and intent');
      return {...keyword,id:keyword.id ?? ctx.id(),batchId,topic,missionVersion:ctx.mission.version};
    });
    const sources = result.sources.map((source:any) => {
      if (!source.id || !source.title) throw new Error('Source identity and title required');
      const existing = store.get<RecordData>('sources',source.id);
      return {...existing,id:source.id,title:source.title,language:source.language,metadata:{...(existing?.metadata ?? {}),...source},status:existing?.status ?? 'pending',discoveredAt:existing?.discoveredAt ?? ctx.now().toISOString()};
    });
    store.transaction(() => {
      store.put('keywordBatches',{id:batchId,topic,mission:ctx.mission,createdAt:ctx.now().toISOString()});
      for (const keyword of keywords) store.put('keywords',keyword);
      for (const source of sources) store.put('sources',source);
      for (const match of result.matches ?? []) {
        if (!keywords.some((k:any) => k.id === match.keywordId) || !sources.some((s:any) => s.id === match.sourceId)) throw new Error('Discovery match references unknown keyword or source');
        store.put('matches',{...match,id:`${batchId}:${match.keywordId}:${match.sourceId}`,batchId});
      }
    });
    return {batchId,keywords,sources};
  }
  if (command.type === 'register-source') {
    if (typeof command.sourceId !== 'string' || !command.sourceId) throw new Error('Source ID required');
    const source = {...store.get<RecordData>('sources',command.sourceId),id:command.sourceId,filePath:command.filePath,permission:command.permission,status:'cleared'};
    assertPermission(source,ctx.now());
    store.put('sources',source);
    store.put('permissions',{id:ctx.id(),sourceId:source.id,...command.permission,registeredAt:ctx.now().toISOString()});
    return source;
  }
  let artifact: Artifact;
  if (command.type === 'retry-artifact') {
    const failed = store.get<Artifact>('artifacts',command.artifactId);
    if (!failed || failed.status !== 'failed') throw new Error('Manual retry requires a failed artifact');
    if (!command.reason) throw new Error('Manual retry requires a reason');
    if (failed.versions.length >= 3) throw new Error('Three total versions exhausted; manual retry cannot reset review allowance');
    store.put('manualRetries',{id:ctx.id(),artifactId:failed.id,reason:command.reason,createdAt:ctx.now().toISOString()});
    artifact = {...failed,status:'producing',lastError:undefined};
  } else {
    if (!['video','image','text'].includes(command.kind) || !['daily','custom','reserve'].includes(command.origin)) throw new Error('Valid production kind and origin required');
    const existing = command.requestId && store.all<Artifact>('artifacts').find(a => a.requestId === command.requestId);
    if (existing) {
      if (existing.kind !== command.kind || existing.origin !== command.origin || (command.topic && existing.topic !== command.topic)) throw new Error('Request ID is already owned by different work');
      if (existing.status !== 'producing' || Date.parse(existing.leaseUntil) > ctx.now().getTime()) return existing;
      artifact = existing;
    } else artifact = {id:ctx.id(),kind:command.kind,origin:command.origin,topic:command.topic ?? ctx.config.topic,ageSegment:command.ageSegment ?? 'general',status:'producing',sourceIds:command.sourceId ? [command.sourceId] : [],segments:command.segments,createdAt:ctx.now().toISOString(),date:command.date,requestId:command.requestId,versions:[],mission:ctx.mission};
  }
  if (artifact.ageSegment !== 'general' && !ctx.config.audience.segments.includes(artifact.ageSegment)) throw new Error('Unconfigured age segment');
  const backoff = store.get<RecordData>('controls','production-backoff');
  if (backoff && Date.parse(backoff.until) > ctx.now().getTime()) return {status:'deferred',until:backoff.until,reason:'provider-backoff'};
  if (ctx.adapters.storage?.freeBytes && await ctx.adapters.storage.freeBytes() < ctx.config.limits.minFreeBytes) {
    await ctx.notify({type:'low-space',message:'Production paused: insufficient free space'});
    return {status:'deferred',reason:'low-space'};
  }
  if (ctx.adapters.capacity?.check) {
    const capacity = await ctx.adapters.capacity.check();
    if (capacity.remaining !== null && capacity.remaining <= 0) return {status:'deferred',reason:'provider-capacity'};
  }
  const source = artifact.sourceIds[0] ? store.get<RecordData>('sources',artifact.sourceIds[0]) : undefined;
  const owner = ctx.id();
  store.transaction(() => {
    const fresh = store.get<Artifact>('artifacts',artifact.id);
    if (fresh?.leaseOwner && Date.parse(fresh.leaseUntil) > ctx.now().getTime()) throw new Error('Artifact already owned by an active worker');
    const active = store.all<Artifact>('artifacts').filter(a=>a.status === 'producing' && Date.parse(a.leaseUntil) > ctx.now().getTime());
    if (active.length >= ctx.config.limits.concurrency) throw new Error('Production concurrency limit reached');
    if (artifact.kind === 'video') {
      assertPermission(source,ctx.now());
      artifact.segments = intervals(artifact.segments);
      if (artifact.origin === 'daily' && artifact.date && store.all<Artifact>('artifacts').some(a=>a.id !== artifact.id && a.origin === 'daily' && a.date === artifact.date && a.status !== 'failed' && a.sourceIds.includes(source!.id))) throw new Error('Daily clips require distinct source videos');
      for (const segment of artifact.segments) {
        const overlap = store.all<RecordData>('segments').find(s=>s.sourceId === source!.id && s.artifactId !== artifact.id && s.startMs < segment.endMs && segment.startMs < s.endMs);
        if (overlap && command.allowReuse !== true) throw new Error('Source interval already reserved or used; explicit reuse required');
      }
      for (const segment of artifact.segments) store.put('segments',{id:`${artifact.id}:${segment.startMs}:${segment.endMs}`,artifactId:artifact.id,sourceId:source!.id,...segment,status:'reserved',explicitReuse:command.allowReuse === true});
    }
    artifact.leaseOwner = owner;
    artifact.leaseUntil = new Date(ctx.now().getTime()+ctx.config.limits.leaseMs).toISOString();
    store.put('artifacts',artifact);
  });
  const bounded = async (operation: () => Promise<any>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Production task timed out; manual retry required')), ctx.config.limits.taskTimeoutMs); })]);
    } finally { if (timer) clearTimeout(timer); }
  };
  const owned = () => { if (store.get<Artifact>('artifacts',artifact.id)?.leaseOwner !== owner) throw new Error('Production ownership lost'); };
  try {
    if (!ctx.adapters.editor?.create) throw new Error('Editor adapter is not configured');
    while (artifact.versions.length < 3) {
      owned();
      let version = artifact.versions.at(-1);
      if (!version || version.review) {
        version = {id:ctx.id(),number:artifact.versions.length+1,status:'rendering',createdAt:ctx.now().toISOString()};
        artifact.versions.push(version);
        store.put('artifacts',artifact);
      }
      if (!version.filePath) {
        const outputDirectory = join(ctx.config.storage.mediaDirectory,artifact.kind,artifact.id,`v${version.number}`);
        mkdirSync(outputDirectory,{recursive:true});
        const previous = artifact.versions.at(-2);
        artifact.leaseUntil = new Date(ctx.now().getTime()+ctx.config.limits.leaseMs).toISOString();
        store.put('artifacts',artifact);
        const result = await bounded(() => ctx.adapters.editor.create({artifact,version:version.number,mission:ctx.mission,source,feedback:previous?.review?.findings ?? [],outputDirectory,idempotencyKey:version!.id}));
        owned();
        if (!result || typeof result.caption !== 'string') throw new Error('Editor must return artifact path and caption');
        if (artifact.kind === 'video' && result.segments && JSON.stringify(intervals(result.segments)) !== JSON.stringify(artifact.segments)) throw new Error('Editor changed reserved source intervals');
        validFile(result.filePath);
        const retainedPath = join(outputDirectory, `artifact${extname(result.filePath) || '.bin'}`);
        if (result.filePath !== retainedPath) copyFileSync(result.filePath, retainedPath);
        Object.assign(version,{...result,filePath:retainedPath,id:version.id,number:version.number,status:'rendered'});
        store.put('artifacts',artifact);
      }
      artifact.leaseUntil = new Date(ctx.now().getTime()+ctx.config.limits.leaseMs).toISOString();
      store.put('artifacts',artifact);
      version.review = await bounded(() => inspect(ctx,artifact,version,source));
      owned();
      store.put('reviews',{id:version.id,artifactId:artifact.id,version:version.number,...version.review,mission:ctx.mission});
      version.status = version.review.passed ? 'approved' : 'rejected';
      store.put('artifacts',artifact);
      if (version.review.passed) {
        if (source) assertPermission(source,ctx.now());
        artifact.status = 'approved';
        artifact.filePath = version.filePath;
        artifact.caption = version.caption;
        artifact.approvedAt = ctx.now().toISOString();
        store.transaction(()=> {
          owned();
          store.put('artifacts',artifact);
          for (const segment of store.all<RecordData>('segments').filter(s=>s.artifactId === artifact.id)) store.put('segments',{...segment,status:'used'});
        });
        break;
      }
    }
    if (artifact.status !== 'approved') { artifact.status = 'failed'; artifact.lastError = 'Independent review exhausted three total versions'; }
  } catch (error:any) {
    owned();
    artifact.lastError = String(error.message ?? error);
    if (['RATE_LIMIT','QUOTA_EXCEEDED','rate_limit','quota'].includes(error.code)) {
      const until = new Date(ctx.now().getTime()+ctx.config.limits.backoffMs).toISOString();
      store.put('controls',{id:'production-backoff',until});
      artifact.status = 'producing';
    } else artifact.status = 'failed';
  } finally {
    if (store.get<Artifact>('artifacts',artifact.id)?.leaseOwner === owner) {
      artifact.leaseOwner = null; artifact.leaseUntil = ctx.now().toISOString();
      store.put('artifacts',artifact);
    }
  }
  if (artifact.origin !== 'reserve' || artifact.status === 'failed') await ctx.notify({type:artifact.status === 'approved' ? 'artifact-ready':'artifact-failed',artifactId:artifact.id,origin:artifact.origin,filePath:artifact.filePath,error:artifact.lastError});
  return artifact;
}
