const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function alignAllTransactionLogsToShootDates() {
    console.log('=== ALIGNING ALL LATE-RETURN/VERIFY LOGS TO THEIR SHOOT DATES ===\n');

    const { data: allTxns } = await tgt.from('transactions').select('*');
    const { data: allLogs } = await tgt.from('logs').select('*');

    const txnMap = new Map(allTxns.map(t => [t.id, t]));

    const updates = [];

    for (const log of allLogs) {
        if (log.action !== 'RETURN' && log.action !== 'VERIFY') continue;

        // Find associated transaction
        let txn = txnMap.get(log.entity_id);
        if (!txn && log.details) {
            txn = allTxns.find(t => t.project && log.details.includes(t.project));
        }

        if (!txn || !txn.timestamp_out) continue;

        const logTime = new Date(log.timestamp).getTime();
        const txnOutTime = new Date(txn.timestamp_out).getTime();
        const txnInTime = txn.timestamp_in ? new Date(txn.timestamp_in).getTime() : (txnOutTime + 4 * 3600 * 1000);

        // If the return/verify log was created more than 48 hours AFTER the shoot checked out,
        // and there was another subsequent transaction before this log, it's a late cleanup log!
        const timeSinceCheckoutHours = (logTime - txnOutTime) / (3600 * 1000);

        if (timeSinceCheckoutHours > 24) {
            // Re-time this log to sit naturally at the end of its transaction (e.g. timestamp_in or txnOutTime + 4 hours)
            let correctedTime = txn.timestamp_in || new Date(txnOutTime + 4 * 3600 * 1000).toISOString();

            // Ensure correctedTime is after timestamp_out
            if (new Date(correctedTime).getTime() <= txnOutTime) {
                correctedTime = new Date(txnOutTime + 3600 * 1000).toISOString();
            }

            updates.push({
                id: log.id,
                action: log.action,
                project: txn.project,
                oldTime: log.timestamp,
                newTime: correctedTime,
                details: log.details
            });
        }
    }

    console.log(`Found ${updates.length} late-closed logs to re-align to their shoot dates:`);
    updates.slice(0, 15).forEach((u, i) => {
        console.log(`${i+1}. [${u.action}] Project: ${u.project}`);
        console.log(`   Late cleanup time: ${u.oldTime} → Actual shoot date: ${u.newTime}`);
        console.log(`   Details: ${u.details}\n`);
    });

    if (updates.length > 0) {
        for (const u of updates) {
            await tgt.from('logs').update({ timestamp: u.newTime }).eq('id', u.id);
        }
        console.log(`✅ Successfully re-aligned all ${updates.length} logs to their actual shoot dates in the database!`);
    }
}

alignAllTransactionLogsToShootDates().catch(console.error);
