/**
 * Google Sheets database layer for AIC Inventory App.
 * This file is intentionally self-contained. It provides helpers used by the
 * Google-Sheets edition without requiring Jdbc, MySQL, PostgreSQL or an API.
 */
function getSpreadsheet_(){
  const cfg=getConfig_();
  if(!cfg.sheetId) throw new Error('Set SPREADSHEET_ID in Config.gs first.');
  return SpreadsheetApp.openById(cfg.sheetId);
}
function setupDatabase(){
  const ss=getSpreadsheet_();
  const schemas={
    categories:['category_id','category_name','description','status'],
    locations:['location_id','location_name','address','status'],
    suppliers:['supplier_id','supplier_name','phone','email','address','status'],
    customers:['customer_id','customer_name','phone','email','address','status'],
    products:['product_id','sku','product_name','category_id','brand','unit','purchase_price','sale_price','reorder_level','supplier_id','status','created_at','updated_at'],
    inventory:['inventory_id','product_id','location_id','opening_stock','current_stock','reorder_level','updated_at'],
    purchases:['purchase_id','supplier_id','purchase_date','invoice_number','discount','tax','total_amount','payment_status','location_id','created_at'],
    purchase_items:['purchase_item_id','purchase_id','product_id','quantity','unit_price','discount','tax','total_amount'],
    sales:['sale_id','customer_id','sale_date','invoice_number','discount','tax','total_amount','payment_status','location_id','created_at'],
    sale_items:['sale_item_id','sale_id','product_id','quantity','unit_price','discount','tax','total_amount'],
    receipts:['receipt_id','customer_id','receipt_date','amount','payment_method','reference_number','notes'],
    payments:['payment_id','supplier_id','payment_date','amount','payment_method','reference_number','notes'],
    users:['user_id','name','email','role','password_hash','status','created_at','updated_at'],
    audit_log:['audit_id','user_id','action','entity','entity_id','details','created_at']
  };
  Object.keys(schemas).forEach(name=>{
    let sh=ss.getSheetByName(name);
    if(!sh) sh=ss.insertSheet(name);
    if(sh.getLastRow()===0) sh.getRange(1,1,1,schemas[name].length).setValues([schemas[name]]);
    sh.setFrozenRows(1);
  });
  return {ok:true,sheetName:ss.getName(),tables:Object.keys(schemas)};
}
function sheetRows_(name){
  const sh=getSpreadsheet_().getSheetByName(name);
  if(!sh||sh.getLastRow()<2) return [];
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  return sh.getRange(2,1,sh.getLastRow()-1,h.length).getValues().filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o;});
}
function sheetAppend_(name,row){
  const sh=getSpreadsheet_().getSheetByName(name); if(!sh) throw new Error('Missing sheet '+name);
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.appendRow(h.map(k=>row[k]===undefined?'':row[k]));
  return row;
}
function sheetFind_(name,key,value){return sheetRows_(name).find(r=>String(r[key])===String(value))||null;}
function sheetNextId_(prefix,name,key){
  const rows=sheetRows_(name); let max=0;
  rows.forEach(r=>{const m=String(r[key]||'').match(new RegExp('^'+prefix+'(\\d+)$'));if(m)max=Math.max(max,Number(m[1]));});
  return prefix+String(max+1).padStart(5,'0');
}
function sheetsTest(){return {connected:true,sheetName:getSpreadsheet_().getName()};}
