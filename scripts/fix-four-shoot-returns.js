const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function fixFourLogs() {
    const fixes = [
        {
            project: 'Gramotsavam Matches Shoot',
            txnId: 'TXN-4Q2YK6',
            correctTime: '2026-08-09T12:30:00.000Z'
        },
        {
            project: 'Independence Day Vande Mataram Homeschool Shoot',
            txnId: 'TXN-DM7F5P',
            correctTime: '2026-08-12T07:15:00.000Z'
        },
        {
            project: 'HYTT26 - Panchabhuta Kriya',
            txnId: 'TXN-X7JEQV',
            correctTime: '2026-08-11T12:00:00.000Z'
        },
        {
            project: 'Agni Arpanam Shoot',
            txnId: 'TXN-T924YY',
            correctTime: '2026-08-12T12:00:00.000Z'
        }
    ];

    for (const fix of fixes) {
        // Find logs for this transaction with action RETURN stamped on 2026-08-13
        const { data: logs } = await tgt
            .from('logs')
            .select('*')
            .eq('action', 'RETURN')
            .eq('entity_id', fix.txnId)
            .gte('timestamp', '2026-08-13T00:00:00Z');

        console.log(`Found ${logs?.length || 0} logs for ${fix.project} (${fix.txnId}) on Aug 13:`);
        for (const log of logs || []) {
            console.log(`  Updating log ${log.id} (${log.timestamp} → ${fix.correctTime})`);
            await tgt.from('logs').update({ timestamp: fix.correctTime }).eq('id', log.id);
        }
    }

    console.log('\n✅ Successfully re-timed all 4 shoot return logs to their genuine shoot completion dates!');
}

fixFourLogs().catch(console.error);
