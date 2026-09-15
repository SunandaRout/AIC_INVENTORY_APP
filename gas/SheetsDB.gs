/** Google Sheets database helpers for AIC Inventory App. */
function getSpreadsheet_(){
  const cfg=getConfig_();
  if(!cfg.sheetId) throw new Error('Open Apps Script from the Google Sheet or set SHEET_ID.');
  return SpreadsheetApp.openById(cfg.sheetId);
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
  sh.appendRow(h.map(k=>row[k]===undefined?'':row[k])); return row;
}
function sheetFind_(name,key,value){return sheetRows_(name).find(r=>String(r[key])===String(value))||null;}
function sheetNextId_(prefix,name,key){
  let max=0; sheetRows_(name).forEach(r=>{const m=String(r[key]||'').match(new RegExp('^'+prefix+'(\\d+)$'));if(m)max=Math.max(max,+m[1]);});
  return prefix+String(max+1).padStart(5,'0');
}
function sheetsTest(){return {connected:true,sheetName:getSpreadsheet_().getName()};}
function testSheetsConnection(){return sheetsTest();}
