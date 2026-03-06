import { describe, it, expect } from 'vitest';
import {
  validateJsonRpcMethod,
  validateToolName,
  validateResourceUri,
  validateEntityName,
  validateStringParam,
  validateNumericParam,
  validateBooleanParam,
  sanitizeObject,
  ValidationError
} from '../../src/utils/input-validator.js';

describe('validateJsonRpcMethod', () => {
  it('accepts all allowed methods', () => {
    expect(validateJsonRpcMethod('initialize')).toBe('initialize');
    expect(validateJsonRpcMethod('tools/list')).toBe('tools/list');
    expect(validateJsonRpcMethod('tools/call')).toBe('tools/call');
    expect(validateJsonRpcMethod('resources/list')).toBe('resources/list');
    expect(validateJsonRpcMethod('resources/read')).toBe('resources/read');
    expect(validateJsonRpcMethod('prompts/list')).toBe('prompts/list');
    expect(validateJsonRpcMethod('prompts/get')).toBe('prompts/get');
    expect(validateJsonRpcMethod('ping')).toBe('ping');
  });

  it('rejects unknown methods', () => {
    expect(() => validateJsonRpcMethod('admin/delete')).toThrow(ValidationError);
    expect(() => validateJsonRpcMethod('exec')).toThrow(ValidationError);
  });

  it('rejects non-string input', () => {
    expect(() => validateJsonRpcMethod(123)).toThrow('must be a string');
    expect(() => validateJsonRpcMethod(null)).toThrow('must be a string');
  });

  it('rejects empty strings', () => {
    expect(() => validateJsonRpcMethod('')).toThrow('cannot be empty');
  });
});

describe('validateToolName', () => {
  it('accepts valid tool names', () => {
    expect(validateToolName('list_records')).toBe('list_records');
    expect(validateToolName('get-customers')).toBe('get-customers');
    expect(validateToolName('createOrder')).toBe('createOrder');
  });

  it('rejects names starting with non-letter', () => {
    expect(() => validateToolName('123tool')).toThrow(ValidationError);
    expect(() => validateToolName('_tool')).toThrow(ValidationError);
  });

  it('rejects empty/null', () => {
    expect(() => validateToolName('')).toThrow('cannot be empty');
    expect(() => validateToolName(null)).toThrow('must be a string');
  });

  it('rejects names longer than 100 chars', () => {
    expect(() => validateToolName('a'.repeat(101))).toThrow('too long');
  });
});

describe('validateResourceUri', () => {
  it('accepts valid URIs', () => {
    expect(validateResourceUri('bc://customers/123')).toBe('bc://customers/123');
    expect(validateResourceUri('template://report')).toBe('template://report');
  });

  it('rejects invalid URI format', () => {
    expect(() => validateResourceUri('not-a-uri')).toThrow(ValidationError);
    expect(() => validateResourceUri('://missing-protocol')).toThrow(ValidationError);
  });

  it('rejects non-string', () => {
    expect(() => validateResourceUri(42)).toThrow('must be a string');
  });

  it('rejects too-long URIs', () => {
    expect(() => validateResourceUri('bc://' + 'a'.repeat(500))).toThrow('too long');
  });
});

describe('validateEntityName', () => {
  it('accepts valid entity names', () => {
    expect(validateEntityName('customers')).toBe('customers');
    expect(validateEntityName('salesInvoices')).toBe('salesInvoices');
    expect(validateEntityName('customer_ledger')).toBe('customer_ledger');
  });

  it('rejects path traversal', () => {
    expect(() => validateEntityName('../../admin')).toThrow(ValidationError);
  });

  it('rejects names with hyphens', () => {
    expect(() => validateEntityName('sales-invoices')).toThrow(ValidationError);
  });

  it('rejects empty', () => {
    expect(() => validateEntityName('')).toThrow('cannot be empty');
  });

  it('rejects non-string', () => {
    expect(() => validateEntityName(undefined)).toThrow('must be a string');
  });
});

describe('validateStringParam', () => {
  it('accepts valid strings', () => {
    expect(validateStringParam('hello', 'test')).toBe('hello');
  });

  it('rejects null/undefined by default', () => {
    expect(() => validateStringParam(null, 'test')).toThrow('is required');
  });

  it('allows empty when configured', () => {
    expect(validateStringParam(null, 'test', { allowEmpty: true })).toBe('');
  });

  it('enforces max length', () => {
    expect(() => validateStringParam('toolong', 'test', { maxLength: 3 })).toThrow('exceeds maximum');
  });

  it('enforces pattern', () => {
    expect(() => validateStringParam('abc', 'test', { pattern: /^[0-9]+$/ })).toThrow('does not match');
  });
});

describe('validateNumericParam', () => {
  it('accepts valid numbers', () => {
    expect(validateNumericParam(42, 'test')).toBe(42);
    expect(validateNumericParam('42', 'test')).toBe(42);
  });

  it('rejects NaN', () => {
    expect(() => validateNumericParam('abc', 'test')).toThrow('must be a valid number');
  });

  it('rejects Infinity', () => {
    expect(() => validateNumericParam(Infinity, 'test')).toThrow('must be a finite number');
  });

  it('enforces integer constraint', () => {
    expect(() => validateNumericParam(3.14, 'test', { integer: true })).toThrow('must be an integer');
  });

  it('enforces min/max', () => {
    expect(() => validateNumericParam(-1, 'test', { min: 0 })).toThrow('must be at least');
    expect(() => validateNumericParam(101, 'test', { max: 100 })).toThrow('must be at most');
  });
});

describe('validateBooleanParam', () => {
  it('accepts boolean values', () => {
    expect(validateBooleanParam(true, 'test')).toBe(true);
    expect(validateBooleanParam(false, 'test')).toBe(false);
  });

  it('accepts string representations', () => {
    expect(validateBooleanParam('true', 'test')).toBe(true);
    expect(validateBooleanParam('false', 'test')).toBe(false);
    expect(validateBooleanParam('1', 'test')).toBe(true);
    expect(validateBooleanParam('0', 'test')).toBe(false);
    expect(validateBooleanParam('yes', 'test')).toBe(true);
    expect(validateBooleanParam('no', 'test')).toBe(false);
  });

  it('rejects non-boolean values', () => {
    expect(() => validateBooleanParam('maybe', 'test')).toThrow('must be a boolean');
    expect(() => validateBooleanParam(42, 'test')).toThrow('must be a boolean');
  });

  it('rejects null/undefined', () => {
    expect(() => validateBooleanParam(null, 'test')).toThrow('is required');
  });
});

describe('sanitizeObject', () => {
  it('returns empty object for null/undefined', () => {
    expect(sanitizeObject(null)).toEqual({});
    expect(sanitizeObject(undefined)).toEqual({});
  });

  it('passes through safe keys', () => {
    expect(sanitizeObject({ name: 'test', value: 42 })).toEqual({ name: 'test', value: 42 });
  });

  it('skips keys with dangerous patterns', () => {
    const result = sanitizeObject({ 'safe': 1, '../bad': 2 });
    expect(result).toHaveProperty('safe');
    expect(result).not.toHaveProperty('../bad');
  });

  it('rejects deeply nested objects', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    expect(() => sanitizeObject(deep)).toThrow('nesting too deep');
  });

  it('rejects arrays as input', () => {
    expect(() => sanitizeObject([1, 2, 3])).toThrow('Expected an object');
  });
});
