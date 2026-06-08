import { Department } from '@/types';

export interface DepartmentLabels {
    workSingular: string;
    workPlural: string;
    workLower: string;
    workPluralLower: string;
    workIdLabel: string;
    teamSingular: string;
    teamPlural: string;
    teamLower: string;
    teamPluralLower: string;
    leadLabel: string;
}

const VIDEO_LABELS: DepartmentLabels = {
    workSingular: 'Shoot',
    workPlural: 'Shoots',
    workLower: 'shoot',
    workPluralLower: 'shoots',
    workIdLabel: 'Shoot ID',
    teamSingular: 'Crew Member',
    teamPlural: 'Crew',
    teamLower: 'crew',
    teamPluralLower: 'crew',
    leadLabel: 'Shoot Incharge',
};

const EVENT_LABELS: DepartmentLabels = {
    workSingular: 'Event',
    workPlural: 'Events',
    workLower: 'event',
    workPluralLower: 'events',
    workIdLabel: 'Event ID',
    teamSingular: 'Team Member',
    teamPlural: 'Team',
    teamLower: 'team',
    teamPluralLower: 'team',
    leadLabel: 'Event Incharge',
};

const normalize = (value?: string | null) =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const getDepartmentLabels = (department?: Department | null): DepartmentLabels => {
    const normalizedName = normalize(department?.name);
    const normalizedSlug = normalize(department?.slug);
    const normalizedDepartment = `${normalizedName} ${normalizedSlug}`;
    const base = ['soundsofisha', 'sounds', 'music', 'event'].some(keyword => normalizedDepartment.includes(keyword))
        ? EVENT_LABELS
        : VIDEO_LABELS;

    const customLabels = department?.settings?.uiLabels || department?.settings?.labels || {};

    return {
        ...base,
        ...customLabels,
    };
};
