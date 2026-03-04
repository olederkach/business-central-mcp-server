# ADR-001: Dual Transport Strategy

## Status
Accepted

## Context
The MCP server needs to support multiple client types:
- Claude Desktop (requires stdio transport)
- Copilot Studio (requires HTTP/SSE transport)
- Future AI agents (may require different transports)

## Decision
Implement a dual-transport architecture supporting both stdio and HTTP/SSE transports simultaneously.

## Consequences
### Positive
- Maximum compatibility with different AI platforms
- Single codebase serves multiple client types
- Easy to add new transports in the future
- Better testing capabilities with HTTP transport

### Negative
- Increased complexity in transport abstraction layer
- Need to maintain compatibility across transports
- Additional testing burden for both transports

## Implementation
- Abstract transport layer with common interface
- Transport-agnostic tool execution
- Unified error handling across transports
- Shared authentication and authorization