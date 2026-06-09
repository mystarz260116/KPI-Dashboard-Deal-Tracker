import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../../lib/supabaseAdmin.js'
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res)
    if (!profile) return

    const { prospect_customer_id, customer_code } = req.body

    if (!prospect_customer_id || !customer_code) {
      res.status(400).json({
        error: 'prospect_customer_id and customer_code are required'
      })
      return
    }

    const { data: candidate, error: candidateFetchError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .select('prospect_customer_id, customer_code, decision, prospect_customers!inner(created_by)')
      .eq('prospect_customer_id', prospect_customer_id)
      .eq('customer_code', customer_code)
      .eq('decision', 'pending')
      .single()

    if (candidateFetchError || !candidate) {
      console.error('merge reject candidate fetch error:', candidateFetchError)
      res.status(404).json({ error: 'candidate not found or already reviewed' })
      return
    }

    const prospectRow = Array.isArray((candidate as any).prospect_customers)
      ? (candidate as any).prospect_customers[0]
      : (candidate as any).prospect_customers

    if (prospectRow?.created_by !== profile.id) {
      res.status(403).json({ error: 'cannot reject another user merge candidate' })
      return
    }

    const { data, error } = await supabaseAdmin
      .from('customer_merge_candidates')
      .update({
        decision: 'rejected',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('prospect_customer_id', prospect_customer_id)
      .eq('customer_code', customer_code)
      .eq('decision', 'pending')
      .select()

    if (error) {
      console.error('merge reject error:', error)
      res.status(500).json({ error: 'failed to reject merge candidate' })
      return
    }

    if (!data || data.length === 0) {
      res.status(400).json({
        error: 'candidate not found or already reviewed'
      })
      return
    }

    res.status(200).json({
      success: true,
      updated: data?.length ?? 0
    })
  } catch (e) {
    console.error('merge reject handler error:', e)
    res.status(500).json({ error: 'unexpected server error' })
  }
}
