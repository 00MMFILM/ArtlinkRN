import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../services/supabaseClient";
import { trackFunnelEvent } from "../services/mauService";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const LANGUAGES = [
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "zh-CN", flag: "🇨🇳", label: "简体中文" },
  { code: "zh-TW", flag: "🇹🇼", label: "繁體中文" },
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
  { code: "th", flag: "🇹🇭", label: "ภาษาไทย" },
  { code: "id", flag: "🇮🇩", label: "Bahasa" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

const userTypes = [
  { id: "professional", emoji: "\uD83C\uDF96\uFE0F", labelKey: "auth.usertype_professional", descKey: "auth.usertype_professional_desc" },
  { id: "aspiring", emoji: "\uD83C\uDF31", labelKey: "auth.usertype_aspiring", descKey: "auth.usertype_aspiring_desc" },
  { id: "hobby", emoji: "\uD83C\uDFA8", labelKey: "auth.usertype_hobby", descKey: "auth.usertype_hobby_desc" },
  { id: "industry", emoji: "\uD83C\uDFE2", labelKey: "auth.usertype_industry", descKey: "auth.usertype_industry_desc" },
  { id: "fan", emoji: "\uD83D\uDC9C", labelKey: "auth.usertype_fan", descKey: "auth.usertype_fan_desc" },
];

const artFields = [
  { id: "acting", emoji: "\uD83C\uDFAD", labelKey: "auth.field_acting" },
  { id: "music", emoji: "\uD83C\uDFB5", labelKey: "auth.field_music" },
  { id: "art", emoji: "\uD83C\uDFA8", labelKey: "auth.field_art" },
  { id: "dance", emoji: "\uD83D\uDC83", labelKey: "auth.field_dance" },
  { id: "literature", emoji: "\u270D\uFE0F", labelKey: "auth.field_literature" },
  { id: "film", emoji: "\uD83C\uDFAC", labelKey: "auth.field_film" },
];

const TOTAL_STEPS = 2;

export default function AuthScreen({ navigation }) {
  const { handleAuth, handleChangeLanguage, language, userProfile } = useApp();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // 계정이 없는 기기는 가입이 기본 (첫 화면이 로그인 폼이라 이탈하던 문제)
  const [mode, setMode] = useState(userProfile?.authUserId ? "login" : "signup");

  useEffect(() => {
    trackFunnelEvent("auth_reached", language);
  }, []);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  // Signup state
  const [signupStep, setSignupStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedUserType, setSelectedUserType] = useState("");
  const [selectedFields, setSelectedFields] = useState([]);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateTransition = (callback) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      callback();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const toggleInArray = (arr, item) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const [loading, setLoading] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  // Validation
  const isStep0Valid = () =>
    name.trim().length >= 1 &&
    email.trim().includes("@") &&
    password.length >= 6 &&
    password === confirmPassword;
  const isStep1Valid = () => selectedUserType !== "" && selectedFields.length > 0;

  const canProceed = () => {
    switch (signupStep) {
      case 0: return isStep0Valid();
      case 1: return isStep1Valid();
      default: return false;
    }
  };

  const handleNext = () => {
    if (!canProceed()) return;
    if (signupStep < TOTAL_STEPS - 1) {
      animateTransition(() => setSignupStep(signupStep + 1));
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (signupStep > 0) {
      animateTransition(() => setSignupStep(signupStep - 1));
    } else {
      animateTransition(() => setMode("login"));
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (error) {
        const msg = error.message.includes("already registered")
          ? t("auth.already_registered_email")
          : error.message;
        Alert.alert(t("auth.signup_failed"), msg);
        return;
      }
      const profileData = {
        name: name.trim(),
        email: email.trim(),
        userType: selectedUserType,
        fields: selectedFields,
        // 아래 항목은 가입 후 프로필 편집에서 채운다 (서버 스키마 호환용 빈값)
        gender: "",
        birthDate: "",
        height: null,
        weight: null,
        heightPrivate: false,
        weightPrivate: false,
        specialties: [],
        school: "",
        location: "",
        agency: "",
        career: [],
        bio: "",
        roleModels: [],
        interests: [],
        profilePublic: false,
        photos: [],
        pendingPhotoUris: [],
      };
      trackFunnelEvent("signup_completed", language);
      await handleAuth(profileData);
    } catch (e) {
      Alert.alert(t("common.error"), t("auth.signup_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert(t("common.error"), t("auth.email_password_required"));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) {
        Alert.alert(t("auth.login_failed"), t("auth.login_invalid"));
        return;
      }
      if (data.user) {
        trackFunnelEvent("login_completed", language);
        // 기존 프로필이 있으면 이메일만 갱신, 없으면 최소 프로필 생성
        await handleAuth({ email: loginEmail.trim(), _mergeExisting: true });
      }
    } catch (e) {
      Alert.alert(t("common.error"), t("auth.login_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await handleAuth(null);
      trackFunnelEvent("browse_skipped", language);
    } catch (_) {
      Alert.alert(t("common.error"), t("auth.login_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim().includes("@")) {
      Alert.alert(t("common.error"), t("auth.valid_email_required"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: "https://artlink-server.vercel.app/api/auth-callback",
      });
      if (error) {
        Alert.alert(t("common.error"), error.message);
        return;
      }
      Alert.alert(t("auth.reset_sent"), t("auth.reset_sent_message"), [
        { text: t("common.confirm"), onPress: () => setMode("login") },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), t("auth.reset_error"));
    } finally {
      setLoading(false);
    }
  };

  // ===== RENDER: Login =====
  const renderLogin = () => (
    <View style={styles.loginContainer}>
      <View style={styles.brandContainer}>
        <Image source={require("../../assets/logo-full.png")} style={styles.brandLogoFull} resizeMode="contain" />
      </View>
      <View style={styles.inputGroup}>
        <TextInput style={styles.input} placeholder={t("auth.email_placeholder")} placeholderTextColor={CLight.gray400} value={loginEmail} onChangeText={setLoginEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextInput style={styles.input} placeholder={t("auth.password_placeholder")} placeholderTextColor={CLight.gray400} value={loginPassword} onChangeText={setLoginPassword} secureTextEntry />
      </View>
      <TouchableOpacity style={styles.forgotButton} onPress={() => animateTransition(() => setMode("forgot"))}>
        <Text style={styles.forgotText}>{t("auth.forgot_password")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.primaryButton, (!loginEmail.trim() || !loginPassword.trim() || loading) && styles.disabledButton]} onPress={handleLogin} disabled={!loginEmail.trim() || !loginPassword.trim() || loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t("auth.login")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => animateTransition(() => setMode("signup"))}>
        <Text style={styles.secondaryButtonText}>{t("auth.signup")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>{t("auth.browse")}</Text>
      </TouchableOpacity>

      {/* Language Selector — Dropdown */}
      <View style={styles.langSelector}>
        <TouchableOpacity
          style={styles.langDropdownButton}
          onPress={() => setLangDropdownOpen(!langDropdownOpen)}
          activeOpacity={0.7}
        >
          <Text style={styles.langDropdownFlag}>
            {LANGUAGES.find(l => l.code === language)?.flag}
          </Text>
          <Text style={styles.langDropdownLabel}>
            {LANGUAGES.find(l => l.code === language)?.label}
          </Text>
          <Text style={styles.langDropdownArrow}>{langDropdownOpen ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {langDropdownOpen && (
          <View style={styles.langDropdownList}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langDropdownItem, language === lang.code && styles.langDropdownItemActive]}
                onPress={() => { handleChangeLanguage(lang.code); setLangDropdownOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.langDropdownItemFlag}>{lang.flag}</Text>
                <Text style={[styles.langDropdownItemLabel, language === lang.code && styles.langDropdownItemLabelActive]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const renderForgot = () => (
    <View style={styles.loginContainer}>
      <View style={styles.brandContainer}>
        <Image source={require("../../assets/logo-full.png")} style={styles.brandLogoFull} resizeMode="contain" />
        <Text style={[T.h2, { color: CLight.gray900, marginTop: 8 }]}>{t("auth.find_password")}</Text>
        <Text style={[T.caption, { color: CLight.gray500, marginTop: 4, textAlign: "center" }]}>{t("auth.find_password_desc")}</Text>
      </View>
      <View style={styles.inputGroup}>
        <TextInput style={styles.input} placeholder={t("auth.email_placeholder")} placeholderTextColor={CLight.gray400} value={forgotEmail} onChangeText={setForgotEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </View>
      <TouchableOpacity style={[styles.primaryButton, (!forgotEmail.trim().includes("@") || loading) && styles.disabledButton]} onPress={handleForgotPassword} disabled={!forgotEmail.trim().includes("@") || loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t("auth.reset_link")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => animateTransition(() => setMode("login"))}>
        <Text style={styles.secondaryButtonText}>{t("auth.back_to_login")}</Text>
      </TouchableOpacity>
    </View>
  );

  // ===== RENDER: Signup Steps =====
  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((signupStep + 1) / TOTAL_STEPS) * 100}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{signupStep + 1} / {TOTAL_STEPS}</Text>
    </View>
  );

  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_basic")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_basic_desc")}</Text>
      <View style={styles.inputGroup}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t("auth.name")}</Text>
          <TextInput style={styles.input} placeholder={t("auth.name_placeholder")} placeholderTextColor={CLight.gray400} value={name} onChangeText={setName} autoCorrect={false} />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t("auth.email_label")}</Text>
          <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor={CLight.gray400} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t("auth.password_label")}</Text>
          <TextInput style={styles.input} placeholder={t("auth.password_min_hint")} placeholderTextColor={CLight.gray400} value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t("auth.password_confirm_label")}</Text>
          <TextInput style={[styles.input, confirmPassword.length > 0 && confirmPassword !== password && styles.inputError]} placeholder={t("auth.password_confirm_placeholder")} placeholderTextColor={CLight.gray400} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <Text style={styles.errorText}>{t("app.password_mismatch")}</Text>
          )}
        </View>
      </View>
    </View>
  );

  // 단계 1: 사용자 유형 + 분야 (기존 2개 단계를 한 화면으로 합침)
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_usertype")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_usertype_desc")}</Text>
      <View style={styles.optionGrid}>
        {userTypes.map((type) => (
          <TouchableOpacity key={type.id} style={[styles.optionCard, selectedUserType === type.id && styles.optionCardActive]} onPress={() => setSelectedUserType(type.id)} activeOpacity={0.7}>
            <Text style={styles.optionEmoji}>{type.emoji}</Text>
            <Text style={[styles.optionLabel, selectedUserType === type.id && styles.optionLabelActive]}>{t(type.labelKey)}</Text>
            <Text style={[styles.optionDesc, selectedUserType === type.id && styles.optionDescActive]}>{t(type.descKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.stepTitle, { marginTop: 28 }]}>{t("auth.step_fields")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_fields_desc")}</Text>
      <View style={styles.fieldGrid}>
        {artFields.map((field) => {
          const isSelected = selectedFields.includes(field.id);
          return (
            <TouchableOpacity key={field.id} style={[styles.fieldCard, isSelected && styles.fieldCardActive]} onPress={() => setSelectedFields(toggleInArray(selectedFields, field.id))} activeOpacity={0.7}>
              <Text style={styles.fieldEmoji}>{field.emoji}</Text>
              <Text style={[styles.fieldLabel, isSelected && styles.fieldLabelActive]}>{t(field.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderSignupStep = () => {
    switch (signupStep) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      default: return null;
    }
  };

  const renderSignup = () => (
    <View style={[styles.signupContainer, { paddingTop: insets.top + 8 }]}>
      <View style={styles.signupHeader}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>{"\u2190"}</Text>
        </TouchableOpacity>
        <Text style={[T.title, { color: CLight.gray900, flex: 1, textAlign: "center" }]}>{t("auth.signup")}</Text>
        <View style={{ width: 44 }} />
      </View>
      {renderProgressBar()}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView style={styles.signupScroll} contentContainerStyle={styles.signupScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {renderSignupStep()}
        </ScrollView>
      </Animated.View>
      <View style={styles.signupActions}>
        <TouchableOpacity style={[styles.primaryButton, (!canProceed() || loading) && styles.disabledButton]} onPress={handleNext} disabled={!canProceed() || loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{signupStep === TOTAL_STEPS - 1 ? t("auth.start") : t("common.next")}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>{t("auth.browse")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipStepButton} onPress={() => animateTransition(() => { setSignupStep(0); setMode("login"); })}>
          <Text style={styles.skipStepText}>{t("auth.login")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {mode === "login" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {renderLogin()}
          </ScrollView>
        )}
        {mode === "forgot" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {renderForgot()}
          </ScrollView>
        )}
        {mode === "signup" && renderSignup()}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CLight.bg },
  content: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },

  loginContainer: { alignItems: "center" },
  brandContainer: { alignItems: "center", marginBottom: 40 },
  brandLogo: { width: 80, height: 80, marginBottom: 8, borderRadius: 20 },
  brandLogoFull: { width: 220, height: 180, marginBottom: 8 },
  brandName: { fontSize: 32, fontWeight: "800", color: CLight.gray900, letterSpacing: -0.5 },
  brandTagline: { ...T.caption, color: CLight.gray500, marginTop: 8 },

  inputGroup: { width: "100%", gap: 12, marginBottom: 16 },
  inputWrapper: { gap: 6 },
  inputLabel: { ...T.captionBold, color: CLight.gray700, marginLeft: 4 },
  input: { width: "100%", height: 50, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 14, paddingHorizontal: 16, ...T.body, color: CLight.gray900 },
  inputError: { borderColor: CLight.red, borderWidth: 1.5 },
  errorText: { ...T.micro, color: CLight.red, marginLeft: 4, marginTop: 2 },

  primaryButton: { width: "100%", height: 52, backgroundColor: CLight.pink, borderRadius: 14, justifyContent: "center", alignItems: "center", shadowColor: CLight.pink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  primaryButtonText: { ...T.bodyBold, color: "#FFFFFF" },
  disabledButton: { backgroundColor: CLight.gray300, shadowOpacity: 0, elevation: 0 },
  secondaryButton: { width: "100%", height: 52, backgroundColor: CLight.white, borderRadius: 14, borderWidth: 1.5, borderColor: CLight.pink, justifyContent: "center", alignItems: "center", marginTop: 12 },
  secondaryButtonText: { ...T.bodyBold, color: CLight.pink },
  forgotButton: { alignSelf: "flex-end", marginBottom: 20, paddingVertical: 4 },
  forgotText: { ...T.small, color: CLight.gray500 },
  // 게스트 진입은 주요 경로 — 버튼으로 격상 (기존: 작은 회색 밑줄 텍스트라 가입이 벽으로 오인됨)
  skipButton: { width: "100%", height: 52, backgroundColor: CLight.white, borderRadius: 14, borderWidth: 1.5, borderColor: CLight.gray300, justifyContent: "center", alignItems: "center", marginTop: 12 },
  skipText: { ...T.bodyBold, color: CLight.gray700 },

  signupContainer: { flex: 1 },
  signupHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: CLight.gray100, justifyContent: "center", alignItems: "center" },
  backButtonText: { fontSize: 20, color: CLight.gray700, fontWeight: "600" },
  signupScroll: { flex: 1 },
  signupScrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  signupActions: { paddingHorizontal: 24, paddingBottom: Platform.OS === "ios" ? 36 : 24, paddingTop: 12, backgroundColor: CLight.bg, borderTopWidth: 1, borderTopColor: CLight.gray200 },
  skipStepButton: { alignItems: "center", paddingVertical: 12 },
  skipStepText: { ...T.caption, color: CLight.gray400 },

  progressContainer: { paddingHorizontal: 24, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  progressTrack: { flex: 1, height: 4, backgroundColor: CLight.gray200, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: CLight.pink, borderRadius: 2 },
  progressLabel: { ...T.microBold, color: CLight.gray500, minWidth: 32, textAlign: "right" },

  stepContent: { paddingTop: 16 },
  stepTitle: { ...T.h2, color: CLight.gray900, marginBottom: 6 },
  stepSubtitle: { ...T.caption, color: CLight.gray500, marginBottom: 24 },

  optionGrid: { gap: 12 },
  optionCard: { backgroundColor: CLight.white, borderRadius: 16, borderWidth: 1.5, borderColor: CLight.gray200, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  optionCardActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft, shadowColor: CLight.pink, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  optionEmoji: { fontSize: 28 },
  optionLabel: { ...T.bodyBold, color: CLight.gray900, flex: 0 },
  optionLabelActive: { color: CLight.pink },
  optionDesc: { ...T.small, color: CLight.gray500, flex: 1 },
  optionDescActive: { color: CLight.pinkLight },

  fieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldCard: { width: (SCREEN_WIDTH - 48 - 24) / 3, aspectRatio: 1, backgroundColor: CLight.white, borderRadius: 16, borderWidth: 1.5, borderColor: CLight.gray200, justifyContent: "center", alignItems: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  fieldCardActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft, shadowColor: CLight.pink, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  fieldEmoji: { fontSize: 32 },
  fieldLabel: { ...T.captionBold, color: CLight.gray700 },
  fieldLabelActive: { color: CLight.pink },

  // Language selector
  langSelector: { alignItems: "center", marginTop: 32, zIndex: 10 },
  langDropdownButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: "#fff" },
  langDropdownFlag: { fontSize: 16 },
  langDropdownLabel: { fontSize: 13, color: CLight.gray600, fontWeight: "500" },
  langDropdownArrow: { fontSize: 9, color: CLight.gray400, marginLeft: 4 },
  langDropdownList: { position: "absolute", bottom: 44, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: CLight.gray200, paddingVertical: 4, width: 180, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  langDropdownItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14 },
  langDropdownItemActive: { backgroundColor: CLight.pinkSoft },
  langDropdownItemFlag: { fontSize: 16 },
  langDropdownItemLabel: { fontSize: 13, color: CLight.gray600 },
  langDropdownItemLabelActive: { color: CLight.pink, fontWeight: "600" },
});
