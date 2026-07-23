// Helpers for connector/cable items whose identity is "End A → End B" (with gender).
// The builder in the Add form stores the ends in metadata and auto-derives a
// human Name and a Model code that feeds the standard barcode (CON-XLRFPHONOM-1).

export type EndGender = 'M' | 'F' | '';

// Categories that use the connector ends builder.
export const isConnectorCategory = (category?: string): boolean => {
    const c = (category || '').trim().toLowerCase();
    return c === 'connector' || c === 'cable' || c === 'adapter';
};

const genderSuffix = (g?: EndGender) => (g === 'M' ? ' (M)' : g === 'F' ? ' (F)' : '');

// Human-readable name: "XLR (F) → Phono (M)". Omits an empty end.
export const buildConnectorName = (
    endA?: string, gA?: EndGender, endB?: string, gB?: EndGender
): string => {
    const a = (endA || '').trim();
    const b = (endB || '').trim();
    if (!a && !b) return '';
    const left = a ? `${a}${genderSuffix(gA)}` : '';
    const right = b ? `${b}${genderSuffix(gB)}` : '';
    if (a && b) return `${left} → ${right}`;
    return left || right;
};

// Compact code for the barcode/model: "XLR" + "F" + "-" + "Phono" + "M" -> "XLRF-PHONOM".
const codePart = (end?: string, g?: EndGender) => {
    const base = (end || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return base ? `${base}${g || ''}` : '';
};
export const buildConnectorCode = (
    endA?: string, gA?: EndGender, endB?: string, gB?: EndGender
): string => {
    const a = codePart(endA, gA);
    const b = codePart(endB, gB);
    return [a, b].filter(Boolean).join('-');
};

// Canonical spellings for common ends so parsing yields consistent labels.
const CANON_ENDS: Record<string, string> = {
    'xlr': 'XLR', 'mini xlr': 'Mini XLR', 'ep': 'EP', 'phono': 'Phono',
    'hdmi': 'HDMI', 'apple': 'Apple', 'd tap': 'D Tap', 'dtap': 'D Tap',
    'd port': 'D Port', 'bnc': 'BNC', 'rca': 'RCA', 'usb': 'USB', 'usb c': 'USB-C',
    'trs': 'TRS', 'trrs': 'TRRS', 'jack': 'Jack',
};
const canonicalEnd = (t: string): string => {
    const key = t.trim().toLowerCase();
    if (!key) return '';
    return CANON_ENDS[key] || t.trim();
};

export interface ParsedConnector {
    endA: string;
    endAGender: EndGender;
    endB: string;
    endBGender: EndGender;
    size: string;
}

// Best-effort parse of a legacy connector name → structured ends + size (length).
// e.g. "EP TO XLR Male 1m - 2m" → { endA:'EP', endB:'XLR', endBGender:'M', size:'1–2m' }.
export const parseConnectorName = (name: string): ParsedConnector => {
    let s = (name || '').trim().replace(/\s+/g, ' ');
    const lower = s.toLowerCase();

    // Pull out a length → Size.
    let size = '';
    if (/below\s*1\s*m/.test(lower)) size = '<1m';
    else {
        const range = lower.match(/(\d+)\s*m\s*(?:-|–|to)+\s*(\d+)\s*m/);
        if (range) size = `${range[1]}–${range[2]}m`;
        else {
            const single = lower.match(/(\d+)\s*m\b/);
            if (single) size = `${single[1]}m`;
        }
    }

    // Strip length + the filler word "connector" from the working string.
    s = s
        .replace(/below\s*1\s*m/ig, '')
        .replace(/\d+\s*m\s*(?:-|–|to)+\s*\d+\s*m/ig, '')
        .replace(/\d+\s*m\b/ig, '')
        .replace(/\bconnector\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Split on the first " to ".
    const parts = s.split(/\s+to\s+/i);
    const partA = parts[0] || '';
    const partB = parts.slice(1).join(' to ') || '';

    const parseEnd = (p: string): { end: string; gender: EndGender } => {
        let g: EndGender = '';
        if (/\bfemale\b/i.test(p)) g = 'F';
        else if (/\bmale\b/i.test(p)) g = 'M';
        const t = p.replace(/\b(male|female)\b/ig, '').replace(/\s+/g, ' ').trim();
        return { end: canonicalEnd(t), gender: g };
    };

    const a = parseEnd(partA);
    const b = parseEnd(partB);
    return { endA: a.end, endAGender: a.gender, endB: b.end, endBGender: b.gender, size };
};
