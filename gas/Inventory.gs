/** Google Sheets inventory module. */
function listInventory(token, opts){
  requirePermission_(token,'inventory'); opts=opts||{};
  let rows=sheetRows_('Inventory'); const products=sheetRows_('Products'); const cats=sheetRows_('Categories');
  const pmap={}; products.forEach(p=>pmap[String(p.id)]=p);
  const cmap={}; cats.forEach(c=>cmap[String(c.id)]=c.name);
  rows=rows.map(i=>{const p=pmap[String(i.product_id)]||{}; const q=Number(i.quantity||0), reorder=Number(p.reorder_level||0); return Object.assign({},i,{product_name:p.name||'',sku:p.sku||'',category_name:cmap[String(p.category_id)]||'',stock_status:q<=0?'Out of Stock':q<=reorder?'Low Stock':'In Stock'});});
  if(opts.search){const s=String(opts.search).toLowerCase();rows=rows.filter(r=>String(r.product_name).toLowerCase().includes(s)||String(r.sku).toLowerCase().includes(s));}
  if(opts.categoryId) rows=rows.filter(r=>String(pmap[String(r.product_id)]?.category_id)===String(opts.categoryId));
  if(opts.locationId) rows=rows.filter(r=>String(r.location_id)===String(opts.locationId));
  if(opts.status) rows=rows.filter(r=>r.stock_status===opts.status);
  rows.sort((a,b)=>String(a.product_name).localeCompare(String(b.product_name)));
  const page=Number(opts.page||1), pageSize=Number(opts.pageSize||25), start=(page-1)*pageSize;
  return {rows:rows.slice(start,start+pageSize),total:rows.length,page,pageSize};
}
function adjustStock(token,productId,locationId,delta,reason){
  const session=requirePermission_(token,'inventory'); const sh=getSpreadsheet_().getSheetByName('Inventory');
  if(!sh) throw new Error('Inventory sheet missing. Run setupDatabase().');
  const rows=sheetRows_('Inventory'); const idx=rows.findIndex(r=>String(r.product_id)===String(productId)&&String(r.location_id)===String(locationId));
  if(idx<0) throw new Error('Inventory record not found.');
  const header=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; const rowNum=idx+2; const qCol=header.indexOf('quantity')+1, uCol=header.indexOf('updated_at')+1;
  const newQty=Number(rows[idx].quantity||0)+Number(delta); sh.getRange(rowNum,qCol).setValue(newQty); if(uCol>0)sh.getRange(rowNum,uCol).setValue(new Date());
  if(typeof logAudit_==='function') logAudit_(session.userId,'INVENTORY_ADJUSTED','inventory',productId,{locationId,delta,reason});
  return {ok:true,quantity:newQty};
}
function createProduct(token,product){
  const session=requirePermission_(token,'inventory'); validateRequired_(product,['sku','productName','categoryId','purchasePrice','salePrice']);
  if(sheetRows_('Products').some(r=>String(r.sku)===String(product.sku))) throw new Error('SKU "'+product.sku+'" already exists.');
  const id=sheetNextId_('PRD','Products','id'); sheetAppend_('Products',{id,sku:product.sku,name:product.productName,category_id:product.categoryId,location_id:product.locationId||'',unit:product.unit||'pcs',cost_price:product.purchasePrice,sale_price:product.salePrice,reorder_level:product.reorderLevel||0,active:'TRUE',created_at:new Date()});
  if(typeof logAudit_==='function') logAudit_(session.userId,'PRODUCT_CREATED','Products',id); return {productId:id};
}
function updateProduct(token,productId,changes){const session=requirePermission_(token,'inventory'); const sh=getSpreadsheet_().getSheetByName('Products'); const rows=sheetRows_('Products'), idx=rows.findIndex(r=>String(r.id)===String(productId)); if(idx<0)throw new Error('Product not found.'); const map={product_name:'name',category_id:'category_id',brand:'brand',unit:'unit',purchase_price:'cost_price',sale_price:'sale_price',reorder_level:'reorder_level',status:'active'}; const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; Object.keys(changes||{}).forEach(k=>{if(map[k]){const c=h.indexOf(map[k])+1;if(c>0)sh.getRange(idx+2,c).setValue(changes[k]);}}); if(typeof logAudit_==='function')logAudit_(session.userId,'PRODUCT_UPDATED','Products',productId,changes); return {ok:true};}
function deleteProduct(token,productId){return updateProduct(token,productId,{status:'Inactive'});}
function exportInventoryCsv(token,opts){const d=listInventory(token,Object.assign({},opts,{page:1,pageSize:100000}));if(!d.rows.length)return '';const h=Object.keys(d.rows[0]);return [h.join(','),...d.rows.map(r=>h.map(k=>csvEscape_(r[k])).join(','))].join('\n');}
function csvEscape_(v){if(v===null||v===undefined)return '';const s=String(v);return /[,"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
