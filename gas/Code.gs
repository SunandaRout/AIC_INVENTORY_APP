/**
 * Code.gs — Web app entry point.
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Lets HTML partials include each other, e.g. <?!= include('Styles'); ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Every client-side call goes through here so there's exactly one
 * server-side place that knows the full list of callable actions —
 * makes it easy to see the whole API surface and keep auth checks
 * consistent. The HTML/JS side calls:
 *   google.script.run.withSuccessHandler(...).api('getDashboardData', token, {...})
 */
function api(action, ...args) {
  const routes = {
    login, logout,
    getDashboardData,
    listInventory, adjustStock, createProduct, updateProduct, deleteProduct, exportInventoryCsv,
    listSuppliers, getSupplierDetails, createSupplier, updateSupplier, deleteSupplier,
    listCustomers, getCustomerDetails, createCustomer, updateCustomer, deleteCustomer,
    listPurchases, createPurchase,
    listSales, createSale,
    listReceipts, createReceipt,
    listPayments, createPayment,
    getSalesReport, getPurchaseReport, getInventoryReport, getCustomerOutstandingReport,
    getSupplierOutstandingReport, getProfitReport, getLocationSalesReport, getCategorySalesReport,
    getProductPerformanceReport, getPaymentReport, getReceiptReport, getLowStockReport, exportReportCsv,
    testDatabaseConnection, testSheetsConnection, syncAllToSQL, getLastSyncStatus, syncSQLToGoogleSheets,
    listUsers, createUser, updateUser, deleteUser,
  };
  const fn = routes[action];
  if (!fn) throw new Error('Unknown action: ' + action);
  return fn(...args);
}
