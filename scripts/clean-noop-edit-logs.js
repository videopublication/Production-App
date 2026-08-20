const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function cleanRedundantEditLogs() {
    console.log('=== CLEANING NO-OP BULK EDIT LOGS ===\n');

    // Find logs with details like 'Bulk edit "Sony" (CAM-FX3-2): name→"Sony", model→"Fx3"'
    const { data: editLogs } = await tgt
        .from('logs')
        .select('*')
        .eq('action', 'EDIT')
        .ilike('details', 'Bulk edit %');

    console.log(`Found ${editLogs?.length || 0} bulk edit logs.`);

    const noOpLogIds = [];

    for (const log of editLogs || []) {
        // Pattern: Bulk edit "X" (BARCODE): name→"X", model→"Y"
        const match = log.details.match(/Bulk edit "(.*?)" \((.*?)\): (.*)/);
        if (match) {
            const currentName = match[1];
            const changes = match[3];

            // If changes only says: name→"SameName", model→"SameModel"
            if (changes === `name→"${currentName}", model→"Fx3"` || changes.includes(`name→"${currentName}"`)) {
                // If it logged name changing to itself
                noOpLogIds.push(log.id);
            }
        }
    }

    console.log(`Identified ${noOpLogIds.length} no-op redundant edit logs.`);

    if (noOpLogIds.length > 0) {
        const { error } = await tgt.from('logs').delete().in('id', noOpLogIds);
        if (error) {
            console.error('Delete error:', error.message);
        } else {
            console.log(`✅ Successfully removed ${noOpLogIds.length} redundant no-op edit logs.`);
        }
    }
}

cleanRedundantEditLogs().catch(console.error);
