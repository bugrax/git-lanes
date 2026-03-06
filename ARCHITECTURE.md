# Architecture

This document describes the internal architecture of git-lanes.

## Overview

git-lanes uses Git's native worktree feature to create isolated workspaces for each AI agent. The tool manages the lifecycle of these workspaces through a manifest system and provides conflict detection across sessions.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent 1   │     │   Agent 2   │     │   Agent 3   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Session A   │  │  Session B   │  │  Session C   │
│  (worktree)  │  │  (worktree)  │  │  (worktree)  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └────────┬────────┴────────┬────────┘
                │                 │
         ┌──────┴──────┐  ┌──────┴──────┐
         │  Manifests  │  │  Git Repo   │
         │   (JSON)    │  │  (shared)   │
         └─────────────┘  └─────────────┘
```

## Core Components

### Session (`src/session.ts`)

The session is the fundamental unit of work. Each session consists of:
- A Git branch (prefixed with the configurable `branch_prefix`)
- A Git worktree (isolated working directory under `.lanes/worktrees/`)
- A manifest file (JSON metadata in `.git/lanes-manifests/`)

**Lifecycle:**
1. `start(name)` — Creates branch from HEAD, sets up worktree, writes manifest
2. `track(files)` — Marks files as pending in the manifest
3. `commit(message)` — Records a changeset (commit SHA, message, files, timestamp)
4. `end()` — Commits pending changes, removes worktree, deletes manifest
5. `abort()` — Force-removes worktree, deletes branch and manifest

**Session Resolution Priority:**
1. Explicit `--session` flag
2. Current worktree path detection
3. Single session auto-selection
4. PPID-based client affinity

### Manifest (`src/manifest.ts`)

Session metadata stored as JSON files in `.git/lanes-manifests/`:

```json
{
  "version": 1,
  "name": "feature-a",
  "branch": "lanes/feature-a",
  "worktreePath": "/repo/.lanes/worktrees/feature-a",
  "changesets": [
    {
      "id": "cs-1709827200000",
      "sha": "abc1234",
      "message": "add search component",
      "files": ["src/search.ts", "src/search.test.ts"],
      "timestamp": "2026-03-07T12:00:00.000Z"
    }
  ],
  "pendingFiles": [],
  "clientId": "12345",
  "createdAt": "2026-03-07T11:00:00.000Z"
}
```

**Safety mechanisms:**
- Atomic writes via temp file + rename
- File locking to prevent race conditions
- Validation on load with graceful handling of corrupted files

### Git Abstraction (`src/git.ts`)

Wraps all Git operations using `Bun.spawnSync()` with array arguments to prevent command injection. Provides functions for:
- Repository info (root, common dir, default branch)
- Branch operations (create, delete, list)
- Worktree operations (add, remove, list, prune)
- Staging and commit
- Diff and status
- Reset and stash
- Merge and push

### Conflict Detection (`src/conflicts.ts`)

Detects file overlaps between sessions:
1. Collects all changed files from the current session (committed + pending + uncommitted)
2. Iterates over all other active sessions
3. Computes set intersection of changed files
4. Uses `git merge-tree` to test auto-merge possibility

### Test Runner (`src/test-runner.ts`)

Supports running tests in isolation:
- **Single session:** Runs test command in the session's worktree
- **Combined:** Creates temp worktree, sequentially merges session branches, runs tests
- **Auto-detection:** Checks for package.json, pyproject.toml, Cargo.toml, go.mod, build.zig, deno.json, Makefile

### File Locking (`src/utils/lock.ts`)

Uses directory-based locking (mkdir atomicity on POSIX):
- Creates `.lock` directory with PID metadata
- Detects stale locks (dead process or timeout > 30s)
- Auto-cleanup on process death

### Adapter System (`src/hooks/install.ts`)

Adapters install agent-specific hooks:
- **Claude Code:** PreToolUse + Stop hooks in `.claude/hooks/`
- **Cursor:** Pre-save hooks in `.cursor/hooks/`
- **Aider:** Pre-edit hooks in `.aider/hooks/`

### Forge System (`src/forge/github.ts`)

Creates pull requests on different platforms:
- **GitHub:** Uses `gh` CLI
- **GitLab:** Uses `glab` CLI
- **Bitbucket:** Uses `bb` CLI

## File Layout

```
.git/
  lanes-manifests/       # Session manifests (shared across worktrees)
.lanes/
  worktrees/             # Session worktrees
    feature-a/
    feature-b/
.lanes.json              # Project configuration
```

## Design Decisions

### Why worktrees over branches?
Worktrees provide true filesystem isolation. Multiple agents can run builds, tests, and linters simultaneously without interference.

### Why sequential merge over octopus merge?
Sequential merge handles complex conflicts more gracefully and provides clearer error messages when a specific session's changes cause issues.

### Why file locking?
Multiple agents may attempt to update manifests concurrently. Directory-based locking with stale detection prevents corruption without external dependencies.
