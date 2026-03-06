/**
 * Server Configuration
 * Loads from environment variables and validates
 */

import { MetadataMode } from './bc/metadata.js';
import { BCConfig, BCConfigParser } from './bc/config.js';
import { logger } from './utils/logger.js';

export interface ServerConfig {
  env: string;
  port: number;
  metadataMode: MetadataMode;
  authMode: 'api-key' | 'oauth';
  keyVaultName?: string;
}

export function loadConfig(): ServerConfig {
  const env = process.env.NODE_ENV || 'development';
  const port = parseInt(process.env.PORT || '3005', 10);

  const metadataMode = (process.env.METADATA_MODE || 'all') as MetadataMode;
  if (metadataMode !== 'all' && metadataMode !== 'extensions-only') {
    throw new Error('METADATA_MODE must be "all" or "extensions-only"');
  }

  const authMode = (process.env.AUTH_MODE || 'api-key') as 'api-key' | 'oauth';
  if (authMode !== 'api-key' && authMode !== 'oauth') {
    throw new Error('AUTH_MODE must be "api-key" or "oauth"');
  }

  const keyVaultName = process.env.KEY_VAULT_NAME;

  if (authMode === 'oauth') {
    const required = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];
    for (const envVar of required) {
      if (!process.env[envVar]) {
        throw new Error(`OAuth mode requires ${envVar} environment variable`);
      }
    }
  }

  if (authMode === 'api-key' && !keyVaultName && !process.env.MCP_API_KEYS) {
    logger.warn('No API keys configured. Set MCP_API_KEYS or KEY_VAULT_NAME');
  }

  return {
    env,
    port,
    metadataMode,
    authMode,
    keyVaultName
  };
}

/**
 * CLI configuration from command-line arguments
 */
export interface CLIConfig {
  url?: string;           // Full BC API URL (parsed to extract tenant/company/etc)
  tenantId?: string;      // Azure AD tenant ID
  clientId?: string;      // BC app registration client ID
  clientSecret?: string;  // BC app registration secret
  environment?: string;   // BC environment name (Production, Sandbox, etc.)
  companyId?: string;     // BC company ID or name
  apiKey?: string;        // MCP API key (rarely used)
}

/**
 * Parse command-line arguments into CLIConfig
 * Supports both --flag and --Flag formats (Microsoft compatible)
 *
 * Examples:
 *   --tenantId xxx --clientId yyy
 *   --url "https://api.businesscentral.dynamics.com/..."
 *   --TenantId xxx --ClientId yyy (Microsoft format)
 */
export function parseCLIArgs(args: string[]): CLIConfig {
  const config: CLIConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i].toLowerCase(); // Normalize to lowercase
    const nextArg = args[i + 1];

    // Skip if no value or next arg is another flag
    if (!nextArg || nextArg.startsWith('--')) {
      continue;
    }

    switch (arg) {
      case '--url':
        config.url = nextArg;
        i++;
        break;
      case '--tenantid':
        config.tenantId = nextArg;
        i++;
        break;
      case '--clientid':
        config.clientId = nextArg;
        i++;
        break;
      case '--clientsecret':
        logger.warn('--clientSecret is deprecated. Secrets in CLI args are visible in process listings. Use BC_CLIENT_SECRET environment variable instead.');
        config.clientSecret = nextArg;
        i++;
        break;
      case '--environment':
        config.environment = nextArg;
        i++;
        break;
      case '--companyid':
        config.companyId = nextArg;
        i++;
        break;
      case '--apikey':
        config.apiKey = nextArg;
        i++;
        break;
    }
  }

  return config;
}

/**
 * Resolve BC configuration from CLI args and environment variables
 * Priority: CLI args > Environment variables > Error
 *
 * @param cliConfig - Parsed CLI arguments
 * @returns Complete BC configuration
 * @throws Error if required fields missing
 */
export function resolveBCConfig(cliConfig: CLIConfig): BCConfig {
  let bcConfig: Partial<BCConfig> = {};

  // If URL provided, parse it first (lowest priority)
  if (cliConfig.url) {
    try {
      bcConfig = BCConfigParser.parseFromUrl(cliConfig.url);
      logger.info('Parsed BC config from URL');
    } catch (error) {
      logger.warn('Failed to parse --url, using individual parameters');
    }
  }

  // Override with individual CLI args and env vars (higher priority)
  bcConfig.tenantId =
    cliConfig.tenantId ||
    process.env.BC_TENANT_ID ||
    process.env.AZURE_TENANT_ID ||
    bcConfig.tenantId ||
    '';

  bcConfig.environment =
    cliConfig.environment ||
    process.env.BC_ENVIRONMENT_NAME ||
    bcConfig.environment ||
    'Production';

  bcConfig.companyId =
    cliConfig.companyId ||
    process.env.BC_COMPANY_ID ||
    bcConfig.companyId ||
    '';

  // API configuration from environment only
  bcConfig.apiType =
    (process.env.API_TYPE as 'standard' | 'custom') ||
    bcConfig.apiType ||
    'standard';

  bcConfig.apiVersion =
    process.env.API_VERSION ||
    bcConfig.apiVersion ||
    'v2.0';

  if (bcConfig.apiType === 'custom') {
    bcConfig.apiPublisher = process.env.API_PUBLISHER || bcConfig.apiPublisher;
    bcConfig.apiGroup = process.env.API_GROUP || bcConfig.apiGroup;
  }

  // Validate required fields
  if (!bcConfig.tenantId) {
    throw new Error(
      'BC Tenant ID required. ' +
      'Set BC_TENANT_ID environment variable or use --tenantId argument'
    );
  }

  if (!bcConfig.companyId) {
    logger.warn('BC_COMPANY_ID not set. Use list_companies + set_active_company tools to select one at runtime.');
  }

  // Validate the complete config
  BCConfigParser.validate(bcConfig as BCConfig);

  return bcConfig as BCConfig;
}
