const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function scanAndFixOutOfOrderLogs() {
    console.log('=== SCANNING ALL OUT-OF-ORDER VERIFICATION & RETURN LOGS ===\n');

    // 1. Fetch all transactions ordered by timestamp_out asc
    const { data: allTxns } = await tgt.from('transactions').select('*').order('timestamp_out', { ascending: true });
    const { data: allEquip } = await tgt.from('equipment').select('*');
    const { data: allLogs } = await tgt.from('logs').select('*').order('timestamp', { ascending: true });

    const equipMap = new Map(allEquip.map(e => [e.id, e]));

    // Map logs by entity_id and by barcode/id
    const outOfOrderUpdates = [];

    // For each equipment item, find its sequence of transactions
    for (const item of allEquip) {
        const itemTxns = allTxns.filter(t => t.items?.includes(item.id));
        if (itemTxns.length <= 1) continue;

        // Sort transactions chronologically
        itemTxns.sort((a, b) => new Date(a.timestamp_out).getTime() - new Date(b.timestamp_out).getTime());

        for (let i = 0; i < itemTxns.length - 1; i++) {
            const currentTxn = itemTxns[i];
            const nextTxn = itemTxns[i + 1];

            const nextCheckoutTime = new Date(nextTxn.timestamp_out).getTime();

            // Find any RETURN or VERIFY logs belonging to currentTxn that are stamped AFTER nextTxn.timestamp_out
            const itemIdentifiers = [item.id, item.barcode].filter(Boolean);

            const lateLogs = allLogs.filter(l => {
                if (l.action !== 'RETURN' && l.action !== 'VERIFY') return false;
                const logTime = new Date(l.timestamp).getTime();
                if (logTime <= nextCheckoutTime) return false; // Not late

                // Is it for currentTxn?
                const isCurrentTxnEntity = l.entity_id === currentTxn.id;
                const mentionsItem = itemIdentifiers.some(uid => (l.details || '').includes(uid));
                const mentionsProject = currentTxn.project && (l.details || '').includes(currentTxn.project);

                return isCurrentTxnEntity || (mentionsItem && mentionsProject);
            });

            for (const log of lateLogs) {
                // Correct timestamp to be just before nextCheckoutTime (or currentTxn timestamp_in if valid)
                const correctedTimeMs = nextCheckoutTime - 60000; // 1 minute before next checkout
                const correctedIso = new Date(correctedTimeMs).toISOString();

                outOfOrderUpdates.push({
                    id: log.id,
                    oldTime: log.timestamp,
                    newTime: correctedIso,
                    itemBarcode: item.barcode,
                    project: currentTxn.project,
                    nextProject: nextTxn.project,
                    details: log.details
                });
            }
        }
    }

    console.log(`Found ${outOfOrderUpdates.length} out-of-order historical logs to fix:`);
    outOfOrderUpdates.forEach((u, idx) => {
        console.log(`${idx+1}. [${u.itemBarcode}] Log ID: ${u.id}`);
        console.log(`   From: ${u.project} (Late: ${u.oldTime}) → Before Next Checkout: ${u.nextProject} (${u.newTime})`);
        console.log(`   Details: ${u.details}\n`);
    });

    if (outOfOrderUpdates.length > 0) {
        for (const update of outOfOrderUpdates) {
            await tgt.from('logs').update({ timestamp: update.newTime }).eq('id', update.id);
        }
        console.log(`✅ Successfully corrected all ${outOfOrderUpdates.length} out-of-order log timestamps in the database!`);
    }
}

scanAndFixOutOfOrderLogs().catch(console.error);
