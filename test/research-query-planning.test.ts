import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { QueryPlanner, normalizeQueryText } from "../src/research/query-planning.ts";
import { ResearchRepository } from "../src/research/repository.ts";
import { Store } from "../src/store.ts";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "sfurti-query-plan-"));
  const store = new Store(join(directory, "fixture.sqlite"));
  return { directory, store, planner: new QueryPlanner(new ResearchRepository(store)) };
}

const dueAt = "2026-09-10T00:00:00.000Z";

test("zero-seed planning covers five buckets without Facebook input", async () => {
  const { directory, store, planner } = await fixture();
  try {
    const runs = planner.plan({ languages: ["bn", "en", "fr"], maxQueries: 12, dueAt });
    const queries = runs.flatMap((run) => run.queries);
    assert.equal(queries.length, 12);
    assert.deepEqual(
      new Set(runs.map((run) => run.bucket)),
      new Set([
        "Attention & Focus",
        "Behavior & Emotion",
        "Learning & Creativity",
        "Physical / Real-world Life",
        "Solutions & Alternatives",
      ])
    );
    assert.ok(queries.some((query) => query.language === "bn"));
    assert.ok(queries.some((query) => query.language === "en"));
    assert.ok(queries.some((query) => query.language === "fr"));
    assert.ok(queries.some((query) => query.intent === "counter_evidence"));
    assert.ok(queries.every((query) => !/facebook\.com/iu.test(query.text)));
    assert.ok(queries.every((query) => query.reason));
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("allocates 40/30/20/10 source work, persists before execution, and resumes by run id", async () => {
  const { directory, store, planner } = await fixture();
  try {
    const runs = planner.plan({
      languages: ["bn", "en"],
      maxQueries: 10,
      dueAt,
      queuedQuestions: ["How can a child focus during homework?", "What is age appropriate?"],
      priorQueries: ["children attention evidence"],
      feedbackSummaries: ["A parent asks for a non-phone activity"],
    });
    const byPurpose = Object.fromEntries(
      ["exploration", "follow_up", "refresh", "feedback"].map((purpose) => [
        purpose,
        runs.filter((run) => run.purpose === purpose).flatMap((run) => run.queries).length,
      ])
    );
    assert.deepEqual(byPurpose, { exploration: 4, follow_up: 3, refresh: 2, feedback: 1 });
    const target = runs[0];
    let persisted = false;
    const result = await planner.executePersisted(target.id, {
      async execute(run) {
        persisted = store.get("research_search_runs", run.id) !== undefined;
        return run.id;
      },
    });
    assert.equal(result, target.id);
    assert.equal(persisted, true);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("query identity is language/provider aware and repeated planning never duplicates work", async () => {
  const { directory, store, planner } = await fixture();
  try {
    const input = {
      languages: ["en", "bn"],
      maxQueries: 2,
      dueAt,
      purpose: "exploration" as const,
      agentPlan: {
        queries: [
          { text: " Children   focus ", language: "en", intent: "neutral" as const, reason: "one" },
          {
            text: "children focus",
            language: "bn",
            intent: "counter_evidence" as const,
            reason: "two",
          },
        ],
        nextQuestions: [],
      },
    };
    const first = planner.plan(input);
    const second = planner.plan(input);
    assert.equal(first.flatMap((run) => run.queries).length, 2);
    assert.deepEqual(
      second.map((run) => run.id),
      first.map((run) => run.id)
    );
    assert.equal(store.all("research_search_runs").length, first.length);
    const queries = first.flatMap((run) => run.queries);
    assert.notEqual(queries[0].id, queries[1].id);
    assert.equal(normalizeQueryText(" Children   FOCUS "), "children focus");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a two-query plan always retains exploration and counter-evidence", async () => {
  const { directory, store, planner } = await fixture();
  try {
    const runs = planner.plan({
      languages: ["en"],
      maxQueries: 2,
      dueAt,
      queuedQuestions: ["What did this parent ask?"],
      feedbackSummaries: ["What activity should we try?"],
    });
    const queries = runs.flatMap((run) => run.queries);
    assert.ok(runs.some((run) => run.purpose === "exploration"));
    assert.ok(queries.some((query) => query.intent === "counter_evidence"));
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
