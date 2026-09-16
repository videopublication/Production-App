const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
    console.log('Querying transaction TXN-PWZSG9...');
    // Look up transaction by id or txn_id or display_id
    const { data: txns, error: txnErr } = await supabase
        .from('transactions')
        .select('*')
        .or('id.eq.TXN-PWZSG9,id.ilike.%PWZSG9%');

    if (txnErr) {
        console.error('Error fetching txn:', txnErr);
        return;
    }

    console.log(`Found ${txns?.length || 0} transactions:`);
    if (!txns || txns.length === 0) {
        // try searching in shoots or search all recent transactions
        const { data: recentTxns } = await supabase
            .from('transactions')
            .select('id, project, status, items, return_date, created_at')
            .order('created_at', { ascending: false })
            .limit(10);
        console.log('Recent transactions:', recentTxns);
        return;
    }

    for (const txn of txns) {
        console.log('\n=============================');
        console.log('TXN ID:', txn.id);
        console.log('Status:', txn.status);
        console.log('Project:', txn.project);
        console.log('Created By:', txn.created_by);
        console.log('Assigned To / Crew:', txn.assigned_to, txn.crew);
        console.log('Items Count:', txn.items?.length);
        console.log('Items:', txn.items);
        console.log('Post Return Conditions:', txn.post_return_conditions);
        console.log('Metadata:', txn.metadata);

        // Fetch logs for this transaction
        const { data: logs } = await supabase
            .from('logs')
            .select('*')
            .or(`entity_id.eq.${txn.id},details->>transactionId.eq.${txn.id}`)
            .order('timestamp', { ascending: true });
        console.log(`\nFound ${logs?.length || 0} logs for txn ${txn.id}:`);
        for (const log of logs || []) {
            console.log(`[${log.timestamp}] Action: ${log.action} | User: ${log.user_name || log.user_id} | Msg: ${log.message || log.details?.message}`);
        }

        // Fetch equipment items in this transaction
        if (txn.items && txn.items.length > 0) {
            const { data: equipList } = await supabase
                .from('equipment')
                .select('id, barcode, name, status, assigned_to, location')
                .in('id', txn.items);
            
            console.log(`\nEquipment status for ${equipList?.length || 0} items:`);
            for (const eq of equipList || []) {
                console.log(`- ${eq.name} (${eq.barcode}) [ID: ${eq.id}]: Status = ${eq.status}, AssignedTo = ${eq.assigned_to}, Loc = ${eq.location}`);
            }
        }
    }
}

main().catch(console.error);
