import * as vscode from "vscode";
import { execFileSync } from "child_process";
import * as path from "path";
import { discoverWorktrees, Worktree } from "./worktrees";
import { createTrellisTerminals, killStaleTerminals } from "./terminals";
import { getAgentCommand } from "./config";

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

export async function addWorktree(gitRoot: string): Promise<void> {
  const branchName = await vscode.window.showInputBox({
    title: "Add Worktree — Branch Name",
    prompt: "New branch to create, or existing branch to check out",
    placeHolder: "feature/my-feature",
    validateInput: (v) => {
      if (!v.trim()) { return "Branch name is required"; }
      if (/\s/.test(v)) { return "Branch name cannot contain spaces"; }
      return undefined;
    },
  });
  if (!branchName) {
    return;
  }

  const shortName = branchName.split("/").pop() ?? branchName;
  const suggestedPath = path.join(gitRoot, ".worktrees", shortName);

  const worktreePath = await vscode.window.showInputBox({
    title: `Add Worktree "${branchName}" — Directory`,
    prompt: "Directory where the worktree will be created",
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
    const newWorktree: Worktree = {
      worktreePath: worktreePath.trim(),
      head: "",
      branch: `refs/heads/${branchName.trim()}`,
      isMain: false,
      name: shortName,
    };
    const terminal = createTrellisTerminals([newWorktree], getAgentCommand());
    terminal?.show(false);

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

export async function removeWorktree(gitRoot: string): Promise<void> {
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
      "Trellis: No worktrees to remove."
    );
    return;
  }

  const pick = await vscode.window.showQuickPick(
    candidates.map((wt) => ({
      label: wt.name,
      description: wt.branch ? wt.branch.replace("refs/heads/", "") : "(detached HEAD)",
      detail: wt.worktreePath,
      wt,
    })),
    {
      title: "Remove Worktree",
      placeHolder: "Select a worktree to remove",
    }
  );
  if (!pick) {
    return;
  }

  const branch = pick.wt.branch ? pick.wt.branch.replace("refs/heads/", "") : "(detached)";
  const confirmed = await vscode.window.showWarningMessage(
    `Remove worktree "${pick.wt.name}" (${branch})?`,
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

