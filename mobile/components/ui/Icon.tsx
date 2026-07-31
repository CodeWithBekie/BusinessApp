import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

// One shared SFSymbol wrapper — previously redeclared identically in ~8 separate screen files
// ((customer)/index.tsx, (customer)/assistant.tsx, customer-order/[id].tsx, business/[id].tsx, etc.).
export function Icon({ name, size = 16, color }: { name: SFSymbol; size?: number; color: string }) {
  return <SymbolView name={{ ios: name, android: 'code', web: 'code' }} tintColor={color} size={size} />;
}
