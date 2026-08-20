const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function purgeAllDuplicateRapidLogs() {
    console.log('=== PURGING RAPID CLICK DUPLICATE LOGS ===\n');

    const { data: allLogs } = await tgt.from('logs').select('*').order('timestamp', { ascending: true });

    const duplicateIds = [];

    for (let i = 1; i < (allLogs?.length || 0); i++) {
        const prev = allLogs[i - 1];
        const curr = allLogs[i];

        // Same action, same details, occurred within 60 seconds
        if (
            prev.action === curr.action &&
            prev.details === curr.details &&
            Math.abs(new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) < 60000
        ) {
            duplicateIds.push(curr.id);
        }
    }

    console.log(`Identified ${duplicateIds.length} rapid duplicate logs across entire database.`);

    if (duplicateIds.length > 0) {
        for (let i = 0; i < duplicateIds.length; i += 50) {
            const chunk = duplicateIds.slice(i, i + 50);
            await tgt.from('logs').delete().in('id', chunk);
        }
        console.log(`✅ Successfully deleted ${duplicateIds.length} duplicate logs from the database!`);
    }
}

purgeAllDuplicateRapidLogs().catch(console.error);
