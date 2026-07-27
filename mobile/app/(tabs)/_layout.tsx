import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { ColorValue, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { OfflineBanner } from '@/src/offline/OfflineBanner';
import { useHasPermission } from '@/src/auth/permissions';

type TabIconName = 'cart' | 'list.bullet' | 'chart.bar' | 'checkmark.seal' | 'bubble.left.and.bubble.right' | 'gearshape' | 'shippingbox';

function TabIcon({ name, color }: { name: TabIconName; color: ColorValue }) {
  return <SymbolView name={{ ios: name, android: 'code', web: 'code' }} tintColor={color} size={26} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // Suppliers/Sales/Approvals are hidden from roles without the matching permission (Cashier,
  // InventoryClerk, Accountant each see a subset) — `href: null` removes a tab from the bar
  // without unmounting its route, the documented expo-router pattern for conditional tabs.
  const canManageSuppliers = useHasPermission('ManageSuppliers');
  const canViewAccounting = useHasPermission('ViewAccounting');
  const canDecideApprovals = useHasPermission('DecideApprovals');

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme].tint,
          // Disable the static render of the header on web to prevent a hydration error in React Navigation v6.
          headerShown: useClientOnlyValue(false, true),
        }}>
        <Tabs.Screen name="index" options={{ title: 'Catalog', tabBarIcon: ({ color }) => <TabIcon name="cart" color={color} /> }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color }) => <TabIcon name="list.bullet" color={color} /> }} />
        <Tabs.Screen
          name="suppliers"
          options={{ title: 'Suppliers', tabBarIcon: ({ color }) => <TabIcon name="shippingbox" color={color} />, href: canManageSuppliers ? undefined : null }}
        />
        <Tabs.Screen
          name="sales"
          options={{ title: 'Sales', tabBarIcon: ({ color }) => <TabIcon name="chart.bar" color={color} />, href: canViewAccounting ? undefined : null }}
        />
        <Tabs.Screen
          name="approvals"
          options={{ title: 'Approvals', tabBarIcon: ({ color }) => <TabIcon name="checkmark.seal" color={color} />, href: canDecideApprovals ? undefined : null }}
        />
        <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: ({ color }) => <TabIcon name="bubble.left.and.bubble.right" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon name="gearshape" color={color} /> }} />
      </Tabs>
    </View>
  );
}
