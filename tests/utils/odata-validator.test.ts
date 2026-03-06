import { describe, it, expect } from 'vitest';
import { ODataValidator } from '../../src/utils/odata-validator.js';

describe('ODataValidator', () => {
  describe('validateSelect', () => {
    it('accepts valid field names', () => {
      expect(ODataValidator.validateSelect('name,displayName,balance')).toBe('name,displayName,balance');
    });

    it('accepts wildcard', () => {
      expect(ODataValidator.validateSelect('*')).toBe('*');
    });

    it('accepts fields with underscores', () => {
      expect(ODataValidator.validateSelect('customer_name,order_id')).toBe('customer_name,order_id');
    });

    it('rejects non-string input', () => {
      expect(() => ODataValidator.validateSelect(null as any)).toThrow('must be a non-empty string');
      expect(() => ODataValidator.validateSelect('')).toThrow('must be a non-empty string');
    });

    it('rejects invalid field names', () => {
      expect(() => ODataValidator.validateSelect('name;DROP TABLE')).toThrow('Invalid field name');
      expect(() => ODataValidator.validateSelect('123abc')).toThrow('Invalid field name');
    });
  });

  describe('validateFilter', () => {
    it('accepts valid filters', () => {
      expect(ODataValidator.validateFilter("name eq 'John'")).toBe("name eq 'John'");
      expect(ODataValidator.validateFilter('balance gt 1000')).toBe('balance gt 1000');
      expect(ODataValidator.validateFilter("status eq 'Open' and amount gt 100")).toBe("status eq 'Open' and amount gt 100");
    });

    it('accepts filters with contains/startswith', () => {
      expect(ODataValidator.validateFilter("contains(name, 'test')")).toBe("contains(name, 'test')");
      expect(ODataValidator.validateFilter("startswith(name, 'A')")).toBe("startswith(name, 'A')");
    });

    it('rejects SQL injection patterns', () => {
      expect(() => ODataValidator.validateFilter("name eq 'x'; DROP TABLE users")).toThrow('suspicious patterns');
      expect(() => ODataValidator.validateFilter("name eq 'x' -- comment")).toThrow('suspicious patterns');
      expect(() => ODataValidator.validateFilter("name eq 'x' /* comment */")).toThrow('suspicious patterns');
    });

    it('rejects XSS patterns', () => {
      expect(() => ODataValidator.validateFilter("<script>alert(1)</script>")).toThrow('suspicious patterns');
      expect(() => ODataValidator.validateFilter("javascript:alert(1)")).toThrow('suspicious patterns');
    });

    it('rejects path traversal', () => {
      expect(() => ODataValidator.validateFilter("../../etc/passwd")).toThrow('suspicious patterns');
    });

    it('rejects unbalanced parentheses', () => {
      expect(() => ODataValidator.validateFilter("(name eq 'x'")).toThrow('Unbalanced parentheses');
    });

    it('accepts balanced parentheses', () => {
      expect(ODataValidator.validateFilter("(name eq 'x') and (balance gt 0)")).toBe("(name eq 'x') and (balance gt 0)");
    });

    it('rejects non-string input', () => {
      expect(() => ODataValidator.validateFilter(null as any)).toThrow('must be a non-empty string');
      expect(() => ODataValidator.validateFilter('')).toThrow('must be a non-empty string');
    });

    it('accepts parentheses inside single-quoted strings (US-09)', () => {
      expect(ODataValidator.validateFilter("name eq 'a(b'")).toBe("name eq 'a(b'");
      expect(ODataValidator.validateFilter("name eq 'foo(bar)baz'")).toBe("name eq 'foo(bar)baz'");
    });

    it('handles escaped quotes inside strings (US-09)', () => {
      expect(ODataValidator.validateFilter("name eq 'it''s'")).toBe("name eq 'it''s'");
    });
  });

  describe('validateExpand', () => {
    it('accepts simple expand', () => {
      expect(ODataValidator.validateExpand('lines')).toBe('lines');
    });

    it('accepts nested expand up to max depth', () => {
      expect(ODataValidator.validateExpand('lines($expand=item($expand=category))')).toBe('lines($expand=item($expand=category))');
    });

    it('rejects expand exceeding max depth', () => {
      // MAX_EXPAND_DEPTH is 3, so 4 opening parens triggers the error
      expect(() => ODataValidator.validateExpand('a($expand=b($expand=c($expand=d($expand=e))))')).toThrow('depth exceeds maximum');
    });

    it('rejects path traversal in expand', () => {
      expect(() => ODataValidator.validateExpand('../admin')).toThrow('Invalid characters');
    });

    it('rejects non-string input', () => {
      expect(() => ODataValidator.validateExpand(null as any)).toThrow('must be a non-empty string');
    });

    it('counts depth correctly with quoted strings containing parens (US-09)', () => {
      // Parens inside quotes should not count toward depth
      expect(ODataValidator.validateExpand("lines($filter=type eq 'y(z)')")).toBe("lines($filter=type eq 'y(z)')");
    });
  });

  describe('validateOrderBy', () => {
    it('accepts valid orderby', () => {
      expect(ODataValidator.validateOrderBy('name')).toBe('name');
      expect(ODataValidator.validateOrderBy('name asc')).toBe('name asc');
      expect(ODataValidator.validateOrderBy('name desc')).toBe('name desc');
    });

    it('accepts multiple orderby fields', () => {
      expect(ODataValidator.validateOrderBy('name asc, balance desc')).toBe('name asc, balance desc');
    });

    it('rejects invalid direction', () => {
      expect(() => ODataValidator.validateOrderBy('name DROP')).toThrow('Invalid sort direction');
    });

    it('rejects too many tokens', () => {
      expect(() => ODataValidator.validateOrderBy('name asc extra')).toThrow('Invalid $orderby format');
    });

    it('rejects invalid field names', () => {
      expect(() => ODataValidator.validateOrderBy('123bad')).toThrow('Invalid field name');
    });
  });

  describe('validateNumeric', () => {
    it('accepts valid numbers', () => {
      expect(ODataValidator.validateNumeric(10, '$top')).toBe(10);
      expect(ODataValidator.validateNumeric('50', '$top')).toBe(50);
    });

    it('respects $top max of 1000', () => {
      expect(ODataValidator.validateNumeric(1000, '$top', 1, 1000)).toBe(1000);
      expect(() => ODataValidator.validateNumeric(1001, '$top', 1, 1000)).toThrow('must be between');
    });

    it('respects $skip max of 100000', () => {
      expect(ODataValidator.validateNumeric(100000, '$skip', 0, 100000)).toBe(100000);
      expect(() => ODataValidator.validateNumeric(100001, '$skip', 0, 100000)).toThrow('must be between');
    });

    it('rejects NaN', () => {
      expect(() => ODataValidator.validateNumeric('abc', '$top')).toThrow('must be a valid number');
    });

    it('rejects values below min', () => {
      expect(() => ODataValidator.validateNumeric(-1, '$skip', 0, 10000)).toThrow('must be between');
    });
  });

  describe('validateODataParams', () => {
    it('validates all params together', () => {
      const result = ODataValidator.validateODataParams({
        $top: 10,
        $skip: 0,
        $filter: "name eq 'test'",
        $select: 'name,balance',
        $orderby: 'name asc'
      });
      expect(result.top).toBe(10);
      expect(result.skip).toBe(0);
      expect(result.filter).toBe("name eq 'test'");
      expect(result.select).toBe('name,balance');
      expect(result.orderby).toBe('name asc');
    });

    it('handles params without $ prefix', () => {
      const result = ODataValidator.validateODataParams({ top: 5, skip: 10 });
      expect(result.top).toBe(5);
      expect(result.skip).toBe(10);
    });

    it('returns empty object for no params', () => {
      expect(ODataValidator.validateODataParams({})).toEqual({});
    });
  });
});
