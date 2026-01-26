import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
}

interface SelectProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
    onOpenChange?: (isOpen: boolean) => void;
}

export const Select: React.FC<SelectProps> = ({
    label,
    value,
    onChange,
    options,
    placeholder = 'Select an option',
    className = '',
    onOpenChange
}) => {
    const [isOpen, setIsOpen] = useState(false);

    // Notify parent of state change
    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
        if (!isOpen) {
            setSearch('');
        }
    }, [isOpen]);

    // Handle back button to close dropdown
    useEffect(() => {
        if (isOpen) {
            // Push state when opening
            window.history.pushState({ selectOpen: true }, '', window.location.href);

            const handlePopState = () => {
                // When back button is pressed, close dropdown
                setIsOpen(false);
            };

            window.addEventListener('popstate', handlePopState);
            return () => {
                window.removeEventListener('popstate', handlePopState);
            };
        }
    }, [isOpen]);

    return (
        <div className={`${className}`} ref={containerRef}>
            {label && (
                <label className="block text-[13px] font-medium text-muted-foreground mb-2">
                    {label}
                </label>
            )}
            <div className="relative">
                {/* Search Input Trigger */}
                <div
                    onClick={() => {
                        setIsOpen(true);
                        searchInputRef.current?.focus();
                    }}
                    className={`flex h-12 w-full items-center gap-2 rounded-xl bg-[#f5f5f7] dark:bg-[#2c2c2e] px-3 text-[15px] transition-all duration-200 border border-transparent ${isOpen
                        ? 'ring-2 ring-primary bg-white dark:bg-[#1c1c1e]'
                        : 'hover:bg-[#e8e8ed] dark:hover:bg-[#3a3a3c]'
                        }`}
                >
                    <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>

                    <input
                        ref={searchInputRef}
                        type="text"
                        className="flex-1 w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
                        placeholder={selectedOption ? selectedOption.label : placeholder}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />

                    <div className="flex items-center gap-1">
                        {selectedOption && selectedOption.value && !search && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                                Selected
                            </span>
                        )}
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isOpen) {
                                    window.history.back(); // Using history back ensures state is cleaned up
                                } else {
                                    setIsOpen(true);
                                }
                            }}
                            className="cursor-pointer p-1"
                        >
                            <svg
                                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Dropdown Panel */}
                {isOpen && (
                    <div
                        className="absolute z-[100] mt-2 w-full overflow-hidden rounded-2xl bg-white dark:bg-[#1c1c1e] border border-border"
                        style={{ boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)' }}
                    >
                        {/* Options list */}
                        <div className="max-h-56 overflow-auto p-2">
                            {filteredOptions.length === 0 ? (
                                <div className="py-6 text-center text-[14px] text-muted-foreground">
                                    {search ? 'No matches found.' : 'No options available.'}
                                </div>
                            ) : (
                                filteredOptions.map((option, index) => (
                                    <div
                                        key={option.value}
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                            setSearch(''); // Clear search on select
                                        }}
                                        className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[15px] transition-colors ${index < filteredOptions.length - 1 ? 'mb-1' : ''
                                            } ${value === option.value
                                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                                                : 'text-foreground hover:bg-[#f5f5f7] dark:hover:bg-[#2c2c2e]'
                                            }`}
                                    >
                                        <span>{option.label}</span>
                                        {value === option.value && (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
