import * as vscode from "vscode";
import { execFileSync } from "child_process";
import * as path from "path";
import { discoverWorktrees, Worktree } from "./worktrees";
import { killStaleTerminals } from "./terminals";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function branchExists(branch: string, cwd: string): boolean {
  try {
    git(["rev-parse", "--verify", branch], cwd);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

async function createWorktree(gitRoot: string): Promise<void> {
  const branchName = await vscode.window.showInputBox({
    title: "Create Worktree (1/2) — Branch Name",
    prompt: "New branch name to create, or existing branch to check out",
    placeHolder: "feature/my-feature",
    validateInput: (v) => (v.trim() ? undefined : "Branch name is required"),
  });
  if (!branchName) {
    return;
  }

  const shortName = branchName.split("/").pop() ?? branchName;
  const suggestedPath = path.join(gitRoot, ".worktrees", shortName);

  const worktreePath = await vscode.window.showInputBox({
    title: "Create Worktree (2/2) — Directory Path",
    prompt: "Absolute path for the new worktree directory",
    value: suggestedPath,
    validateInput: (v) => (v.trim() ? undefined : "Path is required"),
  });
  if (!worktreePath) {
    return;
  }

  try {
    const exists = branchExists(branchName, gitRoot);
    if (exists) {
      git(["worktree", "add", worktreePath.trim(), branchName.trim()], gitRoot);
    } else {
      git(
        ["worktree", "add", "-b", branchName.trim(), worktreePath.trim()],
        gitRoot
      );
    }
    vscode.window.showInformationMessage(
      `Trellis: Created worktree "${shortName}" at ${worktreePath}.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Trellis: Failed to create worktree — ${String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

async function removeWorktree(gitRoot: string): Promise<void> {
  let worktrees: Worktree[];
  try {
    worktrees = discoverWorktrees(gitRoot);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Trellis: Failed to list worktrees — ${String(err)}`
    );
    return;
  }

  const candidates = worktrees.filter((wt) => !wt.isMain);
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(
      "Trellis: No additional worktrees to remove."
    );
    return;
  }

  const pick = await vscode.window.showQuickPick(
    candidates.map((wt) => ({
      label: wt.name,
      description: wt.branch
        ? wt.branch.replace("refs/heads/", "")
        : "(detached)",
      detail: wt.worktreePath,
      wt,
    })),
    { title: "Trellis: Remove Worktree" }
  );
  if (!pick) {
    return;
  }

  const confirmed = await vscode.window.showWarningMessage(
    `Remove worktree "${pick.wt.name}"?`,
    { modal: true },
    "Remove",
    "Force Remove"
  );
  if (!confirmed) {
    return;
  }

  try {
    const args =
      confirmed === "Force Remove"
        ? ["worktree", "remove", "--force", pick.wt.worktreePath]
        : ["worktree", "remove", pick.wt.worktreePath];
    git(args, gitRoot);

    // Clean up terminals for the removed worktree
    const remaining = discoverWorktrees(gitRoot);
    killStaleTerminals(remaining);

    vscode.window.showInformationMessage(
      `Trellis: Removed worktree "${pick.wt.name}".`
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Trellis: Failed to remove worktree — ${String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function manageWorktrees(gitRoot: string): Promise<void> {
  const action = await vscode.window.showQuickPick(
    [
      {
        label: "$(add) Create worktree",
        description: "Add a new worktree for a new or existing branch",
        id: "create",
      },
      {
        label: "$(trash) Remove worktree",
        description: "Delete a worktree and clean up its terminals",
        id: "remove",
      },
    ],
    { title: "Trellis: Manage Worktrees" }
  );

  if (!action) {
    return;
  }

  if (action.id === "create") {
    await createWorktree(gitRoot);
  } else if (action.id === "remove") {
    await removeWorktree(gitRoot);
  }
}
