# Support

## Getting Help

### GitHub Discussions

For questions, ideas, and general discussion, use [GitHub Discussions](https://github.com/your-username/git-lanes/discussions).

### Bug Reports

Found a bug? [Open an issue](https://github.com/your-username/git-lanes/issues/new?template=bug_report.yml) with steps to reproduce.

### Feature Requests

Have an idea? [Submit a feature request](https://github.com/your-username/git-lanes/issues/new?template=feature_request.yml).

## FAQ

### How do I see which session is active?

```bash
git lanes which
```

### How do I recover from a crashed session?

```bash
git lanes prune
```

This removes orphaned worktrees, branches, and manifests from crashed sessions.

### Can I use git-lanes without an AI agent?

Yes. git-lanes works as a standalone tool for any workflow that benefits from parallel isolated workspaces.

### How do I resolve conflicts between sessions?

```bash
# Check for conflicts
git lanes conflicts

# End one session and merge it
git lanes end
git lanes merge

# Then continue with the other session
```

### Does git-lanes work with monorepos?

Yes. Use `shared_dirs` in `.lanes.json` to symlink common directories (like `node_modules`) into session worktrees to save disk space.
