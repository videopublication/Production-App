import { supabase } from './supabase';
import { User, Equipment, Transaction, Log, Shoot, Assignment, Department, Leave, PlannerDraftAssignment, AssignmentSegment } from '@/types';
import { decodeTransactionNotes, encodeTransactionNotes } from './transaction-manual-items';

class StorageService {
    // Departments
    async getDepartments(): Promise<Department[]> {
        const { data, error } = await supabase
            .from('departments')
            .select('*');

        if (error) {
            console.error('Error fetching departments:', error);
            return [];
        }
        return data.map((d: any) => ({
            id: d.id,
            name: d.name,
            slug: d.slug,
            enabledFeatures: d.enabled_features,
            settings: d.settings
        })) as Department[];
    }

    async addDepartment(dept: Partial<Department>): Promise<void> {
        const dbDept = {
            id: dept.id,
            name: dept.name,
            slug: dept.slug,
            enabled_features: dept.enabledFeatures || [],
            settings: dept.settings || {}
        };
        const { error } = await supabase.from('departments').insert(dbDept);
        if (error) throw error;
    }

    async updateDepartment(id: string, updates: Partial<Department>): Promise<void> {
        const dbUpdates: any = {};
        if (updates.name) dbUpdates.name = updates.name;
        if (updates.slug) dbUpdates.slug = updates.slug;
        if (updates.enabledFeatures) dbUpdates.enabled_features = updates.enabledFeatures;
        if (updates.settings) dbUpdates.settings = updates.settings;

        const { error } = await supabase.from('departments').update(dbUpdates).eq('id', id);
        if (error) throw error;
    }

    // Users
    async getUsers(departmentId?: string | null): Promise<User[]> {
        let query = supabase.from('users').select('*');

        if (departmentId) {
            query = query.or(`department_id.eq.${departmentId},role.eq.SUPER_ADMIN`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching users:', error);
            return [];
        }
        return data.map((u: any) => ({
            ...u,
            fcmToken: u.fcm_token,
            departmentId: u.department_id,
            isPrimaryLeaveApprover: u.is_primary_leave_approver,
            canManageExpenses: u.can_manage_expenses,
            canBeAssignedToShoots: u.can_be_assigned_to_shoots
        })) as User[];
    }

    async updateUser(id: string, updates: Partial<User>): Promise<void> {
        const dbUpdates: any = { ...updates };
        if (updates.fcmToken !== undefined) {
            dbUpdates.fcm_token = updates.fcmToken;
            delete dbUpdates.fcmToken;
        }
        if (updates.departmentId !== undefined) {
            dbUpdates.department_id = updates.departmentId;
            delete dbUpdates.departmentId;
        }
        if (updates.isPrimaryLeaveApprover !== undefined) {
            dbUpdates.is_primary_leave_approver = updates.isPrimaryLeaveApprover;
            delete dbUpdates.isPrimaryLeaveApprover;
        }
        if (updates.canManageExpenses !== undefined) {
            dbUpdates.can_manage_expenses = updates.canManageExpenses;
            delete dbUpdates.canManageExpenses;
        }
        if (updates.canBeAssignedToShoots !== undefined) {
            dbUpdates.can_be_assigned_to_shoots = updates.canBeAssignedToShoots;
            delete dbUpdates.canBeAssignedToShoots;
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
    async getEquipment(departmentId?: string | null): Promise<Equipment[]> {
        let query = supabase.from('equipment').select('*');

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching equipment:', error);
            return [];
        }



        return data.map((item: any) => ({
            ...item,
            serialNumber: item.serial_number,
            assignedTo: item.assigned_to,
            lastActivity: item.last_activity,
            createdAt: item.created_at,
            departmentId: item.department_id
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
            metadata: item.metadata,
            assigned_to: item.assignedTo,
            last_activity: item.lastActivity,
            department_id: item.departmentId || null
        }));

        // Use the admin API route to bypass RLS for bulk upsert
        const res = await fetch('/api/admin/equipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: dbItems })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('Error saving equipment:', err);
            throw new Error(err.error || 'Failed to save equipment');
        }
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
            metadata: item.metadata,
            assigned_to: item.assignedTo,
            last_activity: item.lastActivity,
            department_id: item.departmentId
        };

        const { error } = await supabase
            .from('equipment')
            .insert(dbItem);

        if (error) {
            console.error('Error adding equipment:', error);
            throw error;
        }
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

        if (updates.departmentId !== undefined) {
            dbUpdates.department_id = updates.departmentId;
            delete dbUpdates.departmentId;
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
        searchUserIds?: string[],  // OR match (e.g. results for "John" where John is the user)
        departmentId?: string | null // Optional department filter
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

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching transactions:', error);
            return [];
        }

        return data.map((t: any) => {
            const decodedNotes = decodeTransactionNotes(t.notes);
            return {
                ...t,
                userId: t.user_id,
                timestampOut: t.timestamp_out,
                preCheckoutConditions: t.pre_checkout_conditions,
                postReturnConditions: t.post_return_conditions,
                additionalUsers: t.additional_users,
                notes: decodedNotes.notes,
                manualItems: decodedNotes.manualItems,
                shootId: t.shoot_id
            };
        }) as Transaction[];
    }

    async getTransactionStats(departmentId?: string | null): Promise<{ total: number, active: number, closed: number, outItems: number }> {
        // We can run these in parallel
        // 1. Total count
        let totalQuery = supabase.from('transactions').select('*', { count: 'exact', head: true });
        // 2. Active count
        let activeQuery = supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'OPEN');
        // 3. Closed count
        let closedQuery = supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'CLOSED');
        // 4. Out Items
        let outItemsQuery = supabase.from('transactions').select('items').eq('status', 'OPEN');

