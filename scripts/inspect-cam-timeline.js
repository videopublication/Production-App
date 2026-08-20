const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function timeline() {
    const itemId = '16a1feab-4a50-4027-a9b0-265c1da346e9';
    const { data: logs } = await tgt.from('logs').select('*').gte('timestamp', '2026-08-07T00:00:00Z').order('timestamp', { ascending: false });
    const { data: txns } = await tgt.from('transactions').select('*');
    const relatedTxnIds = new Set(txns.filter(t => t.items?.includes(itemId)).map(t => t.id));

    const itemLogs = logs.filter(l => {
        if (l.entity_id === itemId) return true;
        if (relatedTxnIds.has(l.entity_id)) {
            if (l.action === 'CHECKOUT') return true;
            if (l.details?.includes('CAM-FX3-2')) return true;
        }
        return false;
    });

    console.log(`=== CHRONOLOGICAL LOGS FOR CAM-FX3-2 (Aug 7 - Aug 14) (${itemLogs.length} events) ===\n`);
    itemLogs.forEach((l, i) => {
        const txn = txns.find(t => t.id === l.entity_id);
        const projectName = txn ? txn.project : 'Item Event';
        console.log(`${i+1}. [${l.timestamp}] Action: ${l.action} | Project: ${projectName}\n   -> ${l.details}\n`);
    });
}

timeline().catch(console.error);
