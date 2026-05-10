import { createClient } from '@supabase/supabase-js'

// This looks for the variables in Vercel (production) or your .env (local)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)