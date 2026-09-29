/**
 * Code.gs — Web app entry point + JSON bridge for the Vercel frontend.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    try {
      const action = e.parameter.action;
      const token = e.parameter.token || '';
      const args = e.parameter.args ? JSON.parse(e.parameter.args) : {};
      return jsonResponse_({ ok: true, data: api(action, token, args) });
    } catch (err) {
      return jsonResponse_({ ok: false, error: err.message || String(err) });
    }
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** JSON POST bridge used by the Vercel-hosted frontend. */
function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action;
    const token = body.token || '';
    const args = Array.isArray(body.args) ? body.args : [];
    if (!action) throw new Error('Missing action.');
    return jsonResponse_({ ok: true, data: api(action, token, ...args) });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function api(action, ...args) {
  const routes = {
    login, logout, getDashboardData,
    listInventory, adjustStock, createProduct, updateProduct, deleteProduct, exportInventoryCsv,
    listSuppliers, getSupplierDetails, createSupplier, updateSupplier, deleteSupplier,
    listCustomers, getCustomerDetails, createCustomer, updateCustomer, deleteCustomer,
    listPurchases, createPurchase, listSales, createSale,
    listReceipts, createReceipt, listPayments, createPayment,
    getSalesReport, getPurchaseReport, getInventoryReport, getCustomerOutstandingReport,
    getSupplierOutstandingReport, getProfitReport, getLocationSalesReport, getCategorySalesReport,
    getProductPerformanceReport, getPaymentReport, getReceiptReport, getLowStockReport, exportReportCsv,
    testDatabaseConnection, testSheetsConnection, syncAllToSQL, getLastSyncStatus, syncSQLToGoogleSheets,
    listUsers, createUser, updateUser, deleteUser
  };
  const fn = routes[action];
  if (!fn) throw new Error('Unknown action: ' + action);
  return fn(...args);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj, (key, value) =>
    value instanceof Date ? value.toISOString() : value
  )).setMimeType(ContentService.MimeType.JSON);
}
