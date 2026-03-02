import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function Layout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#3b82f6', headerStyle: { backgroundColor: '#f3f4f6' } }}>
      <Tabs.Screen 
        name="index" 
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }} 
      />
      <Tabs.Screen 
        name="detect" 
        options={{ title: 'Detect', tabBarIcon: ({ color }) => <Ionicons name="scan" size={24} color={color} /> }} 
      />
      <Tabs.Screen 
        name="map" 
        options={{ title: 'Map', tabBarIcon: ({ color }) => <Ionicons name="map" size={24} color={color} /> }} 
      />
    </Tabs>
  );
}