---
status: accepted
---

# Add an opt-in Pi free preview profile

The Raspberry Pi deployment uses a versioned `pi-free` profile rather than changing existing profiles. It fixes the initial content target at three videos, one image, and one text daily, retains the 90-day planning target, stays in preview mode, and permits only ChatGPT-authenticated Codex use. It keeps legacy clip production and disabled research, in accordance with ADR-0001, ADR-0003, and ADR-0005. Remote publication remains separate from planning and production as required by ADR-0002.

The profile adds conservative storage, native process, intake, search, and receipt defaults. These are policy settings, not evidence of Pi capacity or account connectivity; live activation and external mutation require later operator-authorized records.
