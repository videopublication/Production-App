const { Client } = require('pg');

const connectionString = 'postgres://postgres:Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ@db.ltnbkmjeyifjpxvcqpte.supabase.co:5432/postgres';

async function fixLogsRls() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔌 Connecting to Mumbai Supabase Database to fix logs RLS...');
        await client.connect();

        const sql = `
            DROP POLICY IF EXISTS "Allow authenticated write logs" ON public.logs;
            DROP POLICY IF EXISTS "Allow insert logs" ON public.logs;
            
            -- Allow public and anon users to insert activity logs
            CREATE POLICY "Allow insert logs" ON public.logs FOR INSERT WITH CHECK (true);
            
            -- Keep select logs restricted to authenticated users
            DROP POLICY IF EXISTS "Allow authenticated read logs" ON public.logs;
            CREATE POLICY "Allow authenticated read logs" ON public.logs FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
        `;

        await client.query(sql);
        console.log('🎉 Successfully updated logs RLS policy! Unauthenticated activity logging is now allowed.');
    } catch (err) {
        console.error('❌ Error updating RLS:', err.message);
    } finally {
        await client.end();
    }
}

fixLogsRls();
