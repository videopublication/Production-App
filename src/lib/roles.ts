export const getRoleLabel = (role?: string | null) => {
    if (!role) return '';

    const labels: Record<string, string> = {
        SUPER_ADMIN: 'Admin',
        ADMIN: 'Admin',
        FINANCE_MANAGER: 'Finance Manager',
        MANAGER: 'Manager',
        CREW: 'Crew',
        Incharge: 'Shoot Incharge',
    };

    if (labels[role]) return labels[role];

    return role
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};
