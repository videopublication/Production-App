const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function inspectLogs() {
    const itemId = '16a1feab-4a50-4027-a9b0-265c1da346e9';
    const { data: logs } = await tgt
        .from('logs')
        .select('*')
        .or(`entity_id.eq.${itemId},details.ilike.%CAM-FX3-2%`)
        .gte('timestamp', '2026-08-10T00:00:00Z')
        .order('timestamp', { ascending: false });

    console.log(`Found ${logs.length} logs for CAM-FX3-2 since Aug 10:`);
    logs.forEach((l, i) => {
        console.log(`${i+1}. [${l.timestamp}] ID: ${l.id} | Action: ${l.action} | Entity: ${l.entity_id} | Details: ${l.details}`);
    });
}

inspectLogs().catch(console.error);
