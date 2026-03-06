import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join, basename } from "path";
import { withLock } from "./utils/lock.ts";
import { getGitCommonDir } from "./git.ts";

const MANIFEST_VERSION = 1;
const MANIFESTS_DIR = "lanes-manifests";

export interface Changeset {
  id: string;
  sha: string;
  message: string;
  files: string[];
  timestamp: string;
}

export interface SessionManifest {
  version: number;
  name: string;
  branch: string;
  worktreePath: string;
  changesets: Changeset[];
  pendingFiles: string[];
  clientId?: string;
  createdAt: string;
}

/**
 * Get the directory where session manifests are stored.
 * Located inside the git common directory to be shared across worktrees.
 */
export function getManifestsDir(cwd?: string): string {
  const commonDir = getGitCommonDir(cwd);
  return join(commonDir, MANIFESTS_DIR);
}

/**
 * Get the file path for a specific session manifest.
 */
export function getManifestPath(name: string, cwd?: string): string {
  return join(getManifestsDir(cwd), `${name}.json`);
}

/**
 * Create a new session manifest.
 */
export function createManifest(
  name: string,
  branch: string,
  worktreePath: string,
  clientId?: string,
  cwd?: string,
): SessionManifest {
  const manifest: SessionManifest = {
    version: MANIFEST_VERSION,
    name,
    branch,
    worktreePath,
    changesets: [],
    pendingFiles: [],
    clientId,
    createdAt: new Date().toISOString(),
  };

  saveManifest(manifest, cwd);
  return manifest;
}

/**
 * Save a manifest to disk atomically with file locking.
 * Uses temp file + rename for atomicity.
 */
export function saveManifest(manifest: SessionManifest, cwd?: string): void {
  const manifestPath = getManifestPath(manifest.name, cwd);
  const manifestDir = getManifestsDir(cwd);

  // Ensure manifests directory exists
  if (!existsSync(manifestDir)) {
    mkdirSync(manifestDir, { recursive: true });
  }

  withLock(manifestPath, () => {
    const tempPath = `${manifestPath}.tmp.${process.pid}`;
    const content = JSON.stringify(manifest, null, 2);

    // Write to temp file first
    Bun.write(tempPath, content);

    // Atomic rename
    require("fs").renameSync(tempPath, manifestPath);
  });
}

/**
 * Load a manifest from disk with validation.
 */
export function loadManifest(name: string, cwd?: string): SessionManifest | null {
  const manifestPath = getManifestPath(name, cwd);

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const raw = require("fs").readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    return validateManifest(parsed);
  } catch {
    // Corrupted manifest - return null
    return null;
  }
}

/**
 * Delete a session manifest.
 */
export function deleteManifest(name: string, cwd?: string): void {
  const manifestPath = getManifestPath(name, cwd);

  if (existsSync(manifestPath)) {
    withLock(manifestPath, () => {
      unlinkSync(manifestPath);
    });
  }
}

/**
 * List all active session names.
 */
export function listManifests(cwd?: string): string[] {
  const dir = getManifestsDir(cwd);

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"))
    .map((f) => basename(f, ".json"));
}

/**
 * Load all active session manifests.
 */
export function loadAllManifests(cwd?: string): SessionManifest[] {
  const names = listManifests(cwd);
  const manifests: SessionManifest[] = [];

  for (const name of names) {
    const manifest = loadManifest(name, cwd);
    if (manifest) {
      manifests.push(manifest);
    }
  }

  return manifests;
}

/**
 * Add a changeset to a manifest.
 */
export function addChangeset(
  name: string,
  changeset: Changeset,
  cwd?: string,
): void {
  const manifest = loadManifest(name, cwd);
  if (!manifest) {
    throw new Error(`Session '${name}' not found`);
  }

  manifest.changesets.push(changeset);
  // Clear pending files since they've been committed
  manifest.pendingFiles = [];
  saveManifest(manifest, cwd);
}

/**
 * Remove the last changeset from a manifest (for undo).
 */
export function removeLastChangeset(name: string, cwd?: string): Changeset | null {
  const manifest = loadManifest(name, cwd);
  if (!manifest) {
    throw new Error(`Session '${name}' not found`);
  }

  const removed = manifest.changesets.pop() ?? null;
  if (removed) {
    // Restore the files as pending
    manifest.pendingFiles = [...new Set([...manifest.pendingFiles, ...removed.files])];
    saveManifest(manifest, cwd);
  }

  return removed;
}

/**
 * Update pending files in a manifest.
 */
export function updatePendingFiles(
  name: string,
  files: string[],
  cwd?: string,
): void {
  const manifest = loadManifest(name, cwd);
  if (!manifest) {
    throw new Error(`Session '${name}' not found`);
  }

  manifest.pendingFiles = [...new Set([...manifest.pendingFiles, ...files])];
  saveManifest(manifest, cwd);
}

/**
 * Update the client ID for a session.
 */
export function updateClientId(
  name: string,
  clientId: string,
  cwd?: string,
): void {
  const manifest = loadManifest(name, cwd);
  if (!manifest) {
    throw new Error(`Session '${name}' not found`);
  }

  manifest.clientId = clientId;
  saveManifest(manifest, cwd);
}

/**
 * Get all changed files across all changesets and pending files.
 */
export function getAllChangedFiles(manifest: SessionManifest): string[] {
  const files = new Set<string>();

  for (const changeset of manifest.changesets) {
    for (const file of changeset.files) {
      files.add(file);
    }
  }

  for (const file of manifest.pendingFiles) {
    files.add(file);
  }

  return [...files];
}

/**
 * Validate manifest structure and return a sanitized version.
 */
function validateManifest(data: unknown): SessionManifest | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name) return null;
  if (typeof obj.branch !== "string" || !obj.branch) return null;
  if (typeof obj.worktreePath !== "string") return null;

  return {
    version: typeof obj.version === "number" ? obj.version : MANIFEST_VERSION,
    name: obj.name,
    branch: obj.branch,
    worktreePath: obj.worktreePath,
    changesets: Array.isArray(obj.changesets) ? obj.changesets : [],
    pendingFiles: Array.isArray(obj.pendingFiles) ? obj.pendingFiles : [],
    clientId: typeof obj.clientId === "string" ? obj.clientId : undefined,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString(),
  };
}
