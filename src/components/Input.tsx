import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-[#424245] mb-2">
                    {label}
                </label>
            )}
            <input
                className={`flex h-12 w-full rounded-2xl border border-input bg-secondary px-4 py-2 text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 ${error ? 'border-destructive focus:ring-destructive' : ''
                    } ${className}`}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-destructive px-1">{error}</p>}
        </div>
    );
};
