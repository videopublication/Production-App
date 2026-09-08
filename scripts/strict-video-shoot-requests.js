const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || 'https://servicedesk.isha.in').replace(/\/+$/, '');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

function searchJiraJql(jql, maxResults = 5) {
    return new Promise((resolve) => {
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,created,reporter,description,issuetype&maxResults=${maxResults}`;
        
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
                        resolve([]);
                    }
                } else {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
    });
}

function normalizeWords(str) {
    if (!str) return [];
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !['shoot', 'request', 'video', 'coverage', 'for', 'the', 'and', 'in', 'at', 'of', 'on', 'a', 'an', 'with', 'from', 'all', 'setup', 'checking', 'venue'].includes(w));
}

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: shoots } = await supabase.from('shoots').select('*').eq('status', 'CONFIRMED').is('jira_ticket_id', null).order('shoot_number');
    
    console.log(`Checking ${shoots.length} shoots strictly under issuetype = "Video Shoot Request"...`);
    const matches = [];

    for (const shoot of shoots) {
        if (shoot.shoot_number === 1171) continue;
        const shootWords = normalizeWords(shoot.title);
        if (shootWords.length === 0) continue;
        
        let jql = `project = VP AND issuetype = "Video Shoot Request" AND (summary ~ "${shootWords.slice(0, 3).join(' ')}" OR text ~ "${shootWords.slice(0, 3).join(' ')}")`;
        if (shoot.start_time) {
            const sDate = new Date(shoot.start_time);
            const dBefore = new Date(sDate.getTime() - 60 * 86400000).toISOString().split('T')[0];
            const dAfter = new Date(sDate.getTime() + 30 * 86400000).toISOString().split('T')[0];
            jql += ` AND created >= "${dBefore}" AND created <= "${dAfter}"`;
        }

        const candidates = await searchJiraJql(jql, 3);
        for (const c of candidates) {
            const sumLower = (c.fields?.summary || '').toLowerCase();
            const overlap = shootWords.filter(w => sumLower.includes(w)).length / shootWords.length;
            if (overlap >= 0.5) {
                matches.push({
                    'Shoot #': `#${shoot.shoot_number}`,
                    'Shoot Title': shoot.title.substring(0, 25),
                    'Date': shoot.start_time ? shoot.start_time.split('T')[0] : '-',
                    'POC': shoot.poc_name || '-',
                    'Jira Ticket': c.key,
                    'Jira Summary': c.fields?.summary?.substring(0, 35),
                    'Jira Status': c.fields?.status?.name,
                    'Issue Type': c.fields?.issuetype?.name
                });
                break;
            }
        }
    }

    console.log(`\nFound ${matches.length} matches with issue type "Video Shoot Request":`);
    console.table(matches);
}

run();
