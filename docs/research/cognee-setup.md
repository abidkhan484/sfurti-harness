# Cognee local setup and operator handoff

Status: setup runbook. This is not evidence-mode activation and does not prove
that Cognee, a model provider, or Sfurti is live-ready.

Cognee is Sfurti's rebuildable retrieval index. The SQLite evidence ledger is
authoritative for source versions, claim versions, approvals, withdrawals, and
publication dependencies. Do not repair a ledger record from Cognee and do not
allow a Cognee answer, session, or generated summary to become evidence.

This runbook supports ticket 15. It deliberately does **not** add a local
compose file yet: Cognee's official Docker example currently uses a floating
`main` image and its compose schema is release-specific. Contract C12 requires
a verified, immutable release and compatibility test before Sfurti pins and
vendors that deployment. Ticket 15 owns that implementation after the version
is verified.

## What the operator supplies

Install Docker Engine and Docker Compose v2, plus Git. Choose one LLM and one
embedding provider that Cognee supports. A local Ollama pair is possible; a
hosted provider needs its own key. Configure both providers together: setting
only the LLM provider can otherwise fall back to OpenAI embeddings.

Keep Cognee's provider configuration in a separate, private file in the
Cognee checkout, never in Sfurti's repository or the Sfurti `.env` file.
The exact keys below are Cognee's documented configuration names; values are
intentionally omitted.

```dotenv
# Cognee service's private .env -- do not commit
LLM_PROVIDER=
LLM_MODEL=
LLM_API_KEY=
EMBEDDING_PROVIDER=
EMBEDDING_MODEL=
EMBEDDING_API_KEY=

# Required only for a chosen external backend; do not set unused providers.
DB_PROVIDER=
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_NAME=
GRAPH_DATABASE_PROVIDER=
GRAPH_DATABASE_URL=
GRAPH_DATABASE_NAME=
GRAPH_DATABASE_USERNAME=
GRAPH_DATABASE_PASSWORD=
VECTOR_DB_PROVIDER=
VECTOR_DB_URL=
VECTOR_DB_KEY=

# Recommended for a local privacy-first trial.
TELEMETRY_DISABLED=true
```

Sfurti reads only these Cognee connection variables from its private `.env`:

```dotenv
# Leave research disabled until all readiness gates are complete.
SFURTI_RESEARCH_ENABLED=false
SFURTI_COGNEE_BASE_URL=http://127.0.0.1:18000
SFURTI_COGNEE_TOKEN=
```

`SFURTI_COGNEE_TOKEN` is blank only when the verified self-hosted release
has authentication deliberately disabled on a loopback-only development
instance. It must contain a dedicated service token whenever authentication is
enabled. Do not use a browser session, cloud API key, or LLM key as this value.
The ticket-15 adapter must redact it in errors, logs, test fixtures, and
`doctor` output.

## Verify a pin before running a service

The current official documentation advertises Docker examples using
`cognee/cognee:main`. That is useful for exploration, but it is not an
acceptable Sfurti pin. Follow this procedure before starting a persistent
service:

1. Read the official Docker and API documentation linked below and select a
   released upstream tag; do not select `main`, `latest`, a branch, or an
   unreviewed package version.
2. Clone the official upstream repository into a directory outside this
   repository, fetch tags, check out the selected tag, and record both the tag
   and immutable commit SHA:

   ```sh
   git clone https://github.com/topoteretes/cognee.git /path/to/cognee
   cd /path/to/cognee
   git fetch --tags --force
   git tag --sort=-version:refname | head -n 20
   git checkout <verified-release-tag>
   git rev-parse HEAD
   ```

3. Inspect that exact checkout's `docker-compose.yml`, Dockerfile, `.env`
   template, API OpenAPI/interactive docs, and image digest (if it uses a
   published image). Confirm its provider variables, persistent paths/volumes,
   authentication mechanism, and supported HTTP operations.
4. Capture the tag, commit SHA, image digest or source-build digest, API base
   path, auth header, and request/response fixtures in
   `docs/integrations/research-providers.md`. Commit a Sfurti deployment lock
   only after ticket 15's adapter fixture tests pass against that release.

Do not apply an upstream compose file unchanged if it publishes Cognee on all
interfaces or leaves it unauthenticated. Bind a development service to
`127.0.0.1` only, or place an authenticated reverse proxy/firewall in front of
it. The eventual Sfurti compose file must use named persistent volumes and
must not publish an unauthenticated service to the LAN or Internet.

## Start a verified local service

After the pin review, use the commands that belong to the _checked-out release_
rather than substituting a command from an older guide. Cognee's current Docker
guide uses Docker Compose profiles: the core API starts as `cognee`, and
PostgreSQL, Neo4j, ChromaDB, and Redis are optional profiles. Choose the
smallest supported stack that passes the lifecycle check; do not start a graph,
vector, cache, or database service merely because it is available.

Before declaring local setup complete, record all of the following in the
ticket-15 completion comment:

