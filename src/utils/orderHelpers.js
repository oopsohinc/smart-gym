/**
 * orderHelpers.js
 * Shared order/invoice number generator functions.
 */

/**
 * Generate a unique order number.
 */
function buildOrderNo() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * Generate a unique invoice number.
 */
function buildInvoiceNo() {
  return `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

module.exports = {
  buildOrderNo,
  buildInvoiceNo
};
