import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenericToolExecutor } from '../../src/tools/generic-executor.js';

// Mock axios for get_odata_metadata which uses it directly
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ status: 200, data: '<edmx:Edmx />' }),
    isAxiosError: vi.fn().mockReturnValue(false)
  }
}));

// Mock dependencies matching the actual API used in generic-executor.ts
const mockBcClient = {
  getConfig: vi.fn().mockReturnValue({
    tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    environment: 'Sandbox',
    apiVersion: 'v2.0',
    apiType: 'standard'
  }),
  getBaseApiPath: vi.fn().mockReturnValue('/v2.0/a1b2c3d4-e5f6-7890-abcd-ef1234567890/Sandbox/api/v2.0'),
  get: vi.fn().mockResolvedValue({ value: [] }),
  create: vi.fn().mockResolvedValue({ id: 'new-1', name: 'New Record' }),
  update: vi.fn().mockResolvedValue({ id: '1', name: 'Updated' }),
  delete: vi.fn().mockResolvedValue(undefined)
};

const mockCompanyManager = {
  getActiveCompanyId: vi.fn().mockResolvedValue('company-123'),
  getActiveCompany: vi.fn().mockResolvedValue({
    id: 'company-123',
    name: 'Test Company',
    displayName: 'Test Company',
    businessProfileId: ''
  }),
  setActiveCompany: vi.fn().mockResolvedValue({
    id: 'c-1',
    name: 'Company 1',
    displayName: 'Company 1',
    businessProfileId: ''
  }),
  discoverCompanies: vi.fn().mockResolvedValue([
    { id: 'company-123', name: 'Test Company', displayName: 'Test Company', businessProfileId: '' }
  ])
};

const mockApiContextManager = {
  getActiveApiContext: vi.fn().mockResolvedValue({
    publisher: '',
    group: '',
    version: 'v2.0',
    displayName: 'Standard BC API v2.0',
    isStandard: true
  }),
  setActiveApi: vi.fn().mockResolvedValue({
    publisher: 'Contoso',
    group: 'Warehouse',
    version: 'v1.0',
    displayName: 'Contoso Warehouse v1.0',
    isStandard: false
  }),
  discoverApis: vi.fn().mockResolvedValue([])
};

