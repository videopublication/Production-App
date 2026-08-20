const { createClient } = require('@supabase/supabase-js');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const src = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function run() {
    console.log('=== 1. COMPARING DEPARTMENTS ===');
    const { data: srcDepts } = await src.from('departments').select('*');
    const { data: tgtDepts } = await tgt.from('departments').select('*');
    console.log('Source Departments:', JSON.stringify(srcDepts, null, 2));
    console.log('Target Departments:', JSON.stringify(tgtDepts, null, 2));

    console.log('\n=== 2. CHECKING SPECIFIC ITEM CAM-FX3-2 ===');
    const { data: srcItem } = await src.from('equipment').select('*').or('barcode.eq.CAM-FX3-2,id.eq.CAM-FX3-2');
    const { data: tgtItem } = await tgt.from('equipment').select('*').or('barcode.eq.CAM-FX3-2,id.eq.CAM-FX3-2');
    console.log('Source CAM-FX3-2:', srcItem);
    console.log('Target CAM-FX3-2:', tgtItem);

    console.log('\n=== 3. CHECKING TRANSACTIONS WITH CAM-FX3-2 ===');
    const { data: srcTxns } = await src.from('transactions').select('*').order('timestamp_out', { ascending: false }).limit(5);
    const { data: tgtTxns } = await tgt.from('transactions').select('*').order('timestamp_out', { ascending: false }).limit(5);
    console.log('Latest 5 Source Transactions:');
    srcTxns?.forEach(t => console.log(`[SRC] ${t.id} | Status: ${t.status} | Project: ${t.project} | Items: ${t.items?.length} | Additional: ${JSON.stringify(t.additional_users)}`));
    console.log('\nLatest 5 Target Transactions:');
    tgtTxns?.forEach(t => console.log(`[TGT] ${t.id} | Status: ${t.status} | Project: ${t.project} | Items: ${t.items?.length} | Additional: ${JSON.stringify(t.additional_users)}`));

    console.log('\n=== 4. CHECKING ITEM STATUS MISMATCHES IN TARGET DB ===');
    const { data: allTgtTxns } = await tgt.from('transactions').select('*').eq('status', 'OPEN');
    const { data: allTgtEquip } = await tgt.from('equipment').select('*');

    const openTxnItemMap = new Map();
    allTgtTxns?.forEach(t => {
        t.items?.forEach(itemId => {
            openTxnItemMap.set(itemId, { txnId: t.id, project: t.project, user: t.user_id });
        });
    });

    const mismatches = [];
    allTgtEquip?.forEach(e => {
        const inOpenTxn = openTxnItemMap.get(e.id);
        if (inOpenTxn && e.status !== 'CHECKED_OUT') {
            mismatches.push({
                id: e.id,
                name: e.name,
                barcode: e.barcode,
                currentStatus: e.status,
                inTxn: inOpenTxn.txnId,
                project: inOpenTxn.project
            });
        }
    });
    console.log(`Found ${mismatches.length} items in OPEN transactions but NOT marked CHECKED_OUT in Target DB:`);
    console.log(JSON.stringify(mismatches, null, 2));
}

run().catch(console.error);
