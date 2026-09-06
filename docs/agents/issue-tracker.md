# Issue tracker: Local Markdown

Issues and specs live under `.scratch/`.

- One feature per directory: `.scratch/<feature-slug>/`.
- Feature spec: `.scratch/<feature-slug>/spec.md`.
- Implementation tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from 01, with one ticket per file.
- Record triage state using a `Status:` line near the top.
  Use the vocabulary in `triage-labels.md`.
- Append discussion under a `## Comments` heading.

When a skill says to publish, create or update the corresponding local
Markdown file. When it says to fetch a ticket, read that file.

Resolve a bare ticket number within its feature directory; numbers
are not globally unique.

Tracker migration is a separate explicit change. Preserve existing
specs, statuses, and discussion when moving to another tool.
