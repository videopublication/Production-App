const { createClient } = require('@supabase/supabase-js');

const sourceUrl = 'https://esevwmkixggyctwryaov.supabase.co';
const sourceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoy0ODAzNzkxNjhfQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const srcKeyFixed = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXZ3bWtpeGdneWN0d3J5YW92Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDgwMzE2OCwiZXhwIjoyMDgwMzc5MTY4fQ.5qGhWiITrlwX1VIIeCiDsFx7qVsNGry7l8kfjysvreI';

const sourceSupabase = createClient(sourceUrl, srcKeyFixed, { auth: { persistSession: false } });
const targetSupabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function compareVerification() {
    console.log('🔍 Comparing verification data between Source & Target...\n');

    // 1. Transactions with OPEN or pending verification status
    const [{ data: srcTxns }, { data: tgtTxns }] = await Promise.all([
        sourceSupabase.from('transactions').select('*'),
        targetSupabase.from('transactions').select('*')
    ]);

    console.log(`Source transactions count: ${srcTxns ? srcTxns.length : 0}`);
    console.log(`Target transactions count: ${tgtTxns ? tgtTxns.length : 0}`);

    // Check open transactions
    const srcOpen = srcTxns ? srcTxns.filter(t => t.status === 'OPEN') : [];
    const tgtOpen = tgtTxns ? tgtTxns.filter(t => t.status === 'OPEN') : [];

    console.log(`Source OPEN transactions: ${srcOpen.length}`);
    console.log(`Target OPEN transactions: ${tgtOpen.length}`);

    // Check transactions with manual_items or pre/post conditions needing action
    // Find if any transactions exist in source that are missing in target
    const tgtTxnIds = new Set((tgtTxns || []).map(t => t.id));
    const missingTxns = (srcTxns || []).filter(t => !tgtTxnIds.has(t.id));

    console.log(`Missing transactions count in Target: ${missingTxns.length}`);

    if (missingTxns.length > 0) {
        console.log('Sample missing transactions:', missingTxns.slice(0, 5).map(t => ({ id: t.id, project: t.project, status: t.status })));
        
        console.log('⚡ Copying missing transactions to target...');
        const { error: upsertErr } = await targetSupabase.from('transactions').upsert(missingTxns);
        if (upsertErr) {
            console.error('Error upserting missing transactions:', upsertErr.message);
        } else {
            console.log('✅ Missing transactions copied to target!');
        }
    }

    // 2. Compare Equipment items & status
    const [{ data: srcEq }, { data: tgtEq }] = await Promise.all([
        sourceSupabase.from('equipment').select('*'),
        targetSupabase.from('equipment').select('*')
    ]);

    const tgtEqMap = new Map((tgtEq || []).map(e => [e.id, e]));
    let eqDiffCount = 0;

    for (const e of (srcEq || [])) {
        const tgtItem = tgtEqMap.get(e.id);
        if (!tgtItem) {
            eqDiffCount++;
        } else if (tgtItem.status !== e.status || tgtItem.condition !== e.condition) {
            eqDiffCount++;
            // Update target equipment
            await targetSupabase.from('equipment').upsert(e);
        }
    }

    console.log(`Equipment status/condition differences updated: ${eqDiffCount}`);
    console.log('\n🎉 Verification comparison completed!');
}

compareVerification();
