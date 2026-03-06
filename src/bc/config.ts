/**
 * Business Central Configuration Parser
 * Extracts BC connection details from MCP request URLs
 * 
 * Supports two URL patterns:
 * 1. Standard: /{tenantId}/{env}/api/{version}/companies({companyId})
 * 2. Custom: /{tenantId}/{env}/api/{publisher}/{group}/{version}/companies({companyId})
 */

export interface BCConfig {
  tenantId: string;
  environment: string;
  companyId: string;
  apiType: 'standard' | 'custom';
  apiVersion: string;
  apiPublisher?: string;
  apiGroup?: string;
}

export class BCConfigParser {
  private static readonly BC_BASE_URL = 'https://api.businesscentral.dynamics.com';

  /**
   * Parse BC configuration from MCP request URL path
   */
  static parseFromUrl(url: string): BCConfig {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    
    const standardMatch = path.match(
      /\/([a-f0-9-]+)\/([^/]+)\/api\/(v[\d.]+)\/companies\(([^)]+)\)/i
    );
    
    if (standardMatch) {
      return {
        tenantId: standardMatch[1],
        environment: standardMatch[2],
        apiType: 'standard',
        apiVersion: standardMatch[3],
        companyId: decodeURIComponent(standardMatch[4])
      };
    }
    
    const customMatch = path.match(
      /\/([a-f0-9-]+)\/([^/]+)\/api\/([^/]+)\/([^/]+)\/(v[\d.]+)\/companies\(([^)]+)\)/i
    );
    
    if (customMatch) {
      return {
        tenantId: customMatch[1],
        environment: customMatch[2],
        apiType: 'custom',
        apiPublisher: customMatch[3],
        apiGroup: customMatch[4],
        apiVersion: customMatch[5],
        companyId: decodeURIComponent(customMatch[6])
      };
    }
    
    throw new Error(`Invalid BC URL format. Expected: /{tenantId}/{env}/api/{version}/companies({id}) or /{tenantId}/{env}/api/{publisher}/{group}/{version}/companies({id})`);
  }

  /**
   * Build BC API base URL from configuration
   */
  static buildBaseUrl(config: BCConfig): string {
    if (config.apiType === 'standard') {
      return `${this.BC_BASE_URL}/v2.0/${config.environment}/api/${config.apiVersion}`;
    }

    return `${this.BC_BASE_URL}/v2.0/${config.environment}/api/${config.apiPublisher}/${config.apiGroup}/${config.apiVersion}`;
  }

  /**
   * Build metadata endpoint URL
   */
  static buildMetadataUrl(config: BCConfig): string {
    return `${this.buildBaseUrl(config)}/$metadata`;
  }

  /**
   * Build entity collection URL
   */
  static buildEntityUrl(config: BCConfig, entityName: string, odataQuery?: string): string {
    const base = `${this.buildBaseUrl(config)}/companies(${encodeURIComponent(config.companyId)})/${entityName}`;
    return odataQuery ? `${base}?${odataQuery}` : base;
  }

  /**
   * Validate BC configuration
   */
  static validate(config: BCConfig): void {
    if (!config.tenantId?.match(/^[a-f0-9-]+$/i)) {
      throw new Error('Invalid tenant ID format');
    }
    if (!config.environment) {
      throw new Error('Environment is required');
    }
    // companyId is optional at startup — can be set via set_active_company tool
    if (config.apiType === 'custom' && (!config.apiPublisher || !config.apiGroup)) {
      throw new Error('Custom API requires publisher and group');
    }
  }
}
