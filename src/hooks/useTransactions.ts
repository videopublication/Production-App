import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Transaction } from '@/types';

export function useTransactions() {
    const queryClient = useQueryClient();

    const transactionsQuery = useQuery({
        queryKey: ['transactions'],
        queryFn: () => storage.getTransactions(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 2,
    });

    const updateTransactionMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Transaction> }) =>
            storage.updateTransaction(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
    });

    return {
        transactions: transactionsQuery.data || [],
        isLoading: transactionsQuery.isLoading,
        isError: transactionsQuery.isError,
        error: transactionsQuery.error,
        updateTransaction: updateTransactionMutation.mutateAsync,
        isUpdating: updateTransactionMutation.isPending,
        refresh: () => transactionsQuery.refetch()
    };
}
