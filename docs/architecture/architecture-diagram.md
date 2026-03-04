# Architecture Diagrams

## System Overview

```mermaid
graph TB
    subgraph "AI Clients"
        CD[Claude Desktop]
        CS[Copilot Studio]
        CC[Custom Clients]
    end

    subgraph "Azure Cloud"
        subgraph "Front Door / CDN"
            FD[Azure Front Door]
            WAF[Web Application Firewall]
        end

        subgraph "Container Apps Environment"
            LB[Load Balancer]

            subgraph "MCP Servers"
                S1[Server Instance 1]
                S2[Server Instance 2]
                S3[Server Instance N]
            end
        end

        subgraph "Data Layer"
            RC[Redis Cache]
            KV[Key Vault]
            AI[Application Insights]
        end

        subgraph "Business Central"
            BC[BC API Endpoints]
        end
    end

    CD -->|stdio| S1
    CS -->|HTTPS/SSE| FD
    CC -->|HTTPS| FD

    FD --> WAF
    WAF --> LB
    LB --> S1
    LB --> S2
    LB --> S3

    S1 --> RC
    S2 --> RC
    S3 --> RC

    S1 --> KV
    S2 --> KV
    S3 --> KV

    S1 --> AI
    S2 --> AI
    S3 --> AI

    S1 --> BC
    S2 --> BC
    S3 --> BC

    style CD fill:#e1f5fe
    style CS fill:#e1f5fe
    style CC fill:#e1f5fe
    style FD fill:#fff3e0
    style WAF fill:#ffebee
    style LB fill:#f3e5f5
    style S1 fill:#e8f5e9
    style S2 fill:#e8f5e9
    style S3 fill:#e8f5e9
    style RC fill:#fff9c4
    style KV fill:#ffebee
    style AI fill:#e3f2fd
    style BC fill:#fce4ec
```

## Request Flow Sequence

```mermaid
sequenceDiagram
    participant C as Client
    participant WAF as WAF
    participant LB as Load Balancer
    participant MCP as MCP Server
    participant Cache as Redis Cache
    participant BC as Business Central
    participant AI as App Insights

    C->>WAF: HTTPS Request
    WAF->>WAF: Security Check
    WAF->>LB: Forward Request
    LB->>MCP: Route to Instance

    MCP->>MCP: Validate Auth
    MCP->>MCP: Check IP Allowlist
    MCP->>MCP: Verify HMAC

    MCP->>Cache: Check Cache
    alt Cache Hit
        Cache-->>MCP: Return Cached Data
        MCP-->>C: Return Response
    else Cache Miss
        MCP->>BC: API Call
        BC-->>MCP: BC Response
        MCP->>Cache: Update Cache
        MCP-->>C: Return Response
    end

    MCP->>AI: Log Metrics
```

## Component Details

### Transport Layer Architecture

```mermaid
graph LR
    subgraph "Transport Layer"
        subgraph "HTTP/SSE"
            H1[Express Server]
            H2[Rate Limiter]
            H3[CORS Handler]
            H4[SSE Stream]
        end

        subgraph "STDIO"
            S1[stdin Reader]
            S2[stdout Writer]
            S3[Protocol Parser]
        end

        subgraph "Common"
            P1[MCP Protocol]
            P2[JSON-RPC Handler]
            P3[Batch Support]
        end
    end

    H1 --> P1
    S1 --> P1
    P1 --> P2
    P2 --> P3

    style H1 fill:#e8f5e9
    style S1 fill:#e3f2fd
    style P1 fill:#fff3e0
```

### Security Layer Architecture

