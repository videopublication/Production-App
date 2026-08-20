export const APP_CONFIG = {
    name: 'VP App',
    version: '2.1.1',
    build: process.env.NODE_ENV === 'development' ? 'Development' : 'Production',
    supportEmail: 'support@example.com',
    jiraDomain: 'servicedesk.isha.in'
};

/**
 * Public link to a ticket in Jira. Safe to expose — it is the same site users
 * already open. The API host and credentials live server-side in lib/jira.ts;
 * this is only for anchor hrefs, so it has one definition instead of being
 * pasted at each call site.
 */
export const jiraBrowseUrl = (issueKey: string) => {
    const base = (process.env.NEXT_PUBLIC_JIRA_BROWSE_BASE || `https://${APP_CONFIG.jiraDomain}`)
        .replace(/\/+$/, '');
    return `${base}/browse/${encodeURIComponent(issueKey)}`;
};
