'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Equipment } from '@/types';
import { Button } from '@/components/Button';
import { downloadFile } from '@/lib/download';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';

const getSuffix = (index: number): string => {
    let s = '';
    let i = index;
    while (i >= 0) {
        s = String.fromCharCode((i % 26) + 65) + s;
        i = Math.floor(i / 26) - 1;
    }
    return s;
};

const guessModelCode = (name: string): string => {
    let s = name || '';
    s = s.replace(/\bIII\b/gi, '3').replace(/\bII\b/gi, '2').replace(/\bI\b/gi, '1');
    s = s.replace(/sony|canon|nikon|panasonic|fuji(film)?|blackmagic/gi, '');
    s = s.replace(/[^a-zA-Z0-9]/g, '');
    return s.toUpperCase().substring(0, 12);
};

const uuid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const CATEGORY_PREFIXES: Record<string, string> = {
    'Camera': 'CAM',
    'Lens': 'LENSE',
    'Tripod': 'TRI',
    'Audio': 'AUD',
    'Lighting': 'LIGHT',
    'Monitor': 'MON',
    'Accessory': 'ACC',
    'Cable': 'CBL',
    'Battery': 'BAT',
    'Storage': 'STR',
    'Grip': 'GRIP',
    'Drone': 'DRN',
};

interface BulkRow {
    id: string;
    category: string;
    company: string;
    model: string;
    serialNumber: string;
    location: string;
}

