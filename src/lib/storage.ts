import { supabase } from './supabase';
import { User, Equipment, Transaction, Log } from '@/types';

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
        delete dbUpdates.barcode;
        delete dbUpdates.name;
        delete dbUpdates.category;

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

    // Transactions
    async getTransactions(): Promise<Transaction[]> {
        const { data, error } = await supabase
            .from('transactions')
            .select('*');

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
            notes: t.notes
        })) as Transaction[];
    }

    async saveTransaction(transaction: Transaction): Promise<void> {
        const dbTransaction = {
            id: transaction.id,
            user_id: transaction.userId,
            items: transaction.items,
            timestamp_out: transaction.timestampOut,
            project: transaction.project,
            pre_checkout_conditions: transaction.preCheckoutConditions,
            status: transaction.status,
            additional_users: transaction.additionalUsers,
            notes: transaction.notes
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
    async getLogs(): Promise<Log[]> {
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .order('timestamp', { ascending: false });

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
}

export const storage = new StorageService();
