/**
 * Error Codes and Context-Rich Error Messages
 * Provides user-friendly, actionable error messages for common scenarios
 */

export enum MCPErrorCode {
  // Authentication & Authorization
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Input Validation
  INVALID_FILTER = 'INVALID_FILTER',
  INVALID_SELECT = 'INVALID_SELECT',
  INVALID_ORDERBY = 'INVALID_ORDERBY',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',

  // Resource Not Found
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
  COMPANY_NOT_FOUND = 'COMPANY_NOT_FOUND',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',

  // Business Logic
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',
  CONCURRENCY_CONFLICT = 'CONCURRENCY_CONFLICT',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',

  // System
  BC_API_UNAVAILABLE = 'BC_API_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface MCPError {
  code: MCPErrorCode;
  message: string;
  details?: Record<string, any>;
  suggestion?: string;
  example?: string;
}

export class ErrorBuilder {
  /**
   * Create a context-rich error from a Business Central API error
   */
  static fromBCApiError(error: any, context?: { tool?: string; operation?: string }): MCPError {
    const bcError = error.response?.data?.error || error;
    const statusCode = error.response?.status;
    const errorMessage = bcError.message || error.message || 'Unknown error';

    // Auth errors
    if (statusCode === 401 || errorMessage.includes('Unauthorized')) {
      return {
        code: MCPErrorCode.AUTH_FAILED,
        message: 'Authentication failed when calling Business Central API',
        details: {
          bcError: errorMessage,
          statusCode
        },
        suggestion: 'Verify that BC_CLIENT_ID and BC_CLIENT_SECRET environment variables are correct and the app has been granted API permissions in Business Central.'
      };
    }

    if (statusCode === 403 || errorMessage.includes('Forbidden')) {
      return {
        code: MCPErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Insufficient permissions to access Business Central resource',
        details: {
          bcError: errorMessage,
          resource: context?.tool
        },
        suggestion: 'Ensure the Azure AD app has been granted the appropriate permissions in Business Central (e.g., Financials.ReadWrite.All).'
      };
    }

    // Not found errors
    if (statusCode === 404) {
      if (context?.tool?.includes('company')) {
        return {
          code: MCPErrorCode.COMPANY_NOT_FOUND,
          message: 'The specified Business Central company was not found',
          suggestion: 'Use the bc_v2_company_list tool to see available companies and their IDs.'
        };
      }
      return {
        code: MCPErrorCode.ENTITY_NOT_FOUND,
        message: `Resource not found in Business Central`,
        details: { bcError: errorMessage }
      };
    }

    // OData filter errors
    if (errorMessage.includes('filter') || errorMessage.includes('$filter')) {
      const filterError = this.parseODataFilterError(errorMessage);
      return {
        code: MCPErrorCode.INVALID_FILTER,
        message: 'Invalid OData $filter expression',
        details: {
          original: errorMessage,
          parsed: filterError.issue
        },
        suggestion: filterError.suggestion,
        example: filterError.example
      };
    }

    // OData select errors
    if (errorMessage.includes('select') || errorMessage.includes('$select')) {
      return {
        code: MCPErrorCode.INVALID_SELECT,
        message: 'Invalid OData $select expression',
        details: { bcError: errorMessage },
        suggestion: 'Check that field names are spelled correctly and are available on this entity. Use comma-separated field names.',
        example: '$select=id,displayName,number'
      };
    }

    // OData orderby errors
    if (errorMessage.includes('orderby') || errorMessage.includes('$orderby')) {
      return {
        code: MCPErrorCode.INVALID_ORDERBY,
        message: 'Invalid OData $orderby expression',
        details: { bcError: errorMessage },
        suggestion: 'Use format: fieldName asc|desc. Separate multiple fields with commas.',
        example: '$orderby=displayName asc,number desc'
      };
    }

    // Duplicate/conflict errors
    if (statusCode === 409 || errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      return {
        code: MCPErrorCode.DUPLICATE_RECORD,
        message: 'A record with this identifier already exists',
        details: { bcError: errorMessage },
        suggestion: 'Use the update operation instead, or choose a different identifier.'
      };
    }

    // Concurrency errors
    if (errorMessage.includes('ETag') || errorMessage.includes('If-Match') || errorMessage.includes('changed')) {
      return {
        code: MCPErrorCode.CONCURRENCY_CONFLICT,
        message: 'The record was modified by another user',
        details: { bcError: errorMessage },
        suggestion: 'Retrieve the latest version of the record and retry the operation.'
      };
    }

    // Required field errors
    if (errorMessage.includes('required') || errorMessage.includes('cannot be null')) {
      const field = this.extractFieldName(errorMessage);
      return {
        code: MCPErrorCode.REQUIRED_FIELD_MISSING,
        message: `Required field is missing: ${field}`,
        details: { bcError: errorMessage },
        suggestion: `Provide a value for the required field '${field}'.`
      };
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return {
        code: MCPErrorCode.TIMEOUT,
        message: 'Request to Business Central timed out',
        details: { bcError: errorMessage },
        suggestion: 'The query may be too complex or Business Central is slow. Try reducing $top limit or simplifying $filter.'
      };
    }

    // Service unavailable
    if (statusCode === 503 || statusCode === 504) {
      return {
        code: MCPErrorCode.BC_API_UNAVAILABLE,
        message: 'Business Central API is temporarily unavailable',
        details: { statusCode },
        suggestion: 'Wait a moment and retry. Business Central may be experiencing high load or maintenance.'
      };
    }

    // Generic internal error
    return {
      code: MCPErrorCode.INTERNAL_ERROR,
      message: errorMessage,
      details: {
        statusCode,
        tool: context?.tool,
        operation: context?.operation
      }
    };
  }

