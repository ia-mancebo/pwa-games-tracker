# 02: Directorio de worktrees invisible para el repo

**What to build:** el directorio donde nacerán los worktrees de subagentes queda operativa e invisible: entra en .gitignore y en los ignores del linter (el de prettier ya lo trajo el ticket 01). Un `git worktree add` dentro no ensucia el `git status` del repo principal ni se cuenta como código por las puertas. Demo: crear un worktree de prueba bajo el directorio, comprobar que git, lint y formato no lo ven, y eliminarlo sin restos.

**Blocked by:** 01 (nace sobre la base ya barrida; sin conflictos en los archivos de ignore).

**Status:** ready-for-agent

- [ ] El directorio de worktrees (un subdirectorio por ticket) está en .gitignore y en los ignores del linter.
- [ ] Worktree de prueba creado dentro ⇒ `git status` del repo principal limpio; lint y format:check no lo cuentan.
- [ ] El worktree de prueba queda eliminado; sin restos ni en disco ni en el status.
