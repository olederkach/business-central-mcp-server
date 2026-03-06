/**
 * Environment Variable Validation
 * Validates all required configuration at startup before server starts
 */

import { parseCLIArgs } from '../config.js';
import { logger } from '../utils/logger.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface EnvVarCheck {
  name: string;
  required: boolean;
  validator?: (value: string) => boolean;
  errorMessage?: string;
}

/**
 * Validate all environment variables at startup
 * Throws error if critical variables are missing
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Always required
  const baseChecks: EnvVarCheck[] = [
    { name: 'NODE_ENV', required: false },
    { name: 'PORT', required: false, validator: (v) => !isNaN(parseInt(v)) }
  ];

  // Check base requirements
  for (const check of baseChecks) {
    const value = process.env[check.name];

    if (!value && check.required) {
      errors.push(`Missing required environment variable: ${check.name}`);
    } else if (value && check.validator && !check.validator(value)) {
      errors.push(check.errorMessage || `Invalid value for ${check.name}: ${value}`);
    }
  }

  // Check authentication mode
  const authMode = process.env.AUTH_MODE || 'api-key';

  if (!['api-key', 'oauth'].includes(authMode)) {
    errors.push(`AUTH_MODE must be 'api-key' or 'oauth', got: ${authMode}`);
  }

  // Check metadata mode
  const metadataMode = process.env.METADATA_MODE || 'all';
  if (!['all', 'extensions-only'].includes(metadataMode)) {
    errors.push(`METADATA_MODE must be 'all' or 'extensions-only', got: ${metadataMode}`);
  }

  // Mode-specific validation
  const isHttpMode = !process.argv.includes('--stdio');
  const cliConfig = parseCLIArgs(process.argv.slice(2));

  if (isHttpMode) {
    // HTTP mode: Require BC credentials in environment
    const missing: string[] = [];

    if (!process.env.BC_TENANT_ID && !process.env.AZURE_TENANT_ID) {
      missing.push('BC_TENANT_ID (or AZURE_TENANT_ID)');
    }
    if (!process.env.BC_CLIENT_ID && !process.env.AZURE_CLIENT_ID) {
      missing.push('BC_CLIENT_ID (or AZURE_CLIENT_ID)');
    }
    if (!process.env.BC_CLIENT_SECRET && !process.env.AZURE_CLIENT_SECRET) {
      missing.push('BC_CLIENT_SECRET (or AZURE_CLIENT_SECRET)');
    }
    if (!process.env.BC_COMPANY_ID) {
      missing.push('BC_COMPANY_ID');
    }

    missing.forEach(m => errors.push(`HTTP mode requires ${m}`));

    // Validate auth-mode specific requirements for HTTP
    if (authMode === 'oauth') {
      const oauthRequired = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];
      for (const envVar of oauthRequired) {
        if (!process.env[envVar]) {
          errors.push(`OAuth mode requires ${envVar} environment variable`);
        }
      }
    } else if (authMode === 'api-key') {
      // Check for API keys
      if (!process.env.MCP_API_KEYS && !process.env.KEY_VAULT_NAME) {
        warnings.push('No API keys configured. Set MCP_API_KEYS or KEY_VAULT_NAME for production');
      }

      // Validate API key format if provided
      if (process.env.MCP_API_KEYS) {
        const keys = process.env.MCP_API_KEYS.split(',');
        const shortKeys = keys.filter(k => k.trim().length < 16);
        if (shortKeys.length > 0) {
          warnings.push(`API keys should be at least 16 characters for security. Found ${shortKeys.length} short key(s)`);
        }
      }
    }

    // Check CORS origins for HTTP mode
    const corsOrigins = process.env.CORS_ORIGINS;
    if (!corsOrigins) {
      warnings.push('CORS_ORIGINS not set — cross-origin requests will be denied');
    } else if (corsOrigins.includes('*')) {
      warnings.push('CORS_ORIGINS contains wildcard (*) which is blocked at runtime when credentials are enabled. Use specific origins.');
    }
  } else {
    // stdio mode: Can use env vars OR CLI args
    // Only tenant ID is truly required at startup — company can be discovered via list_companies tool
    const hasTenant =
      cliConfig.tenantId ||
      cliConfig.url ||
      process.env.BC_TENANT_ID ||
      process.env.AZURE_TENANT_ID;

    if (!hasTenant) {
      errors.push('stdio mode requires BC_TENANT_ID (env) or --tenantId (CLI arg)');
    }

    if (!process.env.BC_COMPANY_ID && !cliConfig.companyId) {
      warnings.push('BC_COMPANY_ID not set. Use list_companies + set_active_company tools at runtime to select a company');
    }

    // Warning for missing BC credentials
    const hasClientCreds =
      (cliConfig.clientId && cliConfig.clientSecret) ||
      ((process.env.BC_CLIENT_ID || process.env.AZURE_CLIENT_ID) &&
       (process.env.BC_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET));

    if (!hasClientCreds) {
      warnings.push('BC OAuth credentials (BC_CLIENT_ID + BC_CLIENT_SECRET) recommended for API access');
    }
  }

  // Check Application Insights
  if (process.env.NODE_ENV === 'production' && !process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    warnings.push('APPLICATIONINSIGHTS_CONNECTION_STRING not set. Monitoring recommended for production');
  }

  // Validate cache TTL
  if (process.env.CACHE_TTL_SECONDS) {
    const ttl = parseInt(process.env.CACHE_TTL_SECONDS);
    if (isNaN(ttl) || ttl < 0) {
      errors.push(`CACHE_TTL_SECONDS must be a positive number, got: ${process.env.CACHE_TTL_SECONDS}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Print validation results to console
 */
export function printValidationResults(result: ValidationResult): void {
  if (!result.valid) {
    logger.error('ENVIRONMENT VALIDATION FAILED');
    result.errors.forEach(err => logger.error(`  ${err}`));
  }

  if (result.warnings.length > 0) {
    logger.warn('CONFIGURATION WARNINGS');
    result.warnings.forEach(warn => logger.warn(`  ${warn}`));
  }

  if (result.valid && result.warnings.length === 0) {
    logger.info('ENVIRONMENT VALIDATION PASSED');
  }

  if (result.valid && result.warnings.length > 0) {
    logger.info('ENVIRONMENT VALIDATION PASSED (with warnings)');
  }
}

/**
 * Validate environment and exit if invalid
 */
export function validateAndExit(): void {
  const result = validateEnvironment();
  printValidationResults(result);

  if (!result.valid) {
    logger.error('Tip: Copy .env.example to .env and fill in your values');
    process.exit(1);
  }
}

/**
 * Get environment summary for health checks
 */
export function getEnvironmentSummary(): Record<string, any> {
  return {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    authMode: process.env.AUTH_MODE || 'api-key',
    metadataMode: process.env.METADATA_MODE || 'all',
    hasApiKeys: !!(process.env.MCP_API_KEYS || process.env.KEY_VAULT_NAME),
    hasAppInsights: !!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    corsOrigins: process.env.CORS_ORIGINS?.split(',').length || 0,
    cacheTtl: process.env.CACHE_TTL_SECONDS || '3600'
  };
}
