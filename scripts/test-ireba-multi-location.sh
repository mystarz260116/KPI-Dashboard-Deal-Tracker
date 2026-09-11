#!/usr/bin/env bash

set -u

BASE_URL="https://xgsusqvtjqwyhfcrssbg.supabase.co/functions/v1/ireba-sync"
TEST_INTERNAL_CODE="9000000000000000000"
INVALID_KEY="intentionally-invalid-ireba-test-key"
FAILURES=0

read_secret() {
  local prompt="$1"
  local variable_name="$2"
  local value

  printf "%s" "$prompt"
  IFS= read -r -s value
  printf "\n"

  if [[ -z "$value" ]]; then
    printf "APIキーが空です。テストを中止します。\n" >&2
    exit 1
  fi

  printf -v "$variable_name" "%s" "$value"
}

request_status() {
  local url="$1"
  local api_key="$2"

  curl \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out "%{http_code}" \
    --request POST \
    --header "content-type: application/json" \
    --header "x-api-key: ${api_key}" \
    --data "{\"内部コード\":${TEST_INTERNAL_CODE}}" \
    "$url"
}

assert_status() {
  local label="$1"
  local expected="$2"
  local url="$3"
  local api_key="$4"
  local actual

  if ! actual="$(request_status "$url" "$api_key")"; then
    printf "NG  %-42s 通信エラー\n" "$label"
    FAILURES=$((FAILURES + 1))
    return
  fi

  if [[ "$actual" == "$expected" ]]; then
    printf "OK  %-42s HTTP %s\n" "$label" "$actual"
  else
    printf "NG  %-42s HTTP %s（期待値: %s）\n" "$label" "$actual" "$expected"
    FAILURES=$((FAILURES + 1))
  fi
}

printf "入れ歯くん3拠点API 読み取り専用テスト\n"
printf "APIキーは入力中も結果にも表示されず、ファイルにも保存されません。\n\n"

read_secret "大阪APIキー: " OSAKA_KEY
read_secret "東京APIキー: " TOKYO_KEY
read_secret "福岡APIキー: " FUKUOKA_KEY

printf "\n正常認証テスト\n"
assert_status "大阪 / 受注確認" "200" "${BASE_URL}/osaka/orders/check" "$OSAKA_KEY"
assert_status "大阪 / 納品確認" "200" "${BASE_URL}/osaka/deliveries/check" "$OSAKA_KEY"
assert_status "東京 / 受注確認" "200" "${BASE_URL}/tokyo/orders/check" "$TOKYO_KEY"
assert_status "東京 / 納品確認" "200" "${BASE_URL}/tokyo/deliveries/check" "$TOKYO_KEY"
assert_status "福岡 / 受注確認" "200" "${BASE_URL}/fukuoka/orders/check" "$FUKUOKA_KEY"
assert_status "福岡 / 納品確認" "200" "${BASE_URL}/fukuoka/deliveries/check" "$FUKUOKA_KEY"

printf "\n不正キー拒否テスト\n"
assert_status "大阪 / 不正キー" "401" "${BASE_URL}/osaka/orders/check" "$INVALID_KEY"
assert_status "東京 / 不正キー" "401" "${BASE_URL}/tokyo/orders/check" "$INVALID_KEY"
assert_status "福岡 / 不正キー" "401" "${BASE_URL}/fukuoka/orders/check" "$INVALID_KEY"

printf "\n拠点間キー混用拒否テスト\n"
assert_status "大阪URL + 東京キー" "401" "${BASE_URL}/osaka/orders/check" "$TOKYO_KEY"
assert_status "東京URL + 福岡キー" "401" "${BASE_URL}/tokyo/orders/check" "$FUKUOKA_KEY"
assert_status "福岡URL + 大阪キー" "401" "${BASE_URL}/fukuoka/orders/check" "$OSAKA_KEY"

printf "\n旧URL停止テスト\n"
assert_status "旧URL + 大阪キー" "401" "${BASE_URL}/orders/check" "$OSAKA_KEY"

unset OSAKA_KEY TOKYO_KEY FUKUOKA_KEY

printf "\n"
if [[ "$FAILURES" -eq 0 ]]; then
  printf "全テスト成功（13/13）\n"
  exit 0
fi

printf "%s件のテストが失敗しました。\n" "$FAILURES" >&2
exit 1
