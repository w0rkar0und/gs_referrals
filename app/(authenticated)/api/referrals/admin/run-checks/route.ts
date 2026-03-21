import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

const QUERY_VERSION = 'v1.0'
const THRESHOLD_DAYS = 30

const HALF_DAY_PREFIXES = [
  'NL 1', 'NL 2', 'NL 3',
  'Nursery 1', 'Nursery 2',
  'Nursery L1', 'Nursery L2', 'Nursery L3',
]

function isHalfDay(contractType: string): boolean {
  const ct = contractType.trim()
  return HALF_DAY_PREFIXES.some(prefix => ct.startsWith(prefix))
}

function calcWorkingDays(shiftCount: number, contractType: string): number {
  return isHalfDay(contractType) ? shiftCount * 0.5 : shiftCount
}

interface RawRow {
  HrCode: string
  Name: string
  Year: number
  Week: number
  WeekStart: string
  WeekEnd: string
  Source: string
  ContractType: string
  ShiftCount: number
}

function processRows(rows: RawRow[]) {
  return rows.map(row => {
    const contractType = (row.ContractType || '').trim()
    const shiftCount = Number(row.ShiftCount)
    return {
      source: (row.Source || '').trim(),
      year: Number(row.Year),
      week: Number(row.Week),
      week_start: row.WeekStart,
      week_end: row.WeekEnd,
      contract_type: contractType,
      shift_count: shiftCount,
      working_days: calcWorkingDays(shiftCount, contractType),
    }
  })
}

interface CheckResult {
  hr_code: string
  name: string
  outcome: 'approved' | 'not_yet_eligible' | 'skipped' | 'error'
  working_days_total?: number
  days_remaining?: number
  discrepancy?: boolean
  reason?: string
}

