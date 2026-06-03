import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import {
  ArrowLeft, Building2, Loader2, LogOut, Search, Users,
} from 'lucide-react';

type ClinicKind = 'customer' | 'prospect';
type SearchFilter = 'all' | ClinicKind;

interface SearchResult {
  id: string;
  kind: ClinicKind;
  name: string;
  subtitle: string;
  status?: string;
  ownDealCount: number;
  lastDealDate?: string;
  nextAction?: string;
}

interface DealSummaryRow {
  deal_date: string;
  next_action: string | null;
  customer_code: string | null;
  prospect_customer_id: string | null;
}

export default function CrmSearch() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const homePath = user?.can_view_dashboard ? '/dashboard' : '/deals/new';
  const homeLabel = user?.can_view_dashboard ? 'ダッシュボード' : '商談入力';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const normalizedQuery = query.trim();

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      if (normalizedQuery.length === 0) {
        setResults([]);
        setError('');
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const customerPromise = filter === 'prospect'
          ? Promise.resolve({ data: [], error: null })
          : supabase
            .from('customers')
            .select('code, name')
            .or(`name.ilike.%${normalizedQuery}%,code.ilike.%${normalizedQuery}%`)
            .order('name', { ascending: true })
            .limit(30);

        let prospectQuery = supabase
          .from('prospect_customers')
          .select('id, name, status')
          .or('status.is.null,status.neq.merged')
          .ilike('name', `%${normalizedQuery}%`)
          .order('name', { ascending: true })
          .limit(30);

        if (!user.can_view_dashboard) {
          prospectQuery = prospectQuery.eq('created_by', user.id);
        }

        const prospectPromise = filter === 'customer'
          ? Promise.resolve({ data: [], error: null })
          : prospectQuery;

        const [customerResult, prospectResult] = await Promise.all([customerPromise, prospectPromise]);

        if (customerResult.error || prospectResult.error) {
          console.error('crm search error:', customerResult.error ?? prospectResult.error);
          setError('検索に失敗しました');
          setResults([]);
          setIsLoading(false);
          return;
        }

        const customerResults: SearchResult[] = (customerResult.data ?? []).map((row: any) => ({
          id: row.code,
          kind: 'customer',
          name: row.name,
          subtitle: `顧客コード: ${row.code}`,
          ownDealCount: 0,
        }));

        const prospectResults: SearchResult[] = (prospectResult.data ?? []).map((row: any) => ({
          id: row.id,
          kind: 'prospect',
          name: row.name,
          subtitle: `見込み顧客ID: ${row.id}`,
          status: row.status ?? undefined,
          ownDealCount: 0,
        }));

        const merged = [...prospectResults, ...customerResults];

        const customerCodes = customerResults.map((row) => row.id);
        const prospectIds = prospectResults.map((row) => row.id);

        const dealQueries: Promise<{ data: DealSummaryRow[] | null; error: any }>[] = [];

        if (customerCodes.length > 0) {
          dealQueries.push(
            (async () => await supabase
              .from('deals')
              .select('deal_date, next_action, customer_code, prospect_customer_id')
              .eq('user_id', user.id)
              .in('customer_code', customerCodes))()
          );
        }

        if (prospectIds.length > 0) {
          dealQueries.push(
            (async () => await supabase
              .from('deals')
              .select('deal_date, next_action, customer_code, prospect_customer_id')
              .eq('user_id', user.id)
              .in('prospect_customer_id', prospectIds))()
          );
        }

        const dealResults = dealQueries.length > 0 ? await Promise.all(dealQueries) : [];
        const dealError = dealResults.find((result) => result.error)?.error;

        if (dealError) {
          console.error('crm search deals error:', dealError);
          setError('商談情報の取得に失敗しました');
          setResults(merged);
          setIsLoading(false);
          return;
        }

        const dealMap = new Map<string, { count: number; lastDealDate?: string; nextAction?: string }>();

        dealResults
          .flatMap((result) => result.data ?? [])
          .forEach((deal) => {
            const kind: ClinicKind = deal.customer_code ? 'customer' : 'prospect';
            const id = deal.customer_code ?? deal.prospect_customer_id;
            if (!id) return;

            const key = `${kind}:${id}`;
            const current = dealMap.get(key);

            if (!current) {
              dealMap.set(key, {
                count: 1,
                lastDealDate: deal.deal_date,
                nextAction: deal.next_action ?? undefined,
              });
              return;
            }

            const nextCount = current.count + 1;
            const shouldReplaceLatest = !current.lastDealDate || deal.deal_date > current.lastDealDate;

            dealMap.set(key, {
              count: nextCount,
              lastDealDate: shouldReplaceLatest ? deal.deal_date : current.lastDealDate,
              nextAction: shouldReplaceLatest ? (deal.next_action ?? undefined) : current.nextAction,
            });
          });

        setResults(merged.map((row) => {
          const dealSummary = dealMap.get(`${row.kind}:${row.id}`);
          return {
            ...row,
            ownDealCount: dealSummary?.count ?? 0,
            lastDealDate: dealSummary?.lastDealDate,
            nextAction: dealSummary?.nextAction,
          };
        }));
      } catch (searchError) {
        console.error('crm search unexpected error:', searchError);
        setError('検索に失敗しました');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [filter, normalizedQuery, user?.id]);

  const groupedSummary = useMemo(() => ({
    total: results.length,
    customers: results.filter((row) => row.kind === 'customer').length,
    prospects: results.filter((row) => row.kind === 'prospect').length,
  }), [results]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(homePath)}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {homeLabel}
          </button>
          <h1 className="text-lg font-bold text-zinc-900">CRM検索</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white hover:text-zinc-700"
            aria-label="ログアウト"
            title="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 text-zinc-700">
            <Users className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-bold">医院検索</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="医院名 / 顧客コードで検索"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>

            <div className="flex gap-2">
              {([
                { value: 'all', label: 'すべて' },
                { value: 'customer', label: '既存' },
                { value: 'prospect', label: '見込み' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    filter === option.value
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span className="rounded-full bg-zinc-100 px-3 py-1">検索結果 {groupedSummary.total}件</span>
            <span className="rounded-full bg-zinc-100 px-3 py-1">既存 {groupedSummary.customers}件</span>
            <span className="rounded-full bg-zinc-100 px-3 py-1">見込み {groupedSummary.prospects}件</span>
          </div>
        </motion.section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
            {error}
          </div>
        )}

        {normalizedQuery.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            医院名または顧客コードを入力すると、CRM検索結果が表示されます。
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-purple-500" />
            検索中です...
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            該当する医院は見つかりませんでした。
          </div>
        ) : (
          <div className="grid gap-4">
            {results.map((result, index) => (
              <motion.button
                key={`${result.kind}:${result.id}`}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => navigate(`/clinics/${result.kind}/${encodeURIComponent(result.id)}`)}
                className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <div className="rounded-full bg-purple-50 p-2 text-purple-600">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <h3 className="text-lg font-bold text-zinc-900">{result.name}</h3>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                        {result.kind === 'customer' ? '既存取引先' : '見込み顧客'}
                      </span>
                      {result.status && (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          {result.status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{result.subtitle}</p>
                  </div>

                  <div className="grid gap-2 text-sm md:min-w-[220px]">
                    <div className="rounded-xl bg-zinc-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">自分の商談件数</p>
                      <p className="mt-1 font-bold text-zinc-900">{result.ownDealCount}件</p>
                    </div>
                    <div className="rounded-xl bg-zinc-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">最終接触日</p>
                      <p className="mt-1 font-semibold text-zinc-800">{result.lastDealDate ?? '未登録'}</p>
                    </div>
                  </div>
                </div>

                {result.nextAction && (
                  <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                    次回アクション: {result.nextAction}
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
