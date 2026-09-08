const https = require('https');
require('dotenv').config({ path: '.env.local' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || 'https://servicedesk.isha.in').replace(/\/+$/, '');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

function getJira(path) {
    return new Promise((resolve) => {
        const url = `${JIRA_BASE_URL}${path}`;
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
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    console.error(`HTTP ${res.statusCode}: ${data}`);
                    resolve(null);
                }
            });
        });
        req.on('error', (err) => {
            console.error(err);
            resolve(null);
        });
    });
}

async function main() {
    console.log('Fetching Project VP issue types from Jira...');
    const project = await getJira('/rest/api/2/project/VP');
    if (project && project.issueTypes) {
        console.log('Issue Types in Project VP:');
        project.issueTypes.forEach(t => console.log(`- [ID: ${t.id}] "${t.name}" (subtask: ${t.subtask})`));
    } else {
        console.log('Could not fetch project metadata.');
    }
}

main();
