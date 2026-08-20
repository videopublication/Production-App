const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function findOverlappingLogs() {
    console.log('=== CHECKING FOR OUT-OF-ORDER RETURN LOGS ON ACTIVE CHECKOUTS ===\n');

    // 1. Fetch all OPEN transactions
    const { data: openTxns } = await tgt.from('transactions').select('*').eq('status', 'OPEN');
    const { data: allEquip } = await tgt.from('equipment').select('*');

    const equipById = new Map(allEquip.map(e => [e.id, e]));

    for (const txn of openTxns) {
        const txnOutMs = new Date(txn.timestamp_out).getTime();

        for (const itemId of txn.items || []) {
            const item = equipById.get(itemId);
            if (!item) continue;

            // Fetch return logs for this item that occurred AFTER this transaction's timestamp_out
            const { data: lateLogs } = await tgt
                .from('logs')
                .select('*')
                .eq('action', 'RETURN')
                .neq('entity_id', txn.id) // Not this transaction
                .or(`entity_id.eq.${itemId},details.ilike.%${item.barcode}%`)
                .gt('timestamp', txn.timestamp_out);

            if (lateLogs && lateLogs.length > 0) {
                console.log(`⚠️ Item [${item.barcode}] ${item.name} in OPEN txn ${txn.id} (${txn.project}, out: ${txn.timestamp_out}) has ${lateLogs.length} late return log(s):`);
                lateLogs.forEach(l => {
                    console.log(`   -> Log ID: ${l.id} | Time: ${l.timestamp} | Details: ${l.details}`);
                });
            }
        }
    }
}

findOverlappingLogs().catch(console.error);
