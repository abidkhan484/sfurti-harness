---
status: accepted
---

# Persist LLM quota deferral without occupying workers

Provider five-hour or weekly allowance exhaustion may interrupt LLM work for long periods, so the harness persists unfinished tasks and recoverable provider sessions, releases their workers, and schedules resumption while independent eligible work continues. Provider adapters report exhaustion and available reset information; the harness owns durable scheduling and uses increasingly delayed probes when availability is unknown, accepting additional recovery state instead of global production backoff or automatic model switching that could increase cost. Completed workflow steps are preserved, and a task whose conversation cannot be resumed requires attention rather than automatically starting over.

Tasks sharing an exhausted allowance wait until every applicable allowance permits execution. Deferred tasks retain their original provider/model across configuration changes, and resumption means continuing a saved conversation rather than guaranteeing continuation of an interrupted computation.
