# git-lanes

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-orange)](https://bun.sh)

**Parallel AI agent isolation for Git repositories.**

git-lanes enables multiple AI coding agents (Claude Code, Cursor, Aider) to work simultaneously on the same Git repository without creating conflicts. Each agent gets its own isolated lane — a dedicated branch and worktree — so they never step on each other's work.

## Table of Contents

- [Problem](#problem)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Adapter Support](#adapter-support)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)

## Problem

When multiple AI agents edit code simultaneously in a repository, they:
- Overwrite each other's changes
- Create merge conflicts
- Produce messy, interleaved commit histories
- Lose work during crashes or timeouts

git-lanes solves this by giving each agent its own isolated workspace with automatic change tracking, conflict detection, and clean PR generation.

## Features

- **Session Isolation** — Each agent gets a dedicated Git worktree and branch, mapped by process ID
- **Change Tracking** — Automatic tracking of file modifications with commit history
- **Conflict Detection** — Built-in detection of file overlaps across active sessions with resolution suggestions
- **Work Preservation** — Auto-checkpoint captures work during timeouts or crashes via WIP commits
- **Clean PR Generation** — Squash incremental edits into reviewable commits and generate pull requests
- **Multi-Adapter Support** — Hooks for Claude Code, Cursor, and Aider
- **Multi-Forge PRs** — Create pull requests on GitHub, GitLab, or Bitbucket
- **File Locking** — Prevent race conditions with atomic manifest operations
- **Zero Dependencies** — Uses only Bun built-ins, no external runtime packages

## Installation

```bash
# Install globally
bun install -g git-lanes

# Or use npx
bunx git-lanes <command>
```

## Quick Start

```bash
# 1. Start a session
git lanes start add-search-feature

# 2. Work normally — files are tracked automatically
# (your AI agent edits files here)

# 3. Commit your changes
git lanes commit -m "add search component with fuzzy matching"

# 4. Check for conflicts with other sessions
git lanes conflicts

# 5. Run tests
git lanes test

# 6. Create a pull request
git lanes pr --title "Add search feature with fuzzy matching"

# 7. End the session
git lanes end
```

## Commands

### Session Management

| Command | Description |
|---------|-------------|
| `git lanes start <name>` | Create a new isolated session |
| `git lanes end [-m <msg>]` | Finalize session, commit pending changes |
| `git lanes abort` | Discard session and all changes |

### Change Tracking

| Command | Description |
|---------|-------------|
| `git lanes track <files...>` | Mark files for next commit |
| `git lanes status` | Show current session state |
| `git lanes diff` | Show staged/unstaged modifications |
| `git lanes commit -m <msg>` | Record a changeset |
| `git lanes log` | List all changesets in session |
| `git lanes undo` | Revert last commit, keep changes |

### Integration

| Command | Description |
|---------|-------------|
| `git lanes squash -m <msg>` | Consolidate commits into one |
| `git lanes merge` | Integrate session into main branch |
| `git lanes pr --title <t>` | Create pull request |

### Collaboration

| Command | Description |
|---------|-------------|
| `git lanes conflicts` | Detect file overlaps across sessions |
| `git lanes test` | Run tests in session worktree |
| `git lanes test --combine` | Run tests on merged sessions |

### Management

| Command | Description |
|---------|-------------|
| `git lanes which` | Identify active session |
| `git lanes list` | Display all active sessions |
| `git lanes prune` | Remove orphaned sessions |
| `git lanes install-hooks` | Install agent hooks |
| `git lanes uninstall-hooks` | Remove agent hooks |

### Flags

| Flag | Description |
|------|-------------|
| `--session, -s <name>` | Specify session explicitly |
| `--forge, -f <type>` | PR forge: `github`, `gitlab`, `bitbucket` |
| `--adapter, -a <name>` | Hook adapter: `claude-code`, `cursor`, `aider` |
| `--command, -c <cmd>` | Test command override |

## Configuration

Create a `.lanes.json` file in your repository root:

```json
{
  "shared_dirs": ["node_modules", ".venv"],
  "main_branch_policy": "block",
  "force_cleanup": "prompt",
  "adopt_changes": "always",
  "branch_prefix": "lanes/"
}
```

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `shared_dirs` | string[] | `[]` | Directories symlinked into worktrees |
| `main_branch_policy` | `block`, `allow`, `prompt` | `block` | Main branch write protection |
| `force_cleanup` | `force`, `fail`, `prompt` | `prompt` | Cleanup behavior on errors |
| `adopt_changes` | `always`, `never`, `prompt` | `always` | Uncommitted change adoption |
| `branch_prefix` | string | `lanes/` | Prefix for session branches |

## Adapter Support

### Claude Code

```bash
git lanes install-hooks --adapter claude-code
```

Installs PreToolUse and Stop hooks that automatically track file changes and checkpoint work.

### Cursor

```bash
git lanes install-hooks --adapter cursor
```

Installs pre-save hooks for automatic file tracking.

### Aider

```bash
git lanes install-hooks --adapter aider
```

Installs pre-edit hooks to ensure session isolation.

## Architecture

git-lanes uses Git's native worktree feature to create isolated workspaces:

```
your-repo/
  .lanes/
    worktrees/
      feature-a/    # Agent 1's isolated workspace
      feature-b/    # Agent 2's isolated workspace
  .git/
    lanes-manifests/
      feature-a.json  # Session metadata
      feature-b.json
```

Each session consists of:
- A **Git branch** (e.g., `lanes/feature-a`)
- A **Git worktree** (isolated working directory)
- A **manifest** (JSON metadata tracking changesets and pending files)

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

## Requirements

- **Bun** 1.0+ (or Node.js 20+ for npm installation)
- **Git** 2.20+ (for worktree support)
- **GitHub CLI** (`gh`) — optional, for `git lanes pr` with GitHub
- **GitLab CLI** (`glab`) — optional, for `git lanes pr --forge gitlab`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
