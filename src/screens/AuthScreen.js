import React, { useState, useRef } from "react";
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
  Switch,
  Image,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../services/supabaseClient";
import * as ImagePicker from "expo-image-picker";
import { useApp } from "../context/AppContext";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";
import {
  ROLE_MODELS_BY_FIELD, INTERESTS_BY_FIELD, USER_TYPES,
  GENDER_OPTIONS, SPECIALTY_SUGGESTIONS, CAREER_TYPES,
} from "../utils/helpers";

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

const GENDER_EMOJIS = { male: "\uD83D\uDC68", female: "\uD83D\uDC69", other: "\uD83E\uDDD1" };

const TOTAL_STEPS = 7;

export default function AuthScreen({ navigation }) {
  const { handleAuth, handleChangeLanguage, language } = useApp();
  const { t } = useTranslation();

  const [mode, setMode] = useState("login");
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
  // Step 3: Body info + photos
  const [photoUris, setPhotoUris] = useState([]);
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [heightPrivate, setHeightPrivate] = useState(false);
  const [weightPrivate, setWeightPrivate] = useState(false);
  // Step 4: Specialties & career
  const [specialties, setSpecialties] = useState([]);
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [school, setSchool] = useState("");
  const [location, setLocation] = useState("");
  const [agency, setAgency] = useState("");
  const [career, setCareer] = useState([]);
  const [careerTitle, setCareerTitle] = useState("");
  const [careerRole, setCareerRole] = useState("");
  const [careerYear, setCareerYear] = useState("");
  const [careerType, setCareerType] = useState("drama");
  // Step 5,6: role models, interests
  const [selectedRoleModels, setSelectedRoleModels] = useState([]);
  const [selectedInterests, setSelectedInterests] = useState([]);
  // Profile public consent
  const [profilePublic, setProfilePublic] = useState(false);

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
  const isStep1Valid = () => selectedUserType !== "";
  const isStep2Valid = () => selectedFields.length > 0;

  const canProceed = () => {
    switch (signupStep) {
      case 0: return isStep0Valid();
      case 1: return isStep1Valid();
      case 2: return isStep2Valid();
      case 3: return true; // body info optional
      case 4: return true; // specialties optional
      case 5: return true; // role models optional
      case 6: return true; // interests optional
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

  const handleAddPhoto = async () => {
    if (photoUris.length >= 6) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("common.permission_required"), t("common.photo_permission"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        setPhotoUris((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (e) {
      Alert.alert(t("common.error"), t("common.photo_load_error"));
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
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
        gender,
        birthDate: birthDate.trim(),
        height: height ? Number(height) : null,
        weight: weight ? Number(weight) : null,
        heightPrivate,
        weightPrivate,
        specialties,
        school: school.trim(),
        location: location.trim(),
        agency: agency.trim(),
        career,
        bio: "",
        roleModels: selectedRoleModels,
        interests: selectedInterests,
        profilePublic,
        photos: photoUris,
        pendingPhotoUris: photoUris,
      };
      handleAuth(profileData);
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
        // 기존 프로필이 있으면 이메일만 갱신, 없으면 최소 프로필 생성
        handleAuth({ email: loginEmail.trim(), _mergeExisting: true });
      }
    } catch (e) {
      Alert.alert(t("common.error"), t("auth.login_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => { handleAuth(null); };

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

  const handleAddCareer = () => {
    if (!careerTitle.trim()) return;
    setCareer((prev) => [...prev, {
      title: careerTitle.trim(),
      role: careerRole.trim(),
      year: careerYear.trim(),
      type: careerType,
    }]);
    setCareerTitle("");
    setCareerRole("");
    setCareerYear("");
  };

  const handleAddCustomSpecialty = () => {
    const trimmed = customSpecialty.trim();
    if (!trimmed || specialties.includes(trimmed)) { setCustomSpecialty(""); return; }
    setSpecialties((prev) => [...prev, trimmed]);
    setCustomSpecialty("");
  };

  const availableRoleModels = selectedFields.reduce((acc, field) => {
    const models = ROLE_MODELS_BY_FIELD[field] || [];
    return [...acc, ...models.filter((m) => !acc.includes(m))];
  }, []);

  const availableInterests = selectedFields.reduce((acc, field) => {
    const items = INTERESTS_BY_FIELD[field] || [];
    return [...acc, ...items.filter((i) => !acc.includes(i))];
  }, []);

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
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_fields")}</Text>
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

  // Step 3: Body info (NEW)
  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_body")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_body_desc")}</Text>

      <Text style={styles.inputLabel}>{t("auth.profile_photos")}</Text>
      <View style={styles.photoGrid}>
        {photoUris.map((uri, i) => (
          <View key={i} style={styles.photoGridItem}>
            <Image source={{ uri }} style={styles.photoGridImg} />
            <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(i)}>
              <Text style={styles.photoRemoveText}>x</Text>
            </TouchableOpacity>
            {i === 0 && <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>{t("auth.main_photo")}</Text></View>}
          </View>
        ))}
        {photoUris.length < 6 && (
          <TouchableOpacity style={styles.photoAddBtn} onPress={handleAddPhoto} activeOpacity={0.7}>
            <Text style={{ fontSize: 28, color: CLight.gray400 }}>+</Text>
            <Text style={[T.micro, { color: CLight.gray400 }]}>{t("auth.add_photo")}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.inputLabel}>{t("auth.gender")}</Text>
      <View style={styles.genderRow}>
        {GENDER_OPTIONS.map((g) => (
          <TouchableOpacity
            key={g.key}
            style={[styles.genderCard, gender === g.key && styles.genderCardActive]}
            onPress={() => setGender(g.key)}
          >
            <Text style={styles.genderEmoji}>{GENDER_EMOJIS[g.key]}</Text>
            <Text style={[styles.genderLabel, gender === g.key && styles.genderLabelActive]}>{t(g.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t("auth.birth_date")}</Text>
          <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={CLight.gray400} value={birthDate} onChangeText={setBirthDate} keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.inputLabel}>{t("auth.height")}</Text>
              <TouchableOpacity onPress={() => setHeightPrivate(!heightPrivate)} style={[styles.privacyToggle, heightPrivate && styles.privacyToggleActive]}>
                <Text style={[styles.privacyToggleText, heightPrivate && styles.privacyToggleTextActive]}>{heightPrivate ? t("common.private") : t("common.public")}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="170" placeholderTextColor={CLight.gray400} value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} />
          </View>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.inputLabel}>{t("auth.weight")}</Text>
              <TouchableOpacity onPress={() => setWeightPrivate(!weightPrivate)} style={[styles.privacyToggle, weightPrivate && styles.privacyToggleActive]}>
                <Text style={[styles.privacyToggleText, weightPrivate && styles.privacyToggleTextActive]}>{weightPrivate ? t("common.private") : t("common.public")}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="60" placeholderTextColor={CLight.gray400} value={weight} onChangeText={setWeight} keyboardType="number-pad" maxLength={3} />
          </View>
        </View>
        <Text style={[T.micro, { color: CLight.gray400, marginTop: 8, lineHeight: 18 }]}>
          {t("auth.private_notice")}
        </Text>
      </View>
    </View>
  );

  // Step 4: Specialties, school, career (NEW)
  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_activity")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_activity_desc")}</Text>

      <Text style={styles.inputLabel}>{t("auth.specialty")}</Text>
      <View style={styles.pillGrid}>
        {SPECIALTY_SUGGESTIONS.map((s) => {
          const isSelected = specialties.includes(s);
          return (
            <TouchableOpacity key={s} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => setSpecialties(toggleInArray(specialties, s))}>
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.tagInputRow, { marginTop: 10 }]}>
        <TextInput style={styles.tagInput} placeholder={t("auth.custom_input")} placeholderTextColor={CLight.gray400} value={customSpecialty} onChangeText={setCustomSpecialty} onSubmitEditing={handleAddCustomSpecialty} returnKeyType="done" maxLength={20} />
        <TouchableOpacity style={[styles.tagAddBtn, !customSpecialty.trim() && styles.tagAddBtnDisabled]} onPress={handleAddCustomSpecialty} disabled={!customSpecialty.trim()}>
          <Text style={[styles.tagAddText, !customSpecialty.trim() && styles.tagAddTextDisabled]}>{t("common.add")}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.inputGroup, { marginTop: 16 }]}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <Text style={styles.inputLabel}>{t("auth.school")}</Text>
            <TextInput style={styles.input} placeholder={t("auth.school_placeholder")} placeholderTextColor={CLight.gray400} value={school} onChangeText={setSchool} />
          </View>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <Text style={styles.inputLabel}>{t("auth.location")}</Text>
            <TextInput style={styles.input} placeholder={t("auth.location_placeholder")} placeholderTextColor={CLight.gray400} value={location} onChangeText={setLocation} />
          </View>
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t("auth.agency")}</Text>
          <TextInput style={styles.input} placeholder={t("auth.agency_placeholder")} placeholderTextColor={CLight.gray400} value={agency} onChangeText={setAgency} />
        </View>
      </View>

      {/* Career section */}
      <Text style={[styles.inputLabel, { marginTop: 16 }]}>{t("auth.career")}</Text>
      {career.map((c, i) => (
        <View key={i} style={styles.careerItem}>
          <View style={{ flex: 1 }}>
            <Text style={[T.captionBold, { color: CLight.gray900 }]}>{c.title}</Text>
            <Text style={[T.micro, { color: CLight.gray500 }]}>{c.role} | {c.year} | {t("careerTypes." + c.type)}</Text>
          </View>
          <TouchableOpacity onPress={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))}>
            <Text style={{ color: CLight.red, fontSize: 18 }}>x</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.careerAddSection}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[styles.input, { flex: 2 }]} placeholder={t("auth.work_title")} placeholderTextColor={CLight.gray400} value={careerTitle} onChangeText={setCareerTitle} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder={t("auth.role")} placeholderTextColor={CLight.gray400} value={careerRole} onChangeText={setCareerRole} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder={t("auth.year")} placeholderTextColor={CLight.gray400} value={careerYear} onChangeText={setCareerYear} keyboardType="number-pad" maxLength={4} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }} style={{ flex: 2 }}>
            {CAREER_TYPES.slice(0, 5).map((ct) => (
              <TouchableOpacity key={ct.key} style={[styles.miniPill, careerType === ct.key && styles.miniPillActive]} onPress={() => setCareerType(ct.key)}>
                <Text style={[styles.miniPillText, careerType === ct.key && styles.miniPillTextActive]}>{t(ct.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <TouchableOpacity style={[styles.addCareerBtn, !careerTitle.trim() && styles.disabledButton]} onPress={handleAddCareer} disabled={!careerTitle.trim()}>
          <Text style={[T.captionBold, { color: CLight.white }]}>{t("auth.add_career")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Step 5: Role Models (was step 3)
  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_rolemodels")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_rolemodels_desc")}</Text>
      <View style={styles.pillGrid}>
        {availableRoleModels.map((model) => {
          const isSelected = selectedRoleModels.includes(model);
          return (
            <TouchableOpacity key={model} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => setSelectedRoleModels(toggleInArray(selectedRoleModels, model))}>
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{model}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {availableRoleModels.length === 0 && (
        <Text style={styles.emptyHint}>{t("auth.select_field_first")}</Text>
      )}
    </View>
  );

  // Step 6: Interests (was step 4)
  const renderStep6 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("auth.step_interests")}</Text>
      <Text style={styles.stepSubtitle}>{t("auth.step_interests_desc")}</Text>
      <View style={styles.pillGrid}>
        {availableInterests.map((interest) => {
          const isSelected = selectedInterests.includes(interest);
          return (
            <TouchableOpacity key={interest} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => setSelectedInterests(toggleInArray(selectedInterests, interest))}>
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{interest}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {availableInterests.length === 0 && (
        <Text style={styles.emptyHint}>{t("auth.select_field_first")}</Text>
      )}

      {/* Profile Public Consent */}
      <View style={styles.consentSection}>
        <View style={styles.consentRow}>
          <View style={{ flex: 1 }}>
            <Text style={[T.captionBold, { color: CLight.gray900 }]}>{t("auth.profile_public")}</Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2, lineHeight: 18 }]}>
              {t("auth.profile_public_desc")}
            </Text>
          </View>
          <Switch
            value={profilePublic}
            onValueChange={setProfilePublic}
            trackColor={{ false: CLight.gray200, true: CLight.pink }}
            thumbColor={CLight.white}
          />
        </View>
      </View>
    </View>
  );

  const renderSignupStep = () => {
    switch (signupStep) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      default: return null;
    }
  };

  const renderSignup = () => (
    <View style={styles.signupContainer}>
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
        {signupStep >= 3 && (
          <TouchableOpacity style={styles.skipStepButton} onPress={handleNext}>
            <Text style={styles.skipStepText}>{t("auth.skip_step")}</Text>
          </TouchableOpacity>
        )}
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
  skipButton: { marginTop: 20, paddingVertical: 8 },
  skipText: { ...T.caption, color: CLight.gray400, textDecorationLine: "underline" },

  signupContainer: { flex: 1, paddingTop: Platform.OS === "ios" ? 56 : 16 },
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

  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: CLight.white },
  pillActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  pillText: { ...T.small, color: CLight.gray700 },
  pillTextActive: { color: CLight.pink, fontWeight: "600" },
  emptyHint: { ...T.caption, color: CLight.gray400, textAlign: "center", marginTop: 32 },

  // Gender cards
  genderRow: { flexDirection: "row", gap: 12, marginBottom: 16, marginTop: 8 },
  genderCard: { flex: 1, backgroundColor: CLight.white, borderRadius: 16, borderWidth: 1.5, borderColor: CLight.gray200, paddingVertical: 18, alignItems: "center", gap: 6 },
  genderCardActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  genderEmoji: { fontSize: 28 },
  genderLabel: { ...T.captionBold, color: CLight.gray700 },
  genderLabelActive: { color: CLight.pink },

  // Tag input
  tagInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagInput: { flex: 1, height: 44, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 12, paddingHorizontal: 14, ...T.caption, color: CLight.gray900 },
  tagAddBtn: { backgroundColor: CLight.pink, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  tagAddBtnDisabled: { backgroundColor: CLight.gray200 },
  tagAddText: { ...T.captionBold, color: CLight.white },
  tagAddTextDisabled: { color: CLight.gray400 },

  // Career
  careerItem: { flexDirection: "row", alignItems: "center", backgroundColor: CLight.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: CLight.gray200 },
  careerAddSection: { marginTop: 8 },
  addCareerBtn: { backgroundColor: CLight.pink, borderRadius: 12, paddingVertical: 10, alignItems: "center", marginTop: 8 },
  miniPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: CLight.white },
  miniPillActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  miniPillText: { ...T.micro, color: CLight.gray500 },
  miniPillTextActive: { color: CLight.pink, fontWeight: "600" },

  // Photo gallery
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  photoGridItem: { width: (SCREEN_WIDTH - 48 - 20) / 3, aspectRatio: 3 / 4, borderRadius: 12, overflow: "hidden", position: "relative" },
  photoGridImg: { width: "100%", height: "100%", borderRadius: 12 },
  photoRemoveBtn: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  photoRemoveText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  mainBadge: { position: "absolute", bottom: 4, left: 4, backgroundColor: CLight.pink, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mainBadgeText: { ...T.micro, color: "#fff", fontWeight: "700" },
  photoAddBtn: { width: (SCREEN_WIDTH - 48 - 20) / 3, aspectRatio: 3 / 4, borderRadius: 12, borderWidth: 2, borderColor: CLight.gray200, borderStyle: "dashed", justifyContent: "center", alignItems: "center", backgroundColor: CLight.gray50 },

  // Consent toggle
  consentSection: { marginTop: 28, borderTopWidth: 1, borderTopColor: CLight.gray200, paddingTop: 20 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: CLight.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: CLight.gray200 },

  // Privacy toggle
  privacyToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: CLight.gray100, borderWidth: 1, borderColor: CLight.gray200 },
  privacyToggleActive: { backgroundColor: CLight.pinkSoft, borderColor: CLight.pink },
  privacyToggleText: { ...T.micro, color: CLight.gray500 },
  privacyToggleTextActive: { color: CLight.pink, fontWeight: "600" },

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
