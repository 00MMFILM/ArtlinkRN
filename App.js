import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet, Modal, TextInput, TouchableOpacity, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from "react-native";
import * as ExpoLinking from "expo-linking";

import { AppProvider, useApp } from "./src/context/AppContext";
import { supabase } from "./src/services/supabaseClient";
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

function AccountLinkBanner({ visible, email, onLinked, onSkip }) {
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = pw.length >= 6 && pw === pwConfirm && !loading;

  if (!visible) return null;

  const handleLink = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password: pw });
      if (error) {
        Alert.alert("연동 실패", error.message.includes("already registered")
          ? "이미 가입된 이메일입니다. 로그인해주세요."
          : error.message);
        return;
      }
      onLinked(data.user?.id);
    } catch {
      Alert.alert("오류", "계정 연동 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={linkStyles.fullOverlay}>
      <Pressable style={linkStyles.backdrop} onPress={onSkip} />
      <KeyboardAvoidingView style={linkStyles.sheetWrap} behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none">
        <View style={linkStyles.sheet}>
          <Text style={linkStyles.badge}>업데이트 안내</Text>
          <Text style={linkStyles.title}>회원가입 시스템이 도입되었습니다</Text>
          <Text style={linkStyles.desc}>기존 회원 대상 안내입니다.{"\n"}비밀번호만 설정하면 가입이 자동 완료됩니다.{"\n"}다른 기기에서도 로그인할 수 있고,{"\n"}데이터가 안전하게 보호됩니다.</Text>
          <Text style={linkStyles.label}>이메일</Text>
          <View style={linkStyles.emailBox}><Text style={linkStyles.emailText}>{email}</Text></View>
          <Text style={linkStyles.label}>비밀번호</Text>
          <TextInput style={linkStyles.input} placeholder="6자 이상" placeholderTextColor="#AEAEB2" secureTextEntry value={pw} onChangeText={setPw} />
          <Text style={linkStyles.label}>비밀번호 확인</Text>
          <TextInput style={[linkStyles.input, pwConfirm.length > 0 && pwConfirm !== pw && { borderColor: "#FF3B30" }]} placeholder="다시 입력" placeholderTextColor="#AEAEB2" secureTextEntry value={pwConfirm} onChangeText={setPwConfirm} />
          {pwConfirm.length > 0 && pwConfirm !== pw && <Text style={linkStyles.error}>비밀번호가 일치하지 않습니다</Text>}
          <Pressable style={[linkStyles.btn, !canSubmit && linkStyles.btnDisabled]} onPress={handleLink} disabled={!canSubmit}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={linkStyles.btnText}>설정 완료</Text>}
          </Pressable>
          <Pressable style={linkStyles.skipBtn} onPress={onSkip}>
            <Text style={linkStyles.skipText}>나중에 하기</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const linkStyles = StyleSheet.create({
  fullOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  badge: { fontSize: 13, fontWeight: "700", color: "#FF2D78", textAlign: "center", marginBottom: 10, backgroundColor: "#FFF0F5", alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: "hidden" },
  title: { fontSize: 20, fontWeight: "700", color: "#1C1C1E", textAlign: "center", marginBottom: 8 },
  desc: { fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: "600", color: "#48484A", marginBottom: 6, marginLeft: 4 },
  emailBox: { backgroundColor: "#F2F2F7", borderRadius: 14, padding: 14, marginBottom: 16 },
  emailText: { fontSize: 15, color: "#8E8E93" },
  input: { height: 50, backgroundColor: "#F2F2F7", borderWidth: 1, borderColor: "#E5E5EA", borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: "#1C1C1E", marginBottom: 12 },
  error: { fontSize: 12, color: "#FF3B30", marginLeft: 4, marginBottom: 8 },
  btn: { height: 52, backgroundColor: "#FF2D78", borderRadius: 14, justifyContent: "center", alignItems: "center", marginTop: 8 },
  btnDisabled: { backgroundColor: "#D1D1D6" },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  skipBtn: { alignItems: "center", paddingVertical: 14 },
  skipText: { fontSize: 14, color: "#AEAEB2" },
});

function ResetPasswordModal({ visible, onDone }) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = newPw.length >= 6 && newPw === confirmPw && !loading;

  const handleReset = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        Alert.alert("오류", error.message);
        return;
      }
      Alert.alert("완료", "비밀번호가 변경되었습니다.", [{ text: "확인", onPress: onDone }]);
    } catch {
      Alert.alert("오류", "비밀번호 변경 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={resetStyles.fullOverlay}>
      <Pressable style={resetStyles.backdrop} onPress={onDone} />
      <KeyboardAvoidingView style={resetStyles.sheetWrap} behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none">
        <View style={resetStyles.sheet}>
          <Text style={resetStyles.title}>새 비밀번호 설정</Text>
          <Text style={resetStyles.desc}>새로운 비밀번호를 입력해주세요.</Text>
          <Text style={resetStyles.label}>새 비밀번호</Text>
          <TextInput style={resetStyles.input} placeholder="6자 이상" placeholderTextColor="#AEAEB2" secureTextEntry value={newPw} onChangeText={setNewPw} />
          <Text style={resetStyles.label}>비밀번호 확인</Text>
          <TextInput style={[resetStyles.input, confirmPw.length > 0 && confirmPw !== newPw && { borderColor: "#FF3B30" }]} placeholder="다시 입력" placeholderTextColor="#AEAEB2" secureTextEntry value={confirmPw} onChangeText={setConfirmPw} />
          {confirmPw.length > 0 && confirmPw !== newPw && <Text style={resetStyles.error}>비밀번호가 일치하지 않습니다</Text>}
          <Pressable style={[resetStyles.btn, !canSubmit && resetStyles.btnDisabled]} onPress={handleReset} disabled={!canSubmit}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={resetStyles.btnText}>변경 완료</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const resetStyles = StyleSheet.create({
  fullOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 999 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: "700", color: "#1C1C1E", textAlign: "center", marginBottom: 8 },
  desc: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginBottom: 24 },
  label: { fontSize: 13, fontWeight: "600", color: "#48484A", marginBottom: 6, marginLeft: 4 },
  input: { height: 50, backgroundColor: "#F2F2F7", borderWidth: 1, borderColor: "#E5E5EA", borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: "#1C1C1E", marginBottom: 12 },
  error: { fontSize: 12, color: "#FF3B30", marginLeft: 4, marginBottom: 8 },
  btn: { height: 52, backgroundColor: "#FF2D78", borderRadius: 14, justifyContent: "center", alignItems: "center", marginTop: 8 },
  btnDisabled: { backgroundColor: "#D1D1D6" },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

function AppNavigator() {
  const { authState, toast, hideToast, eulaAccepted, handleAcceptEula, handleSetDataConsent, handleDataConsentAsked, userProfile, handleUpdateProfile } = useApp();
  const [linkDismissed, setLinkDismissed] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  useEffect(() => {
    const handleDeepLink = async (url) => {
      if (!url) return;
      // Supabase appends tokens as fragment: #access_token=...&type=recovery
      const fragment = url.split("#")[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      if (params.get("type") === "recovery") {
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          setShowResetPassword(true);
        }
      }
    };

    // Handle app opened via deep link
    ExpoLinking.getInitialURL().then(handleDeepLink);

    // Handle deep link while app is open
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  const needsLink = authState === "app" && userProfile?.email && !userProfile?.authUserId && !linkDismissed;

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
      <AccountLinkBanner
        visible={needsLink}
        email={userProfile?.email || ""}
        onLinked={(authUserId) => {
          handleUpdateProfile({ authUserId });
          Alert.alert("완료", "가입이 완료되었습니다!");
        }}
        onSkip={() => setLinkDismissed(true)}
      />
      <ResetPasswordModal visible={showResetPassword} onDone={() => setShowResetPassword(false)} />
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
