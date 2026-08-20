import { format, parseISO } from 'date-fns';
import { Shoot, Assignment, User } from '@/types';
import { DepartmentLabels, getDepartmentLabels } from '@/lib/department-labels';

export const formatWhatsAppMessage = (
    shoot: Shoot,
    assignments: Assignment[],
    users: User[],
    labels: DepartmentLabels = getDepartmentLabels(null)
) => {
    const payload = generateShootWhatsAppPayload(shoot, assignments, users, labels);
    return payload.message;
};

export const generateShootWhatsAppPayload = (
    shoot: Shoot,
    assignments: Assignment[],
    users: User[],
    labels: DepartmentLabels = getDepartmentLabels(null)
) => {
    const startDate = shoot.startTime ? parseISO(shoot.startTime) : null;
    const endDate = shoot.endTime ? parseISO(shoot.endTime) : null;

    let dateString = 'TBD';
    if (startDate) {
        if (endDate && startDate.toDateString() !== endDate.toDateString()) {
            dateString = `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
        } else {
            dateString = format(startDate, 'EEEE, MMMM d, yyyy');
        }
    }

    const start = startDate ? format(startDate, 'h:mm a') : 'TBD';
    const end = endDate ? format(endDate, 'h:mm a') : 'TBD';

    let message = `Namaskaram,\n\n🎬 *${shoot.title.toUpperCase()}* 🎬\n\n`;

    if (shoot.shootNumber) {
        message += `*${labels.workIdLabel}:* #${shoot.shootNumber}\n`;
    }
    
    // Add Jira Ticket if available
    if (shoot.jiraTicketId) {
         message += `*Jira Ticket:* ${shoot.jiraTicketId}\n`;
    }

    message += `*Date:* ${dateString}\n`;
    message += `*Time:* ${start} - ${end}\n`;
    
    // Location formatting
    if (shoot.location) {
         message += `*Location:* ${shoot.location}\n`;
    } else {
         message += `*Location:* TBD\n`;
    }

    if (shoot.description && shoot.description !== 'No description') {
        message += `*Description:*\n${shoot.description}\n`;
    }

    message += `\n`;

    if (shoot.pocName) {
        message += `👤 *POC:* ${shoot.pocName} ${shoot.pocContact ? `(${shoot.pocContact})` : ''}\n`;
    }

    const mentions: string[] = [];

    // Format crew assignments with live WhatsApp user tagging (@phone)
    if (assignments.length > 0) {
        message += `\n📋 *${labels.teamPlural.toUpperCase()} ASSIGNED:*\n`;
        assignments.forEach(assignment => {
            const user = users.find(u => u.id === assignment.userId);
            if (user) {
                const role = assignment.role === 'Incharge' ? '(Incharge)' : '';
                const cleanPhone = (user.phone || '').replace(/[^\d]/g, '');
                
                if (cleanPhone && cleanPhone.length >= 10) {
                    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                    const jid = `${formattedPhone}@s.whatsapp.net`;
                    if (!mentions.includes(jid)) {
                        mentions.push(jid);
                    }
                    message += `- @${formattedPhone} (${user.name}) ${role}\n`;
                } else {
                    message += `- @${user.name} ${role}\n`;
                }
            }
        });
    }

    message += `\nPranam 🙏`;

    return { message, mentions };
};

export const generateBulkShootsWhatsAppPayload = (
    shoots: Shoot[],
    allAssignments: Assignment[],
    users: User[],
    labels: DepartmentLabels = getDepartmentLabels(null)
) => {
    let message = `Namaskaram,\n\n📋 *UPCOMING ${labels.workPlural.toUpperCase()} SCHEDULE* (${shoots.length} ${labels.workPluralLower})\n\n`;
    const allMentions: string[] = [];

    shoots.forEach((shoot, idx) => {
        const shootAssignments = allAssignments.filter(a => a.shootId === shoot.id);
        const startDate = shoot.startTime ? parseISO(shoot.startTime) : null;
        const endDate = shoot.endTime ? parseISO(shoot.endTime) : null;

        let dateString = 'TBD';
        if (startDate) {
            if (endDate && startDate.toDateString() !== endDate.toDateString()) {
                dateString = `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
            } else {
                dateString = format(startDate, 'EEE, MMM d, yyyy');
            }
        }
        const timeString = startDate ? `${format(startDate, 'h:mm a')}${endDate ? ` - ${format(endDate, 'h:mm a')}` : ''}` : 'TBD';

        message += `*${idx + 1}. ${shoot.title.toUpperCase()}*`;
        if (shoot.shootNumber) message += ` (#${shoot.shootNumber})`;
        if (shoot.jiraTicketId) message += ` [${shoot.jiraTicketId}]`;
        message += `\n`;
        message += `  📅 *Date/Time:* ${dateString} • ${timeString}\n`;
        if (shoot.location) message += `  📍 *Location:* ${shoot.location}\n`;
        if (shoot.pocName) message += `  👤 *POC:* ${shoot.pocName}${shoot.pocContact ? ` (${shoot.pocContact})` : ''}\n`;

        // Unique crew
        const seenUserIds = new Set<string>();
        const crewNames: string[] = [];
        shootAssignments.forEach(assignment => {
            if (!seenUserIds.has(assignment.userId)) {
                seenUserIds.add(assignment.userId);
                const u = users.find(user => user.id === assignment.userId);
                if (u) {
                    const cleanPhone = (u.phone || '').replace(/[^\d]/g, '');
                    if (cleanPhone && cleanPhone.length >= 10) {
                        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                        const jid = `${formattedPhone}@s.whatsapp.net`;
                        if (!allMentions.includes(jid)) {
                            allMentions.push(jid);
                        }
                        crewNames.push(`@${formattedPhone} (${u.name})`);
                    } else {
                        crewNames.push(u.name);
                    }
                }
            }
        });

        if (crewNames.length > 0) {
            message += `  👥 *${labels.teamPlural}:* ${crewNames.join(', ')}\n`;
        }
        message += `\n`;
    });

    message += `Pranam 🙏`;
    return { message, mentions: allMentions };
};

export const openWhatsApp = (message: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
};