        if (departmentId) {
            totalQuery = totalQuery.eq('department_id', departmentId);
            activeQuery = activeQuery.eq('department_id', departmentId);
            closedQuery = closedQuery.eq('department_id', departmentId);
            outItemsQuery = outItemsQuery.eq('department_id', departmentId);
        }

        const [totalRes, activeRes, closedRes, outItemsRes] = await Promise.all([
            totalQuery, activeQuery, closedQuery, outItemsQuery
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
        const decodedNotes = decodeTransactionNotes(t.notes);
        return {
            ...t,
            userId: t.user_id,
            timestampOut: t.timestamp_out,
            preCheckoutConditions: t.pre_checkout_conditions,
            postReturnConditions: t.post_return_conditions,
            additionalUsers: t.additional_users,
            notes: decodedNotes.notes,
            manualItems: decodedNotes.manualItems,
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
            notes: encodeTransactionNotes(transaction.notes, transaction.manualItems),
            system_id: systemId,   // New UUID
            display_id: displayId, // New Readable ID
            department_id: transaction.departmentId
        };

        const { error } = await supabase
            .from('transactions')
            .insert(dbTransaction);

        if (error) console.error('Error saving transaction:', error);
    }

    async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
        const dbUpdates: any = { ...updates };
        delete dbUpdates.id;
        delete dbUpdates.manualItems;

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

        if (updates.departmentId !== undefined) { dbUpdates.department_id = updates.departmentId; }
        delete dbUpdates.departmentId;

        if (updates.notes !== undefined || updates.manualItems !== undefined) {
            const { data: currentTxn } = await supabase
                .from('transactions')
                .select('notes')
                .eq('id', id)
                .single();

            const current = decodeTransactionNotes(currentTxn?.notes);
            const nextNotes = updates.notes !== undefined ? updates.notes : current.notes;
            const nextManualItems = updates.manualItems !== undefined ? updates.manualItems : current.manualItems;
            dbUpdates.notes = encodeTransactionNotes(nextNotes, nextManualItems);
        }

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
    async getLogs(page?: number, limit?: number, search?: string, departmentId?: string | null, actionFilter?: string): Promise<Log[]> {
        let query = supabase
            .from('logs')
            .select('*', { count: 'exact' }) // Get count for UI logic if needed later
            .order('timestamp', { ascending: false });

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        if (actionFilter) {
            query = query.eq('action', actionFilter);
        }

        if (search) {
            query = query.or(`details.ilike.%${search}%,action.ilike.%${search}%,entity_id.ilike.%${search}%`);
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

    async getLogsByEntities(
        entityIds: string[],
        options?: { since?: string; until?: string }
    ): Promise<Log[]> {
        if (!entityIds || entityIds.length === 0) return [];

        const chunkSize = 100;
        let allLogs: any[] = [];

        for (let i = 0; i < entityIds.length; i += chunkSize) {
            const chunk = entityIds.slice(i, i + chunkSize);
            let query = supabase
                .from('logs')
                .select('*')
                .in('entity_id', chunk);
            if (options?.since) query = query.gte('timestamp', options.since);
            if (options?.until) query = query.lte('timestamp', options.until);
            const { data, error } = await query.order('timestamp', { ascending: false });

            if (error) {
                console.error('Error fetching logs for entities:', error);
            } else if (data) {
                allLogs = [...allLogs, ...data];
            }
        }

        return allLogs.map((l: any) => ({
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
            new_value: log.newValue,
            department_id: log.departmentId
        };

        const { error } = await supabase
            .from('logs')
            .insert(dbLog);

        if (error) console.error('Error adding log:', error.message || error);
    }

    async resetData(): Promise<void> {
        await supabase.from('equipment').delete().neq('id', '0');
        await supabase.from('transactions').delete().neq('id', '0');
        await supabase.from('logs').delete().neq('id', '0');
        await supabase.from('notifications').delete().neq('id', '0');
    }

    // Notifications
    async getNotifications(userId: string, departmentId?: string | null): Promise<any[]> {
        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId);

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }

        return data.map((n: any) => ({
            id: n.id,
            userId: n.user_id,
            title: n.title,
            message: n.message,
            link: n.link,
            read: n.read,
            createdAt: n.created_at,
            departmentId: n.department_id
        }));
    }

    async addNotification(notification: { userId: string, title: string, message: string, link?: string, departmentId?: string | null }): Promise<void> {
        const dbNotification = {
            user_id: notification.userId,
            title: notification.title,
            message: notification.message,
            link: notification.link,
            read: false,
            department_id: notification.departmentId
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
    async getShoots(departmentId?: string | null): Promise<Shoot[]> {
        let query = supabase
            .from('shoots')
            .select('*')
            .order('start_time', { ascending: true });

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

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
            ...(s.cancellation_reason ? { cancellationReason: s.cancellation_reason } : {}),
            shootNumber: s.shoot_number,
            jiraTicketId: s.jira_ticket_id,
            departmentId: s.department_id,
            expenses: s.expenses || []
        })) as Shoot[];
    }

    async saveShoot(shoot: Shoot): Promise<void> {
        const dbShoot: Record<string, unknown> = {
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
            jira_ticket_id: shoot.jiraTicketId || null,
            department_id: shoot.departmentId,
            expenses: shoot.expenses || []
        };

        if (shoot.cancellationReason !== undefined) {
            dbShoot.cancellation_reason = shoot.cancellationReason || null;
        }

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
        if (updates.cancellationReason !== undefined) {
            dbUpdates.cancellation_reason = updates.cancellationReason || null;
            delete dbUpdates.cancellationReason;
        }
        if (updates.jiraTicketId !== undefined) {
            dbUpdates.jira_ticket_id = updates.jiraTicketId;
            delete dbUpdates.jiraTicketId;
        }
        if (updates.departmentId !== undefined) {
            dbUpdates.department_id = updates.departmentId;
            delete dbUpdates.departmentId;
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
    async getAssignments(departmentId?: string | null): Promise<Assignment[]> {
        let query = supabase.from('assignments').select('*');

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching assignments:', error);
            return [];
        }

        return data.map((a: {
            id: string;
            shoot_id: string;
            user_id: string;
            role: string;
            status: Assignment['status'];
            department_id?: string;
        }) => ({
            id: a.id,
            shootId: a.shoot_id,
            userId: a.user_id,
            role: a.role,
            status: a.status,
            departmentId: a.department_id
        })) as Assignment[];
    }

    async saveAssignments(assignments: Assignment[]): Promise<void> {
        const dbAssignments = assignments.map(a => ({
            id: a.id,
            shoot_id: a.shootId,
            user_id: a.userId,
            role: a.role,
            status: a.status,
            department_id: a.departmentId
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

    // Planner draft assignments
    async getPlannerDraftAssignments(departmentId?: string | null): Promise<PlannerDraftAssignment[]> {
        let query = supabase
            .from('planner_draft_assignments')
            .select('*')
            .order('created_at', { ascending: true });

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) {
            if (error.code === '42P01') {
                console.warn('Planner draft assignments table is missing. Run migration_planner_draft_assignments.sql.');
                return [];
            }
            console.error('Error fetching planner draft assignments:', error);
            return [];
        }

        return data.map((a: {
            id: string;
            shoot_id: string;
            user_id: string;
            role: string;
            created_by?: string;
            created_at: string;
            department_id?: string;
        }) => ({
            id: a.id,
            shootId: a.shoot_id,
            userId: a.user_id,
            role: a.role,
            createdBy: a.created_by,
            createdAt: a.created_at,
            departmentId: a.department_id
        })) as PlannerDraftAssignment[];
    }

    async savePlannerDraftAssignments(assignments: PlannerDraftAssignment[]): Promise<void> {
        const dbAssignments = assignments.map(a => ({
            id: a.id,
            shoot_id: a.shootId,
            user_id: a.userId,
            role: a.role,
            created_by: a.createdBy,
            created_at: a.createdAt,
            department_id: a.departmentId
        }));

        const { error } = await supabase
            .from('planner_draft_assignments')
            .upsert(dbAssignments, { onConflict: 'shoot_id,user_id' });

        if (error) {
            console.error('Error saving planner draft assignments:', error);
            throw error;
        }
    }

    async deletePlannerDraftAssignment(id: string): Promise<void> {
        const { error } = await supabase
            .from('planner_draft_assignments')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting planner draft assignment:', error);
            throw error;
        }
    }

    async deletePlannerDraftAssignments(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        const { error } = await supabase
            .from('planner_draft_assignments')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('Error deleting planner draft assignments:', error);
            throw error;
        }
    }

    // Assignment schedule segments
    async getAssignmentSegments(departmentId?: string | null): Promise<AssignmentSegment[]> {
        let query = supabase
            .from('assignment_segments')
            .select('*')
            .order('start_time', { ascending: true });

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) {
            if (error.code === '42P01') {
                console.warn('Assignment segments table is missing. Run migration_assignment_segments.sql.');
                return [];
            }
            console.error('Error fetching assignment segments:', error);
            return [];
        }

        return data.map((segment: {
            id: string;
            assignment_id?: string | null;
            draft_assignment_id?: string | null;
            shoot_id: string;
            user_id: string;
            start_time: string;
            end_time: string;
            role?: string;
            note?: string;
            created_by?: string;
            created_at?: string;
            department_id?: string;
        }) => ({
            id: segment.id,
            assignmentId: segment.assignment_id,
            draftAssignmentId: segment.draft_assignment_id,
            shootId: segment.shoot_id,
            userId: segment.user_id,
            startTime: segment.start_time,
            endTime: segment.end_time,
            role: segment.role,
            note: segment.note,
            createdBy: segment.created_by,
            createdAt: segment.created_at,
            departmentId: segment.department_id,
        })) as AssignmentSegment[];
    }

    async saveAssignmentSegments(segments: AssignmentSegment[]): Promise<void> {
        if (segments.length === 0) return;

        const dbSegments = segments.map(segment => ({
            id: segment.id,
            assignment_id: segment.assignmentId || null,
            draft_assignment_id: segment.draftAssignmentId || null,
            shoot_id: segment.shootId,
            user_id: segment.userId,
            start_time: segment.startTime,
            end_time: segment.endTime,
            role: segment.role,
            note: segment.note,
            created_by: segment.createdBy,
            created_at: segment.createdAt,
            department_id: segment.departmentId
        }));

        const { error } = await supabase
            .from('assignment_segments')
            .upsert(dbSegments);

        if (error) {
            console.error('Error saving assignment segments:', error);
            throw error;
        }
    }

    async deleteAssignmentSegmentsByAssignmentIds(assignmentIds: string[]): Promise<void> {
        if (assignmentIds.length === 0) return;

        const { error } = await supabase
            .from('assignment_segments')
            .delete()
            .in('assignment_id', assignmentIds);

        if (error) {
            console.error('Error deleting assignment segments:', error);
            throw error;
        }
    }

    async deleteAssignmentSegmentsByDraftAssignmentIds(draftAssignmentIds: string[]): Promise<void> {
        if (draftAssignmentIds.length === 0) return;

        const { error } = await supabase
            .from('assignment_segments')
            .delete()
            .in('draft_assignment_id', draftAssignmentIds);

        if (error) {
            console.error('Error deleting draft assignment segments:', error);
            throw error;
        }
    }

    async deleteAssignmentSegmentsByIds(segmentIds: string[]): Promise<void> {
        if (segmentIds.length === 0) return;

        const { error } = await supabase
            .from('assignment_segments')
            .delete()
            .in('id', segmentIds);

        if (error) {
            console.error('Error deleting assignment segments by id:', error);
            throw error;
        }
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

    // Leaves
    async getLeaves(departmentId?: string | null): Promise<Leave[]> {
        let query = supabase.from('leaves').select('*').order('created_at', { ascending: false });

        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching leaves:', error);
            return [];
        }

        return data.map((l: any) => ({
            id: l.id,
            userId: l.user_id,
            departmentId: l.department_id,
            startDate: l.start_date,
            endDate: l.end_date,
            reason: l.reason,
            status: l.status,
            approverId: l.approver_id,
            createdAt: l.created_at,
            updatedAt: l.updated_at
        })) as Leave[];
    }

    async addLeave(leave: Partial<Leave>): Promise<void> {
        const dbLeave = {
            id: leave.id,
            user_id: leave.userId,
            department_id: leave.departmentId,
            start_date: leave.startDate,
            end_date: leave.endDate,
            reason: leave.reason,
            status: leave.status || 'PENDING',
            approver_id: leave.approverId || null
        };

        const { error } = await supabase.from('leaves').insert(dbLeave);
        if (error) {
            console.error('Error adding leave:', error);
            throw error;
        }
    }

    async updateLeave(id: string, updates: Partial<Leave>): Promise<void> {
        const dbUpdates: any = {};
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.approverId !== undefined) dbUpdates.approver_id = updates.approverId;
        if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
        if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
        if (updates.reason !== undefined) dbUpdates.reason = updates.reason;
        
        dbUpdates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('leaves').update(dbUpdates).eq('id', id);
        if (error) {
            console.error('Error updating leave:', error);
            throw error;
        }
    }

    async deleteLeave(id: string): Promise<void> {
        const { error } = await supabase.from('leaves').delete().eq('id', id);
        if (error) {
            console.error('Error deleting leave:', error);
            throw error;
        }
    }
}

const rawStorage = new StorageService();

// Debounced mutation event dispatcher
// During batch operations (e.g., checkout with 10 items), each storage call
// would fire immediately causing React Query to refetch mid-batch.
// This coalesces rapid-fire mutations into a single event after 300ms of quiet.
let _mutationTimer: ReturnType<typeof setTimeout> | null = null;
function dispatchMutationEvent() {
    if (typeof window === 'undefined') return;
    if (_mutationTimer) clearTimeout(_mutationTimer);
    _mutationTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('app-mutation'));
        _mutationTimer = null;
    }, 300);
}

export const storage = new Proxy(rawStorage, {
    get(target, prop, receiver) {
        const origMethod = Reflect.get(target, prop, receiver);
        if (typeof origMethod === 'function') {
            return async function (...args: any[]) {
                const result = await origMethod.apply(target, args);
                
                // Fire a debounced event for mutating operations so React Query
                // invalidates the cache ONCE after batch operations complete
                const propStr = String(prop);
                const isMutation = propStr.startsWith('add') || 
                                   propStr.startsWith('save') || 
                                   propStr.startsWith('update') || 
                                   propStr.startsWith('delete') || 
                                   propStr.startsWith('bulk') || 
                                   propStr.startsWith('mark') || 
                                   propStr.startsWith('reset') ||
                                   propStr.startsWith('upsert');
                                   
                if (isMutation) {
                    dispatchMutationEvent();
                }
                
                return result;
            };
        }
        return origMethod;
    }
});
