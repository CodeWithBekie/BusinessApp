import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { ColorValue, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { OfflineBanner } from '@/src/offline/OfflineBanner';

type TabIconName = 'storefront' | 'list.bullet' | 'person.circle';

function TabIcon({ name, color }: { name: TabIconName; color: ColorValue }) {
  return <SymbolView name={{ ios: name, android: 'code', web: 'code' }} tintColor={color} size={26} />;
}

export default function CustomerTabLayout() {
  const colorScheme = useColorScheme();

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme].tint,
          headerShown: useClientOnlyValue(false, true),
        }}>
        <Tabs.Screen name="index" options={{ title: 'Browse', tabBarIcon: ({ color }) => <TabIcon name="storefront" color={color} /> }} />
        <Tabs.Screen name="orders" options={{ title: 'My Orders', tabBarIcon: ({ color }) => <TabIcon name="list.bullet" color={color} /> }} />
        <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color }) => <TabIcon name="person.circle" color={color} /> }} />
      </Tabs>
    </View>
  );
}
