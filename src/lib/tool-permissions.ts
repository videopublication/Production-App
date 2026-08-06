import type { Department, Role, User } from '@/types';

/**
 * Who may use each bulk inventory tool, configured per department.
 *
 * These tools act on many items at once — regenerating barcodes, rewriting names, deleting —
 * so which of them a manager should be trusted with varies by team. Rather than hard-coding
 * a role list at each button, the rules live in department settings and an admin edits them.
 *
 * This is the first piece of a central permission layer: every gate calls `canUseTool` rather
 * than testing roles inline, so the set of subjects can grow (teams, item pools) without
 * revisiting the call sites.
 */

export type ToolId =
    | 'fixData'
    | 'exportCsv'
    | 'moveToDataTeam'
    | 'normalizeConnectors'
    | 'generateBarcodes'
    | 'fixNames'
    | 'findReplace'
    | 'bulkEdit'
    | 'printLabels'
    | 'bulkDelete';

export interface ToolDefinition {
    id: ToolId;
    label: string;
    description: string;
    /** Roles allowed when a department hasn't configured this tool — today's behaviour. */
    defaultRoles: Role[];
}

/** Super Admin is never gated: locking yourself out of your own tooling isn't a feature. */
const ALWAYS_ALLOWED: Role[] = ['SUPER_ADMIN'];

const MANAGER_AND_ADMIN: Role[] = ['MANAGER', 'ADMIN'];
const ADMIN_ONLY: Role[] = ['ADMIN'];

/**
 * The tools an admin can grant or withhold. Order is the order they appear in the editor.
 *
 * Defaults reproduce how the app behaved before this setting existed, so enabling the feature
 * changes nothing until someone deliberately unticks a box — except bulk delete, which was
 * always the most destructive and stays with admins by default.
 */
export const INVENTORY_TOOLS: ToolDefinition[] = [
    {
        id: 'generateBarcodes',
        label: 'Generate barcodes',
        description: 'Rewrites barcodes for many items using the standard scheme.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'fixNames',
        label: 'Fix names',
        description: 'Rebuilds names from brand, model, size and category.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'findReplace',
        label: 'Find & replace',
        description: 'Search and replace across item fields in bulk.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'bulkEdit',
        label: 'Bulk edit',
        description: 'Edit several items inline at once.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'normalizeConnectors',
        label: 'Normalize connectors',
        description: 'Rebuilds connector names and codes from their ends.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'printLabels',
        label: 'Print QR labels',
        description: 'Generates printable QR label sheets.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'exportCsv',
        label: 'Export CSV',
        description: 'Downloads the filtered inventory as a spreadsheet.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'moveToDataTeam',
        label: 'Move to data team',
        description: 'Hands items over to the data team’s pool.',
        defaultRoles: ADMIN_ONLY,
    },
    {
        id: 'fixData',
        label: 'Fix data inconsistencies',
        description: 'Clears stale assignees and orphaned checked-out items.',
        defaultRoles: MANAGER_AND_ADMIN,
    },
    {
        id: 'bulkDelete',
        label: 'Delete items',
        description: 'Permanently deletes the selected items. Cannot be undone.',
        defaultRoles: ADMIN_ONLY,
    },
];

const TOOL_BY_ID = new Map<ToolId, ToolDefinition>(INVENTORY_TOOLS.map(t => [t.id, t]));

/** The roles currently allowed to use a tool in this department, configured or default. */
export function allowedRolesForTool(tool: ToolId, department?: Department | null): Role[] {
    const configured = department?.settings?.toolPermissions?.[tool];
    if (Array.isArray(configured)) return configured as Role[];
    return TOOL_BY_ID.get(tool)?.defaultRoles ?? [];
}

/**
 * Whether this user may use the tool here.
 *
 * A Super Admin viewing the global overview has no department pinned, so there are no settings
 * to read — they're allowed regardless, which is also what prevents a misconfiguration from
 * being unrecoverable.
 */
export function canUseTool(
    user: Pick<User, 'role'> | null | undefined,
    tool: ToolId,
    department?: Department | null,
): boolean {
    const role = user?.role;
    if (!role) return false;
    if (ALWAYS_ALLOWED.includes(role)) return true;
    return allowedRolesForTool(tool, department).includes(role);
}

/** Roles an admin can toggle in the editor. The rest are either always- or never-allowed. */
export const CONFIGURABLE_TOOL_ROLES: { role: Role; label: string }[] = [
    { role: 'MANAGER', label: 'Manager' },
    { role: 'ADMIN', label: 'Admin' },
    { role: 'DATA_MANAGER', label: 'Data' },
];
