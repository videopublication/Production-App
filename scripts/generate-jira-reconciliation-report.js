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

function searchJiraJql(jql, maxResults = 5) {
    return new Promise((resolve) => {
        const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,created,reporter&maxResults=${maxResults}`;
        
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
        .filter(w => w.length > 2 && !['shoot', 'request', 'video', 'coverage', 'for', 'the', 'and', 'in', 'at', 'of', 'on', 'a', 'an', 'with', 'from', 'all'].includes(w));
}

function calculateSimilarity(title1, title2) {
    const w1 = new Set(normalizeWords(title1));
    const w2 = new Set(normalizeWords(title2));
    if (w1.size === 0 || w2.size === 0) return 0;
    
    let intersection = 0;
    for (const word of w1) {
        if (w2.has(word)) intersection++;
    }
    return intersection / Math.max(w1.size, w2.size);
}

async function runReconciliation() {
    const { data: shoots, error } = await supabase
        .from('shoots')
        .select('id, shoot_number, title, description, start_time, end_time, location, poc_name, status, jira_ticket_id')
        .order('shoot_number', { ascending: true });

    if (error) {
        console.error('Error fetching shoots:', error);
        return;
    }

    const unlinked = shoots.filter(s => (!s.jira_ticket_id || s.jira_ticket_id.trim() === '') && s.shoot_number !== 1171);
    console.log(`Reconciling ${unlinked.length} unlinked shoots against Jira...\n`);

    const highConfidence = [];
    const possibleMatches = [];
    const noMatches = [];

    for (let i = 0; i < unlinked.length; i++) {
        const s = unlinked[i];
        const keywords = normalizeWords(s.title);

        if (keywords.length === 0) {
            noMatches.push({ shoot: s, reason: 'No significant keywords in title' });
            continue;
        }

        const shootDateStr = s.start_time ? s.start_time.split('T')[0] : null;
        let jql = `project in (VP) AND summary ~ "${keywords.join(' ')}"`;
        
        if (shootDateStr) {
            // Constrain Jira creation date to +/- 60 days of shoot
            const shootDate = new Date(shootDateStr);
            const beforeDate = new Date(shootDate.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const afterDate = new Date(shootDate.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            jql += ` AND created >= "${beforeDate}" AND created <= "${afterDate}"`;
        }

        const candidates = await searchJiraJql(jql, 5);

        if (candidates.length === 0) {
            noMatches.push({ shoot: s, reason: 'No Jira issues found matching title/date window' });
            continue;
        }

        // Score candidates
        const scored = candidates.map(c => {
            const sim = calculateSimilarity(s.title, c.fields?.summary || '');
            return {
                key: c.key,
                summary: c.fields?.summary,
                status: c.fields?.status?.name,
                created: c.fields?.created?.split('T')[0],
                similarity: sim
            };
        }).sort((a, b) => b.similarity - a.similarity);

        const best = scored[0];

        if (best.similarity >= 0.6) {
            highConfidence.push({
                shootNumber: s.shoot_number,
                shootId: s.id,
                shootTitle: s.title,
                shootDate: shootDateStr,
                shootStatus: s.status,
                ticketKey: best.key,
                ticketSummary: best.summary,
                ticketStatus: best.status,
                ticketCreated: best.created,
                score: Math.round(best.similarity * 100)
            });
        } else {
            possibleMatches.push({
                shootNumber: s.shoot_number,
                shootId: s.id,
                shootTitle: s.title,
                shootDate: shootDateStr,
                candidates: scored.slice(0, 2)
            });
        }
    }

    console.log(`=== RECONCILIATION SUMMARY ===`);
    console.log(`High Confidence Matches (>=60% similarity & date matched): ${highConfidence.length}`);
    console.log(`Possible / Ambiguous Matches: ${possibleMatches.length}`);
    console.log(`No Matches (Internal/Testing/Offline Shoots): ${noMatches.length}`);

    if (highConfidence.length > 0) {
        console.log('\n--- HIGH CONFIDENCE MATCHES ---');
        console.table(highConfidence.map(h => ({
            'Shoot #': `#${h.shootNumber}`,
            'Shoot Title': h.shootTitle.substring(0, 25),
            'Date': h.shootDate || '-',
            'Matched Ticket': h.ticketKey,
            'Jira Summary': h.ticketSummary.substring(0, 30),
            'Jira Status': h.ticketStatus,
            'Match %': `${h.score}%`
        })));
    }
}

runReconciliation();
