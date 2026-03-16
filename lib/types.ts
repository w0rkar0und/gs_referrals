export type ReferralStatus = 'pending' | 'not_yet_eligible' | 'approved'

export interface Profile {
  id: string
  display_id: string
  is_internal: boolean
  is_admin: boolean
  created_at: string
}

export interface Contractor {
  hr_code: string
  first_name: string
  last_name: string
  is_active: boolean
  last_worked_date: string | null
  synced_at: string
}

export interface Referral {
  id: string
  recruiter_id: string
  recruited_hr_code: string
  recruited_name: string
  start_date: string
  start_date_locked: boolean
  submitted_at: string
  status: ReferralStatus
  working_days_approved: number | null
  working_days_projected: number | null
  working_days_total: number | null
  last_checked_at: string | null
  last_check_snapshot: Record<string, unknown> | null
  approved_at: string | null
  approval_notes: string | null
  query_version: string | null
}

export interface ReferralCheck {
  id: string
  referral_id: string
  checked_at: string
  query_version: string
  start_date_filter: string
  working_days_approved: number
  working_days_projected: number
  working_days_total: number
  threshold_met: boolean
  start_date_discrepancy_flag: boolean
  check_detail: Record<string, unknown>
}

export interface SyncLogEntry {
  id: string
  ran_at: string
  status: 'success' | 'error'
  records_synced: number | null
  error_message: string | null
  triggered_by: 'scheduled' | 'manual'
}

export interface UserApp {
  id: string
  user_id: string
  app_slug: string
  granted_at: string
  granted_by: string | null
}
