const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function fixAug13Spam() {
    const { data: logs } = await tgt
        .from('logs')
        .select('*')
        .ilike('details', '%CAM-FX3-2%')
        .gte('timestamp', '2026-08-13T05:23:00Z')
        .lte('timestamp', '2026-08-13T05:24:00Z')
        .order('timestamp', { ascending: true });

    console.log(`Found ${logs?.length || 0} spam click logs on Aug 13 05:23:`);
    if (logs && logs.length > 0) {
        const keepId = logs[0].id;
        const deleteIds = logs.slice(1).map(l => l.id);

        if (deleteIds.length > 0) {
            await tgt.from('logs').delete().in('id', deleteIds);
            console.log(`Deleted ${deleteIds.length} duplicate spam logs.`);
        }

        // Re-time the single kept return to Aug 12 11:43:00 (Agni Arpanam return time)
        await tgt.from('logs').update({ timestamp: '2026-08-12T11:43:00.000Z' }).eq('id', keepId);
        console.log(`Updated kept log ${keepId} to Aug 12 11:43:00 UTC.`);
    }
}

fixAug13Spam().catch(console.error);
