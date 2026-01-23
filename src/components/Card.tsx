import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
    description?: string;
    footer?: React.ReactNode;
    variant?: 'default' | 'glass' | 'outline';
    hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    title,
    description,
    footer,
    variant = 'default',
    hover = false
}) => {
    const variants = {
        default: 'card-matte',
        glass: 'glass text-foreground rounded-3xl',
        outline: 'bg-transparent border border-input text-foreground rounded-3xl'
    };

    const hoverStyles = hover ? 'cursor-pointer' : '';

    return (
        <div className={`${variants[variant]} ${hoverStyles} ${className}`}>
            {(title || description) && (
                <div className="flex flex-col space-y-1 p-3 sm:p-4 md:p-6">
                    {title && <h3 className="text-lg sm:text-xl md:text-2xl font-semibold leading-none tracking-tight">{title}</h3>}
                    {description && <p className="text-xs sm:text-sm text-muted-foreground">{description}</p>}
                </div>
            )}
            <div className={`p-3 sm:p-4 md:p-6 ${title || description ? 'pt-0' : ''}`}>
                {children}
            </div>
            {footer && (
                <div className="flex items-center p-3 sm:p-4 md:p-6 pt-0">
                    {footer}
                </div>
            )}
        </div>
    );
};
