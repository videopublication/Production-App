const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function purgeRapidClickSpam() {
    console.log('=== PURGING REMAINING RAPID-CLICK SPAM LOGS ===\n');

    const { data: logs } = await tgt
        .from('logs')
        .select('*')
        .eq('action', 'RETURN')
        .order('timestamp', { ascending: true });

    const toDeleteIds = [];
    const windowMs = 60000; // within 1 minute with identical details

    for (let i = 1; i < (logs?.length || 0); i++) {
        const prev = logs[i - 1];
        const curr = logs[i];

        if (
            prev.entity_id === curr.entity_id &&
            prev.details === curr.details &&
            Math.abs(new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) < windowMs
        ) {
            toDeleteIds.push(curr.id);
        }
    }

    console.log(`Found ${toDeleteIds.length} rapid-click duplicate return logs.`);

    if (toDeleteIds.length > 0) {
        // Chunk deletes
        for (let i = 0; i < toDeleteIds.length; i += 50) {
            const chunk = toDeleteIds.slice(i, i + 50);
            await tgt.from('logs').delete().in('id', chunk);
        }
        console.log(`✅ Successfully purged ${toDeleteIds.length} rapid-click spam logs!`);
    }
}

purgeRapidClickSpam().catch(console.error);