```mermaid
graph TB
    subgraph "Security Layers"
        subgraph "Network Security"
            NS1[IP Allowlist]
            NS2[TLS/HTTPS]
            NS3[DDoS Protection]
        end

        subgraph "Authentication"
            A1[OAuth 2.0]
            A2[API Keys]
            A3[HMAC Signing]
        end

        subgraph "Authorization"
            Z1[Role-Based Access]
            Z2[Resource Isolation]
            Z3[Tenant Separation]
        end

        subgraph "Application Security"
            AS1[Input Validation]
            AS2[SQL Injection Prevention]
            AS3[XSS Protection]
        end
    end

    NS1 --> A1
    A1 --> Z1
    Z1 --> AS1

    style NS1 fill:#ffebee
    style A1 fill:#fff3e0
    style Z1 fill:#e8f5e9
    style AS1 fill:#e3f2fd
```

### Caching Strategy

```mermaid
graph LR
    subgraph "Multi-Level Cache"
        R[Request] --> L1[L1: Memory Cache<br/>LRU - 100MB]
        L1 -->|Miss| L2[L2: Redis Cache<br/>Distributed - 1GB]
        L2 -->|Miss| BC[Business Central API]

        BC --> L2U[Update L2]
        L2U --> L1U[Update L1]
        L1U --> RS[Response]

        L1 -->|Hit| RS
        L2 -->|Hit| L1U
    end

    style L1 fill:#fff9c4
    style L2 fill:#ffecb3
    style BC fill:#fce4ec
```

### Circuit Breaker State Machine

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open: Failure Threshold Exceeded
    Open --> HalfOpen: Timeout Expired
    HalfOpen --> Closed: Success
    HalfOpen --> Open: Failure

    note right of Closed
        Normal operation
        All requests pass through
    end note

    note right of Open
        Circuit is open
        Requests fail fast
        Return fallback response
    end note

    note right of HalfOpen
        Testing recovery
        Limited requests allowed
    end note
```

### Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        D1[Local Docker]
        D2[Unit Tests]
        D3[Integration Tests]
    end

    subgraph "CI/CD Pipeline"
        GH[GitHub Actions]
        B1[Build & Test]
        B2[Security Scan]
        B3[Docker Build]
        B4[Push to ACR]
    end

    subgraph "Staging"
        ST1[Container Apps Staging]
        ST2[E2E Tests]
        ST3[Performance Tests]
    end

    subgraph "Production"
        subgraph "Region 1 - East US"
            P1[Container Apps]
            R1[Redis Cache]
        end

        subgraph "Region 2 - West US"
            P2[Container Apps]
            R2[Redis Cache]
        end

        TM[Traffic Manager]
    end

    D1 --> GH
    GH --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> ST1
    ST1 --> ST2
    ST2 --> ST3
    ST3 --> P1
    ST3 --> P2

    TM --> P1
    TM --> P2

    R1 -.->|Replication| R2

    style D1 fill:#e8f5e9
    style GH fill:#fff3e0
    style ST1 fill:#e3f2fd
    style P1 fill:#ffebee
    style P2 fill:#ffebee
    style TM fill:#f3e5f5
```

### Data Flow Architecture

```mermaid
graph LR
    subgraph "Data Sources"
        BC1[Companies]
        BC2[Customers]
        BC3[Items]
        BC4[Sales Orders]
        BC5[Custom APIs]
    end

    subgraph "MCP Server"
        TG[Tool Generator]
        TG --> T1[14 Generic Tools]
        TG --> T2[Custom Tools]

        RM[Resource Manager]
        RM --> R1[Company Resources]
        RM --> R2[Metadata Resources]

        PM[Prompt Manager]
        PM --> P1[12 BC Prompts]
    end

    subgraph "Output Formats"
        JSON[JSON Response]
        STREAM[Stream Response]
        SSE[SSE Events]
    end

    BC1 --> TG
    BC2 --> TG
    BC3 --> TG
    BC4 --> TG
    BC5 --> TG

    T1 --> JSON
    T2 --> STREAM
    R1 --> SSE
    R2 --> JSON
    P1 --> JSON

    style BC1 fill:#fce4ec
    style TG fill:#e8f5e9
    style JSON fill:#e3f2fd
```

### Monitoring Architecture

