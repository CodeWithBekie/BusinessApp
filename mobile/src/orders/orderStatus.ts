import { OrderStatus } from '@/src/api/client';

export { formatMoney, formatRelativeDate } from '@/src/common/format';

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  Quoted: '#8e8e93',
  Invoiced: '#f2994a',
  Paid: '#2e7d32',
  Fulfilled: '#5856d6',
  Cancelled: '#c0392b',
};

export const ORDER_STATUS_FILTERS: readonly (OrderStatus | 'All')[] = ['All', 'Quoted', 'Invoiced', 'Paid', 'Fulfilled', 'Cancelled'];
