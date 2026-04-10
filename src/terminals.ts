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
 * Create (or reuse) terminals for each worktree in the provided list (already sorted).
 * Returns the first worktree's agent terminal so the caller can focus it,
 * or undefined if the list is empty.
 */
export function createTrellisTerminals(
  worktrees: Worktree[],
  agentCommand: string
): vscode.Terminal | undefined {
  let first: vscode.Terminal | undefined;

  for (const wt of worktrees) {
    const agent = getOrCreate(`${wt.name}${AGENT_SUFFIX}`, wt.worktreePath, agentCommand);
    getOrCreate(`${wt.name}${CLI_SUFFIX}`, wt.worktreePath);
    if (!first) {
      first = agent;
    }
  }

  return first;
}

/**
 * Dispose terminals for worktrees that no longer exist.
 * Keeps terminals whose name prefix matches an active worktree name.
 */
export function killStaleTerminals(activeWorktrees: Worktree[]): void {
  const validPrefixes = new Set<string>();
  for (const wt of activeWorktrees) {
    if (!wt.isMain) {
      validPrefixes.add(wt.name);
    }
  }

  const targets = vscode.window.terminals.filter((t) => {
    const suffix = t.name.endsWith(AGENT_SUFFIX)
      ? AGENT_SUFFIX
      : t.name.endsWith(CLI_SUFFIX)
      ? CLI_SUFFIX
      : null;
    if (!suffix) {
      return false;
    }
    const prefix = t.name.slice(0, t.name.length - suffix.length);
    return !validPrefixes.has(prefix);
  });

  for (const t of targets) {
    t.dispose();
  }
}
