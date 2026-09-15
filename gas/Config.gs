/** Google Sheets Edition configuration. */
const APP_NAME = 'AIC Inventory App';

function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    dbType: 'sheets',
    sheetId: p.getProperty('SHEET_ID') || SpreadsheetApp.getActiveSpreadsheet().getId(),
    sessionSecret: p.getProperty('SESSION_SECRET') || Utilities.getUuid()
  };
}

/** Run once from the Apps Script editor after opening this project from a Google Sheet. */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open Apps Script from the Google Sheet: Extensions > Apps Script.');
  PropertiesService.getScriptProperties().setProperties({SHEET_ID:ss.getId(), SESSION_SECRET:Utilities.getUuid(), DB_TYPE:'sheets'});
  const schemas = {
    Users:['id','username','password_hash','name','role','email','active','created_at'],
    Categories:['id','name','description','active','created_at'],
    Locations:['id','name','address','active','created_at'],
    Products:['id','sku','name','category_id','location_id','unit','cost_price','sale_price','reorder_level','active','created_at'],
    Inventory:['id','product_id','location_id','quantity','updated_at'],
    Suppliers:['id','name','phone','email','address','active','created_at'],
    Customers:['id','name','phone','email','address','active','created_at'],
    Purchases:['id','supplier_id','product_id','quantity','unit_cost','total','date','status','created_at'],
    Sales:['id','customer_id','product_id','quantity','unit_price','total','date','status','created_at'],
    Receipts:['id','sale_id','customer_id','amount','payment_method','date','created_at'],
    Payments:['id','purchase_id','supplier_id','amount','payment_method','date','created_at'],
    StockAdjustments:['id','product_id','location_id','quantity_change','reason','date','created_at'],
    Reports:['id','report_type','report_date','data_json','created_at'],
    AuditLog:['id','user_id','action','entity','entity_id','details','created_at'],
    Settings:['key','value','updated_at']
  };
  Object.keys(schemas).forEach(name=>{
    let sh=ss.getSheetByName(name);
    if(!sh) sh=ss.insertSheet(name);
    const headers=schemas[name];
    if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  });
  let settings=ss.getSheetByName('Settings');
  settings.getRange('A2:C2').setValues([['setup_complete','TRUE',new Date()]]);
  SpreadsheetApp.flush();
  return {ok:true, spreadsheetId:ss.getId(), spreadsheetName:ss.getName(), sheets:Object.keys(schemas)};
}

function ONE_TIME_setScriptProperties(){ return setupDatabase(); }
