const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function deduplicateLogs() {
    console.log('=== DEDUPLICATING SPAM / RAPID-CLICK LOGS IN DATABASE ===\n');

    // Fetch all logs from the database ordered by timestamp asc
    let allLogs = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await tgt
            .from('logs')
            .select('id, timestamp, action, entity_id, user_id, details')
            .order('timestamp', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error || !data || data.length === 0) break;
        allLogs.push(...data);
        page++;
        if (data.length < pageSize) break;
    }

    console.log(`Fetched ${allLogs.length} total logs from database.`);

    const duplicateIds = [];
    let lastLog = null;

    for (const log of allLogs) {
        if (lastLog) {
            const isSameEntity = log.entity_id === lastLog.entity_id;
            const isSameAction = log.action === lastLog.action;
            const isSameUser = log.user_id === lastLog.user_id;
            const isSameDetails = log.details === lastLog.details;

            const timeDiffMs = Math.abs(new Date(log.timestamp).getTime() - new Date(lastLog.timestamp).getTime());

            // If identical log within 30 seconds, it's a rapid-click duplicate!
            if (isSameEntity && isSameAction && isSameUser && isSameDetails && timeDiffMs < 30000) {
                duplicateIds.push(log.id);
                continue; // don't update lastLog, keep original as comparator
            }
        }
        lastLog = log;
    }

    console.log(`Found ${duplicateIds.length} duplicate / spam logs to clean up.`);

    if (duplicateIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < duplicateIds.length; i += batchSize) {
            const batch = duplicateIds.slice(i, i + batchSize);
            const { error: delErr } = await tgt.from('logs').delete().in('id', batch);
            if (delErr) {
                console.error('Error deleting duplicates batch:', delErr.message);
            } else {
                console.log(`✅ Deleted batch of ${batch.length} duplicates (${i + batch.length}/${duplicateIds.length})`);
            }
        }
    }

    console.log('\n=== DEDUPLICATION COMPLETE ===');
}

deduplicateLogs().catch(console.error);
