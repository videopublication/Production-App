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

async function main() {
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, description, jira_ticket_id, status, start_time')
        .order('shoot_number', { ascending: true });

    if (error) {
        console.error('Error fetching shoots:', error);
        return;
    }

    const unlinked = shoots.filter(s => !s.jira_ticket_id || s.jira_ticket_id.trim() === '');
    console.log(`Total shoots: ${shoots.length}`);
    console.log(`Unlinked shoots (no jira_ticket_id): ${unlinked.length}`);

    const jiraRegex = /\b([A-Z]{2,10}-\d+)\b/i;
    const extractable = [];

    for (const s of unlinked) {
        const descMatch = s.description ? s.description.match(jiraRegex) : null;
        const titleMatch = s.title ? s.title.match(jiraRegex) : null;
        const ticketKey = (descMatch ? descMatch[1] : (titleMatch ? titleMatch[1] : null))?.toUpperCase();

        if (ticketKey) {
            extractable.push({
                shootId: s.id,
                shootNumber: s.shoot_number,
                title: s.title,
                currentStatus: s.status,
                description: s.description,
                ticketKey
            });
        }
    }

    console.log(`Found ${extractable.length} unlinked shoots with Jira ticket numbers in description/title:`);

    const keys = Array.from(new Set(extractable.map(e => e.ticketKey)));
    console.log(`Distinct Jira keys to query: ${keys.length} (${keys.join(', ')})`);

    const jiraIssues = await searchJiraBatch(keys);
    const jiraStatusMap = new Map();
    jiraIssues.forEach(iss => {
        jiraStatusMap.set(iss.key.toUpperCase(), iss.fields?.status?.name || 'Unknown');
    });

    console.log('\n--- EXTRACTABLE SHOOTS & JIRA STATUS ---');
    console.table(extractable.map(e => {
        const jiraRawStatus = jiraStatusMap.get(e.ticketKey) || 'NOT FOUND IN JIRA';
        const targetAppStatus = jiraRawStatus !== 'NOT FOUND IN JIRA' ? jiraStatusToAppStatus(jiraRawStatus) : 'N/A';
        return {
            'Shoot #': `#${e.shootNumber || '-'}`,
            'Title': e.title.substring(0, 25),
            'Ticket': e.ticketKey,
            'Current App Status': e.currentStatus,
            'Jira Status': jiraRawStatus,
            'Target App Status': targetAppStatus
        };
    }));
}

main();
