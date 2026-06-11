import type { Equipment } from '@/types';

export const EQUIPMENT_CATEGORY_PREFIXES: Record<string, string> = {
    Camera: 'CAM',
    Lens: 'LENSE',
    Tripod: 'TRI',
    Audio: 'AUD',
    Lighting: 'LIGHT',
    Monitor: 'MON',
    Accessory: 'ACC',
    Cable: 'CBL',
    Battery: 'BAT',
    Storage: 'STR',
    Grip: 'GRIP',
    Drone: 'DRN',
};

export const guessEquipmentModelCode = (name: string): string => {
    let value = name || '';
    value = value.replace(/\bIII\b/gi, '3').replace(/\bII\b/gi, '2').replace(/\bI\b/gi, '1');
    value = value.replace(/sony|canon|nikon|panasonic|fuji(film)?|blackmagic/gi, '');
    value = value.replace(/[^a-zA-Z0-9]/g, '');
    return value.toUpperCase().substring(0, 12);
};

export const normalizeEquipmentModelCode = (model: string): string => {
    return guessEquipmentModelCode(model).substring(0, 10) || 'GEN';
};

export const getEquipmentCategoryPrefix = (category: string): string => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) return 'ITM';

    const exactPrefix = EQUIPMENT_CATEGORY_PREFIXES[trimmedCategory];
    if (exactPrefix) return exactPrefix;

    const matchedCategory = Object.keys(EQUIPMENT_CATEGORY_PREFIXES).find(
        key => key.toLowerCase() === trimmedCategory.toLowerCase()
    );

    if (matchedCategory) return EQUIPMENT_CATEGORY_PREFIXES[matchedCategory];

    return trimmedCategory.substring(0, 3).toUpperCase();
};

export const getEquipmentBarcodeBase = (category: string, modelOrSerial: string): string => {
    return `${getEquipmentCategoryPrefix(category)}-${normalizeEquipmentModelCode(modelOrSerial || 'GEN')}`;
};

export const getNextEquipmentBarcode = (
    item: Pick<Equipment, 'category'> & { model?: string; serialNumber?: string },
    existingItems: Pick<Equipment, 'barcode'>[]
): string => {
    const baseBarcode = getEquipmentBarcodeBase(item.category, item.model || item.serialNumber || 'GEN');
    const existingCount = existingItems.filter(existingItem =>
        existingItem.barcode.startsWith(`${baseBarcode}-`)
    ).length;

    return `${baseBarcode}-${existingCount + 1}`;
};
