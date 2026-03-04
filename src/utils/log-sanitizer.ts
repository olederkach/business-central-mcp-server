/**
 * Log Sanitization Utility
 * Prevents sensitive data from being logged
 *
 * SECURITY: Redacts sensitive fields to prevent credential leakage and PII exposure
 */

export class LogSanitizer {
  // Sensitive field patterns to redact
  private static readonly SENSITIVE_KEYS = [
    // Authentication & Security
    'password', 'passwd', 'pwd',
    'secret', 'api_key', 'apikey', 'api-key',
    'token', 'access_token', 'refresh_token', 'id_token',
    'authorization', 'auth', 'bearer',
    'key', 'private_key', 'public_key',
    'credential', 'credentials',
    'session', 'sessionid', 'session_id',

    // Personal Identifiable Information
    'ssn', 'social_security',
    'credit_card', 'creditcard', 'card_number', 'cardnumber',
    'cvv', 'cvc', 'cvv2',
    'pin', 'pincode',
    'passport', 'license', 'drivers_license',

    // Business Sensitive
    'salary', 'compensation', 'wage',
    'account_number', 'accountnumber', 'routing_number',
    'iban', 'swift', 'bic',

    // Health Information
    'medical', 'health', 'diagnosis',

    // Other
    'signature', 'encrypted', 'hash'
  ];

  // Headers that should be redacted
  private static readonly SENSITIVE_HEADERS = [
    'authorization',
    'x-api-key',
    'cookie',
    'set-cookie',
    'x-auth-token',
    'x-access-token'
  ];

  /**
   * Sanitize an object by redacting sensitive fields
   * @param data - Object to sanitize
   * @returns Sanitized copy of the object
   */
  static sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types
    if (typeof data !== 'object') {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }

    // Handle objects - create a deep copy
    const sanitized: any = {};

    for (const key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        continue;
      }

      const lowerKey = key.toLowerCase();

      // Check if this key should be redacted
      if (this.isSensitiveKey(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitize(data[key]);
      } else {
        // Keep non-sensitive values
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }

  /**
   * Sanitize HTTP headers
   * @param headers - Headers object
   * @returns Sanitized headers
   */
  static sanitizeHeaders(headers: any): any {
    if (!headers || typeof headers !== 'object') {
      return headers;
    }

    const sanitized: any = {};

    for (const key in headers) {
      if (!Object.prototype.hasOwnProperty.call(headers, key)) {
        continue;
      }

      const lowerKey = key.toLowerCase();

      if (this.SENSITIVE_HEADERS.includes(lowerKey)) {
        // Redact sensitive headers
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = headers[key];
      }
    }

    return sanitized;
  }

  /**
   * Sanitize URL by removing query parameters that might contain sensitive data
   * @param url - URL string
   * @returns Sanitized URL
   */
  static sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return url;
    }

    try {
      const urlObj = new URL(url);

      // Check query parameters for sensitive data
      const params = urlObj.searchParams;
      const sanitizedParams = new URLSearchParams();

      params.forEach((value, key) => {
        if (this.isSensitiveKey(key.toLowerCase())) {
          sanitizedParams.set(key, '[REDACTED]');
        } else {
          sanitizedParams.set(key, value);
        }
      });

      urlObj.search = sanitizedParams.toString();
      return urlObj.toString();
    } catch (error) {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Sanitize request body by redacting sensitive fields
   * Useful for logging HTTP request bodies
   */
  static sanitizeRequestBody(body: any): any {
    return this.sanitize(body);
  }

  /**
   * Sanitize response data
   * More lenient than request sanitization - only redacts clear security fields
   */
  static sanitizeResponse(response: any): any {
    if (!response || typeof response !== 'object') {
      return response;
    }

    // For responses, we're more lenient - only redact clear security fields
    const securityFields = ['token', 'access_token', 'refresh_token', 'secret', 'password'];

    const sanitized: any = Array.isArray(response) ? [] : {};

    for (const key in response) {
      if (!Object.prototype.hasOwnProperty.call(response, key)) {
        continue;
      }

      const lowerKey = key.toLowerCase();

      if (securityFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof response[key] === 'object' && response[key] !== null) {
        sanitized[key] = this.sanitizeResponse(response[key]);
      } else {
        sanitized[key] = response[key];
      }
    }

    return sanitized;
  }

  /**
   * Check if a key name indicates sensitive data
   */
  private static isSensitiveKey(key: string): boolean {
    return this.SENSITIVE_KEYS.some(sensitiveKey =>
      key.includes(sensitiveKey)
    );
  }

  /**
   * Create a safe error message for logging
   * Removes stack traces and sensitive data from errors
   */
  static sanitizeError(error: any): any {
    if (!error) {
      return error;
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        // Don't log full stack traces in production
        stack: process.env.NODE_ENV === 'development' ? error.stack : '[REDACTED]'
      };
    }

    return this.sanitize(error);
  }

  /**
   * Truncate large data structures for logging
   * Prevents log flooding with large responses
   */
  static truncate(data: any, maxLength: number = 1000): string {
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    if (str.length <= maxLength) {
      return str;
    }

    return str.substring(0, maxLength) + `... [TRUNCATED - ${str.length - maxLength} more characters]`;
  }
}
