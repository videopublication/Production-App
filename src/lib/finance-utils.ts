import { Assignment, Shoot, ShootExpense, User } from '@/types';
import { DepartmentLabels, getDepartmentLabels } from '@/lib/department-labels';

/**
 * Calculates the total expense for a given shoot.
 */
export const getShootTotalExpense = (shoot: Shoot): number => {
    if (!shoot.expenses || shoot.expenses.length === 0) return 0;
    return shoot.expenses.reduce((sum: number, exp: ShootExpense) => sum + (Number(exp.amount) || 0), 0);
};

/**
 * Generates a CSV blob containing shoot and expense data for reporting.
 */
export const generateShootsCSV = (shoots: Shoot[], assignments: Assignment[], users: User[], labels: DepartmentLabels = getDepartmentLabels(null)): Blob => {
    const headers = [
        labels.workIdLabel,
        'Title',
        'Start Date',
        'Start Time',
        'End Date',
        'End Time',
        'Location',
        'POC Name',
        'Status',
        'Category',
        'Total Expenses (₹)',
        'Boarding (₹)',
        'Travel (₹)',
        'Equipment (₹)',
        'Manpower (₹)',
        'Other (₹)',
        `Assigned ${labels.teamPlural}`
    ];

    const rows = shoots.map(shoot => {
        const start = shoot.startTime ? new Date(shoot.startTime) : null;
        const end = shoot.endTime ? new Date(shoot.endTime) : null;
        const startDate = start ? start.toLocaleDateString() : 'N/A';
        const startTime = start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const endDate = end ? end.toLocaleDateString() : 'N/A';
        const endTime = end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const totalExpense = getShootTotalExpense(shoot);
        
        // Extract category (assuming it's stored in campaign field of first expense or similar, as per existing logic)
        const category = shoot.expenses?.find((e: ShootExpense) => e.campaign)?.campaign || 'UNASSIGNED';

        // Categorized expenses
        let boarding = 0, travel = 0, equipment = 0, manpower = 0, other = 0;
        if (shoot.expenses) {
            shoot.expenses.forEach(exp => {
                const amount = Number(exp.amount) || 0;
                const type = (exp.type || '').toUpperCase();
                if (type.includes('BOARDING')) boarding += amount;
                else if (type.includes('TRAVEL')) travel += amount;
                else if (type.includes('EQUIPMENT')) equipment += amount;
                else if (type.includes('MANPOWER')) manpower += amount;
                else other += amount;
            });
        }

        // Get crew names
        const crewNames = assignments
            .filter(a => a.shootId === shoot.id)
            .map(a => users.find(u => u.id === a.userId)?.name || 'Unknown')
            .join(', ');

        return [
            shoot.shootNumber || 'N/A',
            `"${shoot.title.replace(/"/g, '""')}"`,
            startDate,
            startTime,
            endDate,
            endTime,
            `"${(shoot.location || '').replace(/"/g, '""')}"`,
            `"${(shoot.pocName || '').replace(/"/g, '""')}"`,
            shoot.status,
            `"${category}"`,
            totalExpense,
            boarding,
            travel,
            equipment,
            manpower,
            other,
            `"${crewNames}"`
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
};

/**
 * Triggers a download of the provided CSV Blob.
 */
export const downloadCSV = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
