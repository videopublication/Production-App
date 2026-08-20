const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function reconcile() {
    console.log('=== RECONCILING OPEN TRANSACTIONS WITH EQUIPMENT STATUS ===\n');

    // 1. Fetch all OPEN transactions
    const { data: openTxns, error: txnErr } = await tgt
        .from('transactions')
        .select('*')
        .eq('status', 'OPEN');

    if (txnErr) throw txnErr;
    console.log(`Found ${openTxns.length} OPEN transactions.`);

    // 2. Fetch all equipment
    const { data: allEquip, error: eqErr } = await tgt
        .from('equipment')
        .select('*');

    if (eqErr) throw eqErr;

    const equipById = new Map(allEquip.map(e => [e.id, e]));

    // 3. Collect all items that should be CHECKED_OUT
    const itemsToUpdate = [];

    for (const txn of openTxns) {
        if (!txn.items || txn.items.length === 0) continue;

        for (const itemId of txn.items) {
            const item = equipById.get(itemId);
            if (!item) {
                console.warn(`⚠️ Item ${itemId} in transaction ${txn.id} (${txn.project}) not found in equipment table!`);
                continue;
            }

            if (item.status !== 'CHECKED_OUT') {
                itemsToUpdate.push({
                    itemId: item.id,
                    name: item.name,
                    barcode: item.barcode,
                    oldStatus: item.status,
                    newStatus: 'CHECKED_OUT',
                    assignedTo: txn.user_id,
                    txnId: txn.id,
                    project: txn.project,
                    timestampOut: txn.timestamp_out
                });
            }
        }
    }

    console.log(`Found ${itemsToUpdate.length} items that need status correction:`);
    itemsToUpdate.forEach((it, idx) => {
        console.log(`${idx + 1}. [${it.barcode || it.itemId}] ${it.name} | Status: ${it.oldStatus} -> ${it.newStatus} | In Txn: ${it.txnId} (${it.project})`);
    });

    if (itemsToUpdate.length > 0) {
        console.log('\nApplying updates to equipment table...');
        for (const it of itemsToUpdate) {
            const { error: updateErr } = await tgt
                .from('equipment')
                .update({
                    status: 'CHECKED_OUT',
                    assigned_to: it.assignedTo,
                    last_activity: it.timestampOut || new Date().toISOString()
                })
                .eq('id', it.itemId);

            if (updateErr) {
                console.error(`❌ Failed to update ${it.name} (${it.barcode}):`, updateErr.message);
            } else {
                console.log(`✅ Updated ${it.name} (${it.barcode}) -> CHECKED_OUT`);
            }
        }
    }

    console.log('\n=== RECONCILIATION COMPLETE ===');
}

reconcile().catch(console.error);
