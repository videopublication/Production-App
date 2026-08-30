const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

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

async function runLinkAndSync() {
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, description, jira_ticket_id, status')
        .order('shoot_number', { ascending: true });

    if (error) {
        console.error('Error fetching shoots:', error);
        return;
    }

    const unlinked = shoots.filter(s => !s.jira_ticket_id || s.jira_ticket_id.trim() === '');
    const jiraRegex = /\b([A-Z]{2,10}-\d+)\b/i;
    const targets = [];

    for (const s of unlinked) {
        if (s.shoot_number === 1171) continue; // Protect test ticket safety rule

        const descMatch = s.description ? s.description.match(jiraRegex) : null;
        const titleMatch = s.title ? s.title.match(jiraRegex) : null;
        const ticketKey = (descMatch ? descMatch[1] : (titleMatch ? titleMatch[1] : null))?.toUpperCase();

        if (ticketKey) {
            targets.push({
                shootId: s.id,
                shootNumber: s.shoot_number,
                title: s.title,
                currentStatus: s.status,
                ticketKey
            });
        }
    }

    console.log(`Found ${targets.length} target shoots to link and sync.`);

    const keys = Array.from(new Set(targets.map(t => t.ticketKey)));
    const jiraIssues = await searchJiraBatch(keys);
    const jiraStatusMap = new Map();
    jiraIssues.forEach(iss => {
        jiraStatusMap.set(iss.key.toUpperCase(), iss.fields?.status?.name || 'Unknown');
    });

    let successCount = 0;

    for (const t of targets) {
        const jiraRawStatus = jiraStatusMap.get(t.ticketKey);
        const targetStatus = jiraRawStatus ? jiraStatusToAppStatus(jiraRawStatus) : t.currentStatus;

        const { error: updateErr } = await supabase
            .from('shoots')
            .update({
                jira_ticket_id: t.ticketKey,
                status: targetStatus
            })
            .eq('id', t.shootId);

        if (updateErr) {
            console.error(`Failed to update Shoot #${t.shootNumber}:`, updateErr);
        } else {
            console.log(`✓ Shoot #${t.shootNumber} linked to ${t.ticketKey} -> Status: ${targetStatus} (Jira: ${jiraRawStatus})`);
            successCount++;
        }
    }

    console.log(`\nSuccessfully updated ${successCount} / ${targets.length} shoots!`);
}

if (process.argv.includes('--execute')) {
    runLinkAndSync();
} else {
    console.log('Dry run mode. Run with --execute to perform updates.');
}
