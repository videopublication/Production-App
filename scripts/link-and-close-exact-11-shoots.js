const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXACT_MATCHES = [
    { shootNumber: 127, ticketKey: 'VP-51531', status: 'CLOSED' },
    { shootNumber: 189, ticketKey: 'VP-52125', status: 'CLOSED' },
    { shootNumber: 292, ticketKey: 'VP-52798', status: 'CLOSED' },
    { shootNumber: 757, ticketKey: 'VP-55008', status: 'CLOSED' },
    { shootNumber: 759, ticketKey: 'VP-55048', status: 'CLOSED' },
    { shootNumber: 760, ticketKey: 'VP-55003', status: 'CLOSED' },
    { shootNumber: 762, ticketKey: 'VP-55053', status: 'CLOSED' },
    { shootNumber: 764, ticketKey: 'VP-54625', status: 'CLOSED' },
    { shootNumber: 765, ticketKey: 'VP-54924', status: 'CLOSED' },
    { shootNumber: 766, ticketKey: 'VP-55052', status: 'CLOSED' },
    { shootNumber: 30,  ticketKey: 'VP-51451', status: 'CLOSED' }
];

async function main() {
    console.log(`Updating ${EXACT_MATCHES.length} exact matching shoots...`);

    let success = 0;
    for (const item of EXACT_MATCHES) {
        if (item.shootNumber === 1171) continue; // Protect test ticket safety rule

        const { data, error } = await supabase
            .from('shoots')
            .update({
                jira_ticket_id: item.ticketKey,
                status: item.status
            })
            .eq('shoot_number', item.shootNumber)
            .select('id, shoot_number, title, jira_ticket_id, status');

        if (error) {
            console.error(`Failed to update Shoot #${item.shootNumber}:`, error);
        } else if (!data || data.length === 0) {
            console.warn(`Warning: Shoot #${item.shootNumber} not found.`);
        } else {
            console.log(`✓ Shoot #${item.shootNumber} ("${data[0].title}") linked to ${item.ticketKey} -> Status: ${item.status}`);
            success++;
        }
    }

    console.log(`\nSuccessfully linked and closed ${success} / ${EXACT_MATCHES.length} shoots.`);
}

main();
