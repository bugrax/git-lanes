import { existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "bun";
import {
  getRepoRoot,
  getDefaultBranch,
  addWorktreeDetached,
  removeWorktree,
  gitSafe,
  merge as gitMerge,
} from "./git.ts";
import { resolveSession } from "./session.ts";
import { loadAllManifests } from "./manifest.ts";
import * as log from "./utils/logger.ts";

interface TestResult {
  success: boolean;
  output: string;
  exitCode: number;
  command: string;
}

/**
 * Detect the test command for a project based on config files present.
 */
export function detectTestCommand(projectRoot: string): string | null {
  // Bun
  if (existsSync(join(projectRoot, "bunfig.toml"))) {
    return "bun test";
  }

  // Node.js / npm
  if (existsSync(join(projectRoot, "package.json"))) {
    try {
      const pkg = JSON.parse(
        require("fs").readFileSync(join(projectRoot, "package.json"), "utf-8"),
      );
      if (pkg.scripts?.test) {
        // Check if bun.lock exists to prefer bun
        if (existsSync(join(projectRoot, "bun.lock")) || existsSync(join(projectRoot, "bun.lockb"))) {
          return "bun run test";
        }
        return "npm test";
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Python
  if (existsSync(join(projectRoot, "pyproject.toml")) || existsSync(join(projectRoot, "pytest.ini"))) {
    return "pytest";
  }
  if (existsSync(join(projectRoot, "setup.py")) || existsSync(join(projectRoot, "setup.cfg"))) {
    return "python -m pytest";
  }

  // Rust
  if (existsSync(join(projectRoot, "Cargo.toml"))) {
    return "cargo test";
  }

  // Go
  if (existsSync(join(projectRoot, "go.mod"))) {
    return "go test ./...";
  }

  // Deno
  if (existsSync(join(projectRoot, "deno.json")) || existsSync(join(projectRoot, "deno.jsonc"))) {
    return "deno test";
  }

  // Zig
  if (existsSync(join(projectRoot, "build.zig"))) {
    return "zig build test";
  }

  // Makefile
  if (existsSync(join(projectRoot, "Makefile"))) {
    return "make test";
  }

  return null;
}

/**
 * Run tests inside a session's worktree.
 */
export function runSessionTests(
  command?: string,
  sessionName?: string,
  cwd?: string,
): TestResult {
  const manifest = resolveSession(sessionName, cwd);

  if (!manifest) {
    throw new Error("No active session found");
  }

  const testCommand = command ?? detectTestCommand(manifest.worktreePath);
  if (!testCommand) {
    throw new Error("Could not detect test command. Specify one with --command");
  }

  log.info(`Running tests in session '${manifest.name}': ${testCommand}`);
  return executeTest(testCommand, manifest.worktreePath);
}

/**
 * Run tests on a combined merge of multiple sessions.
 * Uses sequential merge instead of octopus merge for reliability.
 */
export function runCombinedTests(
  command?: string,
  sessionNames?: string[],
  cwd?: string,
): TestResult {
  const repoRoot = getRepoRoot(cwd);
  const defaultBranch = getDefaultBranch(repoRoot);

  // Get sessions to combine
  const manifests = sessionNames
    ? sessionNames.map((name) => {
        const m = resolveSession(name, cwd);
        if (!m) throw new Error(`Session '${name}' not found`);
        return m;
      })
    : loadAllManifests(repoRoot);

  if (manifests.length === 0) {
    throw new Error("No sessions to combine");
  }

  // Create a temporary worktree for the combined test
  const tmpPath = join(repoRoot, ".lanes", "tmp-combined-test");
  const tmpBranch = `lanes/tmp-combined-test-${Date.now()}`;

  try {
    // Create detached worktree from default branch
    gitSafe(["branch", tmpBranch, defaultBranch], repoRoot);
    addWorktreeDetached(tmpPath, tmpBranch, repoRoot);

    // Sequential merge of each session branch
    for (const manifest of manifests) {
      log.info(`Merging session '${manifest.name}'...`);
      const result = gitSafe(
        ["merge", "--no-edit", manifest.branch],
        tmpPath,
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Merge conflict while combining session '${manifest.name}': ${result.stderr}`,
          exitCode: 1,
          command: "git merge",
        };
      }
    }

    // Detect and run tests
    const testCommand = command ?? detectTestCommand(tmpPath) ?? detectTestCommand(repoRoot);
    if (!testCommand) {
      throw new Error("Could not detect test command");
    }

    log.info(`Running combined tests: ${testCommand}`);
    return executeTest(testCommand, tmpPath);
  } finally {
    // Always clean up
    try { removeWorktree(tmpPath, true, repoRoot); } catch { /* skip */ }
    try { gitSafe(["branch", "-D", tmpBranch], repoRoot); } catch { /* skip */ }
  }
}

/**
 * Execute a test command in a given directory.
 */
function executeTest(command: string, cwd: string): TestResult {
  const parts = command.split(" ");
  const cmd = parts[0]!;
  const args = parts.slice(1);

  const result = spawnSync([cmd, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  const output = stdout + (stderr ? `\n${stderr}` : "");

  return {
    success: result.exitCode === 0,
    output,
    exitCode: result.exitCode,
    command,
  };
}
