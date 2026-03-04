# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| < 2.0   | No        |

## Reporting a Vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, email the maintainers with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Response times:

- Acknowledgment: 48 hours
- Initial assessment: 1 week
- Fix: Critical 72h, High 1 week, Medium 2 weeks

## Security Best Practices

### Secrets Management

Never commit secrets to the repository. The following are git-ignored:

- `.env` (use `.env.example` as template)
- `.mcp.json` (contains BC credentials for stdio mode)
- `.claude/` (local IDE configuration)
- `.local-deployment-docs/` (deployment-specific configs)

For production, use **Azure Key Vault**:

```bash
az keyvault secret set \
  --vault-name "your-key-vault" \
  --name "bc-client-secret" \
  --value "<your-client-secret>"
```

### npm Mode (stdio)

- Store credentials in `.mcp.json` or pass via `env` block in client config
- `.mcp.json` is git-ignored by default
- Use separate Azure AD app registrations for dev vs production
- Never pass secrets as CLI arguments in shared environments (visible in process list)

### Enterprise Mode (HTTP)

- Store all secrets in Azure Key Vault with Managed Identity
- Configure restrictive CORS origins (not `*`)
- Enable rate limiting (`RATE_LIMIT_ENABLED=true`)
- Use HTTPS only (enforced by Azure Container Apps)
- Rotate client secrets every 90 days, API keys every 180 days

### Azure AD App Registration

- Use least-privilege scopes: `Dynamics 365 Business Central > API.ReadWrite.All`
- Use separate app registrations per environment (dev, staging, production)
- Enable admin consent for application permissions
- Monitor sign-in logs for suspicious activity

## Authentication Modes

| Mode | Use Case | Transport |
| ---- | -------- | --------- |
| None | Local stdio (process-level security) | stdio |
| API Key | Simple HTTP client auth | HTTP |
| OAuth 2.0 | Enterprise with user context | HTTP |
| Dual (API Key + OAuth) | Copilot Studio discovery + execution | HTTP |

## What NOT to Commit

```bash
# WRONG - real values
AZURE_TENANT_ID=12345678-abcd-1234-abcd-123456789012
BC_CLIENT_SECRET=abc123~secretvalue

# RIGHT - placeholders
AZURE_TENANT_ID=<your-tenant-id>
BC_CLIENT_SECRET=<your-client-secret>
```

## Pre-Release Checklist

- [ ] No secrets in repository or commit history
- [ ] `.env.example` uses placeholders only
- [ ] Documentation uses `<placeholder>` format
- [ ] `.gitignore` covers `.env`, `.mcp.json`, `.claude/`, `.local-deployment-docs/`
- [ ] HTTPS enforced in production
- [ ] Rate limiting configured
- [ ] CORS origins specified (not wildcard)
- [ ] Azure Key Vault configured for production secrets
- [ ] Secrets rotation schedule documented

---

Last Updated: March 2026
