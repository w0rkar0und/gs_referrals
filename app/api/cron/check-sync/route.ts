import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if sync ran today (UTC)
  const today = new Date().toISOString().slice(0, 10)
  const { data: syncRows } = await supabase
    .from('sync_log')
    .select('id')
    .eq('status', 'success')
    .gte('ran_at', `${today}T00:00:00Z`)
    .lte('ran_at', `${today}T23:59:59Z`)
    .limit(1)

  if (syncRows && syncRows.length > 0) {
    return NextResponse.json({ ok: true, message: 'Sync ran today' })
  }

  // Sync did not run — send alert email
  const resend = new Resend(process.env.RESEND_API_KEY)
  const recipients = process.env.NOTIFY_TO_EMAILS!.split(',').map(e => e.trim())
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })

  await resend.emails.send({
    from: process.env.NOTIFY_FROM_EMAIL!,
    to: recipients,
    subject: '⚠️ Greythorn Contractor Sync Did Not Run — Manual Action Required',
    text: [
      'The daily Greythorn contractor sync did not run at 11:00 AM today.',
      '',
      `Date/time of this check: ${now}`,
      '',
      'The contractors table may be up to 24 hours stale. Please run the sync manually',
      'from any machine with Greythorn network access:',
      '',
      '  python scripts/contractor_sync.py',
      '',
      'If the self-hosted runner is offline, check that the work PC is powered on and',
      'the GitHub Actions runner service is running.',
    ].join('\n'),
  })

  return NextResponse.json({ ok: true, message: 'Alert sent' })
}
