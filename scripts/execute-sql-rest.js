const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function executeSql() {
    console.log('⚡ Attempting SQL execution via Supabase API...');

    const sql = `
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS can_self_edit_profile BOOLEAN DEFAULT TRUE;
        
        CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    // Try Supabase Management API SQL endpoint or REST query
    const res = await fetch(`${supabaseUrl}/rest/v1/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: sql })
    });

    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
}

executeSql();
