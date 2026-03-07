import { execSync } from "child_process";
import * as path from "path";

export interface Worktree {
  worktreePath: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  name: string;
}

/**
 * Parse the output of `git worktree list --porcelain`.
 *
 * Each worktree block looks like:
 *
 *   worktree /absolute/path
 *   HEAD <sha>
 *   branch refs/heads/<name>   (absent for detached HEAD)
 *   bare                        (present for bare repos)
 *
 * Blocks are separated by a blank line.
 */
export function parseWorktreeOutput(output: string): Worktree[] {
  const blocks = output.trim().split(/\n\n+/);
  const worktrees: Worktree[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let worktreePath = "";
    let head = "";
    let branch: string | null = null;
    let isBare = false;
    let isMain = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length).trim();
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).trim();
      } else if (line === "bare") {
        isBare = true;
      } else if (line === "isMain" || line === "main") {
        isMain = true;
      }
    }

    if (!worktreePath || isBare) {
      continue;
    }

    const name = path.basename(worktreePath);
    worktrees.push({ worktreePath, head, branch, isMain, name });
  }

  // The first block in porcelain output is always the main worktree
  if (worktrees.length > 0) {
    worktrees[0].isMain = true;
  }

  return worktrees;
}

/**
 * Run `git worktree prune` then `git worktree list --porcelain` and return
 * parsed worktrees. Pruning removes stale entries for directories that have
 * been deleted without `git worktree remove`.
 */
export function discoverWorktrees(cwd: string): Worktree[] {
  execSync("git worktree prune", { cwd });
  const output = execSync("git worktree list --porcelain", {
    cwd,
    encoding: "utf8",
  });
  return parseWorktreeOutput(output);
}