describe('GenericToolExecutor', () => {
  let executor: GenericToolExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock return values after clearAllMocks
    mockBcClient.get.mockResolvedValue({ value: [] });
    mockBcClient.create.mockResolvedValue({ id: 'new-1', name: 'New Record' });
    mockBcClient.update.mockResolvedValue({ id: '1', name: 'Updated' });
    mockBcClient.delete.mockResolvedValue(undefined);
    mockCompanyManager.getActiveCompanyId.mockResolvedValue('company-123');
    mockCompanyManager.discoverCompanies.mockResolvedValue([
      { id: 'company-123', name: 'Test Company', displayName: 'Test Company', businessProfileId: '' }
    ]);
    mockCompanyManager.getActiveCompany.mockResolvedValue({
      id: 'company-123', name: 'Test Company', displayName: 'Test Company', businessProfileId: ''
    });
    mockCompanyManager.setActiveCompany.mockResolvedValue({
      id: 'c-1', name: 'Company 1', displayName: 'Company 1', businessProfileId: ''
    });
    mockApiContextManager.discoverApis.mockResolvedValue([]);
    mockApiContextManager.getActiveApiContext.mockResolvedValue({
      publisher: '', group: '', version: 'v2.0', displayName: 'Standard BC API v2.0', isStandard: true
    });
    mockApiContextManager.setActiveApi.mockResolvedValue({
      publisher: 'Contoso', group: 'Warehouse', version: 'v1.0', displayName: 'Contoso Warehouse v1.0', isStandard: false
    });

    executor = new GenericToolExecutor(
      mockBcClient as any,
      mockCompanyManager as any,
      mockApiContextManager as any,
      'test-token'
    );
  });

  describe('dispatch', () => {
    it('dispatches list_companies', async () => {
      const result = await executor.execute({ toolName: 'list_companies', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(mockCompanyManager.discoverCompanies).toHaveBeenCalled();
    });

    it('dispatches set_active_company', async () => {
      const result = await executor.execute({
        toolName: 'set_active_company',
        arguments: { company_id: 'c-1' }
      });
      expect(result.isError).toBeFalsy();
      expect(mockCompanyManager.setActiveCompany).toHaveBeenCalledWith('c-1');
    });

    it('dispatches get_active_company', async () => {
      const result = await executor.execute({ toolName: 'get_active_company', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(mockCompanyManager.getActiveCompany).toHaveBeenCalled();
    });

    it('dispatches list_bc_api_contexts', async () => {
      const result = await executor.execute({ toolName: 'list_bc_api_contexts', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(mockApiContextManager.discoverApis).toHaveBeenCalled();
    });

    it('dispatches set_active_api', async () => {
      const result = await executor.execute({
        toolName: 'set_active_api',
        arguments: { publisher: 'Contoso', group: 'Warehouse', version: 'v1.0' }
      });
      expect(result.isError).toBeFalsy();
      expect(mockApiContextManager.setActiveApi).toHaveBeenCalledWith('Contoso', 'Warehouse', 'v1.0', 'test-token');
    });

    it('dispatches get_active_api', async () => {
      const result = await executor.execute({ toolName: 'get_active_api', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(mockApiContextManager.getActiveApiContext).toHaveBeenCalled();
    });

    it('dispatches list_resources', async () => {
      mockBcClient.get.mockResolvedValueOnce({
        value: [{ name: 'customers', kind: 'EntitySet', url: '/customers' }]
      });
      const result = await executor.execute({ toolName: 'list_resources', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(mockBcClient.get).toHaveBeenCalledWith('', '', 'test-token');
    });

    it('dispatches get_odata_metadata', async () => {
      const result = await executor.execute({ toolName: 'get_odata_metadata', arguments: {} });
      expect(result.isError).toBeFalsy();
    });

    it('dispatches list_records', async () => {
      mockBcClient.get.mockResolvedValueOnce({ value: [{ id: '1' }] });
      const result = await executor.execute({
        toolName: 'list_records',
        arguments: { resource: 'customers' }
      });
      expect(result.isError).toBeFalsy();
      expect(mockBcClient.get).toHaveBeenCalledWith('customers', expect.any(String), 'test-token');
    });

    it('dispatches get_resource_schema', async () => {
      mockBcClient.get.mockResolvedValueOnce({ value: [{ id: '1', name: 'test' }] });
      const result = await executor.execute({
        toolName: 'get_resource_schema',
        arguments: { resource: 'customers' }
      });
      expect(result.isError).toBeFalsy();
      expect(mockBcClient.get).toHaveBeenCalled();
    });

    it('dispatches create_record', async () => {
      const result = await executor.execute({
        toolName: 'create_record',
        arguments: { resource: 'customers', data: { name: 'New' } }
      });
      expect(result.isError).toBeFalsy();
      expect(mockBcClient.create).toHaveBeenCalledWith('customers', { name: 'New' }, 'test-token');
    });

    it('dispatches update_record', async () => {
      const result = await executor.execute({
        toolName: 'update_record',
        arguments: { resource: 'customers', record_id: '1', data: { name: 'Updated' } }
      });
      expect(result.isError).toBeFalsy();
      expect(mockBcClient.update).toHaveBeenCalledWith('customers', '1', { name: 'Updated' }, undefined, 'test-token');
    });

    it('dispatches delete_record', async () => {
      const result = await executor.execute({
        toolName: 'delete_record',
        arguments: { resource: 'customers', record_id: '1' }
      });
      expect(result.isError).toBeFalsy();
      expect(mockBcClient.delete).toHaveBeenCalledWith('customers', '1', undefined, 'test-token');
    });

    it('dispatches find_records_by_field', async () => {
      mockBcClient.get.mockResolvedValueOnce({ value: [{ name: 'Found' }] });
      const result = await executor.execute({
        toolName: 'find_records_by_field',
        arguments: { resource: 'customers', field: 'name', value: 'John' }
      });
      expect(result.isError).toBeFalsy();
      // find_records_by_field delegates to list_records internally, which calls bcClient.get
      expect(mockBcClient.get).toHaveBeenCalled();
    });

    it('returns error for unknown tool', async () => {
      const result = await executor.execute({ toolName: 'nonexistent_tool', arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown generic tool');
    });
  });

  describe('error handling', () => {
    it('returns error when required resource param is missing', async () => {
      const result = await executor.execute({
        toolName: 'list_records',
        arguments: {}
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameter: resource');
    });

    it('returns error when required record_id param is missing for update', async () => {
      const result = await executor.execute({
        toolName: 'update_record',
        arguments: { resource: 'customers', data: {} }
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameter: record_id');
    });

    it('returns error when required data param is missing for create', async () => {
      const result = await executor.execute({
        toolName: 'create_record',
        arguments: { resource: 'customers' }
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameter: data');
    });

    it('returns error when no active company for list_records', async () => {
      mockCompanyManager.getActiveCompanyId.mockResolvedValueOnce(null);
      const result = await executor.execute({
        toolName: 'list_records',
        arguments: { resource: 'customers' }
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No active company');
    });
  });

  describe('find_records_by_field filter formatting', () => {
    it('formats string values with quotes', async () => {
      mockBcClient.get.mockResolvedValueOnce({ value: [] });
      await executor.execute({
        toolName: 'find_records_by_field',
        arguments: { resource: 'customers', field: 'name', value: 'John' }
      });
      // find_records_by_field builds a filter and delegates to list_records -> bcClient.get
      const call = mockBcClient.get.mock.calls[0];
      expect(call).toBeDefined();
      // The second arg is the OData query string containing the filter
      const queryString = call[1] as string;
      // Filter is URL-encoded in the query string
      expect(queryString).toContain(encodeURIComponent("name eq 'John'"));
    });

    it('handles GUID values', async () => {
      mockBcClient.get.mockResolvedValueOnce({ value: [] });
      await executor.execute({
        toolName: 'find_records_by_field',
        arguments: { resource: 'customers', field: 'id', value: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }
      });
      expect(mockBcClient.get).toHaveBeenCalled();
      const queryString = mockBcClient.get.mock.calls[0][1] as string;
      expect(queryString).toContain("guid'a1b2c3d4-e5f6-7890-abcd-ef1234567890'");
    });

    it('handles boolean values', async () => {
      mockBcClient.get.mockResolvedValueOnce({ value: [] });
      await executor.execute({
        toolName: 'find_records_by_field',
        arguments: { resource: 'customers', field: 'blocked', value: 'true' }
      });
      expect(mockBcClient.get).toHaveBeenCalled();
      const queryString = mockBcClient.get.mock.calls[0][1] as string;
      expect(queryString).toContain(encodeURIComponent('blocked eq true'));
    });

    it('returns error when value is undefined', async () => {
      const result = await executor.execute({
        toolName: 'find_records_by_field',
        arguments: { resource: 'customers', field: 'name' }
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required parameter: value');
    });
  });
});
