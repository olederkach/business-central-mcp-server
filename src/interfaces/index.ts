/**
 * Core Interfaces and Contracts
 * Following MCP best practices for type definitions
 */

export interface IMCPTransport {
  initialize(): Promise<void>;
  send(message: any): Promise<void>;
  receive(): Promise<any>;
  close(): Promise<void>;
}

export interface IMCPHandler {
  handle(request: MCPRequest): Promise<MCPResponse>;
  supports(method: string): boolean;
}

export interface IMCPToolRegistry {
  register(tool: MCPTool): void;
  unregister(name: string): void;
  get(name: string): MCPTool | undefined;
  list(cursor?: string, limit?: number): PaginatedTools;
}

export interface IMCPResourceProvider {
  list(): Promise<MCPResource[]>;
  read(uri: string): Promise<any>;
  subscribe(uri: string, handler: (data: any) => void): void;
  unsubscribe(uri: string): void;
}

export interface IMCPPromptRegistry {
  register(prompt: MCPPrompt): void;
  get(name: string): MCPPrompt | undefined;
  list(): MCPPrompt[];
}

export interface ICache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttl?: number): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export interface IMetricsCollector {
  increment(metric: string, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  histogram(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, duration: number, tags?: Record<string, string>): void;
}

export interface ICircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  reset(): void;
}

export interface IRetryPolicy {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  withExponentialBackoff(): IRetryPolicy;
  withMaxRetries(count: number): IRetryPolicy;
}

// MCP Types
export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  // MCP 2025-03-26: Tool annotations for better UX
  annotations?: {
    readOnly?: boolean;      // Tool only reads data, no modifications
    destructive?: boolean;    // Tool modifies or deletes data (warns user)
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface PaginatedTools {
  tools: MCPTool[];
  nextCursor?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, {
    status: 'pass' | 'fail';
    message?: string;
    duration?: number;
  }>;
  version: string;
  uptime: number;
}