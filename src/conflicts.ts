import { getRepoRoot, getChangedFiles, getDefaultBranch, diffFiles, gitSafe } from "./git.ts";
import { loadAllManifests, getAllChangedFiles, type SessionManifest } from "./manifest.ts";
import { resolveSession } from "./session.ts";
import * as log from "./utils/logger.ts";

export interface ConflictReport {
  currentSession: string;
  conflicts: SessionConflict[];
  hasConflicts: boolean;
}

export interface SessionConflict {
  otherSession: string;
  overlappingFiles: string[];
  canAutoMerge: boolean;
}

/**
 * Check for file conflicts between the current session and all other sessions.
 * Returns a report detailing which files overlap and whether they can be auto-merged.
 */
export function checkConflicts(
  sessionName?: string,
  cwd?: string,
): ConflictReport {
  const repoRoot = getRepoRoot(cwd);
  const currentManifest = resolveSession(sessionName, cwd);

  if (!currentManifest) {
    throw new Error("No active session found");
  }

  // Collect all changed files for the current session
  const currentFiles = new Set<string>([
    ...getAllChangedFiles(currentManifest),
    ...getUncommittedFiles(currentManifest.worktreePath),
  ]);

  // Check against all other sessions
  const allManifests = loadAllManifests(repoRoot);
  const conflicts: SessionConflict[] = [];

  for (const otherManifest of allManifests) {
    if (otherManifest.name === currentManifest.name) continue;

    const otherFiles = new Set<string>([
      ...getAllChangedFiles(otherManifest),
      ...getUncommittedFiles(otherManifest.worktreePath),
    ]);

    // Find intersection
    const overlapping = [...currentFiles].filter((f) => otherFiles.has(f));

    if (overlapping.length > 0) {
      const canAutoMerge = checkAutoMergePossibility(
        currentManifest,
        otherManifest,
        overlapping,
        repoRoot,
      );

      conflicts.push({
        otherSession: otherManifest.name,
        overlappingFiles: overlapping,
        canAutoMerge,
      });
    }
  }

  return {
    currentSession: currentManifest.name,
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}

/**
 * Check if two sessions' changes to overlapping files can be auto-merged.
 * Uses git merge-tree to simulate the merge without modifying any files.
 */
function checkAutoMergePossibility(
  current: SessionManifest,
  other: SessionManifest,
  _overlappingFiles: string[],
  repoRoot: string,
): boolean {
  const defaultBranch = getDefaultBranch(repoRoot);

  // Use merge-tree to test if merge would succeed
  const result = gitSafe(
    ["merge-tree", defaultBranch, current.branch, other.branch],
    repoRoot,
  );

  // If merge-tree exits with 0 and no conflict markers, auto-merge is possible
  if (result.ok && !result.stdout.includes("<<<<<<<")) {
    return true;
  }

  return false;
}

/**
 * Get uncommitted changed files in a worktree.
 */
function getUncommittedFiles(worktreePath: string): string[] {
  try {
    return getChangedFiles(worktreePath);
  } catch {
    return [];
  }
}

/**
 * Format a conflict report for display.
 */
export function formatConflictReport(report: ConflictReport): string {
  if (!report.hasConflicts) {
    return `No conflicts detected for session '${report.currentSession}'.`;
  }

  const lines: string[] = [
    `Conflicts detected for session '${report.currentSession}':`,
    "",
  ];

  for (const conflict of report.conflicts) {
    const mergeStatus = conflict.canAutoMerge ? "(auto-mergeable)" : "(manual resolution needed)";
    lines.push(`  Session '${conflict.otherSession}' ${mergeStatus}:`);

    for (const file of conflict.overlappingFiles) {
      lines.push(`    - ${file}`);
    }
    lines.push("");
  }

  const totalFiles = report.conflicts.reduce((sum, c) => sum + c.overlappingFiles.length, 0);
  lines.push(`Total: ${report.conflicts.length} session(s) with ${totalFiles} overlapping file(s)`);

  return lines.join("\n");
}

/**
 * Suggest resolution strategies for detected conflicts.
 */
export function suggestResolutions(report: ConflictReport): string[] {
  if (!report.hasConflicts) return [];

  const suggestions: string[] = [];

  for (const conflict of report.conflicts) {
    if (conflict.canAutoMerge) {
      suggestions.push(
        `Session '${conflict.otherSession}': Files can be auto-merged. Use 'git lanes merge' after ending one session.`,
      );
    } else {
      suggestions.push(
        `Session '${conflict.otherSession}': Manual resolution required for: ${conflict.overlappingFiles.join(", ")}`,
      );
      suggestions.push(
        `  Suggestion: Coordinate with the other agent to avoid editing the same files, or end one session and resolve conflicts before continuing.`,
      );
    }
  }

  return suggestions;
}
