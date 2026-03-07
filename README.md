# Trellis

Trellis is a VS Code extension that bootstraps a structured terminal layout for **git worktree + AI agent** workflows. With a single command it spins up paired _agent_ and _cli_ terminals for every active worktree, so you can run an AI coding agent alongside a plain shell in each branch context without any manual setup.

---

## Installation

```bash
git clone https://github.com/kelvinluime/trellis.git
cd trellis
npm install
npm install -g @vscode/vsce
vsce package --allow-missing-repository
code --install-extension trellis-0.1.0.vsix
```

Then restart VS Code.

---

## Usage

### Prerequisites

- A git repository with one or more worktrees (created via `git worktree add`).
- The workspace can be opened at any subfolder — Trellis finds the git root automatically.

### Launch Session

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
Trellis: Launch Session
```

Or click the **$(source-tree) Trellis** item in the status bar (bottom-right).

Trellis will:

1. Prune stale worktree entries (`git worktree prune`) then discover all active worktrees.
2. Show a multi-select picker — all worktrees are pre-checked. Uncheck any you don't need, or press Escape to cancel.
3. Create (or reuse) terminals in this order:

   | Terminal name    | Directory        | Icon       | Behavior                    |
   | ---------------- | ---------------- | ---------- | --------------------------- |
   | `main · agent`   | main worktree    | $(sparkle) | Runs `trellis.agentCommand` |
   | `main · cli`     | main worktree    | $(terminal-bash) | Plain shell           |
   | `foo · agent`    | `foo` worktree   | $(sparkle) | Runs `trellis.agentCommand` |
   | `foo · cli`      | `foo` worktree   | $(terminal-bash) | Plain shell           |
   | … (sorted A→Z)   | …                | …          | …                           |

4. Focus `main · agent` automatically.

> **Idempotent** — running Launch Session again will not duplicate terminals. Existing terminals (matched by name) are reused and focused.

### Focus Terminal

Jump to any terminal by name via a Quick Pick:

```
Trellis: Focus Terminal
```

**Shortcut:** `Cmd+Shift+T` (Mac) / `Ctrl+Shift+T` (Win/Linux)

Shows all open terminals — Trellis and non-Trellis alike.

### Kill All Trellis Terminals

```
Trellis: Kill All Trellis Terminals
```

Disposes every terminal whose name ends with ` · agent` or ` · cli`.

---

## Configuration Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `trellis.agentCommand` | `string` | `"claude"` | Command sent to every _agent_ terminal on creation. Use `"claude"`, `"codex"`, or any custom string. |
| `trellis.autoLaunchOnOpen` | `boolean` | `false` | When `true`, Launch Session runs automatically when you open a workspace that contains a git repo. |

### Example `settings.json`

```jsonc
{
  "trellis.agentCommand": "claude",
  "trellis.autoLaunchOnOpen": true
}
```

---

## How It Works

- **Worktree discovery** — runs `git worktree prune` to clean up deleted worktrees, then `git worktree list --porcelain` and parses the output directly (no git libraries).
- **Git root detection** — uses `git rev-parse --show-toplevel` so the workspace can be opened at any subfolder of the repo.
- **Terminal creation** — uses `vscode.window.createTerminal({ name, cwd })`. Agent commands are sent via `terminal.sendText(command)`.
- **No external dependencies** — only the VS Code API and Node built-ins (`child_process`, `fs`, `path`).

---

## Project Structure

```
trellis/
├── src/
│   ├── extension.ts   # activate/deactivate, command + status bar registration
│   ├── worktrees.ts   # git worktree discovery and parsing
│   ├── terminals.ts   # terminal creation with idempotency logic
│   └── config.ts      # settings helpers
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

MIT
