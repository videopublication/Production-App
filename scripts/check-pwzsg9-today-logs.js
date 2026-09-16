const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function checkTodayLogs() {
    const { data: txn } = await supabase.from('transactions').select('*').eq('id', 'TXN-PWZSG9').single();

    // Fetch all logs from 2026-09-16 for these items or this txn
    const { data: logs } = await supabase
        .from('logs')
        .select('*')
        .gte('timestamp', '2026-09-16T00:00:00Z')
        .or(`entity_id.eq.TXN-PWZSG9,details->>transactionId.eq.TXN-PWZSG9`)
        .order('timestamp', { ascending: true });

    console.log(`Found ${logs?.length || 0} txn logs from today:`);
    for (const l of logs || []) {
        console.log(`[${l.timestamp}] Action: ${l.action} | Entity: ${l.entity_id} | Details: ${l.details || JSON.stringify(l.newValue)}`);
    }

    // Now fetch logs for the items themselves from today
    const { data: itemLogs } = await supabase
        .from('logs')
        .select('*')
        .gte('timestamp', '2026-09-16T00:00:00Z')
        .in('entity_id', txn.items)
        .order('timestamp', { ascending: true });

    console.log(`\nFound ${itemLogs?.length || 0} item logs from today:`);
    for (const l of itemLogs || []) {
        console.log(`[${l.timestamp}] Action: ${l.action} | Item: ${l.entity_id} | Details: ${l.details || JSON.stringify(l.newValue)}`);
    }
}

checkTodayLogs().catch(console.error);
