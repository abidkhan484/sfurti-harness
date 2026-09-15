import { createHash } from "node:crypto";
import { AdapterError } from "../process.ts";
import { SearxngSearch, type HttpTransport } from "../search/searxng.ts";

type Input = { topic: string; language: string; idempotencyKey: string; signal?: AbortSignal };
type DiscoveryConfig = {
  endpoint: string;
  queriesPerBatch: number;
  resultsPerQuery: number;
  maxRecommendationsPerTopic: number;
  minRequestSpacingMs: number;
  transport: HttpTransport;
  now?: () => Date;
};

/**
 * Bounded metadata-only discovery. It deliberately has no downloader, source
 * fetcher, permission field, or qualification output: an operator must supply
 * a locally stored permission-backed source before production can use it.
 */
export class LocalDiscovery {
  private readonly search: SearxngSearch;
  private readonly config: DiscoveryConfig;
  private readonly cache = new Map<string, unknown>();
  private lastRequestAt = 0;
  constructor(config: DiscoveryConfig) {
    if (
      !Number.isSafeInteger(config.queriesPerBatch) ||
      config.queriesPerBatch < 1 ||
      config.queriesPerBatch > 5
    )
      throw new AdapterError("configuration", "Discovery queriesPerBatch must be 1–5");
    this.config = config;
    this.search = new SearxngSearch({ baseUrl: config.endpoint, transport: config.transport });
  }
  async discover(input: Input) {
    if (this.cache.has(input.idempotencyKey)) return this.cache.get(input.idempotencyKey);
    const signal = input.signal ?? new AbortController().signal;
    const queries = querySet(input.topic, input.language, this.config.queriesPerBatch);
    const hits: Array<{
      query: string;
      hit: Awaited<ReturnType<SearxngSearch["search"]>>["hits"][number];
    }> = [];
    const limitations: string[] = [];
    for (const query of queries) {
      const wait = this.lastRequestAt + this.config.minRequestSpacingMs - Date.now();
      if (wait > 0) await delay(wait, signal);
      this.lastRequestAt = Date.now();
      try {
        const result = await this.search.search({
          query,
          language: input.language,
          limit: this.config.resultsPerQuery,
          signal,
        });
        hits.push(...result.hits.map((hit) => ({ query, hit })));
        if (result.coverage.partial)
          limitations.push(result.coverage.reason ?? "partial SearXNG coverage");
      } catch (error) {
        if (
          error instanceof AdapterError &&
          ["configuration", "rate_limit", "timeout", "unavailable", "protocol"].includes(error.kind)
        ) {
          limitations.push(`query unavailable: ${query}`);
          continue;
        }
        throw error;
      }
    }
    const unique = new Map<string, (typeof hits)[number]>();
    for (const entry of hits) if (!unique.has(entry.hit.url)) unique.set(entry.hit.url, entry);
    const selected = [...unique.values()].slice(0, this.config.maxRecommendationsPerTopic);
    const now = (this.config.now ?? (() => new Date()))().toISOString();
    const sources = selected.map(({ hit }) => ({
      id: sourceId(hit.url),
      title: hit.title,
      language: observedLanguage(hit),
      canonicalUrl: hit.url,
      metadata: {
        canonicalUrl: hit.url,
        observedEvidence: [{ locator: hit.url, retrievedAt: now, snippet: hit.snippet }],
        qualified: false,
      },
    }));
    const result = {
      keywords: queries.map((query, index) => ({
        id: `q${index + 1}`,
        query,
        language: input.language,
        intent: "permission-backed source recommendation",
      })),
      sources,
      matches: selected.map(({ query, hit }) => ({
        keywordId: `q${queries.indexOf(query) + 1}`,
        sourceId: sourceId(hit.url),
        locator: hit.url,
      })),
      recommendations: selected.map(({ hit }) => ({
        sourceId: sourceId(hit.url),
        canonicalUrl: hit.url,
        title: hit.title,
        language: observedLanguage(hit),
        rationaleBn:
          "এটি কেবল একটি সম্ভাব্য উৎস; অনুমতি ও স্থানীয় ভিডিও জমা দেওয়ার আগে ব্যবহার করা যাবে না।",
        observedEvidence: [{ locator: hit.url, retrievedAt: now, snippet: hit.snippet }],
        tentativeSegments: [],
        limitations: [
          ...limitations,
          "Metadata-only discovery; actual content, reuse permission and timestamps are unverified.",
        ],
      })),
      coverage: { partial: limitations.length > 0, limitations },
    };
    this.cache.set(input.idempotencyKey, result);
    return result;
  }
}
function querySet(topic: string, language: string, limit: number) {
  const base = topic.trim();
  if (!base || base.length > 400)
    throw new AdapterError("configuration", "Discovery topic must be 1–400 characters");
  return [
    base,
    `${base} শিশু কার্যক্রম`,
    `${base} অভিভাবক পরামর্শ`,
    `${base} Bangla video`,
    `${base} practical activity`,
  ]
    .slice(0, limit)
    .map((q) => `${q} ${language}`.trim());
}
function sourceId(url: string) {
  return `discovery-${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
}
function observedLanguage(hit: { title: string; snippet: string }) {
  return /[\u0980-\u09ff]/u.test(`${hit.title} ${hit.snippet}`) ? "bn" : null;
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new AdapterError("timeout", "Discovery cancelled"));
      },
      { once: true }
    );
  });
}
