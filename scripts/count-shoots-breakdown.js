const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, jira_ticket_id, status, department_id')
        .order('shoot_number', { ascending: true });

    if (error) {
        console.error('Error fetching shoots:', error);
        return;
    }

    console.log(`Total Shoots in Database: ${shoots.length}`);

    const statusCounts = {};
    shoots.forEach(s => {
        statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });

    console.log('\n--- STATUS BREAKDOWN ---');
    console.table(statusCounts);

    const unlinked = shoots.filter(s => !s.jira_ticket_id || s.jira_ticket_id.trim() === '');
    console.log(`\nTotal Shoots with NO Jira Ticket (jira_ticket_id is NULL/empty): ${unlinked.length}`);

    const unlinkedStatusCounts = {};
    unlinked.forEach(s => {
        unlinkedStatusCounts[s.status] = (unlinkedStatusCounts[s.status] || 0) + 1;
    });

    console.log('\n--- UNLINKED SHOOTS BY STATUS ---');
    console.table(unlinkedStatusCounts);

    const confirmedShoots = shoots.filter(s => s.status === 'CONFIRMED');
    console.log(`\nTotal CONFIRMED Shoots: ${confirmedShoots.length}`);

    const confirmedUnlinked = confirmedShoots.filter(s => !s.jira_ticket_id || s.jira_ticket_id.trim() === '');
    console.log(`CONFIRMED Shoots WITHOUT Jira Ticket: ${confirmedUnlinked.length}`);
    const confirmedLinked = confirmedShoots.filter(s => s.jira_ticket_id && s.jira_ticket_id.trim() !== '');
    console.log(`CONFIRMED Shoots WITH Jira Ticket: ${confirmedLinked.length}`);
}

main();
