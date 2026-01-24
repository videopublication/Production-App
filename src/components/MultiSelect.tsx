import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
}

interface MultiSelectProps {
    label?: string;
    value: string[];
    onChange: (value: string[]) => void;
    options: Option[];
    placeholder?: string;
    className?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
    label,
    value,
    onChange,
    options,
    placeholder = 'Select options',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Get selected option objects to display labels
    const selectedOptions = options.filter(opt => value.includes(opt.value));

    // Derived display text
    const getDisplayText = () => {
        if (selectedOptions.length === 0) return placeholder;
        if (selectedOptions.length === 1) return selectedOptions[0].label;
        if (selectedOptions.length <= 2) return selectedOptions.map(o => o.label.split(' ')[0]).join(', '); // Show first names if 2
        return `${selectedOptions.length} Selected`;
    };

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
        if (!isOpen) {
            setSearch('');
        }
    }, [isOpen]);

    const toggleOption = (optionValue: string) => {
        const newValues = value.includes(optionValue)
            ? value.filter(v => v !== optionValue)
            : [...value, optionValue];
        onChange(newValues);
    };

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
                        ? 'ring-2 ring-[#0071e3] bg-white dark:bg-[#1c1c1e]'
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
                        placeholder={selectedOptions.length > 0 ? `${selectedOptions.length} Selected` : placeholder}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />

                    <div className="flex items-center gap-1">
                        {selectedOptions.length > 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#0071e3]/10 text-[#0071e3]">
                                {selectedOptions.length}
                            </span>
                        )}
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

                {/* Dropdown Panel */}
                {isOpen && (
                    <div
                        className="absolute z-[100] mt-2 w-full overflow-hidden rounded-2xl bg-white dark:bg-[#1c1c1e] border border-border"
                        style={{ boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)' }}
                    >
                        {/* Options list */}
                        <div className="max-h-64 overflow-auto p-2">
                            {filteredOptions.length === 0 ? (
                                <div className="py-6 text-center text-[14px] text-muted-foreground">
                                    {search ? 'No matches found.' : 'No options available.'}
                                </div>
                            ) : (
                                filteredOptions.map((option, index) => {
                                    const isSelected = value.includes(option.value);
                                    return (
                                        <div
                                            key={option.value}
                                            onClick={() => {
                                                toggleOption(option.value);
                                                // Keep focus on input for continued typing/selecting
                                                searchInputRef.current?.focus();
                                            }}
                                            className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[15px] transition-colors ${index < filteredOptions.length - 1 ? 'mb-1' : ''
                                                } ${isSelected
                                                    ? 'bg-[#0071e3]/5 dark:bg-[#0071e3]/20 text-[#0071e3] font-semibold'
                                                    : 'text-foreground hover:bg-[#f5f5f7] dark:hover:bg-[#2c2c2e]'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${isSelected ? 'bg-[#0071e3] border-[#0071e3]' : 'border-border bg-white dark:bg-black'
                                                    }`}>
                                                    {isSelected && (
                                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span>{option.label}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
