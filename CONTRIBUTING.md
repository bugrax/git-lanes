# Contributing to git-lanes

Thank you for your interest in contributing to git-lanes! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- [Git](https://git-scm.com) 2.20+
- [GitHub CLI](https://cli.github.com) (optional, for PR testing)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/git-lanes.git
cd git-lanes

# Install dependencies
bun install

# Run tests
bun test

# Run the CLI locally
bun run src/cli.ts help
```

## Project Structure

```
src/
  cli.ts           — CLI entry point and command dispatch
  config.ts        — .lanes.json configuration loader
  session.ts       — Session lifecycle management
  manifest.ts      — Session manifest (JSON metadata)
  git.ts           — Git command wrappers (uses Bun.spawnSync)
  conflicts.ts     — Cross-session conflict detection
  test-runner.ts   — Isolated test execution
  hooks/           — Agent hook installation
  adapters/        — Agent-specific adapters
  forge/           — PR creation (GitHub, GitLab, Bitbucket)
  utils/           — Validation, logging, file locking
```

## Development Workflow

### Running Tests

```bash
# All tests
bun test

# Specific test suites
bun test test/unit
bun test test/integration
bun test test/security
bun test test/e2e
bun test test/stress
```

### Type Checking

```bash
bunx --bun tsc --noEmit
```

### Building

```bash
bun run build
```

## Submitting Changes

### Bug Reports

When filing a bug report, include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Your environment (OS, Bun version, Git version)

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with clear, incremental commits
4. Ensure all tests pass: `bun test`
5. Ensure type checking passes: `bunx --bun tsc --noEmit`
6. Submit a pull request

### Commit Message Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add GitLab MR support
fix: prevent path traversal in session names
docs: update README with new commands
test: add integration tests for squash
chore: update dependencies
```

## Coding Rules

1. **Always use `spawnSync` with argument arrays** — never `execSync` with string commands (prevents injection)
2. **Use `getGitCommonDir()`/`getRepoRoot()`** — never hardcode paths
3. **Use `saveManifest()`** — for atomic writes with file locking
4. **Validate session names** with the regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`
5. **Zero runtime dependencies** — only use Bun/Node built-in modules
6. **Always load config** via `loadConfig(repoRoot)`
7. **Hook scripts are bash** — keep them portable

## Design Principles

- **Safety first** — validate all inputs, prevent injection, use atomic operations
- **Zero dependencies** — the tool should work with just Bun and Git
- **Git-native** — leverage Git's built-in features (worktrees, branches) rather than reinventing
- **Adapter-agnostic** — support multiple AI coding tools through a clean adapter interface
- **Fail gracefully** — always clean up on errors, preserve user's work

## Security

If you discover a security vulnerability, please report it responsibly. See [SECURITY.md](SECURITY.md) for details.

## AI Disclosure

If your contribution was assisted by an AI coding tool, please note this in your pull request description. This is informational only and does not affect whether your contribution is accepted.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
