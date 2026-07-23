import { CatalogItemType } from '@/src/api/client';

export { formatMoney } from '@/src/common/format';

export const CATALOG_ITEM_TYPE_LABELS: Record<CatalogItemType, string> = {
  Stock: 'Stock',
  TimeBased: 'Time-based',
  Quote: 'Quote-based',
};

export const CATALOG_ITEM_TYPE_COLORS: Record<CatalogItemType, string> = {
  Stock: '#2f95dc',
  TimeBased: '#5856d6',
  Quote: '#8e8e93',
};

export const CATALOG_ITEM_TYPES: readonly CatalogItemType[] = ['Stock', 'TimeBased', 'Quote'];
