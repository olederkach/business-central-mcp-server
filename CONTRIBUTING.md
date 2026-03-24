# Contributing

Thanks for your interest in contributing to **business-central-mcp-server**!

## Getting Started

1. Fork the repository
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/<your-username>/business-central-mcp-server.git
   cd business-central-mcp-server
   npm install
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

```bash
npm run build    # Compile TypeScript
npm run lint     # Run ESLint
npm run dev      # Build and run stdio server
npm audit        # Check for vulnerabilities
```

## Code Standards

- **TypeScript** — all source code is in `src/`
- **Structured logging** — use `src/utils/logger.ts`, never `console.log`/`console.error`
- **No hardcoded credentials** — use `<your-...>` placeholders in examples and docs
- **Input validation** — validate all user-facing parameters
- **Tool annotations** — every MCP tool must include `readOnly` or `destructive` hints
- **Lint clean** — `npm run lint` must pass with 0 errors before submitting

## Security

- **Never commit credentials**, API keys, client secrets, or tenant IDs
- **Report vulnerabilities privately** — see [SECURITY.md](SECURITY.md)
- Review the Security Checklist in the PR template before submitting

## Pull Request Process

1. Ensure `npm run build` and `npm run lint` pass with 0 errors
2. Ensure `npm audit` shows no new vulnerabilities
3. Fill out the PR template completely
4. PRs are squash-merged into `main`

## Architecture

The server uses 14 generic, resource-agnostic tools (not entity-specific) to interact
with any Business Central API. See [docs/architecture.md](docs/architecture.md) for details.

Two deployment modes:
- **npm/stdio** — for local MCP clients (Claude Desktop, VS Code, Cursor)
- **Azure HTTP/SSE** — for enterprise deployment (Claude.ai, Copilot Studio)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating,
you are expected to uphold this code.
