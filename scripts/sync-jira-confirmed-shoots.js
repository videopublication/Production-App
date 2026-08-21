const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

// In case self-signed or internal CA
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || 'https://servicedesk.isha.in').replace(/\/+$/, '');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

function searchJiraBatch(keys) {
    return new Promise((resolve) => {
        if (!keys || keys.length === 0) return resolve([]);
        const jql = encodeURIComponent(`key in (${keys.join(',')})`);
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${jql}&fields=status,summary&maxResults=${keys.length + 10}`;
        
        const req = https.get(url, {
            headers: {
                'Authorization': `Bearer ${JIRA_TOKEN}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.issues || []);
                    } catch (e) {
                        console.error('[Jira JSON parse error]:', e);
                        resolve([]);
                    }
                } else {
                    console.error(`[Jira Search Error] HTTP ${res.statusCode}: ${data.substring(0, 200)}`);
                    resolve([]);
                }
            });
        });
        req.on('error', (err) => {
            console.error('[Jira Network Error]:', err.message);
            resolve([]);
        });
    });
}

const jiraStatusToAppStatus = (statusName) => {
    if (!statusName) return 'OPEN';
    const s = statusName.trim().toLowerCase();
    if (s.includes('cancel')) return 'CANCELLED';
    if (s.includes('in progress') || s.includes('shoot in progress')) return 'SHOOT_IN_PROGRESS';
    if (s.includes('ready for shoot') || s === 'ready' || s === 'confirmed') return 'READY_FOR_SHOOT';
    if (s.includes('close') || s.includes('shoot over') || s.includes('resolved') || s.includes('done') || s.includes('complete')) return 'CLOSED';
    if (s.includes('hold')) return 'ON_HOLD';
    if (s.includes('waiting for requester') || s.includes('waiting')) return 'WAITING_FOR_REQUESTER';
    if (s.includes('pending production') || s.includes('production setup') || s.includes('setup')) return 'PENDING_PRODUCTION_SETUP';
    if (s.includes('open') || s.includes('to do') || s.includes('new')) return 'OPEN';
    return 'OPEN';
};

async function main() {
    console.log('Fetching shoots with status = CONFIRMED and non-null jira_ticket_id...');
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, jira_ticket_id, status')
        .eq('status', 'CONFIRMED')
        .not('jira_ticket_id', 'is', null);

    if (error) {
        console.error('Supabase error:', error);
        return;
    }

    console.log(`Found ${shoots.length} shoots to evaluate.`);

    // Extract valid issue keys (filtering out testing shoot #1171 / VP-55115 if needed)
    const validShoots = shoots.filter(s => s.jira_ticket_id && /^[A-Z]+-\d+$/i.test(s.jira_ticket_id.trim()));
    const shootMap = new Map();
    validShoots.forEach(s => shootMap.set(s.jira_ticket_id.trim().toUpperCase(), s));

    const keys = Array.from(shootMap.keys());
    console.log(`Total valid Jira keys: ${keys.length}`);

    // Batch in chunks of 50
    const chunkSize = 50;
    const jiraStatusMap = new Map();

    for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = keys.slice(i, i + chunkSize);
        console.log(`Querying Jira batch ${i + 1} to ${Math.min(i + chunkSize, keys.length)}...`);
        const issues = await searchJiraBatch(chunk);
        issues.forEach(issue => {
            const k = issue.key.toUpperCase();
            const statusName = issue.fields?.status?.name || '';
            jiraStatusMap.set(k, statusName);
        });
    }

    console.log(`Fetched status for ${jiraStatusMap.size} tickets from Jira.`);

    let updateCount = 0;
    let closedCount = 0;
    let otherCount = 0;

    const toCloseIds = [];
    const otherUpdates = [];

    for (const [key, shoot] of shootMap.entries()) {
        const jiraStatus = jiraStatusMap.get(key);
        if (!jiraStatus) {
            console.log(`Warning: Jira ticket ${key} not found or inaccessible in Jira.`);
            continue;
        }

        const appStatus = jiraStatusToAppStatus(jiraStatus);
        
        if (appStatus === 'CLOSED') {
            toCloseIds.push(shoot.id);
            closedCount++;
        } else if (appStatus !== 'CONFIRMED') {
            otherUpdates.push({ id: shoot.id, key, status: appStatus, jiraStatus });
            otherCount++;
        } else {
            // Still confirmed/ready in Jira
            console.log(`Ticket ${key} [Shoot #${shoot.shoot_number || '-'}] is still ${jiraStatus} in Jira.`);
        }
    }

    console.log(`\nShoots to update to CLOSED: ${toCloseIds.length}`);
    console.log(`Shoots with other status changes: ${otherUpdates.length}`);

    // Batch update to CLOSED
    if (toCloseIds.length > 0) {
        // Chunk supabase updates in groups of 100
        for (let i = 0; i < toCloseIds.length; i += 100) {
            const idChunk = toCloseIds.slice(i, i + 100);
            const { error: updateErr } = await supabase
                .from('shoots')
                .update({ status: 'CLOSED' })
                .in('id', idChunk);

            if (updateErr) {
                console.error('Error updating to CLOSED:', updateErr);
            } else {
                updateCount += idChunk.length;
            }
        }
    }

    // Update other non-confirmed statuses if any
    for (const item of otherUpdates) {
        const { error: updateErr } = await supabase
            .from('shoots')
            .update({ status: item.status })
            .eq('id', item.id);

        if (!updateErr) {
            updateCount++;
            console.log(`Updated Shoot with Jira ${item.key} to ${item.status} (${item.jiraStatus})`);
        }
    }

    console.log(`\n=============================================`);
    console.log(`DONE! Successfully updated ${updateCount} shoots:`);
    console.log(`- ${closedCount} shoots marked CLOSED`);
    console.log(`- ${otherCount} shoots updated to other Jira statuses`);
    console.log(`=============================================\n`);
}

main();
