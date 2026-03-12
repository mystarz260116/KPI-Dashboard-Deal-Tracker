import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { similarity } from '../../src/lib/mergeUtils.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data: prospects, error: prospectsError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, name, status, merged_customer_code')
      .neq('status', 'merged');

    if (prospectsError) {
      console.error('generate merge prospects error:', prospectsError);
      return res.status(500).json({ error: 'prospects fetch failed' });
    }

    const { data: customers, error: customersError } = await supabaseAdmin
      .from('customers')
      .select('code, name');

    if (customersError) {
      console.error('generate merge customers error:', customersError);
      return res.status(500).json({ error: 'customers fetch failed' });
    }

    // 既存の候補を取得（rejected を再生成しないため）
    const { data: existingCandidates, error: existingError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .select('prospect_customer_id, customer_code, decision');

    if (existingError) {
      console.error('generate merge existing candidates error:', existingError);
      return res.status(500).json({ error: 'existing candidates fetch failed' });
    }

    const rejectedPairs = new Set(
      (existingCandidates ?? [])
        .filter((c: any) => c.decision === 'rejected')
        .map((c: any) => `${c.prospect_customer_id}::${c.customer_code}`)
    );

    const candidateRows: Array<{
      prospect_customer_id: string;
      customer_code: string;
      match_score: number;
      match_reason: string;
      decision: string;
    }> = [];

    (prospects ?? []).forEach((prospect: any) => {
      const prospectName = prospect.name ?? '';

      (customers ?? []).forEach((customer: any) => {
        const score = similarity(prospectName, customer.name ?? '');
        if (score < 0.6) return;

        const pairKey = `${prospect.id}::${customer.code}`;

        // 過去に rejected された同一ペアは再生成しない
        if (rejectedPairs.has(pairKey)) {
          return;
        }

        candidateRows.push({
          prospect_customer_id: prospect.id,
          customer_code: customer.code,
          match_score: Number(score.toFixed(4)),
          match_reason: 'name_similarity',
          decision: 'pending',
        });
      });
    });

    if (candidateRows.length === 0) {
      return res.status(200).json({ success: true, inserted_count: 0 });
    }

    const { error: insertError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .upsert(candidateRows, {
        onConflict: 'prospect_customer_id,customer_code',
        ignoreDuplicates: false,
      });

    if (insertError) {
      console.error('generate merge insert error:', insertError);
      return res.status(500).json({ error: 'merge candidates insert failed' });
    }

    return res.status(200).json({
      success: true,
      inserted_count: candidateRows.length,
    });
  } catch (error) {
    console.error('generate merge unexpected error:', error);
    return res.status(500).json({ error: 'generate merge candidates api failed' });
  }
}