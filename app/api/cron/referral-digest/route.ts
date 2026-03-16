import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get referrals submitted today (UTC)
  const today = new Date().toISOString().slice(0, 10)
  const { data: referrals } = await supabase
    .from('referrals')
    .select('recruited_hr_code, recruited_name, start_date, submitted_at, recruiter_id')
    .gte('submitted_at', `${today}T00:00:00Z`)
    .lte('submitted_at', `${today}T23:59:59Z`)
    .order('submitted_at', { ascending: true })

  if (!referrals || referrals.length === 0) {
    return NextResponse.json({ ok: true, message: 'No new referrals today' })
  }

  // Get recruiter display IDs
  const recruiterIds = [...new Set(referrals.map((r) => r.recruiter_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_id')
    .in('id', recruiterIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_id]))

  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London',
  })

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const lines = [
    `New Referrals Digest — ${dateStr}`,
    '='.repeat(50),
    '',
    `${referrals.length} new referral${referrals.length === 1 ? '' : 's'} submitted today.`,
    '',
    ...referrals.map((r) => {
      const recruiter = profileMap.get(r.recruiter_id) ?? '—'
      return `  ${r.recruited_hr_code}  ${r.recruited_name.padEnd(30)}  Start: ${formatDate(r.start_date)}  By: ${recruiter}`
    }),
    '',
    '',
    `Generated: ${now}`,
    'View all referrals: https://www.gsapps.co/referrals/admin',
  ]

  const resend = new Resend(process.env.RESEND_API_KEY)
  const recipients = process.env.NOTIFY_TO_EMAILS!.split(',').map(e => e.trim())

  await resend.emails.send({
    from: process.env.NOTIFY_FROM_EMAIL!,
    to: recipients,
    subject: `New Referrals — ${dateStr} — ${referrals.length} added`,
    text: lines.join('\n'),
  })

  return NextResponse.json({ ok: true, message: `Digest sent: ${referrals.length} referrals` })
}
