# Manual external dependency updates

Status: planned procedure. External repositories have not been installed, and final URLs, paths, pinned commits, and adapter-specific checks must be filled in during integration. This document does not claim an update command currently exists.

The user requires installable subrepositories and manual update instructions. The proposed mechanism is Git submodules pinned to commits. Confirm the intended upstream projects before initial installation. Neither daily production nor service startup may fetch or install newer upstream code automatically.

## Update procedure

1. Pause creation of new work that uses the dependency and let its active tasks finish. Keep existing publication state intact.
2. Back up harness state, dependency-specific configuration, and any persistent dependency data using a consistent backup procedure.
3. Record the currently pinned commit. Check that the subrepository has no uncommitted local changes; preserve any local work before proceeding.
4. Read the chosen upstream release notes and migration requirements. Select an explicit release or commit, then fetch it. Do not select an unreviewed moving branch merely because it is newest.
5. Check out that version and install its documented dependencies in its isolated environment. Follow required migrations only after understanding whether rollback is possible.
6. Run the harness adapter compatibility checks and a small content-generation check with Facebook publication disabled. Verify returned schemas, artifact paths, Bangla media handling, and workflow/checkpoint behavior.
7. Record the new submodule commit in the parent repository only after checks pass. Resume dependent work and monitor its first task.

If checks fail, restore the prior pinned code and compatible environment. If the dependency migrated persistent data, restoring only the Git commit may not be sufficient: follow its rollback procedure or restore the backup. Preserve the failed-check evidence for diagnosis.

## Instructions to complete during implementation

- Exact repository URLs and checked-in submodule paths.
- Initial install command and required system dependencies.
- Copyable fetch/checkout commands using verified paths.
- Dependency-specific environment setup and migrations.
- Compatibility and media smoke-test commands.
- Service pause/resume commands and rollback instructions.

Do not put credentials or tokens in these instructions. Do not update the editor or Hermes while its tasks are running.
