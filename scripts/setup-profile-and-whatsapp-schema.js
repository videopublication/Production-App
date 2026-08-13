const { Client } = require('pg');

const targetConn = 'postgres://postgres.ltnbkmjeyifjpxvcqpte:5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

async function setupSchema() {
    const client = new Client({ connectionString: targetConn, ssl: { rejectUnauthorized: false } });

    try {
        console.log('🔌 Connecting to Mumbai Supabase Database via pooler...');
        await client.connect();
        console.log('✅ Connected successfully!');

        console.log('⚡ Adding phone & can_self_edit_profile columns to public.users...');
        await client.query(`
            ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
            ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
            ALTER TABLE public.users ADD COLUMN IF NOT EXISTS can_self_edit_profile BOOLEAN DEFAULT TRUE;
        `);
        console.log('✅ Columns added to public.users!');

        console.log('⚡ Creating whatsapp_sessions table for 24/7 session persistence...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✅ Created public.whatsapp_sessions table!');

        console.log('🎉 Database Schema Migration Completed Successfully!');
    } catch (err) {
        console.error('❌ Error setting up schema:', err.message);
    } finally {
        await client.end();
    }
}

setupSchema();
