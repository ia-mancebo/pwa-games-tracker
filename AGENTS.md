# game-tracker

## Dev environment (Windows)

- Node/npm are NOT on the default PATH. Use: `C:\Users\elfri\AppData\Local\Temp\opencode\node\node-v26.7.0-win-x64` (node v26.7.0, npm 11.19.0).
  - Prepend to PATH per command in PowerShell:
    `$env:Path = "C:\Users\elfri\AppData\Local\Temp\opencode\node\node-v26.7.0-win-x64;$env:Path"`
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check` before finishing any code change.
- Cambios de UI, scroll o navegación ⇒ correr el `test:*` de navegador relevante antes de darse por terminado: `test:scroll` scroll y navegación, `test:layout` layout de escritorio, `test:layout:mobile` layout en móvil, `test:overflow:mobile` desbordes horizontales móviles, `test:add-online:overflow` alta online: overflow, `test:aviso` aviso de contador; regla nueva de scroll/navegación ⇒ escenario en el check de navegador.
- Worktrees de subagentes (flujo implement-spec: uno por ticket, rama propia basada en la rama de integración) ⇒ dentro del repo, en el directorio ignorado (`.worktrees/`); nada fuera de la carpeta del repo sin preguntar.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, label string equals role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
