# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-07

### Added
- Initial release
- Session lifecycle management (start, end, abort)
- Change tracking (track, commit, undo, squash)
- Cross-session conflict detection with resolution suggestions
- Test runner with auto-detection (bun, npm, pytest, cargo, go, deno, zig, make)
- Sequential merge strategy for combined testing
- Multi-forge PR support (GitHub, GitLab, Bitbucket)
- Adapter hooks for Claude Code, Cursor, and Aider
- File locking for manifest safety
- Configurable branch prefix via .lanes.json
- Input validation and security checks
- CLI with 20+ commands
