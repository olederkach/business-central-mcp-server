/**
 * Business Central API Client
 * Executes HTTP requests against BC OData endpoints
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { BCConfig, BCConfigParser } from './config.js';
import { OAuthAuth } from '../auth/oauth.js';
import { ApiContextManager } from '../api/api-context-manager.js';
import { trackBCApiCall } from '../monitoring/app-insights.js';
import { logger } from '../utils/logger.js';

export interface BCApiResponse<T = any> {
  '@odata.context': string;
  value?: T[];
  [key: string]: any;
}

export interface BCApiError {
  code: string;
  message: string;
  target?: string;
  details?: BCApiError[];
}

export class BCApiClient {
  private config: BCConfig;
  private axiosClient: AxiosInstance;
  private oauthAuth?: OAuthAuth;
  private apiContextManager?: ApiContextManager;

  constructor(config: BCConfig, apiContextManager?: ApiContextManager) {
    BCConfigParser.validate(config);
    this.config = config;
    this.apiContextManager = apiContextManager;

    // Use domain-only baseURL to allow dynamic API context switching
    // Full API path will be built in buildEntityUrl() based on active context
    this.axiosClient = axios.create({
      baseURL: 'https://api.businesscentral.dynamics.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    try {
      this.oauthAuth = new OAuthAuth();
    } catch (error) {
      logger.warn('OAuth not configured, will require external token');
    }
  }

  async get<T = any>(entityName: string, odataQuery?: string, accessToken?: string): Promise<BCApiResponse<T>> {
    const token = accessToken || await this.getAccessToken();
    const url = this.buildEntityUrl(entityName, odataQuery);
    const startTime = Date.now();

    this.logApiCall('info', {
      message: 'BC API Request',
      method: 'GET',
      entity: entityName,
      url,
      query: odataQuery || null,
      tenantId: this.config.tenantId
    });

    try {
      const response = await this.axiosClient.get<BCApiResponse<T>>(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const duration = Date.now() - startTime;

      // Track successful API call
      trackBCApiCall(`GET ${entityName}`, duration, response.status, this.config.tenantId);

      this.logApiCall('info', {
        message: 'BC API Response Success',
        method: 'GET',
        entity: entityName,
        status: response.status,
        duration,
        recordCount: response.data.value?.length || null,
        hasODataContext: !!response.data['@odata.context'],
        tenantId: this.config.tenantId
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;

      // Track failed API call
      trackBCApiCall(`GET ${entityName}`, duration, status, this.config.tenantId);

      this.logApiCall('error', {
        message: 'BC API Response Error',
        method: 'GET',
        entity: entityName,
        status,
        duration,
        error: axios.isAxiosError(error) ? {
          message: error.message,
          code: error.code,
          response: error.response?.data
        } : String(error),
        tenantId: this.config.tenantId
      });

      throw this.handleError(error);
    }
  }

  async getById<T = any>(entityName: string, id: string, accessToken?: string): Promise<T> {
    const token = accessToken || await this.getAccessToken();
    const url = this.buildEntityUrl(`${entityName}(${this.encodeId(id)})`);
    const startTime = Date.now();

    this.logApiCall('info', {
      message: 'BC API Request',
      method: 'GET',
      entity: entityName,
      id,
      url,
      tenantId: this.config.tenantId
    });

    try {
      const response = await this.axiosClient.get<T>(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const duration = Date.now() - startTime;

      this.logApiCall('info', {
        message: 'BC API Response Success',
        method: 'GET',
        entity: entityName,
        id,
        status: response.status,
        duration,
        tenantId: this.config.tenantId
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;

      this.logApiCall('error', {
        message: 'BC API Response Error',
        method: 'GET',
        entity: entityName,
        id,
        status,
        duration,
        error: axios.isAxiosError(error) ? {
          message: error.message,
          code: error.code,
          response: error.response?.data
        } : String(error),
        tenantId: this.config.tenantId
      });

      throw this.handleError(error);
    }
  }

  async create<T = any>(entityName: string, data: any, accessToken?: string): Promise<T> {
    const token = accessToken || await this.getAccessToken();
    const url = this.buildEntityUrl(entityName);
    const startTime = Date.now();

    this.logApiCall('info', {
      message: 'BC API Request',
      method: 'POST',
      entity: entityName,
      url,
      tenantId: this.config.tenantId
    });

    try {
      const response = await this.axiosClient.post<T>(url, data, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const duration = Date.now() - startTime;

      this.logApiCall('info', {
        message: 'BC API Response Success',
        method: 'POST',
        entity: entityName,
        status: response.status,
        duration,
        tenantId: this.config.tenantId
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;

      this.logApiCall('error', {
        message: 'BC API Response Error',
        method: 'POST',
        entity: entityName,
        status,
        duration,
        error: axios.isAxiosError(error) ? {
          message: error.message,
          code: error.code,
          response: error.response?.data
        } : String(error),
        tenantId: this.config.tenantId
      });

      throw this.handleError(error);
    }
  }

  async update<T = any>(entityName: string, id: string, data: any, etag?: string, accessToken?: string): Promise<T> {
    const token = accessToken || await this.getAccessToken();
    const url = this.buildEntityUrl(`${entityName}(${this.encodeId(id)})`);
    const startTime = Date.now();

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (etag) {
      headers['If-Match'] = etag;
    }

    this.logApiCall('info', {
      message: 'BC API Request',
      method: 'PATCH',
      entity: entityName,
      id,
      url,
      requestBody: data,
      hasETag: !!etag,
      tenantId: this.config.tenantId
    });

    try {
      const response = await this.axiosClient.patch<T>(url, data, { headers });

      const duration = Date.now() - startTime;

      this.logApiCall('info', {
        message: 'BC API Response Success',
        method: 'PATCH',
        entity: entityName,
        id,
        status: response.status,
        duration,
        tenantId: this.config.tenantId
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;

      this.logApiCall('error', {
        message: 'BC API Response Error',
        method: 'PATCH',
        entity: entityName,
        id,
        status,
        duration,
        error: axios.isAxiosError(error) ? {
          message: error.message,
          code: error.code,
          response: error.response?.data
        } : String(error),
        tenantId: this.config.tenantId
      });

      throw this.handleError(error);
    }
  }

  async delete(entityName: string, id: string, etag?: string, accessToken?: string): Promise<void> {
    const token = accessToken || await this.getAccessToken();
    const url = this.buildEntityUrl(`${entityName}(${this.encodeId(id)})`);
    const startTime = Date.now();

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (etag) {
      headers['If-Match'] = etag;
    }

    this.logApiCall('info', {
      message: 'BC API Request',
      method: 'DELETE',
      entity: entityName,
      id,
      url,
      hasETag: !!etag,
      tenantId: this.config.tenantId
    });

    try {
      await this.axiosClient.delete(url, { headers });

      const duration = Date.now() - startTime;

      this.logApiCall('info', {
        message: 'BC API Response Success',
        method: 'DELETE',
        entity: entityName,
        id,
        status: 204,
        duration,
        tenantId: this.config.tenantId
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;

      this.logApiCall('error', {
        message: 'BC API Response Error',
        method: 'DELETE',
        entity: entityName,
        id,
        status,
        duration,
        error: axios.isAxiosError(error) ? {
          message: error.message,
          code: error.code,
          response: error.response?.data
        } : String(error),
        tenantId: this.config.tenantId
      });

      throw this.handleError(error);
    }
  }

  async executeAction(entityName: string, actionName: string, parameters?: any, accessToken?: string): Promise<any> {
    const token = accessToken || await this.getAccessToken();
    const url = this.buildEntityUrl(`${entityName}/${actionName}`);
    const startTime = Date.now();

    this.logApiCall('info', {
      message: 'BC API Request',
      method: 'POST',
      entity: entityName,
      action: actionName,
      url,
      tenantId: this.config.tenantId
    });

    try {
      const response = await this.axiosClient.post(url, parameters || {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const duration = Date.now() - startTime;

      this.logApiCall('info', {
        message: 'BC API Response Success',
        method: 'POST',
        entity: entityName,
        action: actionName,
        status: response.status,
        duration,
        tenantId: this.config.tenantId
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const status = axios.isAxiosError(error) ? error.response?.status || 0 : 0;

      this.logApiCall('error', {
        message: 'BC API Response Error',
        method: 'POST',
        entity: entityName,
        action: actionName,
        status,
        duration,
        error: axios.isAxiosError(error) ? {
          message: error.message,
          code: error.code,
          response: error.response?.data
        } : String(error),
        tenantId: this.config.tenantId
      });

      throw this.handleError(error);
    }
  }

  private logApiCall(level: 'info' | 'error', data: Record<string, any>): void {
    const { message, ...properties } = data;
    if (level === 'error') {
      logger.error(message, undefined, properties);
    } else {
      logger.info(message, properties);
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.oauthAuth) {
      throw new Error('OAuth not configured and no access token provided');
    }
    return this.oauthAuth.getAccessToken(this.config.tenantId);
  }

  /**
   * Build entity URL with dynamic API context support
   * If ApiContextManager is provided, uses active API context
   * Otherwise falls back to static config (backward compatible)
   */
  private buildEntityUrl(path: string, odataQuery?: string): string {
    // Get effective config (API context if available, otherwise static config)
    const effectiveConfig = this.getEffectiveConfig();

    // Build base API path using effective config
    const baseApiPath = this.buildBaseApiPath(effectiveConfig);

    // Top-level entities that should NOT be scoped under /companies(id)/
    const topLevelEntities = [
      'companies',
      'subscriptions',
      'externaleventsubscriptions',
      'externalbusinesseventdefinitions',
      'apicategoryroutes',
      'entityDefinitions'
    ];

    // Check if this path starts with a top-level entity
    const isTopLevel = topLevelEntities.some(entity =>
      path.startsWith(entity) || path.startsWith(`${entity}(`)
    );

    let fullPath: string;
    if (isTopLevel) {
      // Top-level entity: no company scope
      fullPath = `${baseApiPath}/${path}`;
    } else {
      // Company-scoped entity
      const companyPath = `/companies(${encodeURIComponent(effectiveConfig.companyId)})`;
      fullPath = `${baseApiPath}${companyPath}/${path}`;
    }

    return odataQuery ? `${fullPath}?${odataQuery}` : fullPath;
  }

  /**
   * Get effective config by checking ApiContextManager first, then falling back to static config
   * This enables dynamic API context switching while maintaining backward compatibility
   */
  private getEffectiveConfig(): BCConfig {
    if (!this.apiContextManager) {
      // No API context manager - use static config (backward compatible)
      return this.config;
    }

    // Get active API context from cache (synchronous)
    const activeContext = this.apiContextManager.getActiveApiContextSync();

    // Build effective config from active API context
    return {
      ...this.config,
      apiType: activeContext.isStandard ? 'standard' : 'custom',
      apiVersion: activeContext.version,
      apiPublisher: activeContext.publisher || undefined,
      apiGroup: activeContext.group || undefined
    };
  }

  /**
   * Build base API path (without entity path)
   * Example: /v2.0/{tenantId}/{environment}/api/v2.0
   * Or: /v2.0/{tenantId}/{environment}/api/{publisher}/{group}/{version}
   */
  private buildBaseApiPath(config: BCConfig): string {
    const tenantPath = `/v2.0/${config.tenantId}/${config.environment}/api`;

    if (config.apiType === 'standard') {
      return `${tenantPath}/${config.apiVersion}`;
    } else {
      // Custom API
      return `${tenantPath}/${config.apiPublisher}/${config.apiGroup}/${config.apiVersion}`;
    }
  }

  private encodeId(id: string): string {
    if (id.match(/^[a-f0-9-]+$/i)) {
      return id;
    }
    return `'${encodeURIComponent(id)}'`;
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: BCApiError }>;
      const bcError = axiosError.response?.data?.error;

      if (bcError) {
        return new Error(`BC API Error: ${bcError.message} (${bcError.code})`);
      }

      if (axiosError.response?.status === 401) {
        return new Error('Authentication failed: Invalid or expired access token');
      }

      if (axiosError.response?.status === 404) {
        return new Error('Resource not found');
      }

      return new Error(`BC API request failed: ${axiosError.message}`);
    }

    return error instanceof Error ? error : new Error('Unknown error');
  }

  getConfig(): BCConfig {
    return { ...this.config };
  }

  /**
   * Get the full base API path respecting active API context
   * Example: "/v2.0/{tenant}/{env}/api/v2.0" or "/v2.0/{tenant}/{env}/api/Contoso/Warehouse/v1.0"
   *
   * This is used by tools that need to build full URLs (like get_odata_metadata)
   * while respecting the active API context from ApiContextManager
   */
  getBaseApiPath(): string {
    const effectiveConfig = this.getEffectiveConfig();
    return this.buildBaseApiPath(effectiveConfig);
  }
}
