import { format, parseISO } from 'date-fns';
import { Shoot, Assignment, User } from '@/types';

export const formatWhatsAppMessage = (shoot: Shoot, assignments: Assignment[], users: User[]) => {
    const startDate = shoot.startTime ? parseISO(shoot.startTime) : null;
    const endDate = shoot.endTime ? parseISO(shoot.endTime) : null;

    let dateString = 'TBD';
    if (startDate) {
        if (endDate && startDate.toDateString() !== endDate.toDateString()) {
            // Different Dates
            dateString = `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
        } else {
            // Single Day
            dateString = format(startDate, 'EEEE, MMMM d, yyyy');
        }
    }

    const start = startDate ? format(startDate, 'h:mm a') : 'TBD';
    const end = endDate ? format(endDate, 'h:mm a') : 'TBD';

    let message = `Namaskaram,\n\n🎬 *${shoot.title.toUpperCase()}* 🎬\n\n`;

    if (shoot.shootNumber) {
        message += `*Shoot ID:* #${shoot.shootNumber}\n`;
    }
    // message += `*Shoot Name:* ${shoot.title}\n`; // Removed
    message += `*Date:* ${dateString}\n`;
    message += `*Time:* ${start} - ${end}\n`;
    message += `*Location:* ${shoot.location || 'Not set'}\n`;

    if (shoot.description && shoot.description !== 'No description') {
        message += `*Description:* ${shoot.description}\n`;
    }

    // Add spacing before POC
    message += `\n`;

    if (shoot.pocName) {
        message += `👤 *POC:* ${shoot.pocName} ${shoot.pocContact ? `(${shoot.pocContact})` : ''}\n\n`;
    }

    message += `📋 *CREW ASSIGNED:*\n`;
    if (assignments.length > 0) {
        assignments.forEach(assignment => {
            const user = users.find(u => u.id === assignment.userId);
            if (user) {
                const role = assignment.role === 'Incharge' ? '(Incharge)' : '';
                message += `- ${user.name} ${role}\n`;
            }
        });
    } else {
        message += `- No crew assigned yet\n`;
    }

    message += `\nPranam 🙏`;

    return message;
};

export const openWhatsApp = (message: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
};
