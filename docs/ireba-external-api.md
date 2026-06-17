# いればくん 外部連携API 仕様案

## 接続方式

Supabase の `service_role key` は共有せず、弊社側で用意する Supabase Edge Function に対して HTTP POST で送信いただく方式です。

認証は専用APIキーをHTTPヘッダーで送信します。

```http
x-api-key: <共有する専用APIキー>
content-type: application/json
```

## エンドポイント

本番URLは以下です。

| 用途 | URL |
| --- | --- |
| 受注 新規登録・更新 | `POST https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync/orders/upsert` |
| 受注 削除 | `POST https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync/orders/delete` |
| 受注 確認 | `POST https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync/orders/check` |
| 納品 新規登録・更新 | `POST https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync/deliveries/upsert` |
| 納品 削除 | `POST https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync/deliveries/delete` |
| 納品 確認 | `POST https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync/deliveries/check` |

## 保存先テーブル

| Excel上の名称 | DBテーブル | 一意キー | 更新方法 |
| --- | --- | --- | --- |
| 受注ID | `ireba_order_headers` | `内部コード` | upsert |
| 受注明細 | `ireba_order_details` | `内部コード` + `行No` | `内部コード` で削除後 insert |
| 納品ID | `ireba_delivery_headers` | `内部コード` | upsert |
| 納品明細 | `ireba_delivery_details` | `内部コード` + `行No` | `内部コード` で削除後 insert |

DBテーブルの業務カラム名は、ファインシステム様のCSV/Excelに記載された `JSONキー` と同じ日本語名にしています。

## 受注 新規登録・更新

`受注ID` と `受注明細` を同時に送信します。

```json
{
  "受注ID": {
    "内部コード": 1001,
    "受注番号": "J-20260610-001",
    "受注日": "2026-06-10",
    "得意先コード": "C001",
    "得意先名": "サンプル歯科",
    "納品日": "2026-06-15",
    "セット日": "2026-06-16",
    "セット時間": "10:00:00",
    "患者名": "山田太郎"
  },
  "受注明細": [
    {
      "内部コード": 1001,
      "行No": 1,
      "明細区分": "技工",
      "補綴物コード": "P001",
      "補綴物名": "クラウン",
      "数量": 1,
      "単位": "本",
      "単価": 10000,
      "金額": 10000
    }
  ]
}
```

処理内容:

1. `受注ID` は `内部コード` で upsert します。
2. `受注明細` は同じ `内部コード` の既存行を削除します。
3. 送信された `受注明細` を insert します。

大量差分を送信する場合もURLは同じです。`items` 配列に複数伝票を入れて送信できます。
1リクエストあたりの上限は500件です。数千〜数万件の差分は、500件以下に分割して複数回送信してください。

```json
{
  "items": [
    {
      "受注ID": {
        "内部コード": 1001,
        "受注番号": "ORD-001",
        "受注日": "2026-06-15",
        "得意先コード": "C001"
      },
      "受注明細": [
        {
          "内部コード": 1001,
          "行No": 1,
          "補綴物コード": "P001"
        }
      ]
    },
    {
      "受注ID": {
        "内部コード": 1002,
        "受注番号": "ORD-002",
        "受注日": "2026-06-15",
        "得意先コード": "C002"
      },
      "受注明細": []
    }
  ]
}
```

## 納品 新規登録・更新

`納品ID` と `納品明細` を同時に送信します。

```json
{
  "納品ID": {
    "内部コード": 2001,
    "納品日": "2026-06-10",
    "得意先コード": "C001",
    "得意先名": "サンプル歯科",
    "担当者コード": "S001",
    "伝票番号": "D-20260610-001",
    "技工計": 10000,
    "材料計": 2000,
    "外税計": 1200
  },
  "納品明細": [
    {
      "内部コード": 2001,
      "行No": 1,
      "受注番号": "J-20260610-001",
      "補綴物コード": "P001",
      "補綴物名": "クラウン",
      "数量": 1,
      "単価": 10000,
      "金額": 10000,
      "受注内部コード": 1001
    }
  ]
}
```

処理内容:

1. `納品ID` は `内部コード` で upsert します。
2. `納品明細` は同じ `内部コード` の既存行を削除します。
3. 送信された `納品明細` を insert します。

大量差分を送信する場合もURLは同じです。`items` 配列に複数伝票を入れて送信できます。
1リクエストあたりの上限は500件です。数千〜数万件の差分は、500件以下に分割して複数回送信してください。

```json
{
  "items": [
    {
      "納品ID": {
        "内部コード": 2001,
        "納品日": "2026-06-15",
        "得意先コード": "C001"
      },
      "納品明細": [
        {
          "内部コード": 2001,
          "行No": 1,
          "補綴物コード": "P001"
        }
      ]
    }
  ]
}
```

## 削除

削除対象の `内部コード` をJSON配列で送信します。
大量削除の場合もURLは同じで、`内部コード` 配列に複数件を指定します。

受注削除:

```json
{
  "内部コード": [1001, 1002, 1003]
}
```

納品削除:

```json
{
  "内部コード": [2001, 2002, 2003]
}
```

削除時はヘッダーテーブルを削除します。明細テーブルは外部キーの cascade により削除されます。

## 登録内容確認

登録・更新・削除後の確認用に、`内部コード` を指定して登録済みデータを取得できます。

受注確認:

```json
{
  "内部コード": 1001
}
```

レスポンス例:

```json
{
  "success": true,
  "exists": true,
  "内部コード": 1001,
  "受注ID": {
    "内部コード": 1001,
    "受注番号": "ORD-001"
  },
  "受注明細": [
    {
      "内部コード": 1001,
      "行No": 1
    }
  ]
}
```

納品確認:

```json
{
  "内部コード": 2001
}
```

レスポンス例:

```json
{
  "success": true,
  "exists": true,
  "内部コード": 2001,
  "納品ID": {
    "内部コード": 2001,
    "納品日": "2026-06-15"
  },
  "納品明細": [
    {
      "内部コード": 2001,
      "行No": 1
    }
  ]
}
```

対象データが存在しない場合:

```json
{
  "success": true,
  "exists": false,
  "内部コード": 1001
}
```

## レスポンス例

新規登録・更新成功:

```json
{
  "success": true,
  "request_mode": "single",
  "received_count": 1,
  "success_count": 1,
  "failed_count": 0,
  "results": [
    {
      "success": true,
      "index": 0,
      "内部コード": 1001,
      "detail_count": 1
    }
  ],
  "errors": []
}
```

バッチ時に一部失敗した場合:

```json
{
  "success": false,
  "request_mode": "batch",
  "received_count": 2,
  "success_count": 1,
  "failed_count": 1,
  "results": [
    {
      "success": true,
      "index": 0,
      "内部コード": 1001,
      "detail_count": 1
    }
  ],
  "errors": [
    {
      "success": false,
      "index": 1,
      "error": "受注日 is required"
    }
  ]
}
```

認証エラー:

```json
{
  "error": "Unauthorized"
}
```

入力エラー:

```json
{
  "error": "内部コード is required"
}
```

## 確認事項

以下についてファインシステム様に確認が必要です。

1. 新規登録・更新時は、上記のようにヘッダーと明細を同一リクエストで送信いただく形で問題ないか。
2. 削除時は、受注削除と納品削除を別エンドポイントで送信いただく形で問題ないか。
3. 日付は `YYYY-MM-DD`、時刻は `HH:MM:SS` 形式で問題ないか。
4. 必須項目が空の場合はAPIエラーとして返す形で問題ないか。
