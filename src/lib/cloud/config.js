// Supabase project for sign-in and team lesson banks.
// The publishable key is meant to be public — it ships inside the
// app, and row-level security in the database decides what each teacher can
// see. Never put the service_role (secret) key here.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dldsaiujhowpgryxdnxj.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_HlyLQgsb6BiRKNg_0G_K1g_MQPBjYg3';

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
