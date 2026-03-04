/**
 * Rich Business Central Workflow Prompts
 * Provides multi-step guidance for common BC operations
 */

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
    default?: any;
  }>;
}

export interface PromptTemplate {
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}

/**
 * All available BC workflow prompts
 */
export const BC_PROMPTS: PromptDefinition[] = [
  {
    name: 'analyze_customer_financial_health',
    description: 'Comprehensive financial health analysis of a customer including sales history, payment trends, and risk assessment',
    arguments: [
      {
        name: 'customer_number',
        description: 'Customer number or ID to analyze',
        required: true
      },
      {
        name: 'period_months',
        description: 'Number of months to analyze (default: 12)',
        required: false,
        default: 12
      }
    ]
  },
  {
    name: 'create_sales_order_workflow',
    description: 'Interactive guided workflow for creating a sales order with validation and confirmation steps',
    arguments: [
      {
        name: 'customer_number',
        description: 'Customer number for the sales order',
        required: true
      },
      {
        name: 'validate_credit',
        description: 'Check customer credit limit before creating order (default: true)',
        required: false,
        default: true
      }
    ]
  },
  {
    name: 'inventory_stock_check',
    description: 'Check item availability, stock levels, and alternative items for order fulfillment',
    arguments: [
      {
        name: 'item_number',
        description: 'Item number to check stock for',
        required: true
      },
      {
        name: 'quantity_needed',
        description: 'Quantity needed (optional)',
        required: false
      },
      {
        name: 'location_code',
        description: 'Specific location code (optional)',
        required: false
      }
    ]
  },
  {
    name: 'post_sales_invoice',
    description: 'Guide through posting a sales invoice with validation checks and error handling',
    arguments: [
      {
        name: 'invoice_number',
        description: 'Sales invoice number to post',
        required: true
      },
      {
        name: 'validate_before_post',
        description: 'Validate invoice before posting (default: true)',
        required: false,
        default: true
      }
    ]
  },
  {
    name: 'customer_payment_analysis',
    description: 'Analyze customer payment behavior, identify overdue amounts, and assess payment reliability',
    arguments: [
      {
        name: 'customer_number',
        description: 'Customer number to analyze',
        required: true
      },
      {
        name: 'include_predictions',
        description: 'Include payment predictions based on history (default: true)',
        required: false,
        default: true
      }
    ]
  },
  {
    name: 'vendor_reconciliation',
    description: 'Reconcile vendor ledger entries and identify discrepancies',
    arguments: [
      {
        name: 'vendor_number',
        description: 'Vendor number to reconcile',
        required: true
      },
      {
        name: 'date_from',
        description: 'Start date for reconciliation (YYYY-MM-DD)',
        required: false
      }
    ]
  },
  {
    name: 'monthly_financial_close',
    description: 'Month-end financial closing checklist with validation steps',
    arguments: [
      {
        name: 'period_month',
        description: 'Month to close (1-12)',
        required: true
      },
      {
        name: 'period_year',
        description: 'Year to close (YYYY)',
        required: true
      }
    ]
  },
  {
    name: 'customer_credit_review',
    description: 'Review customer credit limit, outstanding balance, and recommend credit adjustments',
    arguments: [
      {
        name: 'customer_number',
        description: 'Customer number to review',
        required: true
      }
    ]
  },
  {
    name: 'sales_performance_analysis',
    description: 'Analyze sales performance metrics, trends, and identify top/bottom performers',
    arguments: [
      {
        name: 'period_months',
        description: 'Number of months to analyze (default: 3)',
        required: false,
        default: 3
      },
      {
        name: 'salesperson_code',
        description: 'Specific salesperson code (optional)',
        required: false
      }
    ]
  },
  {
    name: 'create_purchase_order',
    description: 'Interactive workflow for creating a purchase order with vendor and pricing validation',
    arguments: [
      {
        name: 'vendor_number',
        description: 'Vendor number for the purchase order',
        required: true
      }
    ]
  },
  {
    name: 'item_profitability_analysis',
    description: 'Analyze item profitability, margins, and sales trends',
    arguments: [
      {
        name: 'item_number',
        description: 'Item number to analyze',
        required: true
      },
      {
        name: 'period_months',
        description: 'Number of months to analyze (default: 6)',
        required: false,
        default: 6
      }
    ]
  },
  {
    name: 'bank_reconciliation_workflow',
    description: 'Guide through bank account reconciliation process',
    arguments: [
      {
        name: 'bank_account_number',
        description: 'Bank account number to reconcile',
        required: true
      },
      {
        name: 'statement_date',
        description: 'Bank statement date (YYYY-MM-DD)',
        required: true
      }
    ]
  }
];

