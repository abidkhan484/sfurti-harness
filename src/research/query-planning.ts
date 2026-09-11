import { createHash } from "node:crypto";
import type { SearchQuery, SearchRun } from "./contracts.ts";
import { ResearchRepository } from "./repository.ts";

/** The five editorial areas are deliberately fixed, so an empty registry still discovers broadly. */
export const DISCOVERY_BUCKETS = [
  "Attention & Focus",
  "Behavior & Emotion",
  "Learning & Creativity",
  "Physical / Real-world Life",
  "Solutions & Alternatives",
] as const;

const PURPOSES = ["exploration", "follow_up", "refresh", "feedback"] as const;
type SearchPurpose = (typeof PURPOSES)[number];
type QueryIntent = SearchQuery["intent"];

export interface PlannedSearchQuery extends SearchQuery {
  /** Persisted provenance for the selection; connectors ignore this field. */
  reason: string;
}

/** C4 includes a selection reason even though the connector-facing query does not. */
export type SearchPlanQuery = Omit<SearchQuery, "id" | "provider"> & { reason: string };

export interface SearchPlanInput {
  queries: SearchPlanQuery[];
  nextQuestions: string[];
}

export interface PlannedSearchRun extends Omit<SearchRun, "queries"> {
  queries: PlannedSearchQuery[];
}

export interface QueryPlanningInput {
  /** Defaults to a full research-cycle allocation. */
  purpose?: SearchPurpose;
  languages: readonly string[];
  provider?: string | ((language: string) => string);
  maxQueries: number;
  dueAt: string;
  mission?: string;
  queuedQuestions?: readonly string[];
  feedbackSummaries?: readonly string[];
  priorQueries?: readonly string[];
  /** A parser-validated C4 Search.plan response, if a caller elects to use one. */
  agentPlan?: SearchPlanInput;
}

export interface PersistedSearchExecutor<T = unknown> {
  execute(run: SearchRun): Promise<T>;
}

interface Candidate {
  purpose: SearchPurpose;
  bucket: string;
  text: string;
  language: string;
  intent: QueryIntent;
  reason: string;
  provider: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Text normalization is only for duplicate identity. Search text is retained
 * exactly as selected, including its original language and wording.
 */
export function normalizeQueryText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und").trim().replace(/\s+/gu, " ");
}

function normalizedLanguage(language: string): string {
  return language.normalize("NFKC").toLocaleLowerCase("und").trim();
}

