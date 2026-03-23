import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet } from "react-native";

import { AppProvider, useApp } from "./src/context/AppContext";
import Toast from "./src/components/Toast";

// Screens
import AuthScreen from "./src/screens/AuthScreen";
import HomeScreen from "./src/screens/HomeScreen";
import NotesScreen from "./src/screens/NotesScreen";
import NoteCreateScreen from "./src/screens/NoteCreateScreen";
import NoteDetailScreen from "./src/screens/NoteDetailScreen";
import CommunityScreen from "./src/screens/CommunityScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import GrowthScreen from "./src/screens/GrowthScreen";
import MatchingScreen from "./src/screens/MatchingScreen";
import ShareCardScreen from "./src/screens/ShareCardScreen";
import PortfolioScreen from "./src/screens/PortfolioScreen";
import GoalsScreen from "./src/screens/GoalsScreen";
// SubscriptionScreen removed for App Store compliance (no IAP configured)
import NotificationsScreen from "./src/screens/NotificationsScreen";
import B2BDashboardScreen from "./src/screens/B2BDashboardScreen";
import DevRoadmapScreen from "./src/screens/DevRoadmapScreen";
import MatchingPostCreateScreen from "./src/screens/MatchingPostCreateScreen";
import ProfileEditScreen from "./src/screens/ProfileEditScreen";
import EULAScreen from "./src/screens/EULAScreen";
import CommunityPostDetailScreen from "./src/screens/CommunityPostDetailScreen";
import CommunityPostCreateScreen from "./src/screens/CommunityPostCreateScreen";
import MatchingPostDetailScreen from "./src/screens/MatchingPostDetailScreen";
import InboxScreen from "./src/screens/InboxScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>{emoji}</Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.95)",
          borderTopColor: "rgba(0,0,0,0.04)",
          paddingBottom: 20,
          paddingTop: 6,
          height: 80,
        },
        tabBarActiveTintColor: "#FF2D78",
        tabBarInactiveTintColor: "#AEAEB2",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "홈",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{
          tabBarLabel: "노트",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📝" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          tabBarLabel: "커뮤니티",
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "프로필",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { authState, toast, hideToast, eulaAccepted, handleAcceptEula, handleSetDataConsent, handleDataConsentAsked } = useApp();

  if (authState !== "auth" && !eulaAccepted) {
    return (
      <View style={{ flex: 1 }}>
        <EULAScreen
          onAccept={handleAcceptEula}
          onDataConsent={(value) => {
            handleSetDataConsent(value);
            handleDataConsentAsked();
          }}
        />
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {authState === "auth" ? (
            <Stack.Screen name="Auth" component={AuthScreen} />
          ) : (
            <>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen
                name="NoteCreate"
                component={NoteCreateScreen}
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
              <Stack.Screen name="NoteDetail" component={NoteDetailScreen} />
              <Stack.Screen name="Growth" component={GrowthScreen} />
              <Stack.Screen name="Matching" component={MatchingScreen} />
              <Stack.Screen
                name="MatchingPostCreate"
                component={MatchingPostCreateScreen}
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
              <Stack.Screen name="ShareCard" component={ShareCardScreen} />
              <Stack.Screen name="Portfolio" component={PortfolioScreen} />
              <Stack.Screen name="Goals" component={GoalsScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="B2B" component={B2BDashboardScreen} />
              <Stack.Screen name="Inbox" component={InboxScreen} />
              <Stack.Screen name="DevRoadmap" component={DevRoadmapScreen} />
              <Stack.Screen name="CommunityPostDetail" component={CommunityPostDetailScreen} />
              <Stack.Screen
                name="CommunityPostCreate"
                component={CommunityPostCreateScreen}
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
              <Stack.Screen name="MatchingPostDetail" component={MatchingPostDetailScreen} />
              <Stack.Screen
                name="ProfileEdit"
                component={ProfileEditScreen}
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={hideToast} />
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppNavigator />
    </AppProvider>
  );
}
