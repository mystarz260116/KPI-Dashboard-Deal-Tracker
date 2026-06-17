import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const MAX_BATCH_ITEMS = 500;
const REDACTED_PAYLOAD_KEYS = new Set(["患者名"]);

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

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, nestedValue]) => [
      key,
      REDACTED_PAYLOAD_KEYS.has(key) ? null : redactValue(nestedValue),
    ]),
  );
}

function redactPayload(row: JsonRecord): JsonRecord {
  return redactValue(row) as JsonRecord;
}

function redactPayloadList(rows: JsonRecord[] | null): JsonRecord[] {
  return (rows ?? []).map(redactPayload);
}

function getRequestItems(body: JsonRecord) {
  const rawItems = body.items ?? body["items"] ?? body["データ"];
  if (!Array.isArray(rawItems)) return [body];
  if (rawItems.length === 0) throw new Error("items must not be empty");
  if (rawItems.length > MAX_BATCH_ITEMS) {
    throw new Error(`items must be ${MAX_BATCH_ITEMS} or fewer`);
  }
  return rawItems.map(asRecord);
}

function normalizeOrderHeader(row: JsonRecord) {
  return {
    "内部コード": integer(row, "内部コード", true),
    "受注番号": text(row, "受注番号"),
    "受注日": dateText(row, "受注日", true),
    "得意先コード": text(row, "得意先コード") ?? "",
    "得意先名": text(row, "得意先名"),
    "納品日": dateText(row, "納品日"),
    "セット日": dateText(row, "セット日"),
    "セット時間": text(row, "セット時間"),
    "納品タイプ": text(row, "納品タイプ"),
    "担当者コード": text(row, "担当者コード"),
    "患者名": null,
    "性別": text(row, "性別"),
    "年齢": text(row, "年齢"),
    "色": text(row, "色"),
    "作業指示1": text(row, "作業指示1"),
    "作業指示2": text(row, "作業指示2"),
    "預り品1": text(row, "預り品1"),
    "預り品2": text(row, "預り品2"),
    "預り品3": text(row, "預り品3"),
    "預り品4": text(row, "預り品4"),
    "預り品5": text(row, "預り品5"),
    "預り品6": text(row, "預り品6"),
    "預り品7": text(row, "預り品7"),
    "預り品8": text(row, "預り品8"),
    "預り品9": text(row, "預り品9"),
    "預り品10": text(row, "預り品10"),
    "預り品名": text(row, "預り品名"),
    "メモ": text(row, "メモ"),
    "補綴物部門コード": text(row, "補綴物部門コード"),
    "発行済": text(row, "発行済"),
    "咬合器": text(row, "咬合器"),
    "印刷F": text(row, "印刷F"),
    "得意先入力コード": text(row, "得意先入力コード"),
    "預り材料処理コード": text(row, "預り材料処理コード"),
    raw_payload: redactPayload(row),
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };
}

function normalizeOrderDetail(row: JsonRecord, fallbackInternalCode: number) {
  return {
    "内部コード": integer(row, "内部コード") ?? fallbackInternalCode,
    "行No": integer(row, "行No", true),
    "明細区分": text(row, "明細区分"),
    "補綴物コード": text(row, "補綴物コード"),
    "補綴物名": text(row, "補綴物名"),
    "数量": number(row, "数量"),
    "単位": text(row, "単位"),
    "患者名": null,
    "歯式右上": text(row, "歯式右上"),
    "歯式左上": text(row, "歯式左上"),
    "歯式左下": text(row, "歯式左下"),
    "歯式右下": text(row, "歯式右下"),
    "技工士コード": text(row, "技工士コード"),
    "ユーザー入力項目コード": text(row, "ユーザー入力項目コード"),
    "単価": number(row, "単価"),
    "金額": number(row, "金額"),
    raw_payload: redactPayload(row),
    updated_at: new Date().toISOString(),
  };
}

function normalizeDeliveryHeader(row: JsonRecord) {
  return {
    "内部コード": integer(row, "内部コード", true),
    "納品日": dateText(row, "納品日", true),
    "得意先コード": text(row, "得意先コード") ?? "",
    "得意先名": text(row, "得意先名"),
    "担当者コード": text(row, "担当者コード"),
    "取引区分": text(row, "取引区分"),
    "締切日": dateText(row, "締切日"),
    "伝票番号": text(row, "伝票番号"),
    "見積番号": text(row, "見積番号"),
    "摘要": text(row, "摘要"),
    "税転嫁": text(row, "税転嫁"),
    "技工計": number(row, "技工計"),
    "材料計": number(row, "材料計"),
    "外税計": number(row, "外税計"),
    "印刷F": text(row, "印刷F"),
    "内訳技工（保険）": number(row, "内訳技工（保険）"),
    "内訳技工（自費）": number(row, "内訳技工（自費）"),
    "内訳材料（保険）": number(row, "内訳材料（保険）"),
    "内訳材料（自費）": number(row, "内訳材料（自費）"),
    "得意先入力用コード": text(row, "得意先入力用コード"),
    "得意先預り材料処理コード": text(row, "得意先預り材料処理コード"),
    raw_payload: redactPayload(row),
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };
}

