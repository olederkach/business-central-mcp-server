# OData Query Parameters Support

## Overview
The MCP Central Business Central connector fully supports OData query parameters for efficient server-side filtering, sorting, and pagination of data.

## Supported Parameters

### `$top`
Limits the number of records returned.
- **Type**: Integer
- **Range**: 1-1000
- **Example**: `"$top": 10`

### `$skip`
Skips a specified number of records (useful for pagination).
- **Type**: Integer
- **Example**: `"$skip": 20`

### `$orderby`
Sorts results by one or more fields.
- **Format**: `fieldName [asc|desc]`
- **Multiple fields**: Comma-separated
- **Examples**: 
  - `"$orderby": "unitCost desc"`
  - `"$orderby": "displayName asc, unitCost desc"`

### `$filter`
Filters records based on conditions.
- **Operators**: `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `and`, `or`, `not`, `contains()`, `startswith()`, `endswith()`
- **Examples**:
  - `"$filter": "unitCost gt 500"`
  - `"$filter": "unitCost gt 100 and unitCost lt 1000"`
  - `"$filter": "contains(displayName, 'ATHENS')"`

### `$select`
Selects specific fields to return (reduces payload size).
- **Format**: Comma-separated field names
- **Example**: `"$select": "number,displayName,unitCost,inventory"`

### `$expand`
Expands related entities.
- **Example**: `"$expand": "salesOrderLines"`

### `$count`
Includes the total count of records in the response.
- **Type**: Boolean
- **Example**: `"$count": true`

## Usage Examples

### Basic List with Limit
```json
{
  "name": "bc_v2_item_list",
  "arguments": {
    "$top": 10
  }
}
```

### Sorted Results
```json
{
  "name": "bc_v2_item_list",
  "arguments": {
    "$orderby": "unitCost desc",
    "$top": 5
  }
}
```

### Filtered Results
```json
{
  "name": "bc_v2_customer_list",
  "arguments": {
    "$filter": "blocked eq false",
    "$orderby": "displayName asc"
  }
}
```

### Pagination
```json
{
  "name": "bc_v2_item_list",
  "arguments": {
    "$skip": 20,
    "$top": 10,
    "$orderby": "number asc"
  }
}
```

### Complex Query
```json
{
  "name": "bc_v2_item_list",
  "arguments": {
    "$filter": "unitCost gt 100 and unitCost lt 1000",
    "$select": "number,displayName,unitCost,type",
    "$orderby": "unitCost desc",
    "$top": 20
  }
}
```

## Performance Benefits

Using OData parameters provides significant performance improvements:

1. **Reduced Network Traffic**: Only requested data is transferred
2. **Server-Side Processing**: Filtering and sorting happen at the database level
3. **Lower Memory Usage**: Client doesn't need to process all records
4. **Faster Response Times**: Especially for large datasets

## Best Practices

1. **Always use `$top`** when you don't need all records
2. **Use `$select`** to retrieve only needed fields
3. **Combine `$skip` and `$top`** for efficient pagination
4. **Use `$filter`** instead of client-side filtering
5. **Sort with `$orderby`** at the server level

## Filter Expression Examples

### Comparison Operators
- Equal: `"$filter": "type eq 'Inventory'"`
- Not equal: `"$filter": "blocked ne true"`
- Greater than: `"$filter": "unitCost gt 500"`
- Less than or equal: `"$filter": "inventory le 10"`

### Logical Operators
- AND: `"$filter": "unitCost gt 100 and inventory gt 0"`
- OR: `"$filter": "type eq 'Service' or type eq 'NonInventory'"`
- NOT: `"$filter": "not blocked"`

### String Functions
- Contains: `"$filter": "contains(displayName, 'Desk')"`
- Starts with: `"$filter": "startswith(number, '1')"`
- Ends with: `"$filter": "endswith(displayName, 'Table')"`

### Date Filtering
- Date comparison: `"$filter": "lastModifiedDateTime gt 2025-01-01T00:00:00Z"`
- Current year: `"$filter": "year(documentDate) eq 2026"`

## Tool Usage

OData parameters are passed as arguments to the `list_records` tool:

```json
{
  "resource": "customers",
  "filter": "city eq 'Seattle'",
  "select": "id,displayName,email",
  "orderby": "displayName asc",
  "top": 20
}
```

## Troubleshooting

### Parameters Not Working
- Ensure you're using the `$` prefix for OData parameters
- Check that the field names match exactly (case-sensitive)
- Verify the field supports filtering/sorting in Business Central

### Performance Issues
- Use `$top` to limit results
- Add indexes in Business Central for frequently filtered fields
- Use `$select` to reduce payload size

### Error Messages
- "Invalid filter expression": Check OData syntax
- "Field not found": Verify field name and availability
- "Too many results": Add `$top` parameter (max 1000)

## Additional Resources

- [OData v4.0 Specification](https://www.odata.org/documentation/)
- [Business Central API Documentation](https://docs.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/)
- [OData Query Options](https://docs.oasis-open.org/odata/odata/v4.01/odata-v4.01-part2-url-conventions.html)