import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const asOf = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const previousAsOf = `${Number(asOf.slice(0, 4)) - 1}${asOf.slice(4)}`;
const fiscalYear = Number(asOf.slice(0, 4)) - (Number(asOf.slice(5, 7)) < 4 ? 1 : 0);
const [actual, previous, scenario] = await Promise.all([
  supabase.rpc('product_category_department_fiscal_actuals', { p_as_of_date: asOf }),
  supabase.rpc('product_category_department_fiscal_actuals', { p_as_of_date: previousAsOf }),
  supabase.from('product_category_forecast_scenarios').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
]);
for (const result of [actual, previous, scenario]) if (result.error) throw result.error;
const inputsResult = scenario.data?.id
  ? await supabase.from('product_category_forecast_inputs').select('*').eq('scenario_id', scenario.data.id)
  : { data: [], error: null };
if (inputsResult.error) throw inputsResult.error;
const inputMap = new Map(inputsResult.data.map(row => [`${row.department_id}|${row.category_name}|${row.fiscal_year}`, row]));
const previousMap = new Map(previous.data.map(row => [`${row.department_id}|${row.category_name}|${row.fiscal_year}`, row]));
const excluded = new Set(['値引', '未分類', '材料売上']);
const linear = (values, index) => {
  if (values.length < 2) return Math.max(0, values[0] ?? 0);
  const n=values.length,sx=values.reduce((s,_v,i)=>s+i,0),sy=values.reduce((s,v)=>s+v,0),sxy=values.reduce((s,v,i)=>s+i*v,0),sxx=values.reduce((s,_v,i)=>s+i*i,0);
  const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx); return Math.max(0,(sy-slope*sx)/n+slope*index);
};
const years=[fiscalYear-2,fiscalYear-1,fiscalYear];
const grouped=new Map();
for(const row of actual.data){if(excluded.has(row.category_name))continue;const key=`${row.department_id}|${row.category_name}`;const item=grouped.get(key)??new Map();item.set(Number(row.fiscal_year),{sales:Number(row.sales_total),units:Number(row.units_total)});grouped.set(key,item)}
const totals=Object.fromEntries([...years,...Array.from({length:5},(_,i)=>fiscalYear+i+1)].map(y=>[y,0]));
for(const[key,values]of grouped){const[department,category]=key.split('|');const previousFull=values.get(fiscalYear-1)??{sales:0,units:0};const current=values.get(fiscalYear)??{sales:0,units:0};const priorSame=previousMap.get(`${department}|${category}|${fiscalYear-1}`)??{sales_total:0,units_total:0};
  const actuals=years.map(y=>{const v=values.get(y)??{sales:0,units:0};if(y!==fiscalYear)return{...v,price:v.units?v.sales/v.units:0};const sales=Number(priorSame.sales_total)>0?previousFull.sales*current.sales/Number(priorSame.sales_total):0;const units=Number(priorSame.units_total)>0?previousFull.units*current.units/Number(priorSame.units_total):0;return{sales,units,price:units?sales/units:0}});
  actuals.forEach((v,i)=>totals[years[i]]+=v.sales);const forecasts=[];
  for(let i=0;i<5;i++){const y=fiscalYear+i+1,prev=i?forecasts[i-1]:actuals[2],autoPrevUnits=i?forecasts[i-1].baselineUnits:actuals[2].units,autoPrevPrice=i?forecasts[i-1].baselinePrice:actuals[2].price;const autoUnits=linear(actuals.map(v=>v.units),3+i),autoPrice=linear(actuals.map(v=>v.price),3+i);const input=inputMap.get(`${department}|${category}|${y}`);const ug=input?.units_growth_percent??(autoPrevUnits?100*(autoUnits/autoPrevUnits-1):0),pg=input?.unit_price_growth_percent??(autoPrevPrice?100*(autoPrice/autoPrevPrice-1):0);const units=prev.units*(1+Number(ug)/100),price=prev.price*(1+Number(pg)/100);const value={units,price,sales:units*price,baselineUnits:autoUnits,baselinePrice:autoPrice};forecasts.push(value);totals[y]+=value.sales}
}
console.log(JSON.stringify({as_of:asOf,previous_as_of:previousAsOf,scenario_id:scenario.data?.id,user_inputs:inputsResult.data.length,totals,final_sales:totals[fiscalYear+5]},null,2));