export default function BulkAddPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { department } = useDepartment();

    // Enforce department isolation
    const effectiveDeptId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [existingItems, setExistingItems] = useState<Equipment[]>([]);
    const [defaultLocation, setDefaultLocation] = useState('Suryakund Office');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [rows, setRows] = useState<BulkRow[]>([
        { id: uuid(), category: 'Camera', company: '', model: '', serialNumber: '', location: 'Suryakund Office' }
    ]);

    useEffect(() => {
        const loadItems = async () => {
            try {
                const items = await storage.getEquipment(effectiveDeptId);
                setExistingItems(items);
            } catch (error) {
                console.error('Failed to load inventory', error);
            } finally {
                setLoading(false);
            }
        };
        loadItems();
    }, []);

    const addRow = () => {
        setRows([...rows, {
            id: uuid(),
            category: 'Camera',
            company: '',
            model: '',
            serialNumber: '',
            location: defaultLocation
        }]);
    };

    const removeRow = (id: string) => {
        if (rows.length > 1) {
            setRows(rows.filter(r => r.id !== id));
        }
    };

    const updateRow = (id: string, updates: Partial<BulkRow>) => {
        setRows(rows.map(row => {
            if (row.id === id) {
                return { ...row, ...updates };
            }
            return row;
        }));
    };

    // Normalize model string for barcode (remove spaces, special chars, limit length)
    const normalizeModel = (model: string): string => {
        return guessModelCode(model).substring(0, 10);
    };

    const getPreviewBarcode = (row: BulkRow, rowIndex: number) => {
        if (!row.company && !row.model && !row.serialNumber) return '';
        // Removed early exit for missing model to allow fallback to serial number

        const prefix = CATEGORY_PREFIXES[row.category] || row.category.substring(0, 3).toUpperCase() || 'ITEM';
        const normalizedModel = normalizeModel(row.model || row.serialNumber || 'GEN');
        const baseBarcode = `${prefix}-${normalizedModel}`;

        // Count existing items with this base barcode
        const existingCount = existingItems.filter(i =>
            i.barcode.startsWith(baseBarcode + '-')
        ).length;

        // Count pending items with same base barcode before this row
        let pendingCount = 0;
        for (let i = 0; i < rowIndex; i++) {
            const prevRow = rows[i];
            const prevPrefix = CATEGORY_PREFIXES[prevRow.category] || prevRow.category.substring(0, 3).toUpperCase() || 'ITEM';
            const prevNormalizedModel = prevRow.model ? normalizeModel(prevRow.model) : (prevRow.serialNumber ? normalizeModel(prevRow.serialNumber) : 'UNKNOWN');
            const prevBase = `${prevPrefix}-${prevNormalizedModel}`;
            if (prevBase === baseBarcode) pendingCount++;
        }

        const sequenceNumber = existingCount + pendingCount + 1;
        return `${baseBarcode}-${sequenceNumber}`;
    };

    const getPreviewName = (row: BulkRow) => {
        if (!row.company && !row.model && !row.serialNumber) return '';
        if (!row.company && !row.model) return row.category;
        return `${row.company} ${row.model}`.trim();
    };

    const handleDownloadTemplate = () => {
        const headers = ['MATERIAL CATEGORY', 'COMPANY', 'MODEL', 'SERIAL NUMBER', 'Location'];
        const sampleRows = [
            ['CAMERA', 'SONY', 'A7S3', '5777780', 'Suryakund Office'],
            ['LENS', 'SONY G MASTER', '24 - 70', '2061797', 'Suryakund Office'],
            ['TRIPOD', 'SACHTLER', 'ACE', 'S2150M17049920', 'Suryakund Office']
        ];

        const csvContent = [
            headers.join(','),
            ...sampleRows.map(r => r.join(','))
        ].join('\n');

        // Use helper with CSV text
        downloadFile(csvContent, 'inventory_import_template.csv', 'text/csv;charset=utf-8');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split(/\r\n|\n/);
            const newRows: BulkRow[] = [];
            const duplicateSerials: string[] = [];

            // Heuristic to skip header: check if first row matches known headers
            const firstLine = lines[0]?.toLowerCase() || '';
            const startIdx = firstLine.includes('category') || firstLine.includes('material') || firstLine.includes('company') ? 1 : 0;

            for (let i = startIdx; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Allow comma separation (simple split)
                const cols = line.split(',');
                if (cols.length < 4) continue; // Skip invalid rows (need at least category, company, model, serial)

                // New format: MATERIAL CATEGORY, COMPANY, MODEL, SERIAL NUMBER, Location
                const category = cols[0]?.trim() || 'Camera';
                const company = cols[1]?.trim() || '';
                const model = cols[2]?.trim() || '';
                const serialNumber = cols[3]?.trim() || '';
                const loc = cols[4]?.trim() || defaultLocation;

                // Normalize category (capitalize first letter only)
                const normalizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

                // Completely empty row detection (after basic category fallback)
                if (!company && !model && !serialNumber) continue;

                if (serialNumber) {
                    // Check if serial already exists in inventory or in current batch
                    const isDuplicateInInventory = existingItems.some(item => item.serialNumber === serialNumber);
                    const isDuplicateInBatch = newRows.some(row => row.serialNumber === serialNumber);

                    if (isDuplicateInInventory || isDuplicateInBatch) {
                        duplicateSerials.push(`${serialNumber} (${company} ${model})`);
                        continue; // Skip processing this row
                    }
                }

                newRows.push({
                    id: uuid(),
                    category: normalizedCategory,
                    company,
                    model,
                    serialNumber,
                    location: loc
                });
            }

            if (duplicateSerials.length > 0) {
                alert(`Warning: ${duplicateSerials.length} items were skipped because their Serial Numbers already exist:\n\n${duplicateSerials.slice(0, 5).join('\n')}${duplicateSerials.length > 5 ? '\n...' : ''}`);
            }

            if (newRows.length > 0) {
                let currentRows = [...rows];
                // If only one empty row exists, replace it
                if (currentRows.length === 1 && !currentRows[0].company && !currentRows[0].model && !currentRows[0].serialNumber) {
                    currentRows = [];
                }
                setRows([...currentRows, ...newRows]);
            } else if (duplicateSerials.length === 0) {
                alert('No valid rows found in CSV. Make sure each row has at least Category, Company, or Model.');
            }
        };
        reader.readAsText(file);
        if (e.target) e.target.value = '';
    };

    const queryClient = useQueryClient();
    const handleSave = async () => {
        if (saving) return;
        
        if (!effectiveDeptId) {
            alert('Please select a specific department from the top dropdown before importing items. Cannot import to "All Organizations".');
            return;
        }

        setSaving(true);
        try {
            const newEquipment: Equipment[] = [];
            const baseCounts = new Map<string, number>();

            // Pre-calculate existing counts for each base barcode
            for (const row of rows) {
                // Skip completely empty rows
                if (!row.company && !row.model && !row.serialNumber) continue;

                const prefix = CATEGORY_PREFIXES[row.category] || row.category.substring(0, 3).toUpperCase() || 'ITEM';
                // Fallback: If no model, use full Serial Number or 'GEN' (Generic)
                // We use the full serial to ensure each item gets its own unique base barcode (1-to-1)
                const modelStr = row.model || row.serialNumber || 'GEN';
                const normalizedModel = normalizeModel(modelStr);
                const baseBarcode = `${prefix}-${normalizedModel}`;

                if (!baseCounts.has(baseBarcode)) {
                    const count = existingItems.filter(i => i.barcode.startsWith(baseBarcode + '-')).length;
                    baseCounts.set(baseBarcode, count);
                }
            }

            for (const row of rows) {
                // Skip completely empty rows
                if (!row.company && !row.model && !row.serialNumber) continue;

                const prefix = CATEGORY_PREFIXES[row.category] || row.category.substring(0, 3).toUpperCase() || 'ITEM';
                // Fallback: Use model OR Serial Number for barcode uniqueness
                const modelStr = row.model || row.serialNumber || 'GEN';
                const normalizedModel = normalizeModel(modelStr);
                const baseBarcode = `${prefix}-${normalizedModel}`;

                const currentCount = (baseCounts.get(baseBarcode) || 0) + 1;
                baseCounts.set(baseBarcode, currentCount);

                const barcode = `${baseBarcode}-${currentCount}`;
                const name = row.company || row.model ? `${row.company} ${row.model}`.trim() : row.category;

                newEquipment.push({
                    id: uuid(),
                    name: name,
                    category: row.category,
                    barcode: barcode,
                    status: 'AVAILABLE',
                    location: row.location || 'Storage',
                    condition: 'OK',
                    serialNumber: row.serialNumber || undefined,
                    assignedTo: undefined,
                    lastActivity: new Date().toISOString(),
                    departmentId: effectiveDeptId || undefined
                });
            }

            if (newEquipment.length === 0) {
                alert('Please add at least one valid item with company and model');
                setSaving(false);
                return;
            }

            await storage.saveEquipment(newEquipment);

            // Log the bulk import
            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'CREATE',
                    entityId: 'BULK_IMPORT',
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Bulk imported ${newEquipment.length} items to inventory`,
                    departmentId: effectiveDeptId || undefined
                });
            }

            // Invalidate React Query cache so new items show up in the inventory page
            queryClient.invalidateQueries({ queryKey: ['equipment'] });

            router.push('/inventory');
            router.refresh();
        } catch (error) {
            console.error('Save failed', error);
            alert('Failed to save items');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;

    return (
        <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-8">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button variant="secondary" onClick={() => router.push('/inventory')} size="sm" className="shrink-0">
                        <svg className="w-4 h-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="hidden sm:inline">Back</span>
                    </Button>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Bulk Import</h1>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleDownloadTemplate} size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                        <svg className="w-4 h-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="hidden sm:inline">Template</span>
                        <span className="sm:hidden">CSV</span>
                    </Button>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                        <svg className="w-4 h-4 sm:mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="hidden sm:inline">Upload CSV</span>
                        <span className="sm:hidden">Upload</span>
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".csv"
                    />
                </div>
            </div>

            {/* Department Confirmation Banner */}
            <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${department ? 'bg-indigo-50/50 border-indigo-100 text-indigo-800 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400' : 'bg-primary/5 border-primary/10 text-primary'}`}>
                <div className="p-2 bg-background/50 rounded-lg shadow-sm border border-border/50 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <div>
                    <span className="font-semibold block sm:inline">{!effectiveDeptId ? "Error: " : "Import Destination: "}</span>
                    {!effectiveDeptId ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">Please select a specific department from the top Navigation Bar. Cannot import to "All Organizations".</span>
                    ) : (
                        <>
                            <span>Items will be added permanently to </span>
                            <strong className="font-semibold">{department?.name}</strong>
                            <span>. Please verify this is correct before importing.</span>
                        </>
                    )}
                </div>
            </div>

            <div className="bg-secondary/20 border border-border rounded-xl p-3 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 bg-secondary/50 rounded-lg border border-border/50">
                    <label className="text-xs sm:text-sm font-medium whitespace-nowrap">Default Location:</label>
                    <input
                        className="bg-background border border-border rounded px-3 py-1.5 text-xs sm:text-sm w-full sm:max-w-xs focus:ring-1 focus:ring-primary outline-none"
                        value={defaultLocation}
                        onChange={(e) => {
                            setDefaultLocation(e.target.value);
                            setRows(rows.map(r => ({ ...r, location: e.target.value })));
                        }}
                    />
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/50 text-left">
                                <th className="py-3 px-2 font-medium text-muted-foreground w-8">#</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground w-[130px]">Category</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground min-w-[150px]">Company</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground w-[120px]">Model</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground min-w-[140px]">Serial Number</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground w-[150px]">Location</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground min-w-[180px]">Preview</th>
                                <th className="py-3 px-2 font-medium text-muted-foreground w-[50px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {rows.map((row, index) => (
                                <tr key={row.id} className="group hover:bg-white/5 transition-colors">
                                    <td className="py-2 px-2 text-muted-foreground text-xs">{index + 1}</td>
                                    <td className="py-2 px-2">
                                        <input
                                            list="categories"
                                            className="w-full bg-background border border-border rounded px-2 py-1.5 outline-none"
                                            value={row.category}
                                            onChange={(e) => updateRow(row.id, { category: e.target.value })}
                                            placeholder="e.g. Camera"
                                        />
                                    </td>
                                    <td className="py-2 px-2">
                                        <input
                                            className="w-full bg-background border border-border rounded px-2 py-1.5 outline-none"
                                            value={row.company}
                                            onChange={(e) => updateRow(row.id, { company: e.target.value })}
                                            placeholder="e.g. Sony"
                                        />
                                    </td>
                                    <td className="py-2 px-2">
                                        <input
                                            className="w-full bg-background border border-border rounded px-2 py-1.5 outline-none"
                                            value={row.model}
                                            onChange={(e) => updateRow(row.id, { model: e.target.value })}
                                            placeholder="e.g. A7S3"
                                        />
                                    </td>
                                    <td className="py-2 px-2">
                                        <input
                                            className="w-full bg-background border border-border rounded px-2 py-1.5 outline-none font-mono text-xs"
                                            value={row.serialNumber}
                                            onChange={(e) => updateRow(row.id, { serialNumber: e.target.value })}
                                            placeholder="e.g. 5777780"
                                        />
                                    </td>
                                    <td className="py-2 px-2">
                                        <input
                                            className="w-full bg-background border border-border rounded px-2 py-1.5 outline-none"
                                            value={row.location}
                                            onChange={(e) => updateRow(row.id, { location: e.target.value })}
                                        />
                                    </td>
                                    <td className="py-2 px-2">
                                        <div className="flex flex-col gap-1">
                                            {getPreviewName(row) && (
                                                <span className="text-xs text-foreground">{getPreviewName(row)}</span>
                                            )}
                                            {getPreviewBarcode(row, index) && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary font-mono border border-primary/20 whitespace-nowrap">
                                                    {getPreviewBarcode(row, index)}
                                                </span>
                                            )}
                                            {(!getPreviewBarcode(row, index)) && <span className="text-xs text-muted-foreground italic">Enter details...</span>}
                                        </div>
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                        <button onClick={() => removeRow(row.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                    {rows.map((row, index) => (
                        <div key={row.id} className="bg-background border border-border rounded-lg p-4 space-y-4 shadow-sm relative">
                            <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                <span className="text-sm font-medium text-muted-foreground">Item #{index + 1}</span>
                                <button onClick={() => removeRow(row.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
                                        <input
                                            list="categories"
                                            className="w-full bg-background border border-border rounded px-3 py-2 outline-none text-sm"
                                            value={row.category}
                                            onChange={(e) => updateRow(row.id, { category: e.target.value })}
                                            placeholder="e.g. Camera"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Company</label>
                                        <input
                                            className="w-full bg-background border border-border rounded px-3 py-2 outline-none text-sm"
                                            value={row.company}
                                            onChange={(e) => updateRow(row.id, { company: e.target.value })}
                                            placeholder="e.g. Sony"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Model</label>
                                        <input
                                            className="w-full bg-background border border-border rounded px-3 py-2 outline-none text-sm"
                                            value={row.model}
                                            onChange={(e) => updateRow(row.id, { model: e.target.value })}
                                            placeholder="e.g. A7S3"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Serial Number</label>
                                        <input
                                            className="w-full bg-background border border-border rounded px-3 py-2 outline-none font-mono text-xs"
                                            value={row.serialNumber}
                                            onChange={(e) => updateRow(row.id, { serialNumber: e.target.value })}
                                            placeholder="e.g. 5777780"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
                                    <input
                                        className="w-full bg-background border border-border rounded px-3 py-2 outline-none text-sm"
                                        value={row.location}
                                        onChange={(e) => updateRow(row.id, { location: e.target.value })}
                                    />
                                </div>

                                <div className="bg-secondary/20 rounded p-2">
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Preview</label>
                                    <div className="flex flex-wrap gap-1">
                                        {getPreviewName(row) && (
                                            <span className="text-xs text-foreground">{getPreviewName(row)}</span>
                                        )}
                                        {getPreviewBarcode(row, index) && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary font-mono border border-primary/20 whitespace-nowrap">
                                                {getPreviewBarcode(row, index)}
                                            </span>
                                        )}
                                        {(!row.model) && <span className="text-xs text-muted-foreground italic">Enter model...</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-border/50 gap-3 sm:gap-4">
                    <Button variant="secondary" onClick={addRow} size="sm" className="w-full sm:w-auto">Add Row</Button>
                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        <div className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                            Total: <span className="font-medium text-foreground">{rows.length}</span> items
                        </div>
                        <Button onClick={handleSave} disabled={saving || rows.every(r => !r.company && !r.model && !r.serialNumber)} size="sm" className="flex-1 sm:flex-none">
                            {saving ? 'Saving...' : 'Import All'}
                        </Button>
                    </div>
                </div>
            </div>

            <datalist id="categories">
                {Object.keys(CATEGORY_PREFIXES).map(cat => (
                    <option key={cat} value={cat} />
                ))}
            </datalist>
        </div>
    );
}
