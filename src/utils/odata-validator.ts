/**
 * OData Query Validator
 * Protects against OData injection attacks and malformed queries
 *
 * SECURITY: This module provides whitelist-based validation for OData parameters
 * to prevent injection attacks and unauthorized data access
 */

export class ODataValidator {
  // Allowed OData operators
  private static readonly ALLOWED_OPERATORS = [
    'eq', 'ne', 'gt', 'ge', 'lt', 'le',
    'and', 'or', 'not',
    'contains', 'startswith', 'endswith',
    'substringof', 'indexof', 'length',
    'tolower', 'toupper', 'trim',
    'year', 'month', 'day', 'hour', 'minute', 'second'
  ];

  // Allowed field name pattern (alphanumeric and underscore only)
  private static readonly FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  // Maximum expand depth to prevent performance issues
  private static readonly MAX_EXPAND_DEPTH = 3;

  /**
   * Validate $select parameter
   * Only allows comma-separated field names
   */
  static validateSelect(select: string): string {
    if (!select || typeof select !== 'string') {
      throw new Error('Invalid $select parameter: must be a non-empty string');
    }

    const fields = select.split(',').map(f => f.trim());

    for (const field of fields) {
      // Allow wildcard
      if (field === '*') {
        continue;
      }

      // Check if field name is valid
      if (!this.FIELD_NAME_REGEX.test(field)) {
        throw new Error(`Invalid field name in $select: ${field}`);
      }
    }

    return fields.join(',');
  }

  /**
   * Validate $expand parameter
   * Limits depth and validates field names
   */
  static validateExpand(expand: string): string {
    if (!expand || typeof expand !== 'string') {
      throw new Error('Invalid $expand parameter: must be a non-empty string');
    }

    // Count nesting depth (count opening parentheses)
    const depth = (expand.match(/\(/g) || []).length;
    if (depth > this.MAX_EXPAND_DEPTH) {
      throw new Error(`$expand depth exceeds maximum of ${this.MAX_EXPAND_DEPTH}`);
    }

    // Basic validation: check for suspicious patterns
    if (expand.includes('..') || expand.includes('//') || expand.includes('\\')) {
      throw new Error('Invalid characters in $expand parameter');
    }

    // Extract field names and validate them
    const fieldPattern = /([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const fields = expand.match(fieldPattern) || [];

    for (const field of fields) {
      if (!this.FIELD_NAME_REGEX.test(field)) {
        throw new Error(`Invalid field name in $expand: ${field}`);
      }
    }

    return expand;
  }

  /**
   * Validate $filter parameter
   * Checks for allowed operators and prevents injection
   */
  static validateFilter(filter: string): string {
    if (!filter || typeof filter !== 'string') {
      throw new Error('Invalid $filter parameter: must be a non-empty string');
    }

    // Prevent common injection attempts
    const dangerousPatterns = [
      /;/,        // SQL injection attempt
      /--/,       // SQL comment
      /\/\*/,     // SQL comment
      /\*\//,     // SQL comment
      /<script/i, // XSS attempt
      /javascript:/i, // XSS attempt
      /\.\./,     // Path traversal
      /\\/,       // Backslash (path traversal)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(filter)) {
        throw new Error('Filter contains suspicious patterns');
      }
    }

    // Check for balanced parentheses
    const openCount = (filter.match(/\(/g) || []).length;
    const closeCount = (filter.match(/\)/g) || []).length;
    if (openCount !== closeCount) {
      throw new Error('Unbalanced parentheses in $filter');
    }

    // Validate operators (case-insensitive)
    const filterLower = filter.toLowerCase();
    const operatorPattern = /\b(eq|ne|gt|ge|lt|le|and|or|not|contains|startswith|endswith)\b/g;
    const foundOperators = filterLower.match(operatorPattern) || [];

    for (const op of foundOperators) {
      if (!this.ALLOWED_OPERATORS.includes(op)) {
        throw new Error(`Operator not allowed in $filter: ${op}`);
      }
    }

    return filter;
  }

  /**
   * Validate $orderby parameter
   * Only allows field names with optional asc/desc
   */
  static validateOrderBy(orderby: string): string {
    if (!orderby || typeof orderby !== 'string') {
      throw new Error('Invalid $orderby parameter: must be a non-empty string');
    }

    const parts = orderby.split(',').map(p => p.trim());

    for (const part of parts) {
      const tokens = part.split(/\s+/);

      // First token must be a field name
      if (!this.FIELD_NAME_REGEX.test(tokens[0])) {
        throw new Error(`Invalid field name in $orderby: ${tokens[0]}`);
      }

      // Optional second token must be asc or desc
      if (tokens.length > 1 && !['asc', 'desc'].includes(tokens[1].toLowerCase())) {
        throw new Error(`Invalid sort direction in $orderby: ${tokens[1]}`);
      }

      // No more than 2 tokens
      if (tokens.length > 2) {
        throw new Error(`Invalid $orderby format: ${part}`);
      }
    }

    return orderby;
  }

  /**
   * Validate numeric parameters ($top, $skip)
   */
  static validateNumeric(value: any, paramName: string, min: number = 0, max: number = 10000): number {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      throw new Error(`${paramName} must be a valid number`);
    }

    if (num < min || num > max) {
      throw new Error(`${paramName} must be between ${min} and ${max}`);
    }

    return num;
  }

  /**
   * Validate all OData query parameters
   * Returns sanitized parameters
   */
  static validateODataParams(params: Record<string, any>): Record<string, any> {
    const validated: Record<string, any> = {};

    // Validate $top
    if (params.top !== undefined || params.$top !== undefined) {
      const top = params.top ?? params.$top;
      validated.top = this.validateNumeric(top, '$top', 1, 1000);
    }

    // Validate $skip
    if (params.skip !== undefined || params.$skip !== undefined) {
      const skip = params.skip ?? params.$skip;
      validated.skip = this.validateNumeric(skip, '$skip', 0, 100000);
    }

    // Validate $filter
    if (params.filter !== undefined || params.$filter !== undefined) {
      const filter = params.filter ?? params.$filter;
      validated.filter = this.validateFilter(filter);
    }

    // Validate $orderby
    if (params.orderby !== undefined || params.$orderby !== undefined) {
      const orderby = params.orderby ?? params.$orderby;
      validated.orderby = this.validateOrderBy(orderby);
    }

    // Validate $select
    if (params.select !== undefined || params.$select !== undefined) {
      const select = params.select ?? params.$select;
      validated.select = this.validateSelect(select);
    }

    // Validate $expand
    if (params.expand !== undefined || params.$expand !== undefined) {
      const expand = params.expand ?? params.$expand;
      validated.expand = this.validateExpand(expand);
    }

    return validated;
  }
}