function normalizeDeliveryDetail(row: JsonRecord, fallbackInternalCode: number) {
  return {
    "内部コード": integer(row, "内部コード") ?? fallbackInternalCode,
    "行No": integer(row, "行No", true),
    "受注番号": text(row, "受注番号"),
    "歯式右上": text(row, "歯式右上"),
    "歯式左上": text(row, "歯式左上"),
    "歯式左下": text(row, "歯式左下"),
    "歯式右下": text(row, "歯式右下"),
    "補綴物コード": text(row, "補綴物コード"),
    "補綴物名": text(row, "補綴物名"),
    "単位": text(row, "単位"),
    "明細区分": text(row, "明細区分"),
    "数量": number(row, "数量"),
    "単価": number(row, "単価"),
    "金額": number(row, "金額"),
    "預り残": number(row, "預り残"),
    "患者名": null,
    "技工士コード": text(row, "技工士コード"),
    "ユーザー入力項目コード": text(row, "ユーザー入力項目コード"),
    "技工録ID": text(row, "技工録ID"),
    "受注内部コード": integer(row, "受注内部コード"),
    "自費保険F": text(row, "自費保険F"),
    raw_payload: redactPayload(row),
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

function getSingleInternalCode(body: JsonRecord) {
  const raw = body["内部コード"] ?? body.internal_code ?? body.code;
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isFinite(value)) return Math.trunc(value);
  throw new Error("内部コード is required");
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

async function writeApiLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  payload: {
    endpoint: string;
    operation: string;
    request_mode: string;
    received_count: number;
    success_count: number;
    failed_count: number;
    internal_codes: number[];
    errors: JsonRecord[];
  },
) {
  const { error } = await supabase
    .from("ireba_sync_api_logs")
    .insert(payload);

  if (error) {
    console.error("ireba sync api log insert failed", error);
  }
}

async function upsertOrderItem(supabase: ReturnType<typeof getSupabaseAdmin>, body: JsonRecord) {
  const header = normalizeOrderHeader(getHeaderPayload(body, "受注ID", "order"));
  const details = getArray(body, ["受注明細", "details"]).map((row) =>
    normalizeOrderDetail(row, header["内部コード"])
  );

  const { error: headerError } = await supabase
    .from("ireba_order_headers")
    .upsert(header, { onConflict: "内部コード" });

  if (headerError) throw new Error(`order header upsert failed: ${headerError.message}`);

  const { error: deleteError } = await supabase
    .from("ireba_order_details")
    .delete()
    .eq("内部コード", header["内部コード"]);

  if (deleteError) throw new Error(`order details cleanup failed: ${deleteError.message}`);

  if (details.length > 0) {
    const { error: detailError } = await supabase
      .from("ireba_order_details")
      .insert(details);

    if (detailError) throw new Error(`order details insert failed: ${detailError.message}`);
  }

  return { "内部コード": header["内部コード"] as number, detail_count: details.length };
}

async function upsertDeliveryItem(supabase: ReturnType<typeof getSupabaseAdmin>, body: JsonRecord) {
  const header = normalizeDeliveryHeader(getHeaderPayload(body, "納品ID", "delivery"));
  const details = getArray(body, ["納品明細", "details"]).map((row) =>
    normalizeDeliveryDetail(row, header["内部コード"])
  );

  const { error: headerError } = await supabase
    .from("ireba_delivery_headers")
    .upsert(header, { onConflict: "内部コード" });

  if (headerError) throw new Error(`delivery header upsert failed: ${headerError.message}`);

  const { error: deleteError } = await supabase
    .from("ireba_delivery_details")
    .delete()
    .eq("内部コード", header["内部コード"]);

  if (deleteError) throw new Error(`delivery details cleanup failed: ${deleteError.message}`);

  if (details.length > 0) {
    const { error: detailError } = await supabase
      .from("ireba_delivery_details")
      .insert(details);

    if (detailError) throw new Error(`delivery details insert failed: ${detailError.message}`);
  }

  return { "内部コード": header["内部コード"] as number, detail_count: details.length };
}

async function upsertOrder(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = await getBody(req);
  const items = getRequestItems(body);
  const results: JsonRecord[] = [];
  const errors: JsonRecord[] = [];
  const internalCodes: number[] = [];

  for (let index = 0; index < items.length; index += 1) {
    try {
      const result = await upsertOrderItem(supabase, items[index]);
      results.push({ success: true, index, ...result });
      internalCodes.push(result["内部コード"]);
    } catch (error) {
      errors.push({
        success: false,
        index,
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
  }

  await writeApiLog(supabase, {
    endpoint: "orders/upsert",
    operation: "upsert",
    request_mode: items.length > 1 ? "batch" : "single",
    received_count: items.length,
    success_count: results.length,
    failed_count: errors.length,
    internal_codes: internalCodes,
    errors,
  });

  const success = errors.length === 0;
  return jsonResponse({
    success,
    request_mode: items.length > 1 ? "batch" : "single",
    received_count: items.length,
    success_count: results.length,
    failed_count: errors.length,
    results,
    errors,
  }, success ? 200 : 207);
}

async function upsertDelivery(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = await getBody(req);
  const items = getRequestItems(body);
  const results: JsonRecord[] = [];
  const errors: JsonRecord[] = [];
  const internalCodes: number[] = [];

  for (let index = 0; index < items.length; index += 1) {
    try {
      const result = await upsertDeliveryItem(supabase, items[index]);
      results.push({ success: true, index, ...result });
      internalCodes.push(result["内部コード"]);
    } catch (error) {
      errors.push({
        success: false,
        index,
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
  }

  await writeApiLog(supabase, {
    endpoint: "deliveries/upsert",
    operation: "upsert",
    request_mode: items.length > 1 ? "batch" : "single",
    received_count: items.length,
    success_count: results.length,
    failed_count: errors.length,
    internal_codes: internalCodes,
    errors,
  });

  const success = errors.length === 0;
  return jsonResponse({
    success,
    request_mode: items.length > 1 ? "batch" : "single",
    received_count: items.length,
    success_count: results.length,
    failed_count: errors.length,
    results,
    errors,
  }, success ? 200 : 207);
}

async function deleteOrders(req: Request) {
  const supabase = getSupabaseAdmin();
  const codes = getDeleteCodes(await getBody(req));
  if (codes.length === 0) throw new Error("内部コード is required");

  const { error } = await supabase
    .from("ireba_order_headers")
    .delete()
    .in("内部コード", codes);

  if (error) throw new Error(`order delete failed: ${error.message}`);

  await writeApiLog(supabase, {
    endpoint: "orders/delete",
    operation: "delete",
    request_mode: codes.length > 1 ? "batch" : "single",
    received_count: codes.length,
    success_count: codes.length,
    failed_count: 0,
    internal_codes: codes,
    errors: [],
  });

  return jsonResponse({ success: true, "削除内部コード": codes });
}

async function deleteDeliveries(req: Request) {
  const supabase = getSupabaseAdmin();
  const codes = getDeleteCodes(await getBody(req));
  if (codes.length === 0) throw new Error("内部コード is required");

  const { error } = await supabase
    .from("ireba_delivery_headers")
    .delete()
    .in("内部コード", codes);

  if (error) throw new Error(`delivery delete failed: ${error.message}`);

  await writeApiLog(supabase, {
    endpoint: "deliveries/delete",
    operation: "delete",
    request_mode: codes.length > 1 ? "batch" : "single",
    received_count: codes.length,
    success_count: codes.length,
    failed_count: 0,
    internal_codes: codes,
    errors: [],
  });

  return jsonResponse({ success: true, "削除内部コード": codes });
}

async function checkOrder(req: Request) {
  const supabase = getSupabaseAdmin();
  const code = getSingleInternalCode(await getBody(req));

  const { data: header, error: headerError } = await supabase
    .from("ireba_order_headers")
    .select("*")
    .eq("内部コード", code)
    .maybeSingle();

  if (headerError) throw new Error(`order check failed: ${headerError.message}`);

  if (!header) {
    return jsonResponse({
      success: true,
      exists: false,
      "内部コード": code,
    });
  }

  const { data: details, error: detailsError } = await supabase
    .from("ireba_order_details")
    .select("*")
    .eq("内部コード", code)
    .order("行No");

  if (detailsError) throw new Error(`order details check failed: ${detailsError.message}`);

  return jsonResponse({
    success: true,
    exists: true,
    "内部コード": code,
    "受注ID": redactPayload(header as JsonRecord),
    "受注明細": redactPayloadList(details as JsonRecord[] | null),
  });
}

async function checkDelivery(req: Request) {
  const supabase = getSupabaseAdmin();
  const code = getSingleInternalCode(await getBody(req));

  const { data: header, error: headerError } = await supabase
    .from("ireba_delivery_headers")
    .select("*")
    .eq("内部コード", code)
    .maybeSingle();

  if (headerError) throw new Error(`delivery check failed: ${headerError.message}`);

  if (!header) {
    return jsonResponse({
      success: true,
      exists: false,
      "内部コード": code,
    });
  }

  const { data: details, error: detailsError } = await supabase
    .from("ireba_delivery_details")
    .select("*")
    .eq("内部コード", code)
    .order("行No");

  if (detailsError) throw new Error(`delivery details check failed: ${detailsError.message}`);

  return jsonResponse({
    success: true,
    exists: true,
    "内部コード": code,
    "納品ID": redactPayload(header as JsonRecord),
    "納品明細": redactPayloadList(details as JsonRecord[] | null),
  });
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
    if (pathname.endsWith("/orders/check")) return await checkOrder(req);
    if (pathname.endsWith("/deliveries/upsert")) return await upsertDelivery(req);
    if (pathname.endsWith("/deliveries/delete")) return await deleteDeliveries(req);
    if (pathname.endsWith("/deliveries/check")) return await checkDelivery(req);

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("ireba-sync error", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Invalid request",
    }, 400);
  }
});
