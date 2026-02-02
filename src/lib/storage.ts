import { supabase } from './supabase';
import { User, Equipment, Transaction, Log, Shoot, Assignment } from '@/types';

class StorageService {
    // Users
    async getUsers(): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*');

        if (error) {
            console.error('Error fetching users:', error);
            return [];
        }
        return data.map((u: any) => ({
            ...u,
            fcmToken: u.fcm_token
        })) as User[];
    }

    async updateUser(id: string, updates: Partial<User>): Promise<void> {
        const dbUpdates: any = { ...updates };
        if (updates.fcmToken !== undefined) {
            dbUpdates.fcm_token = updates.fcmToken;
            delete dbUpdates.fcmToken;
        }
        // Remove known non-db fields if any, though User interface is clean

        const { error } = await supabase
            .from('users')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    // Equipment
    async getEquipment(): Promise<Equipment[]> {
        const { data, error } = await supabase
            .from('equipment')
            .select('*');

        if (error) {
            console.error('Error fetching equipment:', error);
            return [];
        }

        return data.map((item: any) => ({
            ...item,
            serialNumber: item.serial_number,
            assignedTo: item.assigned_to,
            lastActivity: item.last_activity
        })) as Equipment[];
    }

    async saveEquipment(equipment: Equipment[]): Promise<void> {
        const dbItems = equipment.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            barcode: item.barcode,
            status: item.status,
            location: item.location,
            condition: item.condition,
            serial_number: item.serialNumber,
            assigned_to: item.assignedTo,
            last_activity: item.lastActivity
        }));

        const { error } = await supabase
            .from('equipment')
            .upsert(dbItems);

        if (error) console.error('Error saving equipment:', error);
    }

    async addEquipment(item: Equipment): Promise<void> {
        const dbItem = {
            id: item.id,
            name: item.name,
            category: item.category,
            barcode: item.barcode,
            status: item.status,
            location: item.location,
            condition: item.condition,
            serial_number: item.serialNumber,
            assigned_to: item.assignedTo,
            last_activity: item.lastActivity
        };

        const { error } = await supabase
            .from('equipment')
            .insert(dbItem);

        if (error) console.error('Error adding equipment:', error);
    }

    async updateEquipment(id: string, updates: Partial<Equipment>): Promise<void> {
        // Sanitize updates - remove ID and handle camelCase mapping
        const dbUpdates: any = { ...updates };
        delete dbUpdates.id;

        if (updates.serialNumber !== undefined) {
            dbUpdates.serial_number = updates.serialNumber;
            delete dbUpdates.serialNumber;
        }

        if (updates.assignedTo !== undefined) {
            dbUpdates.assigned_to = updates.assignedTo;
            delete dbUpdates.assignedTo;
        }

        if (updates.lastActivity !== undefined) {
            dbUpdates.last_activity = updates.lastActivity;
            delete dbUpdates.lastActivity;
        }

        const { error } = await supabase
            .from('equipment')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            console.error('Error updating equipment:', error);
            throw error;
        }
    }

    async deleteEquipment(id: string): Promise<void> {
        const { error } = await supabase
            .from('equipment')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting equipment:', error);
            throw error;
        }
    }

    async bulkDeleteEquipment(ids: string[]): Promise<void> {
        const { error } = await supabase
            .from('equipment')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('Error bulk deleting equipment:', error);
            throw error;
        }
    }

    // Transactions
    async getTransactions(
        page?: number,
        limit?: number,
        search?: string,
        status?: 'OPEN' | 'CLOSED' | 'ALL',
        filterUserIds?: string[], // Strict AND filter
        searchUserIds?: string[]  // OR match (e.g. results for "John" where John is the user)
    ): Promise<Transaction[]> {
        let query = supabase
            .from('transactions')
            .select('*')
            .order('timestamp_out', { ascending: false });

        if (status && status !== 'ALL') {
            query = query.eq('status', status);
        }

        if (filterUserIds && filterUserIds.length > 0) {
            query = query.in('user_id', filterUserIds);
        }

        if (search || (searchUserIds && searchUserIds.length > 0)) {
            const conditions = [];
            if (search) {
                conditions.push(`project.ilike.%${search}%`);
                conditions.push(`id.ilike.%${search}%`);
                conditions.push(`notes.ilike.%${search}%`);
            }
            if (searchUserIds && searchUserIds.length > 0) {
                // Formatting for .in() within .or() is specific: col.in.(val1,val2)
                conditions.push(`user_id.in.(${searchUserIds.join(',')})`);
            }
            if (conditions.length > 0) {
                query = query.or(conditions.join(','));
            }
        }

        if (page && limit) {
            const from = (page - 1) * limit;
            const to = from + limit - 1;
            query = query.range(from, to);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }

        return data.map((t: any) => ({
            ...t,
            userId: t.user_id,
            timestampOut: t.timestamp_out,
            preCheckoutConditions: t.pre_checkout_conditions,
            postReturnConditions: t.post_return_conditions,
            additionalUsers: t.additional_users,
            notes: t.notes,
            shootId: t.shoot_id
        })) as Transaction[];
    }

    async getTransactionStats(): Promise<{ total: number, active: number, closed: number, outItems: number }> {
        // We can run these in parallel
        // 1. Total count
        const totalPromise = supabase.from('transactions').select('*', { count: 'exact', head: true });
        // 2. Active count
        const activePromise = supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'OPEN');
        // 3. Closed count
        const closedPromise = supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'CLOSED');

        // 4. Out Items (Sum of items length for OPEN transactions). 
        // Supabase/PostgREST doesn't support sum() directly on client easily without RPC.
        // We will fetch minimal data for OPEN transactions to sum items. 
        // Since OPEN transactions are usually < 100, this is cheap.
        const outItemsPromise = supabase.from('transactions').select('items').eq('status', 'OPEN');

        const [totalRes, activeRes, closedRes, outItemsRes] = await Promise.all([
            totalPromise, activePromise, closedPromise, outItemsPromise
        ]);

        const outItems = outItemsRes.data
            ? outItemsRes.data.reduce((sum: number, t: any) => sum + (Array.isArray(t.items) ? t.items.length : 0), 0)
            : 0;

        return {
            total: totalRes.count || 0,
            active: activeRes.count || 0,
            closed: closedRes.count || 0,
            outItems
        };
    }

    async getTransaction(id: string): Promise<Transaction | null> {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return null;
        }

        const t = data;
        return {
            ...t,
            userId: t.user_id,
            timestampOut: t.timestamp_out,
            preCheckoutConditions: t.pre_checkout_conditions,
            postReturnConditions: t.post_return_conditions,
            additionalUsers: t.additional_users,
            notes: t.notes,
            shootId: t.shoot_id
        } as Transaction;
    }

    async saveTransaction(transaction: Transaction, systemId?: string, displayId?: string): Promise<void> {
        const dbTransaction = {
            id: transaction.id,
            user_id: transaction.userId,
            items: transaction.items,
            timestamp_out: transaction.timestampOut,
            project: transaction.project,
            shoot_id: transaction.shootId || null,
            pre_checkout_conditions: transaction.preCheckoutConditions,
            status: transaction.status,
            additional_users: transaction.additionalUsers,
            notes: transaction.notes,
            system_id: systemId,   // New UUID
            display_id: displayId  // New Readable ID
        };

        const { error } = await supabase
            .from('transactions')
            .insert(dbTransaction);

        if (error) console.error('Error saving transaction:', error);
    }

    async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
        const dbUpdates: any = { ...updates };
        delete dbUpdates.id;

        if (updates.userId !== undefined) { dbUpdates.user_id = updates.userId; }
        delete dbUpdates.userId;

        if (updates.timestampOut !== undefined) { dbUpdates.timestamp_out = updates.timestampOut; }
        delete dbUpdates.timestampOut;

        if (updates.timestampIn !== undefined) { dbUpdates.timestamp_in = updates.timestampIn; }
        delete dbUpdates.timestampIn;

        if (updates.preCheckoutConditions !== undefined) { dbUpdates.pre_checkout_conditions = updates.preCheckoutConditions; }
        delete dbUpdates.preCheckoutConditions;

        if (updates.postReturnConditions !== undefined) { dbUpdates.post_return_conditions = updates.postReturnConditions; }
        delete dbUpdates.postReturnConditions;

        if (updates.additionalUsers !== undefined) { dbUpdates.additional_users = updates.additionalUsers; }
        delete dbUpdates.additionalUsers;

        if (updates.shootId !== undefined) { dbUpdates.shoot_id = updates.shootId; }
        delete dbUpdates.shootId;

        const { error } = await supabase
            .from('transactions')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            console.error('Error updating transaction:', error);
            throw error;
        }
    }

    // Logs
    async getLogs(page?: number, limit?: number, search?: string): Promise<Log[]> {
        let query = supabase
            .from('logs')
            .select('*', { count: 'exact' }) // Get count for UI logic if needed later
            .order('timestamp', { ascending: false });

        if (search) {
            query = query.or(`details.ilike.%${search}%,action.ilike.%${search}%`);
        }

        if (page && limit) {
            const from = (page - 1) * limit;
            const to = from + limit - 1;
            query = query.range(from, to);
        } else if (limit) {
            // Support just limit without page
            query = query.limit(limit);
        }
        // If no page/limit, we fetch all? Current app expects all.
        // Let's default to fetching all if NOT specified, to allow backward compatibility 
        // with other components (like getLogsByEntity calls if they existed).
        // But getLogs() is mainly used in Admin Logs page.

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching logs:', error);
            return [];
        }

        return data.map((l: any) => ({
            ...l,
            entityId: l.entity_id,
            userId: l.user_id,
            oldValue: l.old_value,
            newValue: l.new_value
        })) as Log[];
    }

    async getLogsByEntity(entityId: string): Promise<Log[]> {
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .eq('entity_id', entityId)
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Error fetching logs for entity:', error);
            return [];
        }

        return data.map((l: any) => ({
            ...l,
            entityId: l.entity_id,
            userId: l.user_id,
            oldValue: l.old_value,
            newValue: l.new_value
        })) as Log[];
    }

    async addLog(log: Log): Promise<void> {
        const dbLog = {
            id: log.id,
            action: log.action,
            entity_id: log.entityId,
            user_id: log.userId,
            timestamp: log.timestamp,
            details: log.details,
            old_value: log.oldValue,
            new_value: log.newValue
        };

        const { error } = await supabase
            .from('logs')
            .insert(dbLog);

        if (error) console.error('Error adding log:', error);
    }

    async resetData(): Promise<void> {
        await supabase.from('equipment').delete().neq('id', '0');
        await supabase.from('transactions').delete().neq('id', '0');
        await supabase.from('logs').delete().neq('id', '0');
        await supabase.from('notifications').delete().neq('id', '0');
    }

    // Notifications
    async getNotifications(userId: string): Promise<any[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching notifications:', error);
            // Log full error details for debugging
            console.dir(error);
            return [];
        }

        return data.map((n: any) => ({
            id: n.id,
            userId: n.user_id,
            title: n.title,
            message: n.message,
            link: n.link,
            read: n.read,
            createdAt: n.created_at
        }));
    }

    async addNotification(notification: { userId: string, title: string, message: string, link?: string }): Promise<void> {
        const dbNotification = {
            user_id: notification.userId,
            title: notification.title,
            message: notification.message,
            link: notification.link,
            read: false
        };

        const { error } = await supabase
            .from('notifications')
            .insert(dbNotification);

        if (error) console.error('Error adding notification:', error);
    }

    async markNotificationRead(id: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', id);

        if (error) console.error('Error marking notification read:', error);
    }

    async deleteNotification(id: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting notification:', error);
    }

    async deleteAllNotifications(userId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userId);

        if (error) console.error('Error deleting all notifications:', error);
    }

    // Shoots
    async getShoots(): Promise<Shoot[]> {
        const { data, error } = await supabase
            .from('shoots')
            .select('*')
            .order('start_time', { ascending: true });

        if (error) {
            console.error('Error fetching shoots:', error);
            return [];
        }

        return data.map((s: any) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            location: s.location,
            status: s.status,
            startTime: s.start_time,
            endTime: s.end_time,
            pocName: s.poc_name,
            pocContact: s.poc_contact,
            requiredRoles: s.required_roles,
            createdBy: s.created_by,
            googleEventId: s.google_event_id, // Map DB column to type
            shootNumber: s.shoot_number,
            jiraTicketId: s.jira_ticket_id
        })) as Shoot[];
    }

    async saveShoot(shoot: Shoot): Promise<void> {
        const dbShoot = {
            id: shoot.id,
            title: shoot.title,
            description: shoot.description,
            location: shoot.location,
            status: shoot.status,
            start_time: shoot.startTime,
            end_time: shoot.endTime,
            poc_name: shoot.pocName,
            poc_contact: shoot.pocContact,
            required_roles: shoot.requiredRoles,
            created_by: shoot.createdBy,
            google_event_id: shoot.googleEventId || null, // Save to DB, ensure null if undefined
            jira_ticket_id: shoot.jiraTicketId || null
        };

        const { error } = await supabase
            .from('shoots')
            .upsert(dbShoot);

        if (error) {
            console.error('Error saving shoot:', error.message, error.details, error);
            throw error;
        }
    }

    async updateShoot(id: string, updates: Partial<Shoot>): Promise<void> {
        const dbUpdates: any = { ...updates };
        delete dbUpdates.id;

        if (updates.startTime !== undefined) {
            dbUpdates.start_time = updates.startTime;
            delete dbUpdates.startTime;
        }
        if (updates.endTime !== undefined) {
            dbUpdates.end_time = updates.endTime;
            delete dbUpdates.endTime;
        }
        if (updates.pocName !== undefined) {
            dbUpdates.poc_name = updates.pocName;
            delete dbUpdates.pocName;
        }
        if (updates.pocContact !== undefined) {
            dbUpdates.poc_contact = updates.pocContact;
            delete dbUpdates.pocContact;
        }
        if (updates.requiredRoles !== undefined) {
            dbUpdates.required_roles = updates.requiredRoles;
            delete dbUpdates.requiredRoles;
        }
        if (updates.createdBy !== undefined) {
            dbUpdates.created_by = updates.createdBy;
            delete dbUpdates.createdBy;
        }
        if (updates.googleEventId !== undefined) {
            dbUpdates.google_event_id = updates.googleEventId;
            delete dbUpdates.googleEventId;
        }
        if (updates.jiraTicketId !== undefined) {
            dbUpdates.jira_ticket_id = updates.jiraTicketId;
            delete dbUpdates.jiraTicketId;
        }

        const { error } = await supabase
            .from('shoots')
            .update(dbUpdates)
            .eq('id', id);

        if (error) {
            console.error('Error updating shoot:', error);
            throw error;
        }
    }

    async deleteShoot(id: string): Promise<void> {
        const { error } = await supabase
            .from('shoots')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting shoot:', error);
    }

    // Assignments
    async getAssignments(): Promise<Assignment[]> {
        const { data, error } = await supabase
            .from('assignments')
            .select('*');

        if (error) {
            console.error('Error fetching assignments:', error);
            return [];
        }

        return data.map((a: any) => ({
            id: a.id,
            shootId: a.shoot_id,
            userId: a.user_id,
            role: a.role,
            status: a.status
        })) as Assignment[];
    }

    async saveAssignments(assignments: Assignment[]): Promise<void> {
        const dbAssignments = assignments.map(a => ({
            id: a.id,
            shoot_id: a.shootId,
            user_id: a.userId,
            role: a.role,
            status: a.status
        }));

        const { error } = await supabase
            .from('assignments')
            .upsert(dbAssignments);

        if (error) console.error('Error saving assignments:', error);
    }

    async deleteAssignment(id: string): Promise<void> {
        const { error } = await supabase
            .from('assignments')
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting assignment:', error);
    }

    // Sessions tracking
    async getUserSessions(userId: string): Promise<any[]> {
        const { data, error } = await supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('last_active_at', { ascending: false });

        if (error) {
            console.error('Error fetching sessions:', error);
            return [];
        }
        return data;
    }

    async upsertSession(userId: string, userAgent: string): Promise<void> {
        const { error } = await supabase
            .from('user_sessions')
            .upsert({
                user_id: userId,
                user_agent: userAgent,
                last_active_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, user_agent'
            });

        if (error) {
            console.error('Error upserting session:', error);
        }
    }

    async deleteSession(userId: string, userAgent: string): Promise<void> {
        await supabase
            .from('user_sessions')
            .delete()
            .match({ user_id: userId, user_agent: userAgent });
    }

    async deleteAllUserSessions(userId: string): Promise<void> {
        const { error } = await supabase
            .from('user_sessions')
            .delete()
            .eq('user_id', userId);

        if (error) console.error('Error deleting all user sessions:', error);
    }
}

export const storage = new StorageService();