export async function POST(request: NextRequest) {
  // Auth
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  // Validate input
  const { hrCodes } = await request.json()
  if (!Array.isArray(hrCodes) || hrCodes.length === 0 || hrCodes.length > 4) {
    return NextResponse.json({ error: 'Select 1-4 HR codes to check.' }, { status: 400 })
  }

  // Fetch referrals from Supabase
  const { data: referrals } = await serviceClient
    .from('referrals')
    .select('*')
    .in('recruited_hr_code', hrCodes)

  if (!referrals || referrals.length === 0) {
    return NextResponse.json({ error: 'No referrals found for the given HR codes.' }, { status: 404 })
  }

  // Build startDates map and filter out already-approved
  const startDates: Record<string, string> = {}
  const referralMap = new Map<string, typeof referrals[0]>()
  const results: CheckResult[] = []

  for (const ref of referrals) {
    if (ref.status === 'approved') {
      results.push({
        hr_code: ref.recruited_hr_code,
        name: ref.recruited_name,
        outcome: 'skipped',
        reason: `Already approved on ${new Date(ref.approved_at).toLocaleDateString('en-GB')}`,
      })
      continue
    }
    startDates[ref.recruited_hr_code] = ref.start_date
    referralMap.set(ref.recruited_hr_code, ref)
  }

  // Call Railway proxy (only if there are non-approved referrals to check)
  if (referralMap.size > 0) {
    const hrCodesToCheck = Array.from(referralMap.keys())

    let proxyData: {
      currentEpoch: { year: number; week: number }
      results: Record<string, {
        approved?: RawRow[]
        projected?: RawRow[]
        firstRotaDate?: string | null
        error?: string
      }>
    }

    try {
      const proxyRes = await fetch(`${process.env.RAILWAY_PROXY_URL}/report/referral-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Report-Secret': process.env.RAILWAY_PROXY_SECRET!,
        },
        body: JSON.stringify({ hrCodes: hrCodesToCheck, startDates }),
      })

      if (!proxyRes.ok) {
        const err = await proxyRes.json()
        return NextResponse.json({ error: err.error || 'Check query failed.' }, { status: proxyRes.status })
      }

      proxyData = await proxyRes.json()
    } catch {
      return NextResponse.json({ error: 'Failed to connect to report service.' }, { status: 502 })
    }

    // Process each HR code
    const now = new Date().toISOString()

    for (const hrCode of hrCodesToCheck) {
      const referral = referralMap.get(hrCode)!
      const raw = proxyData.results[hrCode]

      if (!raw || raw.error) {
        results.push({
          hr_code: hrCode,
          name: referral.recruited_name,
          outcome: 'error',
          reason: raw?.error || 'No data returned',
        })
        continue
      }

      const part1 = processRows(raw.approved || [])
      const part2 = processRows(raw.projected || [])

      const workingDaysApproved = part1.reduce((sum, r) => sum + r.working_days, 0)
      const workingDaysProjected = part2.reduce((sum, r) => sum + r.working_days, 0)
      const workingDaysTotal = workingDaysApproved + workingDaysProjected
      const thresholdMet = workingDaysTotal >= THRESHOLD_DAYS

      // Discrepancy check
      let startDateDiscrepancyFlag = false
      let startDateDiscrepancyDays = 0
      if (raw.firstRotaDate) {
        const firstRota = new Date(raw.firstRotaDate)
        const startDate = new Date(referral.start_date)
        startDateDiscrepancyDays = Math.abs(
          Math.round((firstRota.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        )
        if (startDateDiscrepancyDays > 7) {
          startDateDiscrepancyFlag = true
        }
      }

      const checkDetail = {
        start_date_filter: referral.start_date,
        query_version: QUERY_VERSION,
        first_rota_date: raw.firstRotaDate || null,
        start_date_discrepancy_days: startDateDiscrepancyDays,
        rows: [...part1, ...part2],
      }

      // Write to referral_checks
      await serviceClient.from('referral_checks').insert({
        referral_id: referral.id,
        checked_at: now,
        query_version: QUERY_VERSION,
        start_date_filter: referral.start_date,
        working_days_approved: workingDaysApproved,
        working_days_projected: workingDaysProjected,
        working_days_total: workingDaysTotal,
        threshold_met: thresholdMet,
        start_date_discrepancy_flag: startDateDiscrepancyFlag,
        check_detail: checkDetail,
      })

      // Update referrals table
      const updateData: Record<string, unknown> = {
        working_days_approved: workingDaysApproved,
        working_days_projected: workingDaysProjected,
        working_days_total: workingDaysTotal,
        last_checked_at: now,
        last_check_snapshot: checkDetail,
        query_version: QUERY_VERSION,
      }

      if (thresholdMet && referral.status !== 'approved') {
        updateData.status = 'approved'
        updateData.approved_at = now
      } else if (!thresholdMet) {
        updateData.status = 'not_yet_eligible'
      }

      await serviceClient.from('referrals').update(updateData).eq('id', referral.id)

      const finalStatus = (updateData.status as string) || referral.status
      results.push({
        hr_code: hrCode,
        name: referral.recruited_name,
        outcome: finalStatus === 'approved' ? 'approved' : 'not_yet_eligible',
        working_days_total: workingDaysTotal,
        days_remaining: Math.max(0, THRESHOLD_DAYS - workingDaysTotal),
        discrepancy: startDateDiscrepancyFlag,
      })
    }
  }

  // Send summary email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const recipients = process.env.NOTIFY_TO_EMAILS!.split(',').map(e => e.trim())

    const approved = results.filter(r => r.outcome === 'approved')
    const notYet = results.filter(r => r.outcome === 'not_yet_eligible')
    const skipped = results.filter(r => r.outcome === 'skipped')
    const errors = results.filter(r => r.outcome === 'error')

    const nowStr = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London',
    })

    let subject = `Referral Check Results — ${dateStr} — ${results.length} checked`
    if (approved.length > 0) subject += `, ${approved.length} approved`

    const lines = [
      `Referral Check Run — ${nowStr}`,
      '='.repeat(50),
      '',
      `Checked: ${results.length}  |  Approved: ${approved.length}  |  Not yet eligible: ${notYet.length}  |  Skipped: ${skipped.length}  |  Errors: ${errors.length}`,
      '',
    ]

    if (approved.length > 0) {
      lines.push('NEWLY APPROVED', '-'.repeat(50))
      for (const r of approved) {
        lines.push(`  ${r.hr_code}  ${r.name.padEnd(30)}  ${r.working_days_total?.toFixed(1)} days`)
      }
      lines.push('')
    }

    if (notYet.length > 0) {
      lines.push('NOT YET ELIGIBLE', '-'.repeat(50))
      for (const r of notYet) {
        lines.push(`  ${r.hr_code}  ${r.name.padEnd(30)}  ${r.working_days_total?.toFixed(1)} days  (${r.days_remaining?.toFixed(1)} remaining)`)
      }
      lines.push('')
    }

    if (skipped.length > 0) {
      lines.push('SKIPPED', '-'.repeat(50))
      for (const r of skipped) {
        lines.push(`  ${r.hr_code}  ${r.name.padEnd(30)}  ${r.reason || ''}`)
      }
      lines.push('')
    }

    if (errors.length > 0) {
      lines.push('ERRORS', '-'.repeat(50))
      for (const r of errors) {
        lines.push(`  ${r.hr_code}  ${r.reason || 'Unknown error'}`)
      }
      lines.push('')
    }

    lines.push('', 'View full details: https://www.gsapps.co/referrals/admin')

    await resend.emails.send({
      from: process.env.NOTIFY_FROM_EMAIL!,
      to: recipients,
      subject,
      text: lines.join('\n'),
    })
  } catch {
    // Email failure should not fail the check
    console.error('Failed to send check summary email')
  }

  return NextResponse.json({ results })
}
