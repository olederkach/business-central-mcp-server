/**
 * API Context Manager
 * Manages the active Business Central API context (publisher, group, version)
 * Allows switching between standard BC API, Microsoft extended APIs, and custom ISV APIs
 */

import { BCApiClient } from '../bc/client.js';
import { logger } from '../utils/logger.js';

/**
 * Represents an available API category route in Business Central
 */
export interface ApiRoute {
  publisher: string;
  group: string;
  version: string;
  displayName?: string;
  description?: string;
}

/**
 * Represents the active API context
 */
export interface ApiContext {
  publisher: string;  // "" for standard BC API, "microsoft" for MS extended, "Contoso" for ISV, etc.
  group: string;      // "" for standard BC API, "automation" for MS, "Warehouse" for ISV, etc.
  version: string;    // "v2.0" for standard, custom versions for others
  isStandard: boolean; // True if this is the standard BC API
  displayName: string; // Human-readable name for logging
}

/**
 * Manages API context for dynamic API switching
 * Similar to CompanyManager but for API publisher/group/version context
 */
export class ApiContextManager {
  private bcClient: BCApiClient;
  private availableApisCache: ApiRoute[] | null = null;
  private activeApiContext: ApiContext | null = null;

  /**
   * Default standard BC API context
   */
  private static readonly DEFAULT_API_CONTEXT: ApiContext = {
    publisher: '',
    group: '',
    version: 'v2.0',
    isStandard: true,
    displayName: 'Standard Business Central API v2.0'
  };

  constructor(bcClient: BCApiClient) {
    this.bcClient = bcClient;
    logger.info('ApiContextManager initialized');
  }

  /**
   * Discover all available API routes using the apicategoryroutes endpoint
   * This endpoint returns all APIs available in the BC environment (standard, Microsoft, custom ISV)
   *
   * @param accessToken OAuth access token for BC API
   * @param forceRefresh Force refresh the cache
   * @returns List of available API routes
   */
  async discoverApis(accessToken: string, forceRefresh: boolean = false): Promise<ApiRoute[]> {
    if (this.availableApisCache && !forceRefresh) {
      logger.info(`Returning ${this.availableApisCache.length} cached API routes`);
      return this.availableApisCache;
    }

    logger.info('Discovering available API routes via apicategoryroutes endpoint');

    try {
      // apicategoryroutes is a top-level endpoint (no company context needed)
      // Returns all available APIs with their publisher/group/version metadata
      const response = await this.bcClient.get('apicategoryroutes', '', accessToken);

      if (!response.value || !Array.isArray(response.value)) {
        logger.warn('apicategoryroutes returned unexpected format', { response });
        this.availableApisCache = [];
        return this.availableApisCache;
      }

      // Transform BC response into ApiRoute objects
      this.availableApisCache = response.value.map((route: any) => ({
        publisher: route.publisher || '',
        group: route.group || '',
        version: route.version || 'v2.0',
        displayName: this.buildDisplayName(route.publisher, route.group, route.version),
        description: route.description
      }));

      logger.info(`Discovered ${this.availableApisCache.length} API routes`);
      return this.availableApisCache;
    } catch (error) {
      logger.error('Error discovering API routes', error instanceof Error ? error : undefined);
      throw new Error(`Failed to discover API routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set the active API context for subsequent operations
   * All tools will use this API context until it's changed again
   *
   * @param publisher API publisher ("" for standard, "microsoft", "Contoso", etc.)
   * @param group API group ("" for standard, "automation", "Warehouse", etc.)
   * @param version API version ("v2.0", "v1.0", etc.)
   * @param accessToken OAuth access token for BC API (only needed if cache is empty)
   * @returns The active API context
   */
  async setActiveApi(publisher: string, group: string, version: string, accessToken: string): Promise<ApiContext> {
    logger.info(`Setting active API: publisher="${publisher}", group="${group}", version="${version}"`);

    // Validate that the API exists (discover if cache is empty)
    const availableApis = await this.discoverApis(accessToken);
    const matchingApi = availableApis.find(
      api => api.publisher === publisher && api.group === group && api.version === version
    );

    if (!matchingApi) {
      const availableList = availableApis
        .map(api => `  - publisher="${api.publisher}", group="${api.group}", version="${api.version}"`)
        .join('\n');

      throw new Error(
        `API not found: publisher="${publisher}", group="${group}", version="${version}"\n\n` +
        `Available APIs:\n${availableList}\n\n` +
        `Use list_bc_api_contexts to see all available APIs.`
      );
    }

    // Create the API context
    const isStandard = publisher === '' && group === '';
    this.activeApiContext = {
      publisher,
      group,
      version,
      isStandard,
      displayName: this.buildDisplayName(publisher, group, version)
    };

    logger.info(`Active API set to: ${this.activeApiContext.displayName}`);
    return this.activeApiContext;
  }

  /**
   * Get the currently active API context
   * If no API is explicitly set, defaults to standard BC API v2.0
   *
   * @returns The active API context
   */
  async getActiveApiContext(): Promise<ApiContext> {
    if (this.activeApiContext) {
      return this.activeApiContext;
    }

    // Default to standard BC API (backward compatibility)
    logger.info('No active API context set, defaulting to standard BC API v2.0');
    this.activeApiContext = ApiContextManager.DEFAULT_API_CONTEXT;
    return this.activeApiContext;
  }

  /**
   * Get the currently active API context synchronously (from cache)
   * This is used by BCApiClient for building URLs
   * If no context is set, returns default standard BC API
   *
   * @returns The active API context (from cache or default)
   */
  getActiveApiContextSync(): ApiContext {
    return this.activeApiContext || ApiContextManager.DEFAULT_API_CONTEXT;
  }

  /**
   * Get a specific API route by publisher/group/version
   *
   * @param publisher API publisher
   * @param group API group
   * @param version API version
   * @param accessToken OAuth access token for BC API (only needed if cache is empty)
   * @returns The matching API route or null if not found
   */
  async getApiRoute(publisher: string, group: string, version: string, accessToken: string): Promise<ApiRoute | null> {
    const availableApis = await this.discoverApis(accessToken);
    return availableApis.find(
      api => api.publisher === publisher && api.group === group && api.version === version
    ) || null;
  }

  /**
   * Reset API context to default (standard BC API)
   */
  resetToDefault(): void {
    logger.info('Resetting API context to standard BC API');
    this.activeApiContext = ApiContextManager.DEFAULT_API_CONTEXT;
  }

  /**
   * Clear the API cache (force next discovery to fetch fresh data)
   */
  clearCache(): void {
    logger.info('Clearing API routes cache');
    this.availableApisCache = null;
  }

  /**
   * Build a human-readable display name for an API
   */
  private buildDisplayName(publisher: string, group: string, version: string): string {
    if (publisher === '' && group === '') {
      return `Standard Business Central API ${version}`;
    }
    if (publisher === 'microsoft') {
      return `Microsoft ${group} API ${version}`;
    }
    return `${publisher} ${group} API ${version}`;
  }
}
