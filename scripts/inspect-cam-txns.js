const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function inspectTxns() {
    const itemId = '16a1feab-4a50-4027-a9b0-265c1da346e9';

    const { data: allTxns } = await tgt.from('transactions').select('*').order('timestamp_out', { ascending: false });
    const matchingTxns = allTxns.filter(t => t.items?.includes(itemId));

    console.log(`Found ${matchingTxns.length} transactions containing CAM-FX3-2:`);
    for (const t of matchingTxns.slice(0, 10)) {
        console.log(`\nTransaction: ${t.id} (${t.project})`);
        console.log(`  User: ${t.user_id} | Status: ${t.status}`);
        console.log(`  Out: ${t.timestamp_out}`);
        console.log(`  In:  ${t.timestamp_in}`);

        // Fetch logs for this transaction
        const { data: txnLogs } = await tgt.from('logs').select('*').eq('entity_id', t.id).order('timestamp', { ascending: true });
        console.log(`  Logs (${txnLogs.length}):`);
        txnLogs.forEach(l => {
            console.log(`    [${l.timestamp}] Action: ${l.action} | User: ${l.user_id} | Details: ${l.details}`);
        });
    }
}

inspectTxns().catch(console.error);
