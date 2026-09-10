# Research provider integration checks

## SearXNG search

The built-in SearXNG adapter was checked against the official **2026.9.8+3fdc6d753** Search API documentation on 2026-09-10. It sends an operator-configured instance a `GET /search` request with `q`, `language`, `format=json`, and one-based `pageno`. The documentation states that JSON is an optional enabled output format; a 403 means the instance must enable `json` under `search.formats` rather than that the harness should use another instance.

The adapter maps only documented discovery result fields (`url`, `title`, `content`, optional `publishedDate` and `engine`). Snippets are discovery metadata, never evidence or full-text access. It treats the documented `unresponsive_engines` signal and malformed result records as partial coverage. A 429 becomes a durable rate-limit error with `Retry-After` when supplied; it never loses the caller's cursor. HTML/non-JSON responses are protocol failures, not successful empty searches.

Operator check (does not mark live readiness until a real configured instance responds):

```sh
curl --fail --get "$SFURTI_SEARXNG_URL/search" \
  --data-urlencode 'q=child development evidence' \
  --data-urlencode 'language=en' \
  --data-urlencode 'format=json' \
  --data-urlencode 'pageno=1'
```

Record the instance version, enabled formats, enabled engines, check timestamp, and known coverage limits in the operator's deployment record. Never substitute a public instance or scrape search HTML.

Reference: [SearXNG Search API](https://docs.searxng.org/dev/search_api.html).

## Europe PMC scholarly search

The built-in Europe PMC adapter was mapped against the official REST service and reference guide on 2026-09-10. It requests `GET /search` with encoded `query`, `format=json`, `resultType=core`, bounded `pageSize`, and `cursorMark` (`*` on the first page). The response is read from `resultList.result`; `nextCursorMark` is retained only when it advances, preventing an exhausted cursor from looping.

The documented core fields mapped are `id`, `source`, `doi`, `title`, `abstractText`, `firstPublicationDate`/`pubYear`, `authorString`, `authorList.author.fullName`, `isOpenAccess`, and `fullTextUrlList.fullTextUrl`. The adapter preserves normalized DOI and `source:id` provider identity, authors, dates, and returned full-text/publisher links. An abstract is always discovery metadata, never a claim that the full paper was fetched or appraised. Returned links are ordinary collector candidates and must pass collection, extraction, and evidence review; publisher links remain available for appraisal and updated guidance.

DOIs are normalized (`doi:`/DOI URL stripped, lowercase) into a shared identity key. A web result and a Europe PMC result with the same DOI are separate provenance matches for one study, not independent evidence.

Operator check (does not establish live readiness):

```sh
curl --fail --get 'https://www.ebi.ac.uk/europepmc/webservices/rest/search' \
  --data-urlencode 'query=child development' \
  --data-urlencode 'format=json' \
  --data-urlencode 'resultType=core' \
  --data-urlencode 'pageSize=10' \
  --data-urlencode 'cursorMark=*'
```

Record the service/reference-guide version, date checked, request/response sample with any local identifiers redacted, rate-limit behavior, and known scope limits before activation. The adapter's fixture tests use synthetic data only; no live request was made during implementation.

References: [Europe PMC RESTful Web Service](https://dev.europepmc.org/RestfulWebService) and [Europe PMC Web Service Reference Guide](https://europepmc.org/docs/EBI_Europe_PMC_Web_Service_Reference.pdf).

## Cognee retrieval memory

Sfurti's SQLite ledger—not Cognee—is authoritative for evidence/claim versions,
approvals, withdrawals, dependencies, and publication history. Cognee is a
rebuildable retrieval index behind `CogneeMemory`. The adapter routes only the
four fixed datasets (`sfurti-audience-v1`, `sfurti-evidence-v1`,
`sfurti-approved-claims-v1`, and `sfurti-editorial-history-v1`), requires
structured provenance on every upsert, and discards a retrieval hit that lacks
an `entityVersionId`. In particular, a Cognee generated answer is not evidence.

As of 2026-09-10, no immutable Cognee HTTP image/schema has been verified by
an operator for this repository. The official deployment guide's `main` image
is intentionally not pinned here. Consequently, the adapter takes an explicit
reviewed `CogneeProtocol`: release ID, API version, required capabilities, and
typed encoders/decoders for health, upsert, status, search, and remove. It
health-checks that protocol before each stateful operation and fails closed on
an API-version/capability mismatch. This is a real injected HTTP boundary, but
does not claim that the fixture protocol is Cognee's production schema.

The included fixture protocol (`fixture-release-1`, API version
`sfurti-cognee-http/verified-fixture-1`) is synthetic and tests the pending,
ready, failed, removal, incompatible-version, provenance-exclusion, dataset
routing, bounded-output, and credential-redaction paths. It is not a release
pin and does not establish local or live readiness.

Before enabling the adapter against a service, follow
[`docs/research/cognee-setup.md`](../research/cognee-setup.md) and give the
implementer the release tag, commit SHA, image/source-build digest, exact API
base path, auth mechanism, health/version/capabilities sample, and redacted
upsert/status/search/remove samples. The next release-specific change must
replace the fixture protocol with those reviewed mappings, record the immutable
pin here, and pass its fixtures without widening accepted response fields.

References: [Cognee Docker deployment](https://docs.cognee.ai/how-to-guides/cognee-sdk/deployment/docker), [Cognee API introduction](https://docs.cognee.ai/api-reference/introduction), and [Cognee remember](https://docs.cognee.ai/core-concepts/main-operations/remember).
