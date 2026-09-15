// ---- helpers ----
const fmtMoney = (v) => {
  const abs = Math.abs(v);
  let s;
  if (abs >= 1e9) s = (v/1e9).toFixed(2) + 'B';
  else if (abs >= 1e7) s = (v/1e7).toFixed(2) + 'Cr';
  else if (abs >= 1e5) s = (v/1e5).toFixed(2) + 'L';
  else if (abs >= 1e3) s = (v/1e3).toFixed(1) + 'K';
  else s = v.toFixed(0);
  return '₹' + s;
};
const fmtFull = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
const TEAL_SHADES = ['#14a5a0','#1c2b4a','#4fc3c7','#8aa0c9','#2e8b8a','#5b7fb5','#a7d8d6','#3f5a8a','#7fc6c3','#274472'];

const monthLabel = (m) => {
  const [y,mo] = m.split('-');
  const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[parseInt(mo,10)-1] + '-' + y.slice(2);
};

function sumMap(obj){ return Object.values(obj||{}).reduce((a,b)=>a+b,0); }

function getFilteredMonths(){
  const range = document.getElementById('f-range').value;
  const months = AIC_DATA.months;
  if(months.length === 0) return [];
  const last = months[months.length-1];
  const [ly, lm] = last.split('-').map(Number);
  if(range === 'all') return months;
  if(range === 'custom'){
    const from = document.getElementById('f-from').value; // yyyy-mm
    const to = document.getElementById('f-to').value;
    if(!from || !to) return months;
    return months.filter(m => m >= from && m <= to);
  }
  if(range === 'this_month') return months.filter(m => m === last);
  if(range === 'last_month'){
    const d = new Date(ly, lm-2, 1);
    const key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    return months.filter(m => m === key);
  }
  if(range === 'this_quarter'){
    const q = Math.floor((lm-1)/3);
    return months.filter(m => {
      const [y,mo] = m.split('-').map(Number);
      return y===ly && Math.floor((mo-1)/3)===q;
    });
  }
  if(range === 'this_year') return months.filter(m => m.startsWith(String(ly)));
  if(range === 'last_12'){
    const idx = months.length-12 < 0 ? 0 : months.length-12;
    return months.slice(idx);
  }
  return months;
}

let charts = {};
function renderChart(id, config){
  const ctx = document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, config);
}

function topNFromMonthlyMap(mapByMonth, months, n, locFilter, catFilterKey){
  const agg = {};
  months.forEach(m => {
    const d = mapByMonth[m] || {};
    Object.entries(d).forEach(([k,v]) => { agg[k] = (agg[k]||0) + v; });
  });
  return Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,n);
}

function render(){
  const months = getFilteredMonths();
  document.getElementById('custom-dates').classList.toggle('show', document.getElementById('f-range').value === 'custom');

  const locFilter = document.getElementById('f-location').value;
  const catFilter = document.getElementById('f-category').value;

  // ---- KPIs (sales/purchases filtered by date range; receivable/payable/inventory are as-of-today balances) ----
  let totalSales = months.reduce((a,m)=>{
    if(locFilter !== 'all'){
      return a + ((AIC_DATA.monthly_sales_by_location[m]||{})[locFilter]||0);
    }
    if(catFilter !== 'all'){
      return a + ((AIC_DATA.monthly_sales_by_category[m]||{})[catFilter]||0);
    }
    return a + (AIC_DATA.monthly_sales_total[m]||0);
  },0);
  let totalPurchases = months.reduce((a,m)=>{
    if(locFilter !== 'all') return a + ((AIC_DATA.monthly_purchases_by_location[m]||{})[locFilter]||0);
    return a + (AIC_DATA.monthly_purchases_total[m]||0);
  },0);

  const marginRatio = AIC_DATA.kpis.net_profit / AIC_DATA.kpis.total_sales;
  const netProfit = totalSales * marginRatio;

  // top sales location for the filtered window
  const locTotals = topNFromMonthlyMap(AIC_DATA.monthly_sales_by_location, months, 1);
  const topLoc = locTotals.length ? locTotals[0][0] : AIC_DATA.kpis.top_sales_location;

  const kpiRow = document.getElementById('kpi-row');
  const kpis = [
    {label:'Total Sales', icon:'📈', value: totalSales, color:'#14a5a0'},
    {label:'Total Purchases', icon:'🛒', value: totalPurchases, color:'#4a6bd6'},
    {label:'Net Profit', icon:'💲', value: netProfit, color: netProfit<0?'#e0554f':'#2ea86b', neg: netProfit<0},
    {label:'Total Receivable', icon:'📄', value: AIC_DATA.kpis.total_receivable, color:'#c98a12', sub:'as of today'},
    {label:'Total Payable', icon:'📑', value: AIC_DATA.kpis.total_payable, color:'#d3453f', sub:'as of today'},
    {label:'Top Sales Location', icon:'📍', value: null, text: topLoc, color:'#14a5a0'},
  ];
  kpiRow.innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.neg?'negative':''}">
      <div class="label"><span class="icon" style="background:${k.color}22;color:${k.color}">${k.icon}</span>${k.label}</div>
      <div class="value">${k.text ? k.text : fmtMoney(k.value)}</div>
      ${k.sub ? `<div class="sub">${k.sub}</div>` : ''}
    </div>`).join('');

  // ---- Sales Trend ----
  renderChart('chartTrend', {
    type:'line',
    data:{
      labels: months.map(monthLabel),
      datasets:[{
        label:'Sales', data: months.map(m => (AIC_DATA.monthly_sales_total[m]||0)),
        borderColor:'#1c2b4a', backgroundColor:'rgba(28,43,74,0.06)', fill:true, tension:0.35, pointRadius:2
      }]
    },
    options:{ plugins:{legend:{display:false}, tooltip:{callbacks:{label:(c)=>fmtFull(c.parsed.y)}}},
      scales:{ y:{ticks:{callback:(v)=>fmtMoney(v)}}, x:{ticks:{maxRotation:60,minRotation:60}} },
      maintainAspectRatio:false, responsive:true }
  });

  // ---- Top 10 Customers ----
  const topCust = topNFromMonthlyMap(AIC_DATA.monthly_sales_by_customer, months, 10);
  const maxCust = topCust.length ? topCust[0][1] : 1;
  document.getElementById('topCustomers').innerHTML = topCust.map(([name,val]) => `
    <div class="rank-row">
      <div class="name">${name}</div>
      <div class="chip">${fmtMoney(val)}</div>
    </div>`).join('') || '<p class="note">No data for this range</p>';

  // ---- Purchase by Location (doughnut) ----
  const purchLoc = topNFromMonthlyMap(AIC_DATA.monthly_purchases_by_location, months, 10);
  renderChart('chartPurchLoc', {
    type:'doughnut',
    data:{ labels: purchLoc.map(x=>x[0]), datasets:[{ data: purchLoc.map(x=>x[1]), backgroundColor: TEAL_SHADES, borderWidth:0 }]},
    options:{ maintainAspectRatio:false, plugins:{ legend:{position:'bottom', labels:{boxWidth:10,font:{size:10}}}, tooltip:{callbacks:{label:(c)=>c.label+': '+fmtFull(c.parsed)}} } }
  });

  // ---- Sales by Location ----
  const salesLoc = topNFromMonthlyMap(AIC_DATA.monthly_sales_by_location, months, 10);
  renderChart('chartSalesLoc', {
    type:'bar',
    data:{ labels: salesLoc.map(x=>x[0]), datasets:[{ data: salesLoc.map(x=>x[1]), backgroundColor:'#14a5a0', borderRadius:6 }]},
    options:{ maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:(c)=>fmtFull(c.parsed.y)}}}, scales:{y:{ticks:{callback:(v)=>fmtMoney(v)}}} }
  });

  // ---- Sales by Category ----
  const salesCat = topNFromMonthlyMap(AIC_DATA.monthly_sales_by_category, months, 10);
  renderChart('chartSalesCat', {
    type:'doughnut',
    data:{ labels: salesCat.map(x=>x[0]), datasets:[{ data: salesCat.map(x=>x[1]), backgroundColor: TEAL_SHADES, borderWidth:0 }]},
    options:{ maintainAspectRatio:false, plugins:{ legend:{position:'bottom', labels:{boxWidth:10,font:{size:10}}}, tooltip:{callbacks:{label:(c)=>c.label+': '+fmtFull(c.parsed)}} } }
  });

  // ---- Sales by City ----
  const salesCity = topNFromMonthlyMap(AIC_DATA.monthly_sales_by_city, months, 10);
  renderChart('chartSalesCity', {
    type:'bar',
    data:{ labels: salesCity.map(x=>x[0]), datasets:[{ data: salesCity.map(x=>x[1]), backgroundColor:'#4a6bd6', borderRadius:6 }]},
    options:{ maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:(c)=>fmtFull(c.parsed.y)}}}, scales:{y:{ticks:{callback:(v)=>fmtMoney(v)}}} }
  });

  // ---- Top Products ----
  const topProd = topNFromMonthlyMap(AIC_DATA.monthly_sales_by_product, months, 10);
  renderChart('chartTopProducts', {
    type:'bar',
    data:{ labels: topProd.map(x=>x[0]), datasets:[{ data: topProd.map(x=>x[1]), backgroundColor:'#c98a12', borderRadius:6 }]},
    options:{ indexAxis:'y', maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:(c)=>fmtFull(c.parsed.x)}}}, scales:{x:{ticks:{callback:(v)=>fmtMoney(v)}}} }
  });

  // ---- Inventory Stock (current snapshot, not date filtered) ----
  const inv = AIC_DATA.inventory_status;
  renderChart('chartInventory', {
    type:'bar',
    data:{ labels: inv.map(x=>x.product.length>14?x.product.slice(0,14)+'…':x.product),
      datasets:[
        {label:'Current Stock', data: inv.map(x=>x.stock), backgroundColor:'#14a5a0', borderRadius:5},
        {label:'Reorder Level', data: inv.map(x=>x.reorder), backgroundColor:'#e0554f', borderRadius:5}
      ]},
    options:{ maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{x:{ticks:{maxRotation:60,minRotation:60,font:{size:9}}}} }
  });

  // ---- Payment Collection ----
  const pc = AIC_DATA.payment_collection;
  renderChart('chartCollection', {
    type:'bar',
    data:{ labels:['Receivable','Received','Outstanding'],
      datasets:[{ data:[pc.receivable, pc.received, pc.outstanding], backgroundColor:['#4a6bd6','#2ea86b','#e0554f'], borderRadius:8 }]},
    options:{ maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:(c)=>fmtFull(c.parsed.y)}}}, scales:{y:{ticks:{callback:(v)=>fmtMoney(v)}}} }
  });

  // ---- Inventory status table ----
  const k = AIC_DATA.kpis;
  document.getElementById('invStatusTable').innerHTML = `
    <tr><td><span class="badge in">IN STOCK</span></td><td>${k.in_stock_count}</td><td>Above reorder level</td></tr>
    <tr><td><span class="badge low">LOW STOCK</span></td><td>${k.low_stock_count}</td><td>At or below reorder level</td></tr>
    <tr><td><span class="badge out">OUT OF STOCK</span></td><td>${k.out_stock_count}</td><td>Zero current stock</td></tr>
  `;

  document.getElementById('filter-summary').textContent =
    `${months.length} month(s) · ${locFilter==='all'?'all locations':locFilter} · ${catFilter==='all'?'all categories':catFilter}`;
}

function populateFilterOptions(){
  const locSel = document.getElementById('f-location');
  AIC_DATA.all_locations.forEach(l => { const o=document.createElement('option'); o.value=l; o.textContent=l; locSel.appendChild(o); });
  const catSel = document.getElementById('f-category');
  AIC_DATA.all_categories.forEach(c => { const o=document.createElement('option'); o.value=c; o.textContent=c; catSel.appendChild(o); });
}

document.addEventListener('DOMContentLoaded', () => {
  populateFilterOptions();
  ['f-range','f-location','f-category','f-from','f-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', render);
  });
  render();
});
