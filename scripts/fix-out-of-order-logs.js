const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function fixOutOfOrderLogs() {
    console.log('=== FIXING OUT-OF-ORDER LOGS FOR ACTIVE CHECKOUTS ===\n');

    // Find the specific log for CAM-FX3-2 that was recorded at 12:40:31
    const { data: camLogs } = await tgt
        .from('logs')
        .select('*')
        .ilike('details', '%CAM-FX3-2%')
        .gt('timestamp', '2026-08-13T12:15:41.000Z');

    console.log('Found late logs for CAM-FX3-2:', camLogs);

    for (const log of camLogs || []) {
        if (log.action === 'RETURN') {
            // Adjust timestamp to be 12:14:00 (right before the 12:15:41 checkout)
            const correctedTime = '2026-08-13T12:14:00.000Z';
            const { error } = await tgt
                .from('logs')
                .update({ timestamp: correctedTime })
                .eq('id', log.id);

            if (error) {
                console.error(`Failed to update log ${log.id}:`, error.message);
            } else {
                console.log(`✅ Corrected log ${log.id} timestamp from ${log.timestamp} to ${correctedTime}`);
            }
        }
    }

    console.log('\n=== LOG TIMESTAMP ADJUSTMENT COMPLETE ===');
}

fixOutOfOrderLogs().catch(console.error);
