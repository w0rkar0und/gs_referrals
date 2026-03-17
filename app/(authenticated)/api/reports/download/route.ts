import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { generateDepositExcel } from '@/lib/excel-deposit'
import { generateWorkingDaysExcel } from '@/lib/excel-working-days'
import { generateWorkingDaysByClientExcel } from '@/lib/excel-working-days-by-client'
import { generateSettlementExcel } from '@/lib/excel-settlement'

export async function POST(request: NextRequest) {
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

  const [{ data: profile }, { data: access }] = await Promise.all([
    serviceClient.from('profiles').select('is_admin').eq('id', user.id).single(),
    serviceClient.from('user_apps').select('id, permissions').eq('user_id', user.id).eq('app_slug', 'reports').limit(1),
  ])

  if (!profile?.is_admin && (!access || access.length === 0)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { reportType, reportData } = await request.json()

  if (!reportType || !reportData) {
    return NextResponse.json({ error: 'reportType and reportData are required.' }, { status: 400 })
  }

  // Check report-level permission
  if (!profile?.is_admin) {
    const perms = access![0].permissions as Record<string, boolean> | null
    if (!perms?.[reportType]) {
      return NextResponse.json({ error: 'You do not have access to this report type.' }, { status: 403 })
    }
  }

  try {
    let buffer: Buffer
    let filename: string
    const hrCode = reportData.contractor?.HrCode ?? 'unknown'
    const date = new Date().toISOString().slice(0, 10)

    if (reportType === 'deposit') {
      buffer = await generateDepositExcel(reportData)
      filename = `Deposit_Report_${hrCode}_${date}.xlsx`
    } else if (reportType === 'working-days') {
      buffer = await generateWorkingDaysExcel(reportData)
      filename = `Working_Days_${hrCode}_${date}.xlsx`
    } else if (reportType === 'working-days-by-client') {
      buffer = await generateWorkingDaysByClientExcel(reportData)
      const epoch = reportData.targetEpoch
      filename = `Working_Days_by_Client_Wk${epoch?.week ?? 0}_${epoch?.year ?? 0}_${date}.xlsx`
    } else if (reportType === 'settlement') {
      buffer = await generateSettlementExcel(reportData)
      filename = `Settlement_Data_${hrCode}_${date}.xlsx`
    } else {
      return NextResponse.json({ error: 'Unknown report type.' }, { status: 400 })
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Excel generation error:', err)
    return NextResponse.json({ error: 'Failed to generate Excel file.' }, { status: 500 })
  }
}
