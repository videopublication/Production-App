const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function inspectLig() {
    // 1. Find equipment item
    const { data: equip } = await tgt.from('equipment').select('*').or('barcode.eq.LIG-F22C-2,barcode.eq.AMA-VPAF002-1');
    console.log('Equipment found:', equip);

    if (!equip || equip.length === 0) return;
    const item = equip[0];

    // 2. Find transactions
    const { data: txns } = await tgt.from('transactions').select('*');
    const relatedTxns = txns.filter(t => t.items?.includes(item.id));
    console.log(`\nFound ${relatedTxns.length} transactions for item:`);
    relatedTxns.forEach(t => {
        console.log(`Txn ID: ${t.id} | Project: ${t.project} | Status: ${t.status} | Out: ${t.timestamp_out} | In: ${t.timestamp_in} | Conditions:`, t.post_return_conditions);
    });

    // 3. Find logs
    const { data: logs } = await tgt.from('logs').select('*').order('timestamp', { ascending: false });
    const relatedLogs = logs.filter(l => {
        if (l.entity_id === item.id) return true;
        if (relatedTxns.some(t => t.id === l.entity_id)) return true;
        if (l.details && (l.details.includes(item.barcode) || l.details.includes('AMA-VPAF002-1') || l.details.includes('LIG-F22C-2') || l.details.includes(item.id))) return true;
        return false;
    });

    console.log(`\nFound ${relatedLogs.length} logs for item:`);
    relatedLogs.forEach(l => {
        console.log(`[${l.timestamp}] Action: ${l.action} | Entity: ${l.entity_id} | Details: ${l.details}`);
    });
}

inspectLig().catch(console.error);
