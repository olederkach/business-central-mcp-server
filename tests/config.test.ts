import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCLIArgs, resolveBCConfig } from '../src/config.js';

describe('parseCLIArgs', () => {
  it('parses standard flags', () => {
    const result = parseCLIArgs(['--tenantId', 'my-tenant', '--environment', 'Sandbox']);
    expect(result.tenantId).toBe('my-tenant');
    expect(result.environment).toBe('Sandbox');
  });

  it('normalizes flag casing (Microsoft format)', () => {
    const result = parseCLIArgs(['--TenantId', 'my-tenant', '--ClientId', 'my-client']);
    expect(result.tenantId).toBe('my-tenant');
    expect(result.clientId).toBe('my-client');
  });

  it('skips flags without values', () => {
    const result = parseCLIArgs(['--tenantId', '--environment', 'Sandbox']);
    expect(result.tenantId).toBeUndefined();
    expect(result.environment).toBe('Sandbox');
  });

  it('skips boolean flags (next arg is another flag)', () => {
    const result = parseCLIArgs(['--stdio', '--tenantId', 'my-tenant']);
    expect(result.tenantId).toBe('my-tenant');
  });

  it('parses URL flag', () => {
    const result = parseCLIArgs(['--url', 'https://api.businesscentral.dynamics.com/v2.0/tenant/env/api/v2.0']);
    expect(result.url).toBe('https://api.businesscentral.dynamics.com/v2.0/tenant/env/api/v2.0');
  });

  it('parses companyId', () => {
    const result = parseCLIArgs(['--companyId', 'comp-123']);
    expect(result.companyId).toBe('comp-123');
  });

  it('returns empty config for no args', () => {
    const result = parseCLIArgs([]);
    expect(result).toEqual({});
  });
});

describe('resolveBCConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves from environment variables', () => {
    process.env.BC_TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    process.env.BC_ENVIRONMENT = 'Production';

    const config = resolveBCConfig({});
    expect(config.tenantId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(config.environment).toBe('Production');
  });

  it('CLI args take priority over env vars', () => {
    process.env.BC_TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    process.env.BC_ENVIRONMENT = 'Production';

    const config = resolveBCConfig({ tenantId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' });
    expect(config.tenantId).toBe('b2c3d4e5-f6a7-8901-bcde-f12345678901');
  });

  it('throws on missing required tenantId', () => {
    delete process.env.BC_TENANT_ID;
    delete process.env.AZURE_TENANT_ID;
    expect(() => resolveBCConfig({})).toThrow();
  });

  it('defaults environment to Production', () => {
    process.env.BC_TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    delete process.env.BC_ENVIRONMENT;

    const config = resolveBCConfig({});
    expect(config.environment).toBe('Production');
  });

  it('defaults apiVersion to v2.0', () => {
    process.env.BC_TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    process.env.BC_ENVIRONMENT = 'Sandbox';

    const config = resolveBCConfig({});
    expect(config.apiVersion).toBe('v2.0');
  });
});