/**
 * Get prompt template with rich multi-step instructions
 */
export function getPromptTemplate(name: string, args: Record<string, any>): PromptTemplate | null {
  switch (name) {
    case 'analyze_customer_financial_health':
      return {
        description: 'Comprehensive customer financial health analysis',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Perform comprehensive financial health analysis for customer ${args.customer_number} over the last ${args.period_months || 12} months:

**STEP 1: CUSTOMER OVERVIEW**
- Use bc_v2_customer_get with filter: number eq '${args.customer_number}'
- Extract: name, balance, creditLimit, paymentTermsCode, blocked status
- Calculate: credit utilization (balance/creditLimit × 100%)

**STEP 2: SALES HISTORY ANALYSIS**
- Use bc_v2_salesOrder_list with filter: customerNumber eq '${args.customer_number}' and orderDate gt {${args.period_months || 12} months ago}
- Calculate:
  * Total orders count
  * Total sales amount
  * Average order value
  * Monthly trend (increasing/decreasing)
  * Largest order

**STEP 3: PAYMENT BEHAVIOR**
- Use bc_v2_customerLedgerEntry_list to get payment history
- Calculate:
  * Average days to pay (from due date to payment date)
  * Percentage of on-time payments
  * Current overdue amount
  * Longest overdue invoice age

**STEP 4: RISK ASSESSMENT**
- Evaluate credit risk factors:
  * Balance > 80% of credit limit: HIGH RISK
  * Overdue > 30 days: MEDIUM RISK
  * Payment reliability < 70%: MEDIUM RISK
  * Blocked status: CRITICAL
- Assign overall risk rating: LOW/MEDIUM/HIGH/CRITICAL

**STEP 5: RECOMMENDATIONS**
Provide actionable recommendations:
- Credit limit adjustment (increase/decrease/maintain)
- Payment terms changes
- Collection actions needed
- Sales opportunities or restrictions

**OUTPUT FORMAT:**
Present as executive summary with:
- Key metrics dashboard
- Risk score and factors
- Trend analysis
- Clear action items

Use visual indicators: ✅ (good), ⚠️ (caution), 🚨 (critical)`
          }
        }]
      };

    case 'create_sales_order_workflow':
      return {
        description: 'Interactive sales order creation workflow',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Create a sales order for customer ${args.customer_number} using this guided workflow:

**STEP 1: CUSTOMER VALIDATION**
- Use bc_v2_customer_get with filter: number eq '${args.customer_number}'
- Verify:
  * Customer exists and is not blocked
  * Credit limit available (if ${args.validate_credit !== false})
  * Payment terms are valid
- If blocked or over credit limit, STOP and report issue

**STEP 2: GATHER ORDER DETAILS**
Ask the user for:
- Items to order (item numbers and quantities)
- Requested delivery date
- Shipment method (if applicable)
- Special instructions

**STEP 3: ITEM VALIDATION**
For each item requested:
- Use bc_v2_item_get to verify item exists
- Use bc_v2_itemInventory_list to check stock availability
- If stock insufficient, suggest alternatives or notify user

**STEP 4: PRICE CALCULATION**
- Use bc_v2_salesPrice_list to get customer-specific pricing
- Calculate:
  * Line amounts (quantity × unit price)
  * Discounts (if applicable)
  * Total amount before tax
  * Estimated tax
  * Grand total

**STEP 5: CREATE ORDER**
- Use bc_v2_salesOrder_create with:
  * customerNumber: '${args.customer_number}'
  * orderDate: current date
  * requestedDeliveryDate: from user input
  * salesOrderLines: array of items
- Capture the created order number

**STEP 6: CONFIRMATION**
Display order summary:
- Order number (from creation)
- Customer name
- Order date
- Line items with quantities and prices
- Total amount
- Expected delivery date

Ask user to confirm or provide order number for reference.`
          }
        }]
      };

    case 'inventory_stock_check':
      return {
        description: 'Check item inventory availability',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Check inventory availability for item ${args.item_number}${args.quantity_needed ? ` (quantity needed: ${args.quantity_needed})` : ''}:

**STEP 1: ITEM INFORMATION**
- Use bc_v2_item_get with filter: number eq '${args.item_number}'
- Display: description, baseUnitOfMeasure, type, blocked status

**STEP 2: STOCK AVAILABILITY**
- Use bc_v2_itemInventory_list for item ${args.item_number}
${args.location_code ? `- Filter by locationCode eq '${args.location_code}'` : '- Show all locations'}
- For each location, show:
  * Location code and name
  * Quantity on hand
  * Quantity available (on hand - reserved)
  * Quantity on order (incoming)
  * Expected availability date

**STEP 3: AVAILABILITY ASSESSMENT**
${args.quantity_needed ? `
- Compare quantity needed (${args.quantity_needed}) with available stock
- If sufficient: ✅ "Available - can fulfill immediately"
- If partial: ⚠️ "Partial stock - X available, Y short"
- If none: 🚨 "Out of stock - quantity on order: X, ETA: date"
` : '- Report total availability across all locations'}

**STEP 4: ALTERNATIVE OPTIONS**
If stock insufficient:
- Check if item has variants or substitutes
- Show quantity on order and expected receipt dates
- Suggest alternative items if available

**STEP 5: RECOMMENDATIONS**
Provide guidance:
- Can fulfill order immediately
- Suggest partial shipment if applicable
- Recommend purchase order if stock low
- Provide restocking timeline`
          }
        }]
      };

    case 'customer_payment_analysis':
      return {
        description: 'Analyze customer payment behavior',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze payment behavior and reliability for customer ${args.customer_number}:

**STEP 1: CUSTOMER OVERVIEW**
- Use bc_v2_customer_get for customer ${args.customer_number}
- Extract: name, balance, creditLimit, paymentTermsCode

**STEP 2: PAYMENT HISTORY**
- Use bc_v2_customerLedgerEntry_list
- Filter: customerNumber eq '${args.customer_number}' and documentType eq 'Payment'
- Retrieve last 50 payment entries

**STEP 3: PAYMENT METRICS**
Calculate key metrics:
- **Average Days to Pay:** (paymentDate - dueDate) average
- **On-Time Payment Rate:** % of payments made on or before due date
- **Early Payment Rate:** % of payments made before due date
- **Late Payment Rate:** % of payments made after due date
- **Average Late Days:** For late payments, average days overdue

**STEP 4: CURRENT STATUS**
- Use bc_v2_customerLedgerEntry_list for open entries
- Filter: open eq true and customerNumber eq '${args.customer_number}'
- Identify:
  * Total outstanding amount
  * Overdue amount (dueDate < today)
  * Current amount (not yet due)
  * Aged breakdown (0-30, 31-60, 61-90, 90+ days)

**STEP 5: PAYMENT TRENDS**
Analyze last 6 months:
- Is payment behavior improving or deteriorating?
- Identify any seasonal patterns
- Flag any sudden changes in payment behavior

${args.include_predictions !== false ? `
**STEP 6: PREDICTIONS**
Based on historical behavior, predict:
- Likely payment date for current outstanding invoices
- Risk of further delays
- Recommended collection actions
` : ''}

**STEP 7: RECOMMENDATIONS**
Provide actionable insights:
- Payment terms adjustment (tighten/loosen)
- Collection priority (high/medium/low)
- Credit hold recommendation if necessary
- Suggested follow-up actions`
          }
        }]
      };

    case 'monthly_financial_close':
      return {
        description: 'Month-end financial closing checklist',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Execute month-end financial close for ${args.period_month}/${args.period_year}:

**PHASE 1: PRE-CLOSE VALIDATION**

1. **Bank Reconciliation**
   - Verify all bank accounts are reconciled through period end
   - Check for uncleared transactions > 30 days
   - Flag any discrepancies

2. **Accounts Receivable**
   - Run aged receivables report
   - Verify all customer invoices are posted
   - Check for unposted sales orders that should be invoiced

3. **Accounts Payable**
   - Run aged payables report
   - Verify all vendor invoices are entered
   - Check for pending payment runs

4. **Inventory Reconciliation**
   - Verify physical inventory counts (if conducted)
   - Check for negative inventory balances
   - Review inventory valuation

**PHASE 2: ADJUSTING ENTRIES**

5. **Accruals and Deferrals**
   - Review prepaid expenses
   - Check accrued expenses
   - Verify revenue recognition

6. **Depreciation**
   - Run depreciation calculation for period
   - Post depreciation journal entries

**PHASE 3: REVIEW AND VALIDATION**

7. **General Ledger Review**
   - Review all GL accounts for unusual balances
   - Verify all journals are posted
   - Check for out-of-balance conditions

8. **Intercompany Reconciliation**
   - Reconcile intercompany transactions (if applicable)
   - Verify elimination entries

9. **Financial Statements**
   - Generate trial balance
   - Run income statement for period
   - Run balance sheet as of period end
   - Compare to prior periods

**PHASE 4: CLOSE EXECUTION**

10. **Period Close**
    - Close inventory period
    - Close general ledger period
    - Close accounts receivable period
    - Close accounts payable period

11. **Post-Close Verification**
    - Verify period is closed and locked
    - Confirm no new entries can be posted to closed period
    - Archive period reports

**CHECKLIST OUTPUT:**
For each step, report:
- ✅ Complete and verified
- ⚠️ Issues found (describe)
- 🚨 Critical issues blocking close

**FINAL SUMMARY:**
- Close readiness status
- Outstanding issues list
- Required actions before close
- Estimated time to complete`
          }
        }]
      };

    case 'customer_credit_review':
      return {
        description: 'Customer credit limit review and recommendations',
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Review credit limit for customer ${args.customer_number} and provide recommendations:

**STEP 1: CURRENT CREDIT STATUS**
- Use bc_v2_customer_get for customer ${args.customer_number}
- Extract:
  * Current credit limit
  * Current balance (outstanding)
  * Credit utilization (balance/limit × 100%)
  * Payment terms

**STEP 2: HISTORICAL PERFORMANCE**
- Analyze last 12 months:
  * Total sales volume
  * Average monthly purchases
  * Peak purchase month and amount
  * Payment reliability score (on-time %)
  * Any past due amounts history

**STEP 3: CURRENT EXPOSURE**
- Use bc_v2_customerLedgerEntry_list
- Calculate:
  * Current exposure (open invoices + open orders)
  * Available credit (limit - exposure)
  * Overdue amounts and aging
  * Largest single invoice amount

**STEP 4: RISK FACTORS**
Evaluate:
- ✅ Positive factors:
  * Payment reliability > 95%
  * No overdue amounts
  * Growing sales trend
  * Long business relationship
  
- ⚠️ Warning signs:
  * Credit utilization > 80%
  * Late payments in last 3 months
  * Declining order frequency
  * Industry risk factors

- 🚨 Red flags:
  * Currently overdue > 30 days
  * Payment reliability < 70%
  * Blocked transactions
  * Financial distress indicators

**STEP 5: CREDIT RECOMMENDATION**

Based on analysis, recommend:

**INCREASE CREDIT LIMIT IF:**
- Payment reliability > 95%
- No late payments in last 6 months
- Consistent sales growth
- Current limit constraining business
- **Suggested increase:** X% or $X amount
- **New credit limit:** $X

**MAINTAIN CURRENT LIMIT IF:**
- Performance is stable and acceptable
- Current limit is adequate for needs
- Risk profile is neutral

**DECREASE CREDIT LIMIT IF:**
- Payment reliability declining
- Recent late payments or overdues
- Financial concerns
- **Suggested decrease:** To $X (based on recent average exposure)

**CREDIT HOLD IF:**
- Currently overdue > 60 days
- Multiple NSF payments
- Bankruptcy concerns

**STEP 6: IMPLEMENTATION**
- Recommend review frequency (monthly/quarterly/annually)
- Suggest any special terms or conditions
- Recommend required actions (payment, financial statements, etc.)`
          }
        }]
      };

    default:
      return null;
  }
}
