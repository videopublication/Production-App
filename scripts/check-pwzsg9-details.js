const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function checkDetails() {
    const { data: txn } = await supabase.from('transactions').select('*').eq('id', 'TXN-PWZSG9').single();
    console.log('Transaction details:');
    console.log('ID:', txn.id);
    console.log('Department ID:', txn.department_id);
    console.log('Post return conditions keys count:', Object.keys(txn.post_return_conditions || {}).length);
    console.log('Post return conditions keys:', Object.keys(txn.post_return_conditions || {}));

    // Fetch all logs where entity_id is TXN-PWZSG9 or one of its items
    const { data: itemLogs } = await supabase
        .from('logs')
        .select('*')
        .in('entity_id', txn.items)
        .order('timestamp', { ascending: false });

    console.log(`\nTotal item logs: ${itemLogs?.length || 0}`);
    for (const l of itemLogs || []) {
        console.log(`[${l.timestamp}] Entity: ${l.entity_id} | Action: ${l.action} | User: ${l.user_name || l.user_id} | Details: ${l.details}`);
    }

    // Check verification_queue or verification items if such table exists
    const { data: depts } = await supabase.from('departments').select('*');
    console.log('\nDepartments verification settings:');
    for (const d of depts || []) {
        console.log(`Dept ${d.id} (${d.name}): return_verification_mode = ${d.return_verification_mode}, data_assets = ${d.data_assets_enabled}`);
    }
}

checkDetails().catch(console.error);