- release tag, source commit SHA, built/pulled image digest, and host platform;
- selected LLM, embedding, relational/vector/graph providers and model names;
- non-secret service URL and confirmed authentication mode;
- exact volumes or host paths that preserve the index and backing databases;
- the command used to start, stop, and back up the service;
- API base path and compatibility fixture names.

Never run `docker compose down --volumes` against a service containing useful
test or production memory. It deletes the named volumes. A normal `down`
preserves them; verify this against the selected release's compose file.

## Required dataset and provenance policy

The adapter creates or targets only these logical datasets. Their exact remote
IDs are provider state and must be recorded by the adapter, not guessed by an
operator.

| Sfurti dataset                | Intended records                             | Forbidden promotion                    |
| ----------------------------- | -------------------------------------------- | -------------------------------------- |
| `sfurti-audience-v1`          | redacted audience signals                    | audience report to scientific evidence |
| `sfurti-evidence-v1`          | versioned source excerpts/findings           | source text to approved claim          |
| `sfurti-approved-claims-v1`   | current approved or qualified claim versions | generated answer to claim              |
| `sfurti-editorial-history-v1` | bounded editorial retrieval metadata         | generator/reviewer session to evidence |

Each upsert must include the immutable `entityVersionId`, source
`documentVersionId` where applicable, locator, content hash, schema version,
and a Sfurti idempotency key in structured metadata. Sfurti must reject a
search hit that lacks a resolvable entity version ID; score, text, or a
Cognee-generated answer is not provenance. A withdrawn, expired, changed, or
unresolvable claim remains unusable even if Cognee still returns it.

Call permanent-memory ingestion without a session identifier. Do not enable
Cognee session self-improvement or route session material to any of the four
approved datasets. Any experiment with agent/session memory must use an
isolated, disposable dataset outside this naming scheme.

## Local verification checklist

Run these checks only after ticket 15 has mapped the verified release to the
typed `Memory` adapter. They are an operator-assisted local test, not a live
readiness claim.

1. **Health and version.** Call the documented health endpoint through the
   adapter. Save the returned version/capabilities and fail closed if the
   expected API version or required operations are missing. A TCP connection
   alone does not pass.
2. **Indexing lifecycle.** Upsert one synthetic, non-sensitive record to each
   dataset. Record the returned job and dataset IDs. Poll the release's dataset
   status/pipeline endpoint until it is explicitly complete; `pending` is not
   ready. Test a failed status too. Restart the service after a remote
   completion but before the local status write and verify idempotent recovery
   rather than duplicate ingestion.
3. **Provenance search.** Search each dataset separately. Confirm every hit
   contains a resolvable `entityVersionId`; inject a hit without one and verify
   the adapter excludes it. Confirm a query cannot cross dataset boundaries
   unless Sfurti explicitly requests those datasets.
4. **Deletion/tombstone.** Mark the synthetic ledger entity withdrawn first,
   then request the memory remove operation using its recorded remote IDs and
   idempotency key. Poll completion, search again, and retain the ledger
   tombstone regardless of remote response. Simulate a stale high-scoring hit
   and verify the ledger gate excludes it.
5. **Rebuild.** Stop the index, restore the authoritative ledger fixture, and
   rebuild the four datasets from the memory outbox. Confirm claim approval,
   withdrawal, and dependency state are unchanged before and after rebuilding.
6. **Secrets and exposure.** Check that `docker compose config` and Sfurti
   `doctor` redact secrets, and that the bound port is loopback-only or behind
   an authenticated proxy. Do not paste provider keys, tokens, or raw audience
   data into ticket comments.

## Operator handoff to the implementation agent

Provide this non-secret handoff once the local service is ready:

```text
Cognee release tag:
Cognee commit SHA:
Image digest or local build digest:
Service base URL (loopback/proxied):
Authentication mode and header verified from this release:
Enabled providers and model names (no keys):
Persistent volumes/paths:
Health endpoint result (version/capabilities, redacted):
Dataset-status endpoint/result shape (redacted):
Remember/upsert, search, and remove request/response samples (redacted):
Index pending -> ready check performed: yes/no
Delete/tombstone check performed: yes/no
Rebuild-from-ledger check performed: yes/no
Known limitations or provider quotas:
```

The agent can then implement and fixture-test the release-specific adapter.
Do not provide credentials in chat, commit them, or authorize live Facebook
publication as part of this handoff.

## Authoritative references

- [Cognee Docker deployment](https://docs.cognee.ai/how-to-guides/cognee-sdk/deployment/docker)
- [Cognee API introduction](https://docs.cognee.ai/api-reference/introduction)
- [Cognee remember operation and indexing status](https://docs.cognee.ai/core-concepts/main-operations/remember)
- [Cognee remember HTTP API](https://docs.cognee.ai/api-reference/remember/remember)
- [Cognee local provider setup](https://docs.cognee.ai/guides/local-setup)
