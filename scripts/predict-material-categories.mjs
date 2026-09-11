import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('material_product_sales_summary').select('*').range(from, from + 999);
  if (error) throw error;
  all.push(...data);
  if (data.length < 1000) break;
}

const byCode = new Map();
for (const row of all) {
  const item = byCode.get(row.normalized_product_code) ?? { rows: [], text: '' };
  item.rows.push(row); item.text += ` ${row.normalized_product_name}`.toLowerCase(); byCode.set(row.normalized_product_code, item);
}
const existing = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('material_category_masters').select('department_id,normalized_product_code,normalized_product_name,material_category,notes').range(from, from + 999);
  if (error) throw error;
  existing.push(...data);
  if (data.length < 1000) break;
}
const existingMap = new Map(existing.map(row => [`${row.department_id}\u0000${row.normalized_product_code}\u0000${row.normalized_product_name}`, row]));
const includes = (text, words) => words.some(word => text.includes(word));
const classify = (code, text) => {
  if (includes(text, ['cad/cam', 'cadcam'])) return 'CADCAM冠';
  if (includes(text, ['emax', 'e-max', 'ｅｍａｘ'])) return 'emax';
  if (includes(text, ['ジルコ', 'katana', 'カタナ', 'wg材料'])) return 'ジルコニア';
  if (code.startsWith('17') || includes(text, ['インプラント', 'implant', 'abutment', 'アバット', 'ｱﾊﾞｯﾄ', 'フィクスチャ', 'ﾌｨｸｽﾁｬ', 'analog', 'アナログ', 'ｱﾅﾛｸﾞ', 'チタンベース', 'ﾁﾀﾝﾍﾞｰｽ'])) return 'インプラント';
  if (includes(text, ['硬質レジン歯', '硬質ﾚｼﾞﾝ歯', '保険レジン歯', '保険ﾚｼﾞﾝ歯'])) return 'デンチャー(保険)';
  if (code.startsWith('15') || includes(text, ['人工歯', 'レジン歯', 'ﾚｼﾞﾝ歯', '陶歯', 'エンデュラ', 'サーパス', 'ベラシア', 'リブデント', 'ゼンオパール', 'e－ha'])) return 'デンチャー(自費)';
  if (code.startsWith('16') || includes(text, ['マグフィット', '磁石', 'キーパー', 'ｷｰﾊﾟｰ', 'マグネット', 'アタッチメント', 'エクスパンションスクリュー', 'ゴシックアーチ', '床材料'])) return 'デンチャー(自費)';
  if (includes(text, ['１２％パラジウム', '12％パラジウム', '銀合金', 'ゼオメタル', 'シルビジウム', 'キャスティングシルバー', 'パラジウム Ⅱ'])) return 'FMC';
  if (code.startsWith('10') && includes(text, ['ｋ', 'k', 'ゴールド', 'プレシャス', 'タイプ'])) return 'その他の自費クラウン';
  return '未分類';
};

const now = new Date().toISOString();
const payload = [];
const summary = {};
for (const [code, item] of byCode) {
  const category = classify(code, item.text);
  summary[category] = (summary[category] ?? 0) + 1;
  for (const row of item.rows) {
    const previous = existingMap.get(`${row.department_id}\u0000${code}\u0000${row.normalized_product_name}`);
    if (previous && previous.material_category !== '未分類' && !String(previous.notes).includes('暫定分類')) continue;
    payload.push({
    department_id: row.department_id, normalized_product_code: code, normalized_product_name: row.normalized_product_name,
    material_category: category, notes: category === '未分類' ? '名称から判定できず・要確認' : '名称・コードによる暫定分類（要確認）',
    is_active: true, updated_at: now,
    });
  }
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', codes: byCode.size, aliases: payload.length, summary }, null, 2));
if (apply) for (let i = 0; i < payload.length; i += 500) {
  const { error } = await supabase.from('material_category_masters').upsert(payload.slice(i, i + 500), { onConflict: 'department_id,normalized_product_code,normalized_product_name' });
  if (error) throw error;
}
