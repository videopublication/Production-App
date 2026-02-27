import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Equipment } from '@/types';
import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';

export const EQUIPMENT_KEYS = {
    all: ['equipment'] as const,
    byDept: (deptId: string | null) => ['equipment', deptId] as const,
    detail: (id: string) => ['equipment', 'detail', id] as const,
};

/**
 * Returns the effective department ID for equipment queries.
 * - Regular users: ALWAYS their own department (enforced, not optional)
 * - Super Admins: uses the department context switcher (null = all)
 */
function useEffectiveDepartmentId(): { deptId: string | null; user: any } {
    const { user } = useAuth();
    const { department } = useDepartment();

    // Regular users: ALWAYS filter by their own department, regardless of context
    if (user && user.role !== 'SUPER_ADMIN' && user.departmentId) {
        return { deptId: user.departmentId, user };
    }

    // Super Admin: use selected department from context (null = global/all)
    return { deptId: department?.id || null, user };
}

export function useEquipment() {
    const { deptId, user } = useEffectiveDepartmentId();

    return useQuery({
        queryKey: EQUIPMENT_KEYS.byDept(deptId),
        queryFn: () => storage.getEquipment(deptId),
        enabled: !!user, // Don't fetch until user is loaded
        staleTime: 0,
    });
}

export function useEquipmentItem(id: string) {
    const { deptId, user } = useEffectiveDepartmentId();

    return useQuery({
        queryKey: EQUIPMENT_KEYS.detail(id),
        queryFn: async () => {
            const allItems = await storage.getEquipment(deptId);

            const decodedId = decodeURIComponent(id);
            const found = allItems.find(e =>
                e.id === id ||
                e.barcode === id ||
                e.barcode === decodedId
            );

            if (!found) {
                console.warn(`Equipment lookup failed. Searched for "${id}" (decoded: "${decodedId}") in ${allItems.length} items.`);
            }

            return found || null;
        },
        enabled: !!id && !!user,
    });
}

export function useAddEquipment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (item: Equipment) => storage.addEquipment(item),
        onSuccess: () => {
            // Invalidate all equipment queries (any department)
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        },
    });
}

export function useUpdateEquipment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Equipment> }) =>
            storage.updateEquipment(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        },
    });
}

export function useSaveEquipment() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (items: Equipment[]) => storage.saveEquipment(items),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        }
    })
}

export function useDeleteEquipment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: string[]) => storage.bulkDeleteEquipment(ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        },
    });
}
