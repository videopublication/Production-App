const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function verifyAllItems() {
    const { data: allTxns } = await tgt.from('transactions').select('*').order('timestamp_out', { ascending: true });
    const { data: allEquip } = await tgt.from('equipment').select('*');
    const { data: allLogs } = await tgt.from('logs').select('*').order('timestamp', { ascending: true });

    let remainingLateLogs = 0;

    for (const item of allEquip) {
        const itemTxns = allTxns.filter(t => t.items?.includes(item.id));
        if (itemTxns.length <= 1) continue;

        itemTxns.sort((a, b) => new Date(a.timestamp_out).getTime() - new Date(b.timestamp_out).getTime());

        for (let i = 0; i < itemTxns.length - 1; i++) {
            const currentTxn = itemTxns[i];
            const nextTxn = itemTxns[i + 1];
            const nextCheckoutTime = new Date(nextTxn.timestamp_out).getTime();
            const itemIdentifiers = [item.id, item.barcode].filter(Boolean);

            const lateLogs = allLogs.filter(l => {
                if (l.action !== 'RETURN' && l.action !== 'VERIFY') return false;
                const logTime = new Date(l.timestamp).getTime();
                if (logTime <= nextCheckoutTime) return false;

                const isCurrentTxnEntity = l.entity_id === currentTxn.id;
                const mentionsItem = itemIdentifiers.some(uid => (l.details || '').includes(uid));
                const mentionsProject = currentTxn.project && (l.details || '').includes(currentTxn.project);

                return isCurrentTxnEntity || (mentionsItem && mentionsProject);
            });

            if (lateLogs.length > 0) {
                remainingLateLogs += lateLogs.length;
                console.log(`Remaining late log for [${item.barcode}]:`, lateLogs.map(l => l.details));
            }
        }
    }

    console.log(`\n=== FINAL AUDIT RESULT ===`);
    console.log(`Total Equipment Items Checked: ${allEquip.length}`);
    console.log(`Total Out-Of-Order Logs Remaining: ${remainingLateLogs}`);
    if (remainingLateLogs === 0) {
        console.log(`✅ 100% of all equipment items have cleanly ordered chronological logs!`);
    }
}

verifyAllItems().catch(console.error);
