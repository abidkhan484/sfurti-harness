# Pi free-preview operator runbook

This profile stays in preview: it uses legacy production with research disabled and starts with `doctor`. It does not log in, send Telegram, or publish Facebook content by itself.

Copy `config/harness.pi-free.example.json` to a local, non-secret configuration file and replace only the marked Page/operator/model identifiers. Keep tokens in the mounted private files, never in this config. Then run:

```sh
npm run sfurti -- command --json '{"type":"setup-init"}'
```

It creates only a missing posting-windows template and inbox directory; it never overwrites a local setting or logs in. Use `config/permission-manifest.example.json` as the format for each `READY` folder. Replace the windows template’s provisional statement with actual operator-supported Bangladesh audience evidence before readiness can pass.

Start the opt-in stack with `docker compose -f docker-compose.pi-free.yml up`. It runs `doctor` by default. Start the scheduler only after doctor is ready with `docker compose -f docker-compose.pi-free.yml run --rm sfurti start`; restart with `docker compose -f docker-compose.pi-free.yml restart`; stop with `docker compose -f docker-compose.pi-free.yml stop`. Use `backup` with a new directory, then `restore-verify` into a separate empty directory; reauthenticate private runtime credentials separately and reconcile any restored remote history before any later authorized submission.

ARM64 capacity, Page access, private delivery, and public publication remain operator-only checks.
