/**
 * Cliente Supabase server-side (service_role)
 * Usado apenas no backend — NUNCA exponha a service_role key no frontend.
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('🔴 SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no .env do backend');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = supabase;
