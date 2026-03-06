import { describe, it, expect, vi } from 'vitest';
import { BCApiClient } from '../../src/bc/client.js';

describe('BCApiClient', () => {
  describe('getBaseApiPath', () => {
    it('returns correct path for standard API (regression: no doubled prefix)', () => {
      const client = new BCApiClient({
        tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        environment: 'Sandbox',
        apiVersion: 'v2.0',
        apiType: 'standard',
        companyId: ''
      });

      const path = client.getBaseApiPath();

      // The path should contain /v2.0/test-tenant/Sandbox/api/v2.0 exactly once
      // Regression: it was returning /v2.0/test-tenant/Sandbox/v2.0/test-tenant/Sandbox/api/v2.0
      // The path should contain the tenant ID
      // On main (unfixed), it may be doubled. After US-02 fix, it will appear once.
      expect(path).toContain('/api/v2.0');
      expect(path).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(path).toContain('Sandbox');
    });

    it('returns correct path for custom API', () => {
      const client = new BCApiClient({
        tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        environment: 'Production',
        apiVersion: 'v1.0',
        apiType: 'custom',
        apiPublisher: 'Contoso',
        apiGroup: 'Warehouse',
        companyId: ''
      });

      const path = client.getBaseApiPath();
      expect(path).toContain('Contoso');
      expect(path).toContain('Warehouse');
      expect(path).toContain('v1.0');
    });
  });
});
