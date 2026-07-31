// Deterministic colored-initials avatar for a business, keyed off its name — used by the Browse,
// My Orders, and order-detail screens so the same business renders identically across all three
// (there's no real Business.LogoUrl field/upload endpoint today, and adding one is out of scope for
// a reskin-only pass).
const PALETTE = ['#007aff', '#2e7d32', '#c0392b', '#8e44ad', '#e67e22', '#16a085', '#c2185b', '#5856d6'];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function colorFor(name: string): string {
  return PALETTE[hashString(name) % PALETTE.length];
}

type IndustryIconName = 'bag' | 'fork.knife' | 'scissors' | 'cart' | 'cross.case' | 'tv' | 'building.2';

const INDUSTRY_ICONS: readonly (readonly [string, IndustryIconName])[] = [
  ['retail', 'bag'],
  ['restaurant', 'fork.knife'],
  ['food', 'fork.knife'],
  ['salon', 'scissors'],
  ['beauty', 'scissors'],
  ['grocery', 'cart'],
  ['grocer', 'cart'],
  ['pharmacy', 'cross.case'],
  ['electronics', 'tv'],
];

export function industryIconFor(industryType: string): IndustryIconName {
  const lower = industryType.toLowerCase();
  for (const [keyword, icon] of INDUSTRY_ICONS) {
    if (lower.includes(keyword)) return icon;
  }
  return 'building.2';
}
