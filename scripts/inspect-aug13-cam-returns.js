const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function inspectAug13ItemReturns() {
    const { data: logs } = await tgt
        .from('logs')
        .select('*')
        .ilike('details', '%CAM-FX3-2%')
        .gte('timestamp', '2026-08-13T00:00:00Z')
        .order('timestamp', { ascending: true });

    console.log(`Found ${logs?.length || 0} logs for CAM-FX3-2 on Aug 13:`);
    logs?.forEach(l => {
        console.log(`ID: ${l.id} | Action: ${l.action} | Time: ${l.timestamp} | Details: ${l.details}`);
    });
}

inspectAug13ItemReturns().catch(console.error);
