# ADR-002: Distributed Caching Strategy

## Status
Accepted

## Context
Business Central API calls can be slow and rate-limited. The server needs to:
- Reduce API call frequency
- Improve response times
- Support horizontal scaling
- Handle cache invalidation properly

## Decision
Implement a hybrid caching strategy with:
1. In-memory LRU cache for hot data
2. Redis distributed cache for shared state
3. Compression for large cached objects
4. Smart TTL based on data type

## Consequences
### Positive
- Significant performance improvement (10x for cached hits)
- Reduced BC API load
- Horizontal scaling capability
- Consistent cache across instances

### Negative
- Additional Redis dependency for production
- Cache invalidation complexity
- Memory usage considerations

## Implementation
```typescript
// Hybrid cache with fallback
class HybridCache {
  private memory: LRUCache
  private redis: RedisCache

  async get(key: string) {
    return await memory.get(key)
      ?? await redis.get(key)
      ?? await fetchFromSource(key)
  }
}
```

## Cache TTL Strategy
- Company metadata: 1 hour
- Tool definitions: 10 minutes
- Query results: 5 minutes
- Authentication tokens: Until expiry minus buffer