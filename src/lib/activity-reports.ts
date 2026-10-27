import { Assignment, Condition, Equipment, Log, Shoot, Transaction, User } from '@/types';
import { CONDITION_LABELS, getEquipmentIssue, getIssueSummary } from './equipment-issues';

export type ReportTabId = 'logs' | 'usage' | 'shoots' | 'crew';

export type UsageSortField =
    | 'checkouts_desc'
    | 'checkouts_asc'
    | 'hours_desc'
    | 'last_used_desc'
    | 'name_asc';

/**
 * Normalizes equipment categories so singular/plural or casing variants
 * (e.g. "lens", "Lenses", "LENS") group cleanly under one canonical label ("Lens").
 */
export function normalizeCategoryLabel(raw?: string | null, barcode?: string | null): string {
    const clean = (raw || '').trim().replace(/\s+/g, ' ');
    const lower = clean.toLowerCase();

    if (
        lower === 'lens' ||
        lower === 'lenses' ||
        lower === 'lense' ||
        (!clean && (barcode || '').toUpperCase().startsWith('LENSE-'))
    ) {
        return 'Lens';
    }
    if (lower === 'camera' || lower === 'cameras' || lower === 'cam') return 'Camera';
    if (
        lower === 'card' ||
        lower === 'cards' ||
        lower === 'memory card' ||
        lower === 'sd card' ||
        lower === 'cf card' ||
        lower === 'cfexpress'
    ) {
        return 'Card';
    }
    if (lower === 'battery' || lower === 'batteries') return 'Battery';
    if (lower === 'accessory' || lower === 'accessories') return 'Accessory';
    if (lower === 'cable' || lower === 'cables') return 'Cable';
    if (lower === 'tripod' || lower === 'tripods') return 'Tripod';
    if (lower === 'monitor' || lower === 'monitors') return 'Monitor';
    if (lower === 'light' || lower === 'lights' || lower === 'lighting') return 'Lighting';
    if (lower === 'audio' || lower === 'mic' || lower === 'microphone') return 'Audio';
    if (lower === 'gimbal' || lower === 'gimbals') return 'Gimbal';
    if (lower === 'grip' || lower === 'grips') return 'Grip';
    if (lower === 'drone' || lower === 'drones') return 'Drone';
    if (lower === 'storage' || lower === 'hard disk' || lower === 'ssd' || lower === 'hdd') return 'Storage';

    if (!clean) return 'Uncategorized';
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function itemMatchesCategory(item: Equipment, selectedCategory: string): boolean {
    if (!selectedCategory || selectedCategory === 'ALL') return true;
    const normalizedItemCat = normalizeCategoryLabel(item.category, item.barcode);
    if (normalizedItemCat.toLowerCase() === selectedCategory.toLowerCase()) return true;
    if (
        selectedCategory.toLowerCase() === 'lens' &&
        (item.barcode || '').toUpperCase().startsWith('LENSE-')
    ) {
        return true;
    }
    return false;
}

export const formatReportDate = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatReportDateTime = (iso?: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const formatDurationLabel = (hours: number, days?: number): string => {
    if ((!hours || hours <= 0) && (!days || days <= 0)) return '0 days (0 hrs)';
    const roundedHours = Math.round(hours * 10) / 10;
    const effectiveDays =
        typeof days === 'number' && days > 0
            ? Math.round(days)
            : Math.max(1, Math.ceil(roundedHours / 24));
    const dayWord = effectiveDays === 1 ? 'day' : 'days';
    return `${effectiveDays} ${dayWord} (${roundedHours} hrs)`;
};

export interface UsageReportRow {
    itemId: string;
    name: string;
    category: string;
    brand: string;
    model: string;
    size: string;
    barcode: string;
    serialNumber: string;
    status: Equipment['status'];
    condition: Condition;
    conditionLabel: string;
    activeIssueText: string;
    hasIssue: boolean;
    totalCheckouts: number;
    openCheckouts: number;
    totalHoursUsed: number;
    totalDaysUsed: number;
    lastUsedDate: string | null;
    lastUsedDateLabel: string;
    lastUsedEvent: string;
    lastUsedBy: string;
    topCrew: Array<{ userId: string; name: string; count: number }>;
    topCrewLabel: string;
}

export interface ShootEquipmentRow {
    transactionId: string;
    shootId?: string | null;
    eventName: string;
    location: string;
    dateOut: string;
    dateOutLabel: string;
    dateIn: string | null;
    dateInLabel: string;
    durationHours: number;
    durationDays: number;
    durationLabel: string;
    itemsTaken: Array<{
        id: string;
        name: string;
        barcode: string;
        preCondition: string;
        returnCondition: string;
        isReturned: boolean;
    }>;
    itemsTakenLabel: string;
    barcodesLabel: string;
    camerasUsed: string;
    crewPeople: string[];
    crewLabel: string;
    outstandingCount: number;
    returnConditionSummary: string;
    hasReturnIssue: boolean;
    status: 'OPEN' | 'CLOSED';
}

export interface CrewBreakdownRow {
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    checkoutCount: number;
    totalItemUnitsTaken: number;
    uniqueItemsUsed: number;
    totalHoursUsed: number;
    totalDaysUsed: number;
    favoriteItems: Array<{ id: string; name: string; barcode: string; count: number }>;
    favoriteItemsLabel: string;
    lastCheckoutDate: string | null;
    lastCheckoutLabel: string;
    lastEventName: string;
}

export interface UsageSummaryStats {
    totalItems: number;
    availableItems: number;
    checkedOutItems: number;
    issueItems: number;
    totalCheckouts: number;
    totalShootsWithCategory: number;
    totalHoursUsed: number;
    totalDaysUsed: number;
    mostUsedItem: UsageReportRow | null;
    leastUsedActiveItem: UsageReportRow | null;
    neverUsedCount: number;
}

/**
 * Resolves the crew members involved in a transaction, combining live shoot assignments
 * (when linked to a shoot) with the transaction's primary and additional users.
 */
export function resolveTransactionCrewIds(
    txn: Transaction,
    shoot: Shoot | undefined,
    assignments: Assignment[]
): string[] {
    const shootCrewIds = shoot
        ? assignments
              .filter(
                  (a: Assignment) =>
                      a.shootId === shoot.id && ['ACCEPTED', 'PENDING'].includes(a.status)
              )
              .map((a: Assignment) => a.userId)
        : [];

    return Array.from(
        new Set([txn.userId, ...(txn.additionalUsers || []), ...shootCrewIds].filter(Boolean))
    );
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_SINGLE_DAY_SHOOT_MS = 8 * HOUR_MS;

function toLocalDateKey(isoOrMs?: string | number | Date | null): string {
    if (!isoOrMs) return '';
    const d = isoOrMs instanceof Date ? isoOrMs : new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function calendarDaysBetween(startMs: number, endMs: number): number {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 1;
    const s = new Date(startMs);
    const e = new Date(endMs);
    const sDay = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
    const eDay = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
    return Math.max(1, Math.round((eDay - sDay) / DAY_MS) + 1);
}

function getCrewReturnSignalMs(txn: Transaction, outMs: number): number {
    const candidates: number[] = [];
    if (txn.dataReport?.answeredAt) {
        const t = new Date(txn.dataReport.answeredAt).getTime();
        if (Number.isFinite(t) && t >= outMs) candidates.push(t);
    }
    if (Array.isArray(txn.manualItems)) {
        for (const m of txn.manualItems) {
            if (m.returnedAt) {
                const t = new Date(m.returnedAt).getTime();
                if (Number.isFinite(t) && t >= outMs) candidates.push(t);
            }
        }
    }
    return candidates.length > 0 ? Math.min(...candidates) : NaN;
}

export interface UsageDurationResult {
    hours: number;
    days: number;
}

/**
 * Calculates effective usage duration in both hours and calendar shoot days for a transaction
 * (or a specific item within it).
 *
 * - Every valid checkout on a shoot counts as at least 1 shoot day (`days >= 1`).
 * - Multi-day shoots or multi-day checkouts count the actual calendar days spanned (`days = 2, 3, 5...`).
 * - Real return timestamps (`txn.timestampIn`, `dataReport.answeredAt`, `manualItems[].returnedAt`)
 *   are preserved when within the shoot's reasonable window and capped by `nextCheckoutMs` (when the
 *   physical item was checked out on its next shoot).
 * - Multi-week shelf verification delays or unclosed old transactions fall back to the shoot's
 *   scheduled window so ghost shelf hours never inflate usage.
 */
export function resolveUsageDuration(params: {
    txn: Transaction;
    shoot?: Shoot;
    isReturned: boolean;
    nextCheckoutMs?: number;
    nowMs?: number;
}): UsageDurationResult {
    const { txn, shoot, isReturned, nextCheckoutMs, nowMs = Date.now() } = params;
    const outMs = new Date(txn.timestampOut).getTime();
    if (!Number.isFinite(outMs)) return { hours: 0, days: 0 };

    const shootStartMs = shoot?.startTime ? new Date(shoot.startTime).getTime() : NaN;
    const shootEndMs = shoot?.endTime ? new Date(shoot.endTime).getTime() : NaN;
    const hasValidShootWindow =
        Number.isFinite(shootStartMs) &&
        Number.isFinite(shootEndMs) &&
        shootEndMs >= shootStartMs;

    const shootCalDays = hasValidShootWindow
        ? Math.min(30, calendarDaysBetween(shootStartMs, shootEndMs))
        : 1;

    const endDateObj = Number.isFinite(shootEndMs) ? new Date(shootEndMs) : null;
    const isAutoEndOfDay = Boolean(
        endDateObj && endDateObj.getHours() === 23 && endDateObj.getMinutes() === 59
    );

    const crewReturnMs = getCrewReturnSignalMs(txn, outMs);
    const rawInMs = txn.timestampIn ? new Date(txn.timestampIn).getTime() : NaN;
    const txnInMs = Number.isFinite(rawInMs) && rawInMs >= outMs ? rawInMs : NaN;
    const validNextCheckoutMs =
        typeof nextCheckoutMs === 'number' && Number.isFinite(nextCheckoutMs) && nextCheckoutMs > outMs
            ? nextCheckoutMs
            : NaN;

    let recordedInMs =
        Number.isFinite(crewReturnMs) && Number.isFinite(txnInMs)
            ? Math.min(crewReturnMs, txnInMs)
            : Number.isFinite(crewReturnMs)
            ? crewReturnMs
            : txnInMs;

    if (Number.isFinite(validNextCheckoutMs) && Number.isFinite(recordedInMs)) {
        recordedInMs = Math.min(recordedInMs, validNextCheckoutMs);
    }

    // Allow up to 48h for a 1-day shoot (prep day before / return day after), or (shootCalDays + 1) days for multi-day shoots
    const maxReasonableDurationMs = Math.max(48 * HOUR_MS, (shootCalDays + 1) * DAY_MS);

    const resolveFallbackEndMs = (): number => {
        if (shootCalDays > 1 && hasValidShootWindow) {
            return shootEndMs > outMs
                ? Math.min(shootEndMs, outMs + shootCalDays * DAY_MS)
                : outMs + Math.min(shootCalDays * DAY_MS, shootEndMs - shootStartMs);
        }
        if (hasValidShootWindow && !isAutoEndOfDay && shootEndMs > shootStartMs) {
            const explicitSpan = Math.min(DAY_MS, shootEndMs - shootStartMs);
            if (shootEndMs > outMs && shootEndMs - outMs <= DAY_MS) {
                return shootEndMs;
            }
            return outMs + explicitSpan;
        }
        return outMs + DEFAULT_SINGLE_DAY_SHOOT_MS;
    };

    let endMs: number;
    if (Number.isFinite(recordedInMs)) {
        if (recordedInMs - outMs <= maxReasonableDurationMs) {
            endMs = recordedInMs;
        } else {
            // timestamp_in was stamped days/weeks after the shoot during shelf verification
            endMs = resolveFallbackEndMs();
        }
    } else if (!isReturned && nowMs >= outMs && nowMs - outMs <= maxReasonableDurationMs) {
        endMs = nowMs;
    } else {
        endMs = resolveFallbackEndMs();
    }

    if (Number.isFinite(validNextCheckoutMs)) {
        endMs = Math.min(endMs, validNextCheckoutMs);
    }
    endMs = Math.max(outMs, endMs);

    const diffHours = Math.max(0, (endMs - outMs) / HOUR_MS);
    const hours = Math.round(diffHours * 10) / 10;

    const actualCalDays = calendarDaysBetween(outMs, endMs);
    let days: number;
    if (actualCalDays === 1) {
        days = 1;
    } else if (actualCalDays === 2) {
        days = diffHours >= 16 || shootCalDays >= 2 ? 2 : 1;
    } else {
        days = Math.min(actualCalDays, Math.max(shootCalDays, Math.ceil(diffHours / 20)));
    }

    return {
        hours,
        days: Math.max(1, days),
    };
}

export function resolveUsageDurationHours(params: {
    txn: Transaction;
    shoot?: Shoot;
    isReturned: boolean;
    nextCheckoutMs?: number;
    nowMs?: number;
}): number {
    return resolveUsageDuration(params).hours;
}

/**
 * Calculates transaction duration in hours between timestampOut and timestampIn (or now if still open).
 */
export function getTransactionDurationHours(
    txn: Transaction,
    nowMs: number = Date.now(),
    shoot?: Shoot
): number {
    return resolveUsageDuration({
        txn,
        shoot,
        isReturned:
            txn.status === 'CLOSED' ||
            Boolean(txn.timestampIn) ||
            Boolean(txn.dataReport?.answeredAt),
        nowMs,
    }).hours;
}

function getEquipmentSearchText(item: Equipment): string {
    const issue = getEquipmentIssue(item);
    const activeIssueText = issue
        ? `${getIssueSummary(issue)}${issue.note ? `: ${issue.note}` : ''}`
        : item.condition !== 'OK'
        ? CONDITION_LABELS[item.condition] || item.condition
        : '';
    return [
        item.name,
        normalizeCategoryLabel(item.category, item.barcode),
        (item.metadata?.brand as string) || '',
        (item.metadata?.model as string) || '',
        (item.metadata?.size as string) || '',
        item.barcode || '',
        item.serialNumber || (item.metadata?.serialNumber as string) || '',
        item.status || '',
        CONDITION_LABELS[item.condition] || item.condition || '',
        activeIssueText,
    ]
        .join(' ')
        .toLowerCase();
}

function matchesSearchTokens(text: string, tokens: string[]): boolean {
    if (tokens.length === 0) return true;
    const lower = text.toLowerCase();
    return tokens.every(tok => lower.includes(tok));
}

export function buildCategoryReports(params: {
    equipment: Equipment[];
    transactions: Transaction[];
    shoots: Shoot[];
    assignments: Assignment[];
    users: User[];
    selectedCategory: string; // 'ALL' or canonical category name e.g. 'Lens'
    fromDate?: string;
    toDate?: string;
    searchQuery?: string;
}) {
    const {
        equipment,
        transactions,
        shoots,
        assignments,
        users,
        selectedCategory,
        fromDate,
        toDate,
        searchQuery = '',
    } = params;

    const nowMs = Date.now();
    const q = searchQuery.trim().toLowerCase();
    const qTokens = q ? q.split(/\s+/).filter(Boolean) : [];

    const itemById = new Map<string, Equipment>(equipment.map(e => [e.id, e]));
    const shootById = new Map<string, Shoot>(shoots.map(s => [s.id, s]));
    const userById = new Map<string, User>(users.map(u => [u.id, u]));

    const baseCategoryItems = equipment.filter(item => itemMatchesCategory(item, selectedCategory));

    // Check if the search query directly matches equipment items (e.g. "fx3", "z280", "CAM-FX3-3")
    const directMatchedItems =
        qTokens.length > 0
            ? baseCategoryItems.filter(item =>
                  matchesSearchTokens(getEquipmentSearchText(item), qTokens)
              )
            : baseCategoryItems;

    const isEquipmentSearchMatch = qTokens.length > 0 && directMatchedItems.length > 0;
    const categoryItems = isEquipmentSearchMatch ? directMatchedItems : baseCategoryItems;
    const categoryItemIds = new Set(categoryItems.map(i => i.id));

    // Precompute per-item "next checkout after this transaction" across ALL transactions
    // so an item reused in a later shoot never accumulates ghost hours on an earlier shoot.
    const itemTimelineMap = new Map<string, Array<{ txnId: string; outMs: number }>>();
    for (const t of transactions) {
        const outMs = new Date(t.timestampOut || 0).getTime();
        if (!Number.isFinite(outMs)) continue;
        for (const itemId of t.items || []) {
            let list = itemTimelineMap.get(itemId);
            if (!list) {
                list = [];
                itemTimelineMap.set(itemId, list);
            }
            list.push({ txnId: t.id, outMs });
        }
    }
    const nextCheckoutByTxnItem = new Map<string, number>();
    for (const [itemId, list] of itemTimelineMap.entries()) {
        list.sort((a, b) => a.outMs - b.outMs);
        for (let i = 0; i < list.length; i++) {
            const current = list[i];
            for (let j = i + 1; j < list.length; j++) {
                if (list[j].outMs > current.outMs) {
                    nextCheckoutByTxnItem.set(`${current.txnId}:${itemId}`, list[j].outMs);
                    break;
                }
            }
        }
    }

    // Filter transactions by date range using local YYYY-MM-DD keys
    const dateFilteredTransactions = transactions.filter(txn => {
        const shoot = txn.shootId ? shootById.get(txn.shootId) : undefined;
        const startDateKey = toLocalDateKey(shoot?.startTime || txn.timestampOut);
        const endDateKey =
            toLocalDateKey(
                txn.dataReport?.answeredAt || txn.timestampIn || shoot?.endTime || shoot?.startTime || txn.timestampOut
            ) || startDateKey;
        if (!startDateKey) return false;
        if (fromDate && endDateKey < fromDate && startDateKey < fromDate) return false;
        if (toDate && startDateKey > toDate) return false;
        return true;
    });

    // Per-item accumulators
    const itemStatsMap = new Map<
        string,
        {
            checkouts: number;
            openCheckouts: number;
            hoursUsed: number;
            daysUsed: number;
            lastUsedDate: string | null;
            lastUsedEvent: string;
            lastUsedBy: string;
            crewCounts: Map<string, number>;
        }
    >();

    for (const item of categoryItems) {
        itemStatsMap.set(item.id, {
            checkouts: 0,
            openCheckouts: 0,
            hoursUsed: 0,
            daysUsed: 0,
            lastUsedDate: null,
            lastUsedEvent: '—',
            lastUsedBy: '—',
            crewCounts: new Map(),
        });
    }

    // Per-crew accumulators
    const crewStatsMap = new Map<
        string,
        {
            checkoutCount: number;
            totalItemUnitsTaken: number;
            uniqueItemIds: Set<string>;
            hoursUsed: number;
            daysUsed: number;
            itemCounts: Map<string, number>;
            lastCheckoutDate: string | null;
            lastEventName: string;
        }
    >();

    const shootRows: ShootEquipmentRow[] = [];

    for (const txn of dateFilteredTransactions) {
        const matchedItems = txn.items
            .filter(id => categoryItemIds.has(id))
            .map(id => itemById.get(id))
            .filter((i): i is Equipment => Boolean(i));

        if (matchedItems.length === 0) continue;

        const allTxnItems = txn.items
            .map(id => itemById.get(id))
            .filter((i): i is Equipment => Boolean(i));

        const shoot = txn.shootId ? shootById.get(txn.shootId) : undefined;
        const eventName = shoot?.title || txn.project || 'Unspecified';
        const location = shoot?.location || '—';
        const effectiveDate = shoot?.startTime || txn.timestampOut;

        const crewIds = resolveTransactionCrewIds(txn, shoot, assignments);
        const crewPeople = crewIds
            .map(id => userById.get(id)?.name || userById.get(id)?.email)
            .filter((n): n is string => Boolean(n));

        const camerasUsed =
            allTxnItems
                .filter(i => normalizeCategoryLabel(i.category, i.barcode) === 'Camera')
                .map(i => `${i.name}${i.barcode ? ` (${i.barcode})` : ''}`)
                .join(', ') || '—';

        // If search query did NOT match equipment items directly (e.g. searching by shoot name, location, or crew member),
        // filter transactions by shoot/event/location/crew match before accumulating stats!
        if (qTokens.length > 0 && !isEquipmentSearchMatch) {
            const txnSearchText = [
                eventName,
                location,
                crewPeople.join(' '),
                camerasUsed,
                matchedItems.map(i => `${i.name} ${i.barcode}`).join(' '),
            ].join(' ');
            if (!matchesSearchTokens(txnSearchText, qTokens)) {
                continue;
            }
        }

        // Update per-item stats and collect per-item durations for this transaction
        let txnMaxItemHours = 0;
        let txnMaxItemDays = 1;
        const itemReturnedById = new Map<string, boolean>();

        for (const item of matchedItems) {
            const st = itemStatsMap.get(item.id);
            const nextCheckoutMs = nextCheckoutByTxnItem.get(`${txn.id}:${item.id}`);
            const isReturned =
                txn.status === 'CLOSED' ||
                txn.postReturnConditions?.[item.id] !== undefined ||
                nextCheckoutMs !== undefined ||
                item.status !== 'CHECKED_OUT';

            itemReturnedById.set(item.id, isReturned);

            const itemDuration = resolveUsageDuration({
                txn,
                shoot,
                isReturned,
                nextCheckoutMs,
                nowMs,
            });
            if (itemDuration.hours > txnMaxItemHours) {
                txnMaxItemHours = itemDuration.hours;
            }
            if (itemDuration.days > txnMaxItemDays) {
                txnMaxItemDays = itemDuration.days;
            }

            if (!st) continue;
            st.checkouts += 1;
            if (!isReturned) {
                st.openCheckouts += 1;
            }
            st.hoursUsed += itemDuration.hours;
            st.daysUsed += itemDuration.days;

            if (!st.lastUsedDate || new Date(effectiveDate) > new Date(st.lastUsedDate)) {
                st.lastUsedDate = effectiveDate;
                st.lastUsedEvent = eventName;
                st.lastUsedBy = crewPeople.join(', ') || '—';
            }

            for (const uid of crewIds) {
                st.crewCounts.set(uid, (st.crewCounts.get(uid) || 0) + 1);
            }
        }

        const fallbackDuration = resolveUsageDuration({
            txn,
            shoot,
            isReturned:
                txn.status === 'CLOSED' ||
                Boolean(txn.timestampIn) ||
                Boolean(txn.dataReport?.answeredAt),
            nowMs,
        });
        const durationHours = matchedItems.length > 0 ? txnMaxItemHours : fallbackDuration.hours;
        const durationDays = matchedItems.length > 0 ? txnMaxItemDays : fallbackDuration.days;

        // Update per-crew stats
        for (const uid of crewIds) {
            let cStat = crewStatsMap.get(uid);
            if (!cStat) {
                cStat = {
                    checkoutCount: 0,
                    totalItemUnitsTaken: 0,
                    uniqueItemIds: new Set(),
                    hoursUsed: 0,
                    daysUsed: 0,
                    itemCounts: new Map(),
                    lastCheckoutDate: null,
                    lastEventName: '—',
                };
                crewStatsMap.set(uid, cStat);
            }
            cStat.checkoutCount += 1;
            cStat.totalItemUnitsTaken += matchedItems.length;
            cStat.hoursUsed += durationHours;
            cStat.daysUsed += durationDays;

            for (const item of matchedItems) {
                cStat.uniqueItemIds.add(item.id);
                cStat.itemCounts.set(item.id, (cStat.itemCounts.get(item.id) || 0) + 1);
            }

            if (
                !cStat.lastCheckoutDate ||
                new Date(effectiveDate) > new Date(cStat.lastCheckoutDate)
            ) {
                cStat.lastCheckoutDate = effectiveDate;
                cStat.lastEventName = eventName;
            }
        }

        // Build ShootEquipmentRow
        const itemsTaken = matchedItems.map(item => {
            const postCond = txn.postReturnConditions?.[item.id];
            const isReturned =
                itemReturnedById.get(item.id) ??
                (txn.status === 'CLOSED' || postCond !== undefined);
            const preCond = txn.preCheckoutConditions?.[item.id] || item.condition || 'OK';
            const retLabel = isReturned
                ? CONDITION_LABELS[postCond || 'OK'] || postCond || 'OK'
                : 'Still Out';
            return {
                id: item.id,
                name: item.name,
                barcode: item.barcode,
                preCondition: CONDITION_LABELS[preCond] || preCond,
                returnCondition: retLabel,
                isReturned,
            };
        });

        const outstandingCount = itemsTaken.filter(i => !i.isReturned).length;
        const issuesOnReturn = itemsTaken.filter(
            i => i.isReturned && i.returnCondition !== 'OK'
        );

        let returnConditionSummary = 'All OK';
        if (outstandingCount > 0 && issuesOnReturn.length === 0) {
            returnConditionSummary =
                outstandingCount === itemsTaken.length
                    ? 'Still Out'
                    : `${itemsTaken.length - outstandingCount} OK, ${outstandingCount} Out`;
        } else if (issuesOnReturn.length > 0) {
            returnConditionSummary = issuesOnReturn
                .map(i => `${i.barcode || i.name}: ${i.returnCondition}`)
                .join('; ');
        }

        const effectiveDateIn =
            txn.dataReport?.answeredAt ||
            txn.timestampIn ||
            (outstandingCount === 0 && shoot?.endTime ? shoot.endTime : null);

        shootRows.push({
            transactionId: txn.id,
            shootId: txn.shootId,
            eventName,
            location,
            dateOut: effectiveDate,
            dateOutLabel: formatReportDate(effectiveDate),
            dateIn: effectiveDateIn,
            dateInLabel: effectiveDateIn ? formatReportDate(effectiveDateIn) : '—',
            durationHours,
            durationDays,
            durationLabel: formatDurationLabel(durationHours, durationDays),
            itemsTaken,
            itemsTakenLabel: itemsTaken
                .map(i => `${i.name}${i.barcode ? ` (${i.barcode})` : ''}`)
                .join(', '),
            barcodesLabel: itemsTaken.map(i => i.barcode).filter(Boolean).join(', ') || '—',
            camerasUsed,
            crewPeople,
            crewLabel: crewPeople.join(', ') || '—',
            outstandingCount,
            returnConditionSummary,
            hasReturnIssue: issuesOnReturn.length > 0,
            status: txn.status,
        });
    }

    // Build UsageReportRow[]
    const usageRowsAll: UsageReportRow[] = categoryItems.map(item => {
        const st = itemStatsMap.get(item.id)!;
        const issue = getEquipmentIssue(item);
        const activeIssueText = issue
            ? `${getIssueSummary(issue)}${issue.note ? `: ${issue.note}` : ''}`
            : item.condition !== 'OK'
            ? CONDITION_LABELS[item.condition] || item.condition
            : 'None';

        const topCrew = Array.from(st.crewCounts.entries())
            .map(([userId, count]) => {
                const u = userById.get(userId);
                return {
                    userId,
                    name: u?.name || u?.email || 'Unknown',
                    count,
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const hoursRounded = Math.round(st.hoursUsed * 10) / 10;

        return {
            itemId: item.id,
            name: item.name,
            category: normalizeCategoryLabel(item.category, item.barcode),
            brand: (item.metadata?.brand as string) || '—',
            model: (item.metadata?.model as string) || '—',
            size: (item.metadata?.size as string) || '—',
            barcode: item.barcode || '—',
            serialNumber: item.serialNumber || (item.metadata?.serialNumber as string) || '—',
            status: item.status,
            condition: item.condition,
            conditionLabel: CONDITION_LABELS[item.condition] || item.condition,
            activeIssueText,
            hasIssue: Boolean(issue) || item.condition !== 'OK' || ['DAMAGED', 'MAINTENANCE', 'LOST'].includes(item.status),
            totalCheckouts: st.checkouts,
            openCheckouts: st.openCheckouts,
            totalHoursUsed: hoursRounded,
            totalDaysUsed: st.daysUsed,
            lastUsedDate: st.lastUsedDate,
            lastUsedDateLabel: formatReportDate(st.lastUsedDate),
            lastUsedEvent: st.lastUsedEvent,
            lastUsedBy: st.lastUsedBy,
            topCrew,
            topCrewLabel: topCrew.map(c => `${c.name} (${c.count}×)`).join(', ') || '—',
        };
    });

    // When searching by a shoot/event/crew term (non-equipment match), scope usageRows to items used in those shoots
    const filteredUsageRows =
        qTokens.length > 0 && !isEquipmentSearchMatch
            ? usageRowsAll.filter(r => r.totalCheckouts > 0)
            : usageRowsAll;

    const filteredShootRows = [...shootRows].sort(
        (a, b) => new Date(b.dateOut).getTime() - new Date(a.dateOut).getTime()
    );

    // Build CrewBreakdownRow[]
    const crewRowsAll: CrewBreakdownRow[] = Array.from(crewStatsMap.entries())
        .map(([userId, st]) => {
            const u = userById.get(userId);
            const favoriteItems = Array.from(st.itemCounts.entries())
                .map(([itemId, count]) => {
                    const eq = itemById.get(itemId);
                    return {
                        id: itemId,
                        name: eq?.name || itemId,
                        barcode: eq?.barcode || '',
                        count,
                    };
                })
                .sort((a, b) => b.count - a.count)
                .slice(0, 4);

            const hoursRounded = Math.round(st.hoursUsed * 10) / 10;

            return {
                userId,
                userName: u?.name || u?.email || 'Unknown User',
                userEmail: u?.email || '—',
                userRole: u?.role || 'CREW',
                checkoutCount: st.checkoutCount,
                totalItemUnitsTaken: st.totalItemUnitsTaken,
                uniqueItemsUsed: st.uniqueItemIds.size,
                totalHoursUsed: hoursRounded,
                totalDaysUsed: st.daysUsed,
                favoriteItems,
                favoriteItemsLabel:
                    favoriteItems
                        .map(f => `${f.name}${f.barcode ? ` [${f.barcode}]` : ''} (${f.count}×)`)
                        .join(', ') || '—',
                lastCheckoutDate: st.lastCheckoutDate,
                lastCheckoutLabel: formatReportDate(st.lastCheckoutDate),
                lastEventName: st.lastEventName,
            };
        })
        .sort(
            (a, b) =>
                b.checkoutCount - a.checkoutCount ||
                b.totalItemUnitsTaken - a.totalItemUnitsTaken
        );

    const filteredCrewRows =
        qTokens.length > 0 && !isEquipmentSearchMatch
            ? crewRowsAll.filter(r =>
                  matchesSearchTokens(
                      [
                          r.userName,
                          r.userEmail,
                          r.userRole,
                          r.favoriteItemsLabel,
                          r.lastEventName,
                      ].join(' '),
                      qTokens
                  )
              )
            : crewRowsAll;

    // Compute summary from the filtered rows so the top 4 KPI cards always reflect the active category, date, and search filters!
    const sortedByUsageDesc = [...filteredUsageRows].sort(
        (a, b) =>
            b.totalCheckouts - a.totalCheckouts ||
            b.totalDaysUsed - a.totalDaysUsed ||
            b.totalHoursUsed - a.totalHoursUsed
    );
    const activeUsedItems = sortedByUsageDesc.filter(r => r.totalCheckouts > 0);
    const mostUsedItem = activeUsedItems[0] || null;
    const leastUsedActiveItem =
        activeUsedItems.length > 0 ? activeUsedItems[activeUsedItems.length - 1] : null;
    const neverUsedCount = filteredUsageRows.filter(r => r.totalCheckouts === 0).length;

    const useItemLevelTotals = selectedCategory !== 'ALL' || qTokens.length > 0;
    const totalHoursSummary = useItemLevelTotals
        ? Math.round(filteredUsageRows.reduce((sum, r) => sum + r.totalHoursUsed, 0) * 10) / 10
        : Math.round(filteredShootRows.reduce((sum, r) => sum + r.durationHours, 0) * 10) / 10;
    const totalDaysSummary = useItemLevelTotals
        ? filteredUsageRows.reduce((sum, r) => sum + r.totalDaysUsed, 0)
        : filteredShootRows.reduce((sum, r) => sum + r.durationDays, 0);

    const summary: UsageSummaryStats = {
        totalItems: filteredUsageRows.length,
        availableItems: filteredUsageRows.filter(r => r.status === 'AVAILABLE').length,
        checkedOutItems: filteredUsageRows.filter(r => r.status === 'CHECKED_OUT').length,
        issueItems: filteredUsageRows.filter(r => r.hasIssue).length,
        totalCheckouts: filteredUsageRows.reduce((sum, r) => sum + r.totalCheckouts, 0),
        totalShootsWithCategory: filteredShootRows.length,
        totalHoursUsed: totalHoursSummary,
        totalDaysUsed: totalDaysSummary,
        mostUsedItem,
        leastUsedActiveItem,
        neverUsedCount,
    };

    return {
        summary,
        usageRows: filteredUsageRows,
        shootRows: filteredShootRows,
        crewRows: filteredCrewRows,
    };
}

const csvQuote = (v: unknown): string => {
    const str = v === null || v === undefined ? '' : String(v);
    return `"${str.replace(/"/g, '""')}"`;
};

export function generateUsageReportCSV(rows: UsageReportRow[]): string {
    const headers = [
        'Usage Rank',
        'Item Name',
        'Category',
        'Brand',
        'Model',
        'Size / Spec',
        'Barcode',
        'Serial Number',
        'Current Status',
        'Condition',
        'Active Issue',
        'Total Checkouts',
        'Total Hours Used',
        'Total Days Used',
        'Last Used Date',
        'Last Used Shoot / Event',
        'Last Used By',
        'Top Crew Members',
    ];

    const sorted = [...rows].sort(
        (a, b) => b.totalCheckouts - a.totalCheckouts || b.totalHoursUsed - a.totalHoursUsed
    );

    const body = sorted.map((r, idx) =>
        [
            r.totalCheckouts === 0 ? 'Unused (0)' : `#${idx + 1}`,
            csvQuote(r.name),
            csvQuote(r.category),
            csvQuote(r.brand),
            csvQuote(r.model),
            csvQuote(r.size),
            csvQuote(r.barcode),
            csvQuote(r.serialNumber),
            csvQuote(r.status),
            csvQuote(r.conditionLabel),
            csvQuote(r.activeIssueText),
            r.totalCheckouts,
            r.totalHoursUsed,
            r.totalDaysUsed,
            csvQuote(r.lastUsedDateLabel),
            csvQuote(r.lastUsedEvent),
            csvQuote(r.lastUsedBy),
            csvQuote(r.topCrewLabel),
        ].join(',')
    );

    return [headers.join(','), ...body].join('\n');
}

export function generateShootLogReportCSV(
    rows: ShootEquipmentRow[],
    categoryLabel: string
): string {
    const itemColHeader =
        categoryLabel && categoryLabel !== 'ALL' ? `${categoryLabel}s Taken` : 'Equipment Taken';
    const headers = [
        'Transaction ID',
        'Event / Shoot Name',
        'Location',
        'Checkout Date',
        'Returned Date',
        'Duration (Days)',
        'Duration (Hours)',
        'Duration',
        itemColHeader,
        'Barcodes',
        'Cameras Used on Shoot',
        'Crew / Camera Person',
        'Items Still Out',
        'Return Condition Summary',
        'Transaction Status',
    ];

    const body = rows.map(r =>
        [
            csvQuote(r.transactionId),
            csvQuote(r.eventName),
            csvQuote(r.location),
            csvQuote(r.dateOutLabel),
            csvQuote(r.dateInLabel),
            r.durationDays,
            r.durationHours,
            csvQuote(r.durationLabel),
            csvQuote(r.itemsTakenLabel),
            csvQuote(r.barcodesLabel),
            csvQuote(r.camerasUsed),
            csvQuote(r.crewLabel),
            r.outstandingCount,
            csvQuote(r.returnConditionSummary),
            csvQuote(r.status),
        ].join(',')
    );

    return [headers.join(','), ...body].join('\n');
}

export function generateCrewBreakdownCSV(rows: CrewBreakdownRow[], categoryLabel: string): string {
    const catName = categoryLabel && categoryLabel !== 'ALL' ? categoryLabel : 'Equipment';
    const headers = [
        'Crew Member',
        'Email',
        'Role',
        `Shoots / Checkouts (${catName})`,
        `Total ${catName} Units Taken`,
        `Unique ${catName}s Used`,
        'Total Hours Used',
        'Total Days Used',
        `Most Used ${catName}s (Frequency)`,
        'Last Checkout Date',
        'Last Shoot / Event',
    ];

    const body = rows.map(r =>
        [
            csvQuote(r.userName),
            csvQuote(r.userEmail),
            csvQuote(r.userRole),
            r.checkoutCount,
            r.totalItemUnitsTaken,
            r.uniqueItemsUsed,
            r.totalHoursUsed,
            r.totalDaysUsed,
            csvQuote(r.favoriteItemsLabel),
            csvQuote(r.lastCheckoutLabel),
            csvQuote(r.lastEventName),
        ].join(',')
    );

    return [headers.join(','), ...body].join('\n');
}

export function generateActivityLogsCSV(
    logs: Log[],
    getUserName: (userId?: string) => string,
    getLogItems: (log: Log) => string[]
): string {
    const headers = [
        'Timestamp (ISO)',
        'Date & Time',
        'User',
        'Action',
        'Entity / Transaction ID',
        'Details',
        'Items Count',
        'Items Involved',
    ];

    const body = logs.map(log => {
        const items = getLogItems(log);
        return [
            csvQuote(log.timestamp),
            csvQuote(formatReportDateTime(log.timestamp)),
            csvQuote(getUserName(log.userId)),
            csvQuote(log.action),
            csvQuote(log.entityId),
            csvQuote(log.details || ''),
            items.length,
            csvQuote(items.join('; ')),
        ].join(',');
    });

    return [headers.join(','), ...body].join('\n');
}

/**
 * Generates a single combined master CSV report containing:
 * 1. Summary KPIs
 * 2. Usage & Popularity Table
 * 3. Shoot-by-Shoot Log Table
 * 4. Crew Usage Breakdown Table
 */
export function generateMasterCategoryReportCSV(params: {
    categoryLabel: string;
    fromDate?: string;
    toDate?: string;
    summary: UsageSummaryStats;
    usageRows: UsageReportRow[];
    shootRows: ShootEquipmentRow[];
    crewRows: CrewBreakdownRow[];
}): string {
    const { categoryLabel, fromDate, toDate, summary, usageRows, shootRows, crewRows } = params;
    const catTitle = categoryLabel === 'ALL' ? 'All Equipment' : `${categoryLabel} Equipment`;
    const periodLabel =
        fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Present'}` : 'All Time';

    const sections: string[] = [
        `"=== ${catTitle.toUpperCase()} MASTER DATA REPORT ==="`,
        `"Generated On",${csvQuote(new Date().toLocaleString())}`,
        `"Report Scope",${csvQuote(catTitle)}`,
        `"Date Range",${csvQuote(periodLabel)}`,
        `"Total Items in Inventory",${summary.totalItems}`,
        `"Available / Checked Out / Needs Attention","${summary.availableItems} Available / ${summary.checkedOutItems} Out / ${summary.issueItems} Issue"`,
        `"Total Checkouts in Period",${summary.totalCheckouts}`,
        `"Total Shoots Using ${catTitle}",${summary.totalShootsWithCategory}`,
        `"Total Usage Duration","${summary.totalHoursUsed} hrs (${summary.totalDaysUsed} days)"`,
        `"Most Used Item",${csvQuote(
            summary.mostUsedItem
                ? `${summary.mostUsedItem.name} (${summary.mostUsedItem.barcode}) - ${summary.mostUsedItem.totalCheckouts} checkouts`
                : 'None'
        )}`,
        `"Least Used Active Item",${csvQuote(
            summary.leastUsedActiveItem
                ? `${summary.leastUsedActiveItem.name} (${summary.leastUsedActiveItem.barcode}) - ${summary.leastUsedActiveItem.totalCheckouts} checkouts`
                : 'None'
        )}`,
        `"Unused Items (0 Checkouts)",${summary.neverUsedCount}`,
        '',
        `"=== 1. USAGE & POPULARITY STATS ==="`,
        generateUsageReportCSV(usageRows),
        '',
        `"=== 2. SHOOT-BY-SHOOT LOG ==="`,
        generateShootLogReportCSV(shootRows, categoryLabel),
        '',
        `"=== 3. CREW USAGE BREAKDOWN ==="`,
        generateCrewBreakdownCSV(crewRows, categoryLabel),
    ];

    return sections.join('\n');
}

/**
 * Checks whether an activity log entry relates to any item or transaction in the selected category.
 */
export function logMatchesCategory(params: {
    log: Log;
    selectedCategory: string;
    categoryItemIds: Set<string>;
    categoryBarcodes: Set<string>;
    categoryTransactionIds: Set<string>;
}): boolean {
    const { log, selectedCategory, categoryItemIds, categoryBarcodes, categoryTransactionIds } =
        params;
    if (!selectedCategory || selectedCategory === 'ALL') return true;

    if (log.entityId && (categoryItemIds.has(log.entityId) || categoryTransactionIds.has(log.entityId))) {
        return true;
    }

    if (log.newValue && typeof log.newValue === 'object') {
        const nv = log.newValue as Record<string, unknown>;
        if (typeof nv.category === 'string') {
            if (
                normalizeCategoryLabel(nv.category).toLowerCase() ===
                selectedCategory.toLowerCase()
            ) {
                return true;
            }
        }
        const idLists = [nv.itemIds, nv.addedItemIds];
        for (const list of idLists) {
            if (Array.isArray(list)) {
                for (const id of list) {
                    if (typeof id === 'string' && categoryItemIds.has(id)) return true;
                }
            }
        }
        const nameLists = [nv.itemNames, nv.addedItemNames];
        for (const list of nameLists) {
            if (Array.isArray(list)) {
                for (const name of list) {
                    if (typeof name === 'string') {
                        const lower = name.toLowerCase();
                        for (const bc of categoryBarcodes) {
                            if (bc && lower.includes(bc)) return true;
                        }
                        if (
                            selectedCategory.toLowerCase() === 'lens' &&
                            (lower.includes('lens') || lower.includes('lense-'))
                        ) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    if (log.oldValue && typeof log.oldValue === 'object') {
        const ov = log.oldValue as Record<string, unknown>;
        if (typeof ov.category === 'string') {
            if (
                normalizeCategoryLabel(ov.category).toLowerCase() ===
                selectedCategory.toLowerCase()
            ) {
                return true;
            }
        }
    }

    if (log.details) {
        const detailsLower = log.details.toLowerCase();
        for (const bc of categoryBarcodes) {
            if (bc && detailsLower.includes(bc)) return true;
        }
        if (
            selectedCategory.toLowerCase() === 'lens' &&
            (detailsLower.includes(' lens') || detailsLower.includes('lense-'))
        ) {
            return true;
        }
    }

    return false;
}

