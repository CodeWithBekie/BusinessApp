export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  Pending: '#f2994a',
  Approved: '#2e7d32',
  Rejected: '#c0392b',
};

export const APPROVAL_STATUS_FILTERS: readonly (ApprovalStatus | 'All')[] = ['Pending', 'Approved', 'Rejected', 'All'];
