# game-tracker

## Dev environment (Windows)

- Node/npm are NOT on the default PATH. Use: `C:\Users\elfri\AppData\Local\Temp\opencode\node\node-v26.7.0-win-x64` (node v26.7.0, npm 11.19.0).
  - Prepend to PATH per command in PowerShell:
    `$env:Path = "C:\Users\elfri\AppData\Local\Temp\opencode\node\node-v26.7.0-win-x64;$env:Path"`
- Run `npm run typecheck`, `npm run lint`, `npm test` before finishing any code change.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, label string equals role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
