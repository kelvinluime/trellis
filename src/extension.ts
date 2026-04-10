import * as vscode from "vscode";
import { execSync } from "child_process";
import { discoverWorktrees, Worktree } from "./worktrees";
import { createTrellisTerminals, killStaleTerminals } from "./terminals";
import { addWorktree, removeWorktree } from "./worktree-manager";
import { getAgentCommand, getAutoLaunchOnOpen } from "./config";

let statusBarItem: vscode.StatusBarItem | undefined;
let sessionActive = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

/**
 * Find the actual git repo root by running `git rev-parse --show-toplevel`.
 * This works even when the workspace is opened at a subfolder of the repo.
 * Returns undefined if the directory is not inside a git repo.
 */
function getGitRoot(dir: string): string | undefined {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

function updateStatusBar(): void {
  if (!statusBarItem) {
    return;
  }
  const root = getWorkspaceRoot();
  const gitRoot = root ? getGitRoot(root) : undefined;
  if (gitRoot) {
    statusBarItem.text = sessionActive
      ? "$(source-tree) Trellis ✓"
      : "$(source-tree) Trellis";
    statusBarItem.tooltip = sessionActive
      ? "Trellis session active — click to relaunch"
      : "Trellis: Launch Session";
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

// ---------------------------------------------------------------------------
// Command: trellis.launch
// ---------------------------------------------------------------------------

async function launchSession(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Trellis: No workspace folder is open.");
    return;
  }

  const gitRoot = getGitRoot(workspaceRoot);
  if (!gitRoot) {
    vscode.window.showErrorMessage(
      "Trellis: The workspace is not inside a git repository."
    );
    return;
  }

  let worktrees: Worktree[];
  try {
    worktrees = discoverWorktrees(gitRoot);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Trellis: Failed to list git worktrees — ${String(err)}`
    );
    return;
  }

  const mainWorktree = worktrees.find((wt) => wt.isMain);
  if (!mainWorktree) {
    vscode.window.showErrorMessage(
      "Trellis: Could not identify the main worktree."
    );
    return;
  }

  const candidates = worktrees
    .filter((wt) => !wt.isMain)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Quick pick: let user choose which worktrees to open (all pre-selected)
  const picks = await vscode.window.showQuickPick(
    candidates.map((wt) => ({
      label: wt.name,
      description: wt.worktreePath,
      picked: true,
      wt,
    })),
    {
      canPickMany: true,
      title: "Trellis: Select worktrees to open",
      placeHolder: candidates.length === 0
        ? "No worktrees found — create a worktree first"
        : "Space to toggle, Enter to confirm",
    }
  );

  // undefined means user pressed Escape
  if (picks === undefined) {
    return;
  }

  const selected = picks.map((p) => p.wt);
  killStaleTerminals(worktrees);
  const agentCommand = getAgentCommand();

  const firstTerminal = createTrellisTerminals(selected, agentCommand);
  firstTerminal?.show(false);

  sessionActive = true;
  updateStatusBar();
}

// ---------------------------------------------------------------------------
// Command: trellis.focus
// ---------------------------------------------------------------------------

async function focusTerminal(): Promise<void> {
  const all = vscode.window.terminals;

  if (all.length === 0) {
    vscode.window.showInformationMessage("Trellis: No active terminals.");
    return;
  }

  const pick = await vscode.window.showQuickPick(
    all.map((t) => ({ label: t.name, terminal: t })),
    { title: "Focus Terminal" }
  );

  if (pick) {
    pick.terminal.show(false);
  }
}

// ---------------------------------------------------------------------------
// Commands: trellis.addWorktree / trellis.removeWorktree
// ---------------------------------------------------------------------------

async function withGitRoot(
  fn: (gitRoot: string) => Promise<void>
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Trellis: No workspace folder is open.");
    return;
  }
  const gitRoot = getGitRoot(workspaceRoot);
  if (!gitRoot) {
    vscode.window.showErrorMessage(
      "Trellis: The workspace is not inside a git repository."
    );
    return;
  }
  await fn(gitRoot);
}

// ---------------------------------------------------------------------------
// Command: trellis.cleanup
// ---------------------------------------------------------------------------

async function cleanupStale(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage("Trellis: No workspace folder is open.");
    return;
  }

  const gitRoot = getGitRoot(workspaceRoot);
  if (!gitRoot) {
    vscode.window.showErrorMessage(
      "Trellis: The workspace is not inside a git repository."
    );
    return;
  }

  let worktrees: Worktree[];
  try {
    worktrees = discoverWorktrees(gitRoot);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Trellis: Failed to list git worktrees — ${String(err)}`
    );
    return;
  }

  killStaleTerminals(worktrees);

  const hasTrellisTerminal = vscode.window.terminals.some(
    (t) => t.name.includes(" · agent") || t.name.includes(" · cli")
  );
  if (!hasTrellisTerminal && sessionActive) {
    sessionActive = false;
    updateStatusBar();
  }

  vscode.window.showInformationMessage(
    "Trellis: Cleaned up terminals for deleted worktrees."
  );
}

// ---------------------------------------------------------------------------
// Activation / deactivation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("trellis.launch", launchSession),
    vscode.commands.registerCommand("trellis.focus", focusTerminal),
    vscode.commands.registerCommand("trellis.cleanup", cleanupStale),
    vscode.commands.registerCommand("trellis.addWorktree", () => withGitRoot(addWorktree)),
    vscode.commands.registerCommand("trellis.removeWorktree", () => withGitRoot(removeWorktree))
  );

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "trellis.launch";
  context.subscriptions.push(statusBarItem);

  updateStatusBar();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBar())
  );

  // Reflect terminal closures in the status bar (e.g. user manually closes them)
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(() => {
      const hasTrellisTerminal = vscode.window.terminals.some(
        (t) => t.name.includes(" · agent") || t.name.includes(" · cli")
      );
      if (!hasTrellisTerminal && sessionActive) {
        sessionActive = false;
        updateStatusBar();
      }
    })
  );

  if (getAutoLaunchOnOpen()) {
    const root = getWorkspaceRoot();
    if (root && getGitRoot(root)) {
      // Defer so the window is fully ready before creating terminals
      setTimeout(() => launchSession(), 500);
    }
  }
}

export function deactivate(): void {}
