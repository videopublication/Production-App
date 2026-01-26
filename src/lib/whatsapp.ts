import { format, parseISO } from 'date-fns';
import { Shoot, Assignment, User } from '@/types';

export const formatWhatsAppMessage = (shoot: Shoot, assignments: Assignment[], users: User[]) => {
    const date = shoot.startTime ? format(parseISO(shoot.startTime), 'EEEE, MMMM d, yyyy') : 'TBD';
    const startTime = shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : 'TBD';
    const endTime = shoot.endTime ? format(parseISO(shoot.endTime), 'h:mm a') : 'TBD';

    let message = `Namaskaram,\n\n🎬 *SHOOT DETAILS* 🎬\n\n`;

    if (shoot.shootNumber) {
        message += `*Shoot ID:* #${shoot.shootNumber}\n`;
    }
    message += `*Shoot Name:* ${shoot.title}\n`;
    message += `*Date:* ${date}\n`;
    message += `*Time:* ${startTime} - ${endTime}\n`;
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
