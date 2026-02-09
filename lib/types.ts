export interface Business {
  id: string
  name: string
  description: string | null
  category: string
  is_active: boolean
  preset_amounts?: number[] | null
  pin_code: string | null
  auth_user_id: string | null
  password_hash: string | null
  deleted_at: string | null
  fee_percentage: number
  email: string | null
  phone: string | null
  owner_name: string | null
  username: string | null
  can_add_transactions?: boolean
  created_at: string
  updated_at: string
}

export interface Member {
  id: string
  member_code: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  balance: number
  is_active: boolean
  pin_code: string | null
  card_number: string | null
  card_cvc: string | null
  card_exp_month: string | null
  card_exp_year: string | null
  card_zip: string | null
  card_last_four: string | null
  status: 'active' | 'paused' | 'deleted'
  card_status?: 'active' | 'declined' | 'pending_review'
  approval_status?: 'pending' | 'approved' | 'rejected'
  pause_reason: string | null
  auth_user_id: string | null
  kiosk_message: string | null
  skip_pin: boolean
  is_cash_collector: boolean
  cash_collector_pin: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  // Product interface definition here
}

export interface Transaction {
  id: string
  member_id: string
  business_id: string
  amount: number
  balance_before: number
  balance_after: number
  description: string | null
  source: 'kiosk' | 'business_portal' | 'admin_panel' | 'api' | 'test_data' | 'unknown'
  device_info: Record<string, unknown> | null
  ip_address: string | null
  created_by_user_id: string | null
  created_at: string
  member?: Member
  business?: Business
}

export interface BalanceAdjustment {
  id: string
  member_id: string
  amount: number
  adjustment_type: 'deposit' | 'withdrawal' | 'correction'
  notes: string | null
  admin_user_id: string | null
  balance_before: number
  balance_after: number
  created_at: string
  member?: Member
}

export interface AdminUser {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'staff' | 'manager'
  assigned_business_id: string | null
  created_at: string
  assigned_business?: Business
}



export interface BillingCycle {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'active' | 'closed' | 'invoiced'
  created_at: string
  closed_at: string | null
}

export interface Invoice {
  id: string
  billing_cycle_id: string
  member_id: string
  total_amount: number
  transaction_count: number
  email_sent_to: string | null
  sent_at: string | null
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'paid' | 'paid_cash'
  payment_status?: 'unpaid' | 'paid_cash' | 'card_processed' | 'card_declined'
  email_message: string | null
  created_at: string
  member?: Member
  billing_cycle?: BillingCycle
}

export interface InvoiceEmail {
  id: string
  invoice_id: string
  resend_id: string | null
  event_type: string
  event_data: Record<string, unknown> | null
  created_at: string
}
