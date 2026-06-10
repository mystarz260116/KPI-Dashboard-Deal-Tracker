import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isAuthorized(req: Request) {
  const expected = Deno.env.get("IREBA_SYNC_API_KEY");
  const actual = req.headers.get("x-api-key");
  return Boolean(expected && actual && expected === actual);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function jp(row: JsonRecord, key: string) {
  return row[key];
}

function text(row: JsonRecord, key: string) {
  const raw = jp(row, key);
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value || null;
}

function integer(row: JsonRecord, key: string, required = false) {
  const raw = jp(row, key);
  const value = Number(raw);
  if (Number.isFinite(value)) return Math.trunc(value);
  if (required) throw new Error(`${key} is required`);
  return null;
}

function number(row: JsonRecord, key: string) {
  const raw = jp(row, key);
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function dateText(row: JsonRecord, key: string, required = false) {
  const value = text(row, key);
  if (value) return value;
  if (required) throw new Error(`${key} is required`);
  return null;
}

async function getBody(req: Request) {
  try {
    return asRecord(await req.json());
  } catch {
    return {};
  }
}

function getArray(body: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) return value.map(asRecord);
  }

  return [];
}

function getHeaderPayload(body: JsonRecord, japaneseKey: string, englishKey: string) {
  const nested = body[japaneseKey] ?? body[englishKey] ?? body.header;
  const record = asRecord(nested);
  return Object.keys(record).length > 0 ? record : body;
}

function normalizeOrderHeader(row: JsonRecord) {
  return {
    internal_code: integer(row, "内部コード", true),
    order_number: text(row, "受注番号"),
    order_date: dateText(row, "受注日", true),
    customer_code: text(row, "得意先コード") ?? "",
    customer_name: text(row, "得意先名"),
    delivery_date: dateText(row, "納品日"),
    set_date: dateText(row, "セット日"),
    set_time: text(row, "セット時間"),
    delivery_type: text(row, "納品タイプ"),
    staff_code: text(row, "担当者コード"),
    patient_name: text(row, "患者名"),
    gender: text(row, "性別"),
    age: text(row, "年齢"),
    color: text(row, "色"),
    work_instruction_1: text(row, "作業指示1"),
    work_instruction_2: text(row, "作業指示2"),
    deposit_item_1: text(row, "預り品1"),
    deposit_item_2: text(row, "預り品2"),
    deposit_item_3: text(row, "預り品3"),
    deposit_item_4: text(row, "預り品4"),
    deposit_item_5: text(row, "預り品5"),
    deposit_item_6: text(row, "預り品6"),
    deposit_item_7: text(row, "預り品7"),
    deposit_item_8: text(row, "預り品8"),
    deposit_item_9: text(row, "預り品9"),
    deposit_item_10: text(row, "預り品10"),
    deposit_item_name: text(row, "預り品名"),
    memo: text(row, "メモ"),
    prosthesis_department_code: text(row, "補綴物部門コード"),
    issued_flag: text(row, "発行済"),
    articulator: text(row, "咬合器"),
    print_flag: text(row, "印刷F"),
    customer_input_code: text(row, "得意先入力コード"),
    deposit_material_processing_code: text(row, "預り材料処理コード"),
    raw_payload: row,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };
}

