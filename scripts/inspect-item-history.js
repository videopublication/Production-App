const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function check() {
    const itemId = '16a1feab-4a50-4027-a9b0-265c1da346e9';
    const { data: logs } = await tgt
        .from('logs')
        .select('*')
        .or(`entity_id.eq.${itemId},details.ilike.%CAM-FX3-2%`)
        .order('timestamp', { ascending: false })
        .limit(10);

    console.log('Recent 10 logs for CAM-FX3-2:');
    logs?.forEach((l, i) => {
        console.log(`${i+1}. [${l.timestamp}] Action: ${l.action} | User: ${l.user_id} | Details: ${l.details}`);
    });

    console.log('\nAll transactions containing this item:');
    const { data: allTxns } = await tgt.from('transactions').select('*');
    const matchingTxns = allTxns?.filter(t => t.items?.includes(itemId)) || [];
    matchingTxns.forEach(t => {
        console.log(`- ${t.id} (${t.project}) | Status: ${t.status} | Out: ${t.timestamp_out} | In: ${t.timestamp_in}`);
    });
}

check().catch(console.error);
