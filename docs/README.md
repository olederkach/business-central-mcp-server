# Documentation

Business Central MCP Server

---

## Getting Started

| Document | Description |
| -------- | ----------- |
| [Quick Start](QUICK_START.md) | npm/npx setup (2 min) and Azure deployment overview |
| [MCP Client Setup](MCP_CLIENT_SETUP.md) | Configure Claude Desktop, Claude Code, Cursor, Cline, Claude.ai, Copilot Studio, Azure AI Foundry |
| [Copilot Studio](COPILOT_STUDIO_COMPLETE_SETUP.md) | Microsoft Copilot Studio integration (OAuth Dynamic Discovery) |
| [Azure AI Foundry](azure-ai-foundry/QUICK_SETUP.md) | Azure AI Foundry agent setup |

## Deployment & Operations

| Document | Description |
| -------- | ----------- |
| [Deployment Guide](DEPLOYMENT.md) | Azure Container Apps deployment, app registration, CI/CD |
| [DCR Setup](DCR_SETUP_GUIDE.md) | OAuth 2.0 Dynamic Client Registration and discovery endpoints |
| [Key Vault Migration](KEY_VAULT_MIGRATION_GUIDE.md) | Move secrets to Azure Key Vault |

## Architecture

| Document | Description |
| -------- | ----------- |
| [Architecture Overview](ARCHITECTURE.md) | Components, data flow, security layers |
| [ADR-001: Transport Strategy](architecture/ADR-001-transport-strategy.md) | stdio + HTTP/SSE dual transport |
| [ADR-002: Caching Strategy](architecture/ADR-002-caching-strategy.md) | In-memory LRU cache design |
| [ADR-003: Resilience Patterns](architecture/ADR-003-resilience-patterns.md) | Circuit breaker, retry, timeout |
| [Architecture Diagrams](architecture/architecture-diagram.md) | Mermaid diagrams |

## API Reference

| Document | Description |
| -------- | ----------- |
| [API Reference](api-reference/README.md) | Endpoints, authentication, tools |
| [OData Parameters](api-reference/odata-parameters.md) | $filter, $select, $expand, $orderby |
| [Error Catalog](api-reference/error-catalog.md) | Error codes and troubleshooting |

## Azure AI Foundry

| Document | Description |
| -------- | ----------- |
| [Quick Setup](azure-ai-foundry/QUICK_SETUP.md) | Connect to Azure AI Foundry |
| [Agent Service Setup](azure-ai-foundry/AGENT_SERVICE_SETUP.md) | MCP resource discovery for agents |
| [Dynamic Input Discovery](azure-ai-foundry/DYNAMIC_INPUT_DISCOVERY.md) | How resource discovery works |

---

## External Resources

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [BC API Documentation](https://learn.microsoft.com/dynamics365/business-central/dev-itpro/api-reference/v2.0/)
- [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)

## Support

- [GitHub Issues](https://github.com/olederkach/business-central-mcp-server/issues) -- Bug reports
- [Security Policy](../SECURITY.md) -- Vulnerability reporting