function normalizeOrderDetail(row: JsonRecord, fallbackInternalCode: number) {
  return {
    internal_code: integer(row, "内部コード") ?? fallbackInternalCode,
    line_no: integer(row, "行No", true),
    detail_type: text(row, "明細区分"),
    prosthesis_code: text(row, "補綴物コード"),
    prosthesis_name: text(row, "補綴物名"),
    quantity: number(row, "数量"),
    unit: text(row, "単位"),
    patient_name: text(row, "患者名"),
    tooth_upper_right: text(row, "歯式右上"),
    tooth_upper_left: text(row, "歯式左上"),
    tooth_lower_left: text(row, "歯式左下"),
    tooth_lower_right: text(row, "歯式右下"),
    technician_code: text(row, "技工士コード"),
    user_input_item_code: text(row, "ユーザー入力項目コード"),
    unit_price: number(row, "単価"),
    amount: number(row, "金額"),
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

function normalizeDeliveryHeader(row: JsonRecord) {
  return {
    internal_code: integer(row, "内部コード", true),
    delivery_date: dateText(row, "納品日", true),
    customer_code: text(row, "得意先コード") ?? "",
    customer_name: text(row, "得意先名"),
    staff_code: text(row, "担当者コード"),
    transaction_type: text(row, "取引区分"),
    closing_date: dateText(row, "締切日"),
    slip_number: text(row, "伝票番号"),
    estimate_number: text(row, "見積番号"),
    summary: text(row, "摘要"),
    tax_transfer: text(row, "税転嫁"),
    technique_total: number(row, "技工計"),
    material_total: number(row, "材料計"),
    external_tax_total: number(row, "外税計"),
    print_flag: text(row, "印刷F"),
    insurance_technique_breakdown: number(row, "内訳技工（保険）"),
    private_technique_breakdown: number(row, "内訳技工（自費）"),
    insurance_material_breakdown: number(row, "内訳材料（保険）"),
    private_material_breakdown: number(row, "内訳材料（自費）"),
    customer_input_code: text(row, "得意先入力用コード"),
    customer_deposit_material_processing_code: text(row, "得意先預り材料処理コード"),
    raw_payload: row,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };
}

function normalizeDeliveryDetail(row: JsonRecord, fallbackInternalCode: number) {
  return {
    internal_code: integer(row, "内部コード") ?? fallbackInternalCode,
    line_no: integer(row, "行No", true),
    order_number: text(row, "受注番号"),
    tooth_upper_right: text(row, "歯式右上"),
    tooth_upper_left: text(row, "歯式左上"),
    tooth_lower_left: text(row, "歯式左下"),
    tooth_lower_right: text(row, "歯式右下"),
    prosthesis_code: text(row, "補綴物コード"),
    prosthesis_name: text(row, "補綴物名"),
    unit: text(row, "単位"),
    detail_type: text(row, "明細区分"),
    quantity: number(row, "数量"),
    unit_price: number(row, "単価"),
    amount: number(row, "金額"),
    remaining_deposit: number(row, "預り残"),
    patient_name: text(row, "患者名"),
    technician_code: text(row, "技工士コード"),
    user_input_item_code: text(row, "ユーザー入力項目コード"),
    lab_record_id: text(row, "技工録ID"),
    order_internal_code: integer(row, "受注内部コード"),
    self_pay_insurance_flag: text(row, "自費保険F"),
    raw_payload: row,
    updated_at: new Date().toISOString(),
  };
}

function getDeleteCodes(body: JsonRecord) {
  const raw = body["内部コード"] ?? body.internal_codes ?? body.codes;
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .map((value) => Math.trunc(value));
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase function secrets are not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function upsertOrder(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = await getBody(req);
  const header = normalizeOrderHeader(getHeaderPayload(body, "受注ID", "order"));
  const details = getArray(body, ["受注明細", "details"]).map((row) =>
    normalizeOrderDetail(row, header.internal_code)
  );

  const { error: headerError } = await supabase
    .from("ireba_order_headers")
    .upsert(header, { onConflict: "internal_code" });

  if (headerError) throw new Error(`order header upsert failed: ${headerError.message}`);

  const { error: deleteError } = await supabase
    .from("ireba_order_details")
    .delete()
    .eq("internal_code", header.internal_code);

  if (deleteError) throw new Error(`order details cleanup failed: ${deleteError.message}`);

  if (details.length > 0) {
    const { error: detailError } = await supabase
      .from("ireba_order_details")
      .insert(details);

    if (detailError) throw new Error(`order details insert failed: ${detailError.message}`);
  }

  return jsonResponse({ success: true, internal_code: header.internal_code, detail_count: details.length });
}

async function upsertDelivery(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = await getBody(req);
  const header = normalizeDeliveryHeader(getHeaderPayload(body, "納品ID", "delivery"));
  const details = getArray(body, ["納品明細", "details"]).map((row) =>
    normalizeDeliveryDetail(row, header.internal_code)
  );

  const { error: headerError } = await supabase
    .from("ireba_delivery_headers")
    .upsert(header, { onConflict: "internal_code" });

  if (headerError) throw new Error(`delivery header upsert failed: ${headerError.message}`);

  const { error: deleteError } = await supabase
    .from("ireba_delivery_details")
    .delete()
    .eq("internal_code", header.internal_code);

  if (deleteError) throw new Error(`delivery details cleanup failed: ${deleteError.message}`);

  if (details.length > 0) {
    const { error: detailError } = await supabase
      .from("ireba_delivery_details")
      .insert(details);

    if (detailError) throw new Error(`delivery details insert failed: ${detailError.message}`);
  }

  return jsonResponse({ success: true, internal_code: header.internal_code, detail_count: details.length });
}

async function deleteOrders(req: Request) {
  const supabase = getSupabaseAdmin();
  const codes = getDeleteCodes(await getBody(req));
  if (codes.length === 0) throw new Error("内部コード is required");

  const { error } = await supabase
    .from("ireba_order_headers")
    .delete()
    .in("internal_code", codes);

  if (error) throw new Error(`order delete failed: ${error.message}`);

  return jsonResponse({ success: true, deleted_internal_codes: codes });
}

async function deleteDeliveries(req: Request) {
  const supabase = getSupabaseAdmin();
  const codes = getDeleteCodes(await getBody(req));
  if (codes.length === 0) throw new Error("内部コード is required");

  const { error } = await supabase
    .from("ireba_delivery_headers")
    .delete()
    .in("internal_code", codes);

  if (error) throw new Error(`delivery delete failed: ${error.message}`);

  return jsonResponse({ success: true, deleted_internal_codes: codes });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const pathname = new URL(req.url).pathname;
    if (pathname.endsWith("/orders/upsert")) return await upsertOrder(req);
    if (pathname.endsWith("/orders/delete")) return await deleteOrders(req);
    if (pathname.endsWith("/deliveries/upsert")) return await upsertDelivery(req);
    if (pathname.endsWith("/deliveries/delete")) return await deleteDeliveries(req);

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("ireba-sync error", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Invalid request",
    }, 400);
  }
});