  private static parseODataFilterError(message: string): { issue: string; suggestion: string; example: string } {
    // Common OData filter mistakes
    if (message.includes('eq') && (message.includes("'") || message.includes('"'))) {
      return {
        issue: 'String values must be enclosed in single quotes',
        suggestion: "Use single quotes around string values in eq comparisons",
        example: "$filter=displayName eq 'John Smith'"
      };
    }

    if (message.includes('operator')) {
      return {
        issue: 'Invalid OData operator',
        suggestion: 'Valid operators are: eq, ne, gt, ge, lt, le, and, or, not, contains, startswith, endswith',
        example: "$filter=number eq '1000' and displayName contains 'Corp'"
      };
    }

    if (message.includes('property') || message.includes('field')) {
      return {
        issue: 'Invalid field name in filter',
        suggestion: 'Check field names are spelled correctly and exist on this entity',
        example: "$filter=blocked eq false"
      };
    }

    return {
      issue: 'OData filter syntax error',
      suggestion: 'Check the OData filter syntax documentation',
      example: "$filter=number eq '1000'"
    };
  }

  private static extractFieldName(message: string): string {
    // Try to extract field name from error messages like "Field 'displayName' is required"
    const match = message.match(/['"]([^'"]+)['"]/);
    return match ? match[1] : 'unknown field';
  }

  /**
   * Create error for missing required parameter
   */
  static requiredParameter(paramName: string, toolName: string): MCPError {
    return {
      code: MCPErrorCode.REQUIRED_FIELD_MISSING,
      message: `Required parameter '${paramName}' is missing`,
      details: { parameter: paramName, tool: toolName },
      suggestion: `Provide the '${paramName}' parameter when calling ${toolName}.`
    };
  }

  /**
   * Create error for tool not found
   */
  static toolNotFound(toolName: string, availableTools?: number): MCPError {
    return {
      code: MCPErrorCode.TOOL_NOT_FOUND,
      message: `Tool '${toolName}' not found`,
      details: {
        requestedTool: toolName,
        availableToolCount: availableTools
      },
      suggestion: availableTools
        ? `Use the tools/list method to see all ${availableTools} available tools.`
        : 'Use the tools/list method to see available tools.'
    };
  }

  /**
   * Format error for MCP JSON-RPC response
   */
  static toJsonRpcError(mcpError: MCPError): { code: number; message: string; data?: any } {
    return {
      code: this.getJsonRpcCode(mcpError.code),
      message: mcpError.message,
      data: {
        errorCode: mcpError.code,
        details: mcpError.details,
        suggestion: mcpError.suggestion,
        example: mcpError.example
      }
    };
  }

  private static getJsonRpcCode(mcpCode: MCPErrorCode): number {
    // Map MCP error codes to JSON-RPC error codes
    switch (mcpCode) {
      case MCPErrorCode.TOOL_NOT_FOUND:
        return -32601; // Method not found
      case MCPErrorCode.REQUIRED_FIELD_MISSING:
      case MCPErrorCode.INVALID_FILTER:
      case MCPErrorCode.INVALID_SELECT:
      case MCPErrorCode.INVALID_ORDERBY:
      case MCPErrorCode.INVALID_FIELD_VALUE:
        return -32602; // Invalid params
      case MCPErrorCode.AUTH_FAILED:
      case MCPErrorCode.TOKEN_EXPIRED:
      case MCPErrorCode.INSUFFICIENT_PERMISSIONS:
        return -32001; // Unauthorized (custom)
      case MCPErrorCode.RATE_LIMIT_EXCEEDED:
        return -32002; // Rate limit (custom)
      default:
        return -32603; // Internal error
    }
  }
}
