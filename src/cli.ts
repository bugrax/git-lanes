import {
  startSession,
  endSession,
  abortSession,
  trackFiles,
  sessionCommit,
  undoLastCommit,
  squashSession,
  mergeSession,
  getSessionStatus,
  getSessionLog,
  listSessions,
  whichSession,
  pruneSessions,
  pushSession,
  resolveSession,
} from "./session.ts";
import { checkConflicts, formatConflictReport, suggestResolutions } from "./conflicts.ts";
import { runSessionTests, runCombinedTests } from "./test-runner.ts";
import { createPullRequest, type ForgeType } from "./forge/github.ts";
import { installHooks, uninstallHooks } from "./hooks/install.ts";
import { getRepoRoot, isInsideGitRepo, diff, status } from "./git.ts";
import { loadConfig } from "./config.ts";
import * as log from "./utils/logger.ts";

const VERSION = "0.1.0";

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // Skip bun and script path
  const command = args[0] ?? "help";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;

    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[arg.slice(1)] = next;
        i++;
      } else {
        flags[arg.slice(1)] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function getFlag(flags: Record<string, string | boolean>, ...names: string[]): string | undefined {
  for (const name of names) {
    const val = flags[name];
    if (typeof val === "string") return val;
  }
  return undefined;
}

function hasFlag(flags: Record<string, string | boolean>, ...names: string[]): boolean {
  return names.some((n) => flags[n] !== undefined);
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);

  // Commands that don't require a git repo
  if (command === "version" || command === "--version" || command === "-v") {
    log.print(`git-lanes ${VERSION}`);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  // All other commands require a git repo
  if (!isInsideGitRepo()) {
    log.error("Not inside a git repository");
    process.exit(1);
  }

  const sessionFlag = getFlag(flags, "session", "s");

  try {
    switch (command) {
      case "start": {
        const name = positional[0];
        if (!name) {
          log.error("Usage: git lanes start <name>");
          process.exit(1);
        }
        startSession(name);
        break;
      }

      case "end": {
        const message = getFlag(flags, "m", "message");
        endSession(sessionFlag, message);
        break;
      }

      case "abort": {
        abortSession(sessionFlag);
        break;
      }

      case "track": {
        if (positional.length === 0) {
          log.error("Usage: git lanes track <file1> [file2] ...");
          process.exit(1);
        }
        trackFiles(positional, sessionFlag);
        break;
      }

      case "status": {
        const info = getSessionStatus(sessionFlag);
        log.print(`Session: ${info.session.name}`);
        log.print(`Branch: ${info.session.branch}`);
        log.print(`Worktree: ${info.session.worktreePath}`);
        log.print(`Changesets: ${info.session.changesets.length}`);
        log.print(`Pending files: ${info.session.pendingFiles.length}`);
        if (info.status) {
          log.print(`\nGit status:\n${info.status}`);
        }
        break;
      }

      case "diff": {
        const info = getSessionStatus(sessionFlag);
        if (info.diff) {
          log.print(info.diff);
        } else {
          log.info("No changes");
        }
        break;
      }

      case "commit": {
        const message = getFlag(flags, "m", "message");
        if (!message) {
          log.error("Usage: git lanes commit -m <message>");
          process.exit(1);
        }
        sessionCommit(message, sessionFlag);
        break;
      }

      case "log": {
        const changesets = getSessionLog(sessionFlag);
        if (changesets.length === 0) {
          log.info("No commits in this session");
        } else {
          for (const cs of changesets) {
            log.print(`${cs.sha.slice(0, 8)} ${cs.message} (${cs.files.length} files, ${cs.timestamp})`);
          }
        }
        break;
      }

      case "undo": {
        const removed = undoLastCommit(sessionFlag);
        if (!removed) {
          log.info("Nothing to undo");
        }
        break;
      }

      case "squash": {
        const message = getFlag(flags, "m", "message");
        if (!message) {
          log.error("Usage: git lanes squash -m <message>");
          process.exit(1);
        }
        squashSession(message, sessionFlag);
        break;
      }

      case "merge": {
        mergeSession(sessionFlag);
        break;
      }

      case "pr": {
        const title = getFlag(flags, "title", "t");
        const body = getFlag(flags, "body", "b");
        const forge = (getFlag(flags, "forge", "f") ?? "github") as ForgeType;

        if (!title) {
          log.error("Usage: git lanes pr --title <title> [--body <body>] [--forge github|gitlab|bitbucket]");
          process.exit(1);
        }

        // Push first
        pushSession(sessionFlag);

        // Create PR
        const manifest = resolveSession(sessionFlag);
        if (!manifest) {
          log.error("No active session found");
          process.exit(1);
        }

        const url = createPullRequest(manifest.branch, title, body, forge);
        log.success(`Pull request created: ${url}`);
        break;
      }

      case "conflicts": {
        const report = checkConflicts(sessionFlag);
        log.print(formatConflictReport(report));

        if (report.hasConflicts) {
          log.print("\nSuggestions:");
          for (const suggestion of suggestResolutions(report)) {
            log.print(`  ${suggestion}`);
          }
        }
        break;
      }

      case "test": {
        const testCommand = getFlag(flags, "command", "c");
        const combine = hasFlag(flags, "combine");

        if (combine) {
          const result = runCombinedTests(testCommand, positional.length > 0 ? positional : undefined);
          log.print(result.output);
          if (!result.success) process.exit(result.exitCode);
        } else {
          const result = runSessionTests(testCommand, sessionFlag);
          log.print(result.output);
          if (!result.success) process.exit(result.exitCode);
        }
        break;
      }

      case "which": {
        const session = whichSession();
        if (session) {
          log.print(`Active session: ${session.name}`);
          log.print(`Branch: ${session.branch}`);
          log.print(`Worktree: ${session.worktreePath}`);
        } else {
          log.info("No active session");
        }
        break;
      }

      case "list": {
        const sessions = listSessions();
        if (sessions.length === 0) {
          log.info("No active sessions");
        } else {
          log.print(`${sessions.length} active session(s):\n`);
          for (const s of sessions) {
            log.print(`  ${s.name}`);
            log.print(`    Branch: ${s.branch}`);
            log.print(`    Changesets: ${s.changesets.length}`);
            log.print(`    Created: ${s.createdAt}`);
            log.print("");
          }
        }
        break;
      }

      case "prune": {
        pruneSessions();
        break;
      }

      case "allow-main": {
        const repoRoot = getRepoRoot();
        const config = loadConfig(repoRoot);
        log.print(`Current main branch policy: ${config.main_branch_policy}`);
        log.info("Edit .lanes.json to change the main_branch_policy setting");
        break;
      }

      case "install-hooks": {
        const adapter = getFlag(flags, "adapter", "a") ?? "claude-code";
        installHooks(adapter);
        break;
      }

      case "uninstall-hooks": {
        const adapter = getFlag(flags, "adapter", "a") ?? "claude-code";
        uninstallHooks(adapter);
        break;
      }

      default:
        log.error(`Unknown command: ${command}`);
        log.info("Run 'git lanes help' for usage information");
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof Error) {
      log.error(err.message);
    } else {
      log.error(String(err));
    }
    process.exit(1);
  }
}

function printHelp(): void {
  log.print(`
git-lanes v${VERSION} - Parallel AI agent isolation for Git repositories

USAGE:
  git lanes <command> [options]

SESSION COMMANDS:
  start <name>              Create a new isolated session
  end [--message|-m <msg>]  Finalize session, commit pending changes
  abort                     Discard session and all changes

CHANGE TRACKING:
  track <files...>          Mark files for next commit
  status                    Show current session state
  diff                      Show staged/unstaged modifications
  commit -m <message>       Record a changeset
  log                       List all changesets in session
  undo                      Revert last commit, keep changes

INTEGRATION:
  squash -m <message>       Consolidate commits into one
  merge                     Integrate session into main branch
  pr --title <t> [--body]   Create pull request (--forge github|gitlab|bitbucket)

COLLABORATION:
  conflicts                 Detect file overlaps across sessions
  test [--command <cmd>]    Run tests in session worktree
  test --combine            Run tests on merged sessions

MANAGEMENT:
  which                     Identify active session
  list                      Display all active sessions
  prune                     Remove orphaned sessions
  allow-main                Show main branch policy

HOOKS:
  install-hooks [--adapter] Install agent hooks (default: claude-code)
  uninstall-hooks           Remove agent hooks

OTHER:
  version                   Show version
  help                      Show this help

FLAGS:
  --session, -s <name>      Specify session explicitly
  --forge, -f <type>        PR forge: github, gitlab, bitbucket (default: github)
`.trim());
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
