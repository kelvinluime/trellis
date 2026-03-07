import * as vscode from "vscode";
import { Worktree } from "./worktrees";

const SEPARATOR = " · ";

export const AGENT_SUFFIX = `${SEPARATOR}agent`;
export const CLI_SUFFIX = `${SEPARATOR}cli`;

function findExisting(name: string): vscode.Terminal | undefined {
  return vscode.window.terminals.find((t) => t.name === name);
}

function getOrCreate(
  name: string,
  cwd: string,
  command?: string
): vscode.Terminal {
  const existing = findExisting(name);
  if (existing) {
    existing.show(false);
    return existing;
  }
  const icon = new vscode.ThemeIcon(command ? "sparkle" : "terminal-bash");
  const terminal = vscode.window.createTerminal({ name, cwd, iconPath: icon });
  if (command) {
    terminal.sendText(command);
  }
  return terminal;
}

/**
 * Create (or reuse) all terminals for the main worktree, then for each
 * additional worktree in the provided list (already sorted).
 * Returns the main · agent terminal so the caller can focus it.
 */
export function createTrellisTerminals(
  mainWorktree: Worktree,
  additionalWorktrees: Worktree[],
  agentCommand: string
): vscode.Terminal {
  const mainLabel = "main";

  const mainAgent = getOrCreate(
    `${mainLabel}${AGENT_SUFFIX}`,
    mainWorktree.worktreePath,
    agentCommand
  );
  getOrCreate(`${mainLabel}${CLI_SUFFIX}`, mainWorktree.worktreePath);

  for (const wt of additionalWorktrees) {
    getOrCreate(`${wt.name}${AGENT_SUFFIX}`, wt.worktreePath, agentCommand);
    getOrCreate(`${wt.name}${CLI_SUFFIX}`, wt.worktreePath);
  }

  return mainAgent;
}

/**
 * Dispose all terminals whose names were created by Trellis.
 */
export function killAllTrellisTerminals(): void {
  // Snapshot the array first — disposing mutates vscode.window.terminals
  const targets = vscode.window.terminals.filter(
    (t) => t.name.endsWith(AGENT_SUFFIX) || t.name.endsWith(CLI_SUFFIX)
  );
  for (const t of targets) {
    t.dispose();
  }
}
