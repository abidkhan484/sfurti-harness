# Node orchestration with a replaceable LLM provider

The harness must coordinate scheduled and custom work across multiple LLM and editing tools while allowing a future SDK change. A main Node process will orchestrate task workers, pass structured results between components, and persist their outputs; Codex SDK will be the initial LLM implementation behind a Strategy interface. This keeps workflow ownership in the harness and provider-specific behavior inside its adapter, at the cost of defining and maintaining that boundary.
