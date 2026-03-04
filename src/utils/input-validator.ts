/**
 * Input Validation Utilities
 * Comprehensive validation for all user inputs to prevent injection attacks
 */

/**
 * Allowed JSON-RPC 2.0 methods for MCP protocol
 */
const ALLOWED_JSONRPC_METHODS = [
  'initialize',
  'initialized',
  'shutdown',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
  'resources/templates/list',
  'prompts/list',
  'prompts/get',
  'completion/complete',
  'notifications/initialized',
  'notifications/cancelled',
  'notifications/progress',
  'notifications/resources/list_changed',
  'notifications/resources/updated',
  'notifications/tools/list_changed',
  'notifications/prompts/list_changed',
  'ping'
] as const;

/**
 * Dangerous patterns that should never appear in any input
 */
const DANGEROUS_PATTERNS = [
  /\.\.\//,  // Path traversal (forward slash)
  /\.\.\\/,  // Path traversal (backslash)
  /\\/,
  /;/,
  /--/,
  /\/\*/,
  /\*\//,
  /<script/i,
  /javascript:/i,
  /on\w+=/i, // Event handlers like onclick=
  /eval\(/i,
  /exec\(/i,
  /system\(/i,
  /cmd\(/i,
  /powershell/i,
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bTRUNCATE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bEXEC\b/i,
  /\bUNION\b/i,
  /\bSELECT\b.*\bFROM\b/i
] as const;

/**
 * Valid resource URI format: {protocol}://{path}
 * Examples: bc://customers/12345, template://customer-report
 */
const RESOURCE_URI_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[a-zA-Z0-9_\-./]+$/;

/**
 * Valid tool name format: alphanumeric, underscore, hyphen
 * Examples: get_customers, list-invoices, createOrder
 */
const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Valid Business Central entity name
 */
const BC_ENTITY_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate JSON-RPC method name
 */
export function validateJsonRpcMethod(method: unknown): string {
  if (typeof method !== 'string') {
    throw new ValidationError('Method must be a string', 'method', method);
  }

  if (!method || method.length === 0) {
    throw new ValidationError('Method cannot be empty', 'method', method);
  }

  if (method.length > 100) {
    throw new ValidationError('Method name too long (max 100 characters)', 'method', method);
  }

  // Check if method is in allowed list
  if (!ALLOWED_JSONRPC_METHODS.includes(method as any)) {
    throw new ValidationError(
      `Invalid JSON-RPC method: ${method}. Allowed methods: ${ALLOWED_JSONRPC_METHODS.join(', ')}`,
      'method',
      method
    );
  }

  return method;
}

/**
 * Validate tool name
 */
export function validateToolName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new ValidationError('Tool name must be a string', 'name', name);
  }

  if (!name || name.length === 0) {
    throw new ValidationError('Tool name cannot be empty', 'name', name);
  }

  if (name.length > 100) {
    throw new ValidationError('Tool name too long (max 100 characters)', 'name', name);
  }

  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new ValidationError(
      'Tool name must start with a letter and contain only letters, numbers, underscores, and hyphens',
      'name',
      name
    );
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(name)) {
      throw new ValidationError('Tool name contains suspicious patterns', 'name', name);
    }
  }

  return name;
}

/**
 * Validate resource URI
 */
export function validateResourceUri(uri: unknown): string {
  if (typeof uri !== 'string') {
    throw new ValidationError('Resource URI must be a string', 'uri', uri);
  }

  if (!uri || uri.length === 0) {
    throw new ValidationError('Resource URI cannot be empty', 'uri', uri);
  }

  if (uri.length > 500) {
    throw new ValidationError('Resource URI too long (max 500 characters)', 'uri', uri);
  }

  if (!RESOURCE_URI_PATTERN.test(uri)) {
    throw new ValidationError(
      'Resource URI must be in format: {protocol}://{path}',
      'uri',
      uri
    );
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(uri)) {
      throw new ValidationError('Resource URI contains suspicious patterns', 'uri', uri);
    }
  }

  return uri;
}

/**
 * Validate Business Central entity name
 */
export function validateEntityName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new ValidationError('Entity name must be a string', 'entityName', name);
  }

  if (!name || name.length === 0) {
    throw new ValidationError('Entity name cannot be empty', 'entityName', name);
  }

  if (name.length > 100) {
    throw new ValidationError('Entity name too long (max 100 characters)', 'entityName', name);
  }

  if (!BC_ENTITY_NAME_PATTERN.test(name)) {
    throw new ValidationError(
      'Entity name must start with a letter and contain only letters, numbers, and underscores',
      'entityName',
      name
    );
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(name)) {
      throw new ValidationError('Entity name contains suspicious patterns', 'entityName', name);
    }
  }

  return name;
}

/**
 * Validate string parameter
 * General-purpose string validation with length limits and pattern checking
 */
export function validateStringParam(
  value: unknown,
  fieldName: string,
  options: {
    maxLength?: number;
    minLength?: number;
    allowEmpty?: boolean;
    pattern?: RegExp;
  } = {}
): string {
  const { maxLength = 1000, minLength = 0, allowEmpty = false, pattern } = options;

  if (value === null || value === undefined) {
    if (allowEmpty) {
      return '';
    }
    throw new ValidationError(`${fieldName} is required`, fieldName, value);
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName, value);
  }

  if (!allowEmpty && value.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, fieldName, value);
  }

  if (value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} characters`,
      fieldName,
      value
    );
  }

  if (value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} exceeds maximum length of ${maxLength} characters`,
      fieldName,
      value
    );
  }

  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`${fieldName} does not match required pattern`, fieldName, value);
  }

  // Check for dangerous patterns
  for (const dangerousPattern of DANGEROUS_PATTERNS) {
    if (dangerousPattern.test(value)) {
      throw new ValidationError(`${fieldName} contains suspicious patterns`, fieldName, value);
    }
  }

  return value;
}

/**
 * Validate numeric parameter
 */
export function validateNumericParam(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): number {
  const { min, max, integer = false } = options;

  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`, fieldName, value);
  }

  const num = typeof value === 'string' ? parseFloat(value) : Number(value);

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`, fieldName, value);
  }

  if (!isFinite(num)) {
    throw new ValidationError(`${fieldName} must be a finite number`, fieldName, value);
  }

  if (integer && !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`, fieldName, value);
  }

  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName, value);
  }

  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`, fieldName, value);
  }

  return num;
}

/**
 * Validate boolean parameter
 */
export function validateBooleanParam(value: unknown, fieldName: string): boolean {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`, fieldName, value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }

  throw new ValidationError(`${fieldName} must be a boolean`, fieldName, value);
}

/**
 * Sanitize object by removing null/undefined values and validating types
 */
export function sanitizeObject(obj: unknown, maxDepth = 5): Record<string, any> {
  if (maxDepth <= 0) {
    throw new ValidationError('Object nesting too deep (max 5 levels)', 'object', obj);
  }

  if (obj === null || obj === undefined) {
    return {};
  }

  if (typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ValidationError('Expected an object', 'object', obj);
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Validate key name
    if (typeof key !== 'string' || key.length === 0 || key.length > 100) {
      continue; // Skip invalid keys
    }

    // Check for dangerous patterns in keys
    let hasDangerousPattern = false;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(key)) {
        hasDangerousPattern = true;
        break;
      }
    }
    if (hasDangerousPattern) {
      continue; // Skip dangerous keys
    }

    // Recursively sanitize nested objects
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value, maxDepth - 1);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? sanitizeObject(item, maxDepth - 1)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