```mermaid
graph TB
    subgraph "Application"
        APP[MCP Server]
        APP --> OT[OpenTelemetry]
        APP --> PM[Prometheus Metrics]
        APP --> AL[App Insights Logger]
    end

    subgraph "Collection"
        OT --> OTLP[OTLP Collector]
        PM --> PROM[Prometheus Server]
        AL --> AI[Application Insights]
    end

    subgraph "Storage"
        OTLP --> AzMon[Azure Monitor]
        PROM --> TS[Time Series DB]
        AI --> LA[Log Analytics]
    end

    subgraph "Visualization"
        AzMon --> DASH1[Azure Dashboard]
        TS --> GRAF[Grafana]
        LA --> KQL[KQL Queries]

        DASH1 --> ALERT[Alerts]
        GRAF --> ALERT
        KQL --> ALERT
    end

    style APP fill:#e8f5e9
    style OTLP fill:#fff3e0
    style AzMon fill:#e3f2fd
    style GRAF fill:#f3e5f5
    style ALERT fill:#ffebee
```

### High Availability Architecture

```mermaid
graph TB
    subgraph "Global Load Balancing"
        DNS[Azure DNS]
        TM[Traffic Manager]
    end

    subgraph "Region 1: East US"
        subgraph "Availability Zone 1"
            E1A[MCP Instance]
        end
        subgraph "Availability Zone 2"
            E1B[MCP Instance]
        end
        subgraph "Availability Zone 3"
            E1C[MCP Instance]
        end
        ER1[(Redis Primary)]
    end

    subgraph "Region 2: West US"
        subgraph "Availability Zone 1"
            W1A[MCP Instance]
        end
        subgraph "Availability Zone 2"
            W1B[MCP Instance]
        end
        subgraph "Availability Zone 3"
            W1C[MCP Instance]
        end
        WR1[(Redis Replica)]
    end

    subgraph "Region 3: North Europe"
        subgraph "Availability Zone 1"
            N1A[MCP Instance]
        end
        subgraph "Availability Zone 2"
            N1B[MCP Instance]
        end
        subgraph "Availability Zone 3"
            N1C[MCP Instance]
        end
        NR1[(Redis Replica)]
    end

    DNS --> TM
    TM --> E1A
    TM --> W1A
    TM --> N1A

    ER1 -.->|Geo-Replication| WR1
    ER1 -.->|Geo-Replication| NR1

    style DNS fill:#fff3e0
    style TM fill:#f3e5f5
    style E1A fill:#e8f5e9
    style W1A fill:#e3f2fd
    style N1A fill:#ffebee
    style ER1 fill:#fff9c4
```

## Performance Optimization Flow

```mermaid
graph TD
    REQ[Incoming Request] --> COMPRESS{Compressible?}

    COMPRESS -->|Yes| COMP[Enable Compression]
    COMPRESS -->|No| CACHE{Cacheable?}
    COMP --> CACHE

    CACHE -->|Yes| CHECK[Check Cache]
    CACHE -->|No| EXEC[Execute Request]

    CHECK --> HIT{Cache Hit?}
    HIT -->|Yes| RETURN[Return Cached]
    HIT -->|No| EXEC

    EXEC --> BATCH{Batchable?}
    BATCH -->|Yes| QUEUE[Queue Request]
    BATCH -->|No| PROCESS[Process Single]

    QUEUE --> BATCHEXEC[Batch Execute]
    BATCHEXEC --> UPDATE[Update Cache]
    PROCESS --> UPDATE

    UPDATE --> COMPRESS2{Response > 1KB?}
    COMPRESS2 -->|Yes| GZIP[Compress Response]
    COMPRESS2 -->|No| SEND[Send Response]
    GZIP --> SEND

    RETURN --> SEND

    style REQ fill:#e8f5e9
    style RETURN fill:#fff9c4
    style SEND fill:#e3f2fd
```

---

*These diagrams represent the current architecture of Business Central MCP Server v2.2.7. For implementation details, see the [source code](../../src/).*