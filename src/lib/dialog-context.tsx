'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface DialogOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'primary' | 'danger';
}

interface DialogContextType {
    confirm: (options: DialogOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [dialog, setDialog] = useState<DialogOptions | null>(null);
    const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

    const confirm = useCallback((options: DialogOptions) => {
        return new Promise<boolean>((resolve) => {
            setDialog(options);
            setResolveRef(() => resolve);
        });
    }, []);

    const handleCancel = () => {
        if (resolveRef) resolveRef(false);
        setDialog(null);
    };

    const handleConfirm = () => {
        if (resolveRef) resolveRef(true);
        setDialog(null);
    };

    return (
        <DialogContext.Provider value={{ confirm }}>
            {children}
            {dialog && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={handleCancel}
                    />
                    <div className="relative w-full max-w-[420px] bg-white/95 backdrop-blur-2xl rounded-[24px] overflow-hidden shadow-2xl animate-in zoom-in-95 fade-in duration-300">
                        <div className="px-6 pt-7 pb-5 text-center">
                            <h3 className="text-[20px] font-bold text-[#1d1d1f] mb-2 leading-tight">
                                {dialog.title}
                            </h3>
                            <p className={`max-h-[50vh] overflow-y-auto text-[15px] text-[#8e8e93] leading-relaxed px-1 ${dialog.message.includes('\n') ? 'whitespace-pre-line text-left' : ''}`}>
                                {dialog.message}
                            </p>
                        </div>

                        <div className="flex flex-col border-t border-[#c6c6c8]/30">
                            <button
                                onClick={handleConfirm}
                                className={`w-full py-4 text-[17px] font-semibold active:bg-[#f2f2f7] transition-colors ${dialog.variant === 'danger' ? 'text-[#ff3b30]' : 'text-[var(--primary)]'
                                    }`}
                            >
                                {dialog.confirmLabel || 'Confirm'}
                            </button>
                            <div className="h-[0.5px] bg-[#c6c6c8]/30" />
                            <button
                                onClick={handleCancel}
                                className="w-full py-4 text-[17px] font-medium text-[var(--primary)] active:bg-[#f2f2f7] transition-colors"
                            >
                                {dialog.cancelLabel || 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};

export const useConfirm = () => {
    const context = useContext(DialogContext);
    if (!context) throw new Error('useConfirm must be used within DialogProvider');
    return context.confirm;
};
