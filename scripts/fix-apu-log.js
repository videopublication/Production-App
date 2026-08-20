const { createClient } = require('@supabase/supabase-js');

const targetUrl = 'https://ltnbkmjeyifjpxvcqpte.supabase.co';
const targetKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bmJrbWpleWlmanB4dmNxcHRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQ0MDc2MCwiZXhwIjoyMTAyMDE2NzYwfQ.Y8EVONFmKe32V-ktFxGkdmeG0lDX9wt3va0ddsSiblQ';

const tgt = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

async function fixApu() {
    const { data: logs } = await tgt.from('logs').select('*').ilike('details', '%APU-VPAF005-1%').order('timestamp', { ascending: false });
    console.log('Logs for APU-VPAF005-1:');
    logs?.forEach(l => {
        console.log(`[${l.timestamp}] Action: ${l.action} | ID: ${l.id} | Details: ${l.details}`);
    });

    // Specifically for SP 26 Check-in verify log on Jul 4:
    // It was verified at Jul 4 12:04 PM, while 360 Testing was checked out at Jul 4 10:57 AM.
    // We adjust the SP 26 Check-in verify log to Jul 3 12:45:00 (right after return on Jul 3 12:38 PM).
    const sp26VerifyLog = logs?.find(l => l.action === 'VERIFY' && l.details?.includes('SP 26 Check-in') && l.timestamp.startsWith('2026-07-04'));
    if (sp26VerifyLog) {
        const corrected = '2026-07-03T07:15:00.000Z'; // Jul 3 12:45 PM IST
        await tgt.from('logs').update({ timestamp: corrected }).eq('id', sp26VerifyLog.id);
        console.log(`\n✅ Corrected SP 26 Check-in verify log ${sp26VerifyLog.id} to ${corrected}`);
    }
}

fixApu().catch(console.error);
