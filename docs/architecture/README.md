# Architecture Overview

## System Architecture

The Business Central MCP Server is built with a modular, enterprise-grade architecture designed for scalability, resilience, and maintainability.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         AI Clients                           │
│  (Claude Desktop, Copilot Studio, Custom Integrations)       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Transport Layer                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │  │
│  │  │   HTTP   │  │   SSE    │  │     STDIO      │    │  │
│  │  └──────────┘  └──────────┘  └────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Security Layer                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │  │
│  │  │   HMAC   │  │ IP Allow │  │    OAuth 2.0   │    │  │
│  │  └──────────┘  └──────────┘  └────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Core Services                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │  │
│  │  │Tool Gen. │  │ Protocol │  │   Resources    │    │  │
│  │  └──────────┘  └──────────┘  └────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Performance & Resilience                   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │  │
│  │  │  Cache   │  │  Circuit │  │    Bulkhead    │    │  │
│  │  │  (Redis) │  │  Breaker │  │    Pattern     │    │  │
│  │  └──────────┘  └──────────┘  └────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Observability                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │  │
│  │  │ Tracing  │  │ Metrics  │  │    Logging     │    │  │
│  │  │  (OTel)  │  │(Prometh.)│  │  (App Insight) │    │  │
│  │  └──────────┘  └──────────┘  └────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Business Central API                            │
│  (OData v4, REST API, Custom Extensions)                     │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Transport Layer
Handles communication with AI clients through multiple protocols:

- **HTTP Transport** (`src/transports/http.ts`)
  - RESTful endpoints for web clients
  - Supports JSON-RPC 2.0
  - Rate limiting and CORS support

- **SSE Transport** (`src/transports/copilot-sse.ts`)
  - Server-Sent Events for real-time updates
  - Streaming responses for large datasets
  - Copilot Studio optimized

- **STDIO Transport** (`src/transports/stdio-server.ts`)
  - Direct pipe communication
  - Claude Desktop compatible
  - Low latency for local clients

### 2. Security Layer
Enterprise-grade security features:

- **HMAC Request Signing** (`src/security/request-signing.ts`)
  - SHA-256 signature verification
  - Replay attack prevention
  - Constant-time comparison

- **IP Allowlisting** (`src/security/request-signing.ts`)
  - CIDR range support
  - Private network detection
  - Dynamic IP management

- **OAuth 2.0** (`src/auth/oauth.ts`)
  - Azure AD integration
  - Token refresh automation
  - Multi-tenant support

### 3. Core Services

- **Tool Definitions** (`src/tools/generic-tools.ts`)
  - 14 generic resource-agnostic tools
  - Tool executor (`src/tools/generic-executor.ts`)

- **Protocol Handler** (`src/mcp/protocol.ts`)
  - MCP 1.0 compliance
  - Batch request support
  - Error standardization

- **Resource Manager** (`src/resources/`)
  - Dynamic resource discovery
  - Company-level isolation
  - Metadata caching

### 4. Performance Layer

- **Caching System** (`src/performance/redis-cache.ts`)
  ```
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │   Request   │────▶│  LRU Cache  │────▶│    Redis    │
  └─────────────┘     │  (Memory)   │     │ (Distributed)│
                       └─────────────┘     └─────────────┘
                              │                    │
                              └────────┬───────────┘
                                       ▼
                              ┌─────────────────┐
                              │   BC API Call   │
                              └─────────────────┘
  ```

- **Circuit Breaker** (`src/resilience/circuit-breaker.ts`)
  - States: Closed → Open → Half-Open
  - Automatic recovery
  - Fallback responses

- **Bulkhead Pattern** (`src/resilience/circuit-breaker.ts`)
  - Resource isolation
  - Queue management
  - Concurrent request limits

### 5. Observability

- **Distributed Tracing** (`src/monitoring/tracing.ts`)
  - OpenTelemetry integration
  - Request correlation
  - Performance insights

- **Metrics Collection** (`src/monitoring/metrics.ts`)
  - Prometheus format
  - Custom business metrics
  - Real-time dashboards

- **Structured Logging** (`src/utils/logger.ts`)
  - Application Insights integration
  - Context propagation
  - Error tracking

## Data Flow

### Request Processing Pipeline