function cleanText(value: string): string {
  return Array.from(value.normalize("NFKC"))
    .map((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point < 32 || point === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}

function providerFor(provider: QueryPlanningInput["provider"], language: string): string {
  const selected = typeof provider === "function" ? provider(language) : (provider ?? "searxng");
  const clean = cleanText(selected);
  if (!clean) throw new Error("A search provider identity is required");
  return clean;
}

function fallbackText(bucket: string, language: string, intent: QueryIntent): string {
  if (language.toLocaleLowerCase("und").startsWith("bn")) {
    const suffix =
      intent === "counter_evidence"
        ? "বিপরীত প্রমাণ ও সীমাবদ্ধতা"
        : intent === "practical"
          ? "বাস্তবসম্মত বিকল্প কার্যক্রম"
          : "অভিভাবকের প্রশ্ন ও নিরপেক্ষ প্রমাণ";
    return `${bucket}: শিশুদের জন্য ${suffix}`;
  }
  const suffix =
    intent === "counter_evidence"
      ? "contrary evidence and limitations"
      : intent === "practical"
        ? "practical alternatives for families"
        : "parent questions and neutral evidence";
  return `${bucket}: children ${suffix}`;
}

function allocation(total: number): Record<SearchPurpose, number> {
  const weights: Record<SearchPurpose, number> = {
    exploration: 0.4,
    follow_up: 0.3,
    refresh: 0.2,
    feedback: 0.1,
  };
  const values = PURPOSES.map((purpose, order) => {
    const exact = total * weights[purpose];
    return { purpose, order, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remainder = total - values.reduce((sum, value) => sum + value.count, 0);
  for (const value of [...values].sort((a, b) => b.remainder - a.remainder || a.order - b.order)) {
    if (!remainder) break;
    value.count++;
    remainder--;
  }
  return Object.fromEntries(values.map((value) => [value.purpose, value.count])) as Record<
    SearchPurpose,
    number
  >;
}

function sourceCandidates(
  values: readonly string[],
  purpose: SearchPurpose,
  languages: readonly string[],
  provider: QueryPlanningInput["provider"],
  intent: QueryIntent,
  reason: string
): Candidate[] {
  return values.flatMap((value, index) => {
    const text = cleanText(value);
    if (!text) return [];
    return languages.map((language) => ({
      purpose,
      bucket: DISCOVERY_BUCKETS[index % DISCOVERY_BUCKETS.length],
      text,
      language,
      intent,
      reason,
      provider: providerFor(provider, language),
    }));
  });
}

function explorationCandidates(
  languages: readonly string[],
  provider: QueryPlanningInput["provider"]
): Candidate[] {
  const candidates: Candidate[] = [];
  const intents: QueryIntent[] = ["neutral", "counter_evidence", "practical"];
  for (let index = 0; index < DISCOVERY_BUCKETS.length * languages.length; index++) {
    const bucket = DISCOVERY_BUCKETS[index % DISCOVERY_BUCKETS.length];
    const language = languages[Math.floor(index / DISCOVERY_BUCKETS.length) % languages.length];
    const intent = intents[index % intents.length];
    candidates.push({
      purpose: "exploration",
      bucket,
      text: fallbackText(bucket, language, intent),
      language,
      intent,
      reason: "deterministic zero-seed discovery fallback",
      provider: providerFor(provider, language),
    });
  }
  return candidates;
}

function queryKey(candidate: Candidate): string {
  return [
    normalizeQueryText(candidate.text),
    normalizedLanguage(candidate.language),
    normalizeQueryText(candidate.provider),
  ].join("\u001f");
}

function runIdentity(
  purpose: SearchPurpose,
  bucket: string,
  queries: PlannedSearchQuery[]
): string {
  return `search-run-${digest(JSON.stringify({ purpose, bucket, queries: queries.map(({ id }) => id) })).slice(0, 32)}`;
}

function queryId(candidate: Candidate): string {
  return `search-query-${digest(`${candidate.purpose}\u001f${candidate.bucket}\u001f${queryKey(candidate)}`).slice(0, 32)}`;
}

function isPurpose(value: string): value is SearchPurpose {
  return (PURPOSES as readonly string[]).includes(value);
}

function allRuns(repository: ResearchRepository): SearchRun[] {
  const runs: SearchRun[] = [];
  let cursor: string | undefined;
  do {
    const page = repository.list<SearchRun>("research_search_runs", cursor, 100);
    runs.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return runs;
}

/**
 * Creates immutable, restart-safe search runs. It never invokes a connector or
 * an LLM: callers may optionally supply an already validated Search.plan draft.
 */
export class QueryPlanner {
  private readonly repository: ResearchRepository;
  constructor(repository: ResearchRepository) {
    this.repository = repository;
  }

  plan(input: QueryPlanningInput): PlannedSearchRun[] {
    if (!Number.isSafeInteger(input.maxQueries) || input.maxQueries < 1)
      throw new Error("maxQueries must be a positive integer");
    if (!Number.isFinite(Date.parse(input.dueAt)) || !input.dueAt.endsWith("Z"))
      throw new Error("dueAt must be a UTC ISO date");
    const languages = [...new Set(input.languages.map(normalizedLanguage).filter(Boolean))];
    if (!languages.length) throw new Error("At least one query language is required");
    if (input.purpose && !isPurpose(input.purpose)) throw new Error("Unknown search purpose");

    const agentCandidates = (input.agentPlan?.queries ?? []).flatMap((query, index) => {
      const language = normalizedLanguage(query.language);
      const text = cleanText(query.text);
      if (!language || !text || !languages.includes(language)) return [];
      return [
        {
          purpose: input.purpose ?? ("exploration" as SearchPurpose),
          bucket: DISCOVERY_BUCKETS[index % DISCOVERY_BUCKETS.length],
          text,
          language,
          intent: query.intent,
          reason: `validated search-agent proposal: ${cleanText(query.reason)}`,
          provider: providerFor(input.provider, language),
        },
      ];
    });
    const candidates: Record<SearchPurpose, Candidate[]> = {
      exploration: [
        ...agentCandidates.filter((candidate) => candidate.purpose === "exploration"),
        ...explorationCandidates(languages, input.provider),
      ],
      follow_up: sourceCandidates(
        input.queuedQuestions ?? [],
        "follow_up",
        languages,
        input.provider,
        "neutral",
        "queued research question"
      ),
      refresh: sourceCandidates(
        input.priorQueries ?? [],
        "refresh",
        languages,
        input.provider,
        "counter_evidence",
        "prior query refresh"
      ),
      feedback: sourceCandidates(
        input.feedbackSummaries ?? [],
        "feedback",
        languages,
        input.provider,
        "neutral",
        "anonymized audience observation"
      ),
    };

    const selected: Candidate[] = [];
    const seen = new Set<string>();
    const take = (purpose: SearchPurpose, count: number): number => {
      let taken = 0;
      for (const candidate of candidates[purpose]) {
        if (taken === count) break;
        const key = queryKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push(candidate);
        taken++;
      }
      return taken;
    };

    const targets = input.purpose
      ? (Object.fromEntries(
          PURPOSES.map((purpose) => [purpose, purpose === input.purpose ? input.maxQueries : 0])
        ) as Record<SearchPurpose, number>)
      : allocation(input.maxQueries);
    let unfilled = 0;
    for (const purpose of PURPOSES) unfilled += targets[purpose] - take(purpose, targets[purpose]);
    // C8: shares without usable source work are borrowed in this stable order.
    while (unfilled > 0) {
      const before = selected.length;
      for (const purpose of PURPOSES) {
        if (!unfilled) break;
        unfilled -= take(purpose, 1);
      }
      if (selected.length === before) break;
    }
    // Exploration fallback is deliberately repeatable across every bucket/language.
    for (let cycle = 1; selected.length < input.maxQueries; cycle++) {
      for (const base of explorationCandidates(languages, input.provider)) {
        if (selected.length === input.maxQueries) break;
        const candidate = {
          ...base,
          text: `${base.text} ${cycle + 1}`,
          reason: "bounded expansion of deterministic zero-seed discovery fallback",
        };
        if (seen.has(queryKey(candidate))) continue;
        seen.add(queryKey(candidate));
        selected.push(candidate);
      }
    }

    // With two slots, C8 requires both exploration and counter-evidence coverage.
    if (
      input.maxQueries >= 2 &&
      !selected.some((candidate) => candidate.intent === "counter_evidence")
    ) {
      const candidate = explorationCandidates(languages, input.provider).find(
        (value) => value.intent === "counter_evidence" && !seen.has(queryKey(value))
      );
      if (candidate) selected[selected.length - 1] = candidate;
    }
    if (
      input.maxQueries >= 2 &&
      !selected.some((candidate) => candidate.purpose === "exploration")
    ) {
      const candidate = explorationCandidates(languages, input.provider).find(
        (value) => !seen.has(queryKey(value))
      );
      if (candidate) selected[0] = candidate;
    }

    const grouped = new Map<string, Candidate[]>();
    for (const candidate of selected) {
      const key = `${candidate.purpose}\u001f${candidate.bucket}`;
      grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
    }
    const existing = new Map(allRuns(this.repository).map((run) => [run.id, run]));
    const results: PlannedSearchRun[] = [];
    for (const [key, group] of grouped) {
      const [purpose, bucket] = key.split("\u001f") as [SearchPurpose, string];
      const queries = group.map((candidate) => ({
        id: queryId(candidate),
        text: candidate.text,
        language: candidate.language,
        intent: candidate.intent,
        provider: candidate.provider,
        reason: candidate.reason,
      }));
      const id = runIdentity(purpose, bucket, queries);
      const prior = existing.get(id) as PlannedSearchRun | undefined;
      if (prior) {
        results.push(prior);
        continue;
      }
      const run: PlannedSearchRun = {
        id,
        schemaVersion: 1,
        createdAt: input.dueAt,
        updatedAt: input.dueAt,
        purpose,
        bucket,
        queries,
        status: "planned",
        cursorByQuery: Object.fromEntries(queries.map((query) => [query.id, null])),
        counts: { planned: queries.length, retrieved: 0 },
        dueAt: input.dueAt,
      };
      this.repository.saveDraft("research_search_runs", run);
      results.push(run);
    }
    return results;
  }

  /** Connectors execute this persisted record; planning is never repeated on resumption. */
  async executePersisted<T>(searchRunId: string, executor: PersistedSearchExecutor<T>): Promise<T> {
    const run = allRuns(this.repository).find((candidate) => candidate.id === searchRunId);
    if (!run) throw new Error(`Unknown search run: ${searchRunId}`);
    return executor.execute(run);
  }
}
