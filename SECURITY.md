# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in git-lanes, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Use [GitHub Security Advisories](https://github.com/your-username/git-lanes/security/advisories/new) to report privately
3. Include steps to reproduce, impact assessment, and suggested fix if possible

We will acknowledge your report within 48 hours and provide a timeline for resolution.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Model

git-lanes is designed with the following security measures:

### Command Injection Prevention
- All Git commands use `spawnSync` with **array arguments** (never string interpolation)
- Session names are validated against `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`
- File paths are validated to prevent traversal attacks

### Path Traversal Protection
- Session names cannot contain `..`, `/`, or `\`
- All paths are resolved and validated before use

### Atomic File Operations
- Manifest writes use temp file + rename for atomicity
- File locking prevents race conditions between concurrent processes

### Input Validation
- All user inputs (session names, commit messages, file paths) are validated
- Dangerous characters are rejected: `;&|` `` ` `` `$(){}[]!#~'"\\<>`

## In Scope

- Command injection via session names or commit messages
- Path traversal attacks
- Race conditions in manifest operations
- Symlink-based escapes from worktrees
- Privilege escalation through hook scripts

## Out of Scope

- Vulnerabilities in Git itself
- Issues requiring physical access to the machine
- Social engineering attacks
- Denial of service through resource exhaustion (e.g., creating thousands of sessions)

## Security Scanning

The CI pipeline includes security-focused tests that verify:
- Input validation rejects malicious session names
- Path traversal attempts are blocked
- Command injection payloads are neutralized