```
1. Request Arrival
   ├─▶ Transport Layer (HTTP/SSE/STDIO)
   │
2. Security Validation
   ├─▶ IP Allowlist Check
   ├─▶ HMAC Signature Verification
   ├─▶ OAuth Token Validation
   │
3. Request Processing
   ├─▶ Rate Limiting
   ├─▶ Request Parsing
   ├─▶ Cache Check
   │   ├─▶ [Cache Hit] Return Cached Response
   │   └─▶ [Cache Miss] Continue Processing
   │
4. Business Logic
   ├─▶ Tool/Resource Resolution
   ├─▶ Circuit Breaker Check
   │   ├─▶ [Open] Return Fallback
   │   └─▶ [Closed] Execute Request
   ├─▶ BC API Call
   │
5. Response Processing
   ├─▶ Response Transformation
   ├─▶ Cache Update
   ├─▶ Compression
   │
6. Response Delivery
   └─▶ Transport Layer Response
```

## Scalability Design

### Horizontal Scaling

```
        Load Balancer
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
Server 1  Server 2  Server N
    │        │        │
    └────────┼────────┘
             ▼
      Shared Redis Cache
             ▼
      Business Central
```

### Key Scalability Features

1. **Stateless Design**
   - No server-side session state
   - Request-based authentication
   - Shared cache layer

2. **Connection Pooling**
   - Reusable BC API connections
   - Redis connection pooling
   - Database connection limits

3. **Resource Management**
   - Memory limits per request
   - CPU throttling
   - Graceful shutdown

## Technology Stack

### Core Technologies
- **Runtime:** Node.js 20+ (LTS)
- **Language:** TypeScript 5.3+
- **Framework:** Express 4.18+
- **Protocol:** MCP 1.0

### Infrastructure
- **Cache:** Redis 7+
- **Container:** Docker 20+
- **Cloud:** Azure Container Apps
- **Registry:** Azure Container Registry

### Observability
- **Tracing:** OpenTelemetry
- **Metrics:** Prometheus
- **Logging:** Application Insights
- **APM:** Azure Monitor

## Design Patterns

### Implemented Patterns

1. **Dependency Injection**
   - IoC container
   - Service registration
   - Lifetime management

2. **Repository Pattern**
   - Data access abstraction
   - Business logic separation
   - Testability

3. **Strategy Pattern**
   - Transport strategies
   - Authentication strategies
   - Caching strategies

4. **Observer Pattern**
   - Event-driven architecture
   - Subscription management
   - Change notifications

5. **Factory Pattern**
   - Tool generation
   - Resource creation
   - Transport instantiation

## Security Architecture

### Defense in Depth

```
Layer 1: Network Security
├─ IP Allowlisting
├─ TLS/HTTPS Only
└─ DDoS Protection

Layer 2: Authentication
├─ OAuth 2.0
├─ API Keys
└─ HMAC Signing

Layer 3: Authorization
├─ Role-Based Access
├─ Resource Isolation
└─ Tenant Separation

Layer 4: Application Security
├─ Input Validation
├─ SQL Injection Prevention
└─ XSS Protection

Layer 5: Data Security
├─ Encryption at Rest
├─ Encryption in Transit
└─ Secret Management
```

## Performance Characteristics

### Benchmarks (v2.2.7)

| Metric | Value | Target |
|--------|-------|--------|
| Startup Time | < 3s | < 5s |
| Request Latency (p50) | 45ms | < 100ms |
| Request Latency (p99) | 250ms | < 500ms |
| Throughput | 1000 req/s | > 500 req/s |
| Memory Usage | 256MB | < 512MB |
| Cache Hit Rate | 85% | > 80% |

### Optimization Strategies

1. **Caching**
   - Multi-level caching (Memory + Redis)
   - Intelligent TTL management
   - Cache warming strategies

2. **Compression**
   - Response compression (gzip/brotli)
   - Payload optimization
   - Binary protocol support

3. **Connection Management**
   - Keep-alive connections
   - Connection pooling
   - Smart retry logic

## Architecture Decision Records

Key architectural decisions are documented in ADRs:

1. [ADR-001: Dual Transport Strategy](./ADR-001-transport-strategy.md)
2. [ADR-002: Distributed Caching Strategy](./ADR-002-caching-strategy.md)
3. [ADR-003: Resilience Patterns](./ADR-003-resilience-patterns.md)

## Future Architecture Considerations

### Planned Enhancements

1. **GraphQL Support**
   - Unified query interface
   - Schema stitching
   - Real-time subscriptions

2. **Event Sourcing**
   - Audit trail
   - Time travel debugging
   - Event replay

3. **Service Mesh**
   - Istio integration
   - Traffic management
   - Advanced observability

4. **Multi-Region Support**
   - Geo-distributed caching
   - Regional failover
   - Data sovereignty

---

*For implementation details, see the [source code](../../src/) and [API documentation](../api-reference/).*