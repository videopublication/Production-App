import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'glass';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading,
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
        primary: 'bg-[#0071e3] text-white hover:bg-[#0077ed] active:scale-[0.98]',
        secondary: 'bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dcdce0] active:scale-[0.98] dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
        outline: 'bg-transparent text-[#1d1d1f] border border-[#d2d2d7] hover:bg-[#f5f5f7] active:scale-[0.98] dark:text-white dark:border-gray-700 dark:hover:bg-white/10',
        ghost: 'bg-transparent text-[#1d1d1f] hover:bg-[#f5f5f7] active:scale-[0.98] dark:text-gray-300 dark:hover:bg-white/5',
        danger: 'bg-[#ff3b30] text-white hover:bg-[#ff453a] active:scale-[0.98]',
        success: 'bg-[#34c759] text-white hover:bg-[#30d158] active:scale-[0.98]',
        glass: 'bg-white/70 backdrop-blur-xl text-[#1d1d1f] hover:bg-white/90 active:scale-[0.98] dark:bg-white/10 dark:text-white dark:hover:bg-white/20',
    };

    const sizes = {
        sm: 'h-8 px-4 text-[13px] font-medium',
        md: 'h-11 px-5 text-[15px] font-medium',
        lg: 'h-12 px-6 text-[17px] font-semibold',
        icon: 'h-10 w-10 p-0',
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : null}
            {children}
        </button>
    );
};
