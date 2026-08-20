import React from 'react';

interface JiraIconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    className?: string;
}

export function JiraIcon({ size = 16, className = '', ...props }: JiraIconProps) {
    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            {...props}
        >
            <path d="M51.5 16.3C57.6 27.5 55.4 43.6 42.6 56.8H24.5C22.0 56.8 20.6 54.1 21.9 52.0L51.5 16.3Z" />
            <path d="M48.5 83.7C42.4 72.5 44.6 56.4 57.4 43.2H75.5C78.0 43.2 79.4 45.9 78.1 48.0L48.5 83.7Z" />
        </svg>
    );
}

export default JiraIcon;
