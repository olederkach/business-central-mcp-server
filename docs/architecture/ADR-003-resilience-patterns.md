# ADR-003: Resilience Patterns

## Status
Accepted

## Context
The server must handle:
- Business Central API outages
- Network failures
- Rate limiting
- Cascading failures
- Overload situations

## Decision
Implement comprehensive resilience patterns:
1. Circuit Breaker - Prevent cascading failures
2. Bulkhead - Isolate failures
3. Retry with exponential backoff
4. Timeout controls
5. Fallback mechanisms

## Consequences
### Positive
- High availability even during BC outages
- Graceful degradation
- Predictable failure behavior
- Better user experience
- Protection against cascading failures

### Negative
- Additional complexity
- Need for fallback data strategies
- Configuration tuning required

## Implementation

### Circuit Breaker Configuration
```typescript
{
  errorThresholdPercentage: 50,
  requestVolumeThreshold: 20,
  resetTimeout: 30000,
  sleepWindow: 5000
}
```

### Bulkhead Configuration
```typescript
{
  maxConcurrent: 10,
  maxQueue: 100,
  timeout: 30000
}
```

### Retry Policy
```typescript
{
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  factor: 2
}
```

## Monitoring
- Circuit breaker state changes
- Retry attempt metrics
- Bulkhead queue depth
- Timeout occurrences