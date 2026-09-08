const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, start_time, location, poc_name, description, status')
        .eq('status', 'CONFIRMED')
        .is('jira_ticket_id', null)
        .order('shoot_number', { ascending: true });

    if (error) {
        console.error('Error fetching shoots:', error);
        return;
    }

    console.log(`Found ${shoots.length} CONFIRMED shoots without Jira Ticket:\n`);
    
    // Group by month/category
    shoots.forEach(s => {
        const d = s.start_time ? s.start_time.split('T')[0] : 'No Date';
        console.log(`[#${s.shoot_number || '-'}] ${d} | "${s.title}" | POC: ${s.poc_name || '-'} | Loc: ${s.location || '-'} | Desc: ${s.description || '-'}`);
    });
}

main();
