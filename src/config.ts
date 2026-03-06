import { existsSync } from "fs";
import { join } from "path";

const CONFIG_FILENAME = ".lanes.json";

export type MainBranchPolicy = "prompt" | "allow" | "block";
export type ForceCleanup = "prompt" | "force" | "fail";
export type AdoptChanges = "always" | "never" | "prompt";

export interface LanesConfig {
  shared_dirs: string[];
  main_branch_policy: MainBranchPolicy;
  force_cleanup: ForceCleanup;
  adopt_changes: AdoptChanges;
  branch_prefix: string;
}

const DEFAULT_CONFIG: LanesConfig = {
  shared_dirs: [],
  main_branch_policy: "block",
  force_cleanup: "prompt",
  adopt_changes: "always",
  branch_prefix: "lanes/",
};

export function loadConfig(repoRoot: string): LanesConfig {
  const configPath = join(repoRoot, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = Bun.file(configPath);
    const text = raw.size > 0 ? JSON.parse(raw.toString()) : {};
    return mergeConfig(text);
  } catch {
    // Return defaults on parse error
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(partial: Partial<LanesConfig>): LanesConfig {
  return {
    shared_dirs: Array.isArray(partial.shared_dirs)
      ? partial.shared_dirs.filter((d): d is string => typeof d === "string")
      : DEFAULT_CONFIG.shared_dirs,
    main_branch_policy: isValidPolicy(partial.main_branch_policy, ["prompt", "allow", "block"])
      ? partial.main_branch_policy
      : DEFAULT_CONFIG.main_branch_policy,
    force_cleanup: isValidPolicy(partial.force_cleanup, ["prompt", "force", "fail"])
      ? partial.force_cleanup
      : DEFAULT_CONFIG.force_cleanup,
    adopt_changes: isValidPolicy(partial.adopt_changes, ["always", "never", "prompt"])
      ? partial.adopt_changes
      : DEFAULT_CONFIG.adopt_changes,
    branch_prefix: typeof partial.branch_prefix === "string" && partial.branch_prefix.length > 0
      ? partial.branch_prefix
      : DEFAULT_CONFIG.branch_prefix,
  };
}

function isValidPolicy<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function getConfigPath(repoRoot: string): string {
  return join(repoRoot, CONFIG_FILENAME);
}

export function getDefaultConfig(): LanesConfig {
  return { ...DEFAULT_CONFIG };
}
