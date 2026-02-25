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
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import { ROLE_MODELS_BY_FIELD, INTERESTS_BY_FIELD, USER_TYPES } from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const userTypes = [
  { id: "professional", emoji: "\uD83C\uDF96\uFE0F", label: "\uC804\uBB38 \uC608\uC220\uAC00", desc: "\uD604\uC5C5\uC5D0\uC11C \uD65C\uB3D9 \uC911\uC778 \uC544\uD2F0\uC2A4\uD2B8" },
  { id: "aspiring", emoji: "\uD83C\uDF31", label: "\uC608\uC220 \uC9C0\uB9DD\uC0DD", desc: "\uC804\uACF5 \uD559\uC0DD\uC774\uAC70\uB098 \uB370\uBDD4\uB97C \uC900\uBE44 \uC911" },
  { id: "hobby", emoji: "\uD83C\uDFA8", label: "\uCDE8\uBBF8 \uC608\uC220\uAC00", desc: "\uC990\uAE30\uBA74\uC11C \uC608\uC220 \uD65C\uB3D9\uC744 \uD558\uACE0 \uC788\uC5B4\uC694" },
  { id: "industry", emoji: "\uD83C\uDFE2", label: "\uC5C5\uACC4 \uAD00\uACC4\uC790", desc: "\uD504\uB85C\uB355\uC158, \uAE30\uD68D\uC0AC, \uAD50\uC721\uAE30\uAD00 \uB4F1" },
];

const artFields = [
  { id: "acting", emoji: "\uD83C\uDFAD", label: "\uC5F0\uAE30" },
  { id: "music", emoji: "\uD83C\uDFB5", label: "\uC74C\uC545" },
  { id: "art", emoji: "\uD83C\uDFA8", label: "\uBBF8\uC220" },
  { id: "dance", emoji: "\uD83D\uDC83", label: "\uBB34\uC6A9" },
  { id: "literature", emoji: "\u270D\uFE0F", label: "\uBB38\uD559" },
  { id: "film", emoji: "\uD83C\uDFAC", label: "\uC601\uD654" },
];

const TOTAL_STEPS = 5;

export default function AuthScreen({ navigation }) {
  const { handleAuth } = useApp();

  // ---- Mode: "login" | "signup" | "forgot" ----
  const [mode, setMode] = useState("login");

  // ---- Login fields ----
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // ---- Forgot password ----
  const [forgotEmail, setForgotEmail] = useState("");

  // ---- Signup state ----
  const [signupStep, setSignupStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedUserType, setSelectedUserType] = useState("");
  const [selectedFields, setSelectedFields] = useState([]);
  const [selectedRoleModels, setSelectedRoleModels] = useState([]);
  const [selectedInterests, setSelectedInterests] = useState([]);

  // ---- Animations ----
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ---- Helpers ----
  const animateTransition = (callback) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      callback();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const toggleInArray = (arr, item) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  // ---- Validation ----
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
      case 3: return true; // role models optional
      case 4: return true; // interests optional
      default: return false;
    }
  };

  // ---- Navigation ----
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

  const handleComplete = () => {
    const profileData = {
      name: name.trim(),
      email: email.trim(),
      userType: selectedUserType,
      fields: selectedFields,
      roleModels: selectedRoleModels,
      interests: selectedInterests,
    };
    handleAuth(profileData);
  };

  const handleLogin = () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert("\uC624\uB958", "\uC774\uBA54\uC77C\uACFC \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
      return;
    }
    // For beta, just proceed with a default profile
    handleAuth({ name: loginEmail.split("@")[0], email: loginEmail.trim() });
  };

  const handleSkip = () => {
    handleAuth(null);
  };

  const handleForgotPassword = () => {
    if (!forgotEmail.trim().includes("@")) {
      Alert.alert("\uC624\uB958", "\uC720\uD6A8\uD55C \uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
      return;
    }
    Alert.alert("\uC548\uB0B4", "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uB9C1\uD06C\uAC00 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", [
      { text: "\uD655\uC778", onPress: () => setMode("login") },
    ]);
  };

  // ---- Get available role models and interests based on selected fields ----
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
      {/* Brand */}
      <View style={styles.brandContainer}>
        <Text style={styles.brandInfinity}>{"\u221E"}</Text>
        <Text style={styles.brandName}>ArtLink</Text>
        <Text style={styles.brandTagline}>{"\uB2F9\uC2E0\uC758 \uC608\uC220 \uC5EC\uC815\uC744 \uAE30\uB85D\uD558\uC138\uC694"}</Text>
      </View>

      {/* Inputs */}
      <View style={styles.inputGroup}>
        <TextInput
          style={styles.input}
          placeholder={"\uC774\uBA54\uC77C"}
          placeholderTextColor={CLight.gray400}
          value={loginEmail}
          onChangeText={setLoginEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder={"\uBE44\uBC00\uBC88\uD638"}
          placeholderTextColor={CLight.gray400}
          value={loginPassword}
          onChangeText={setLoginPassword}
          secureTextEntry
        />
      </View>

      {/* Forgot password */}
      <TouchableOpacity
        style={styles.forgotButton}
        onPress={() => animateTransition(() => setMode("forgot"))}
      >
        <Text style={styles.forgotText}>{"\uBE44\uBC00\uBC88\uD638\uB97C \uC78A\uC73C\uC168\uB098\uC694?"}</Text>
      </TouchableOpacity>

      {/* Login button */}
      <TouchableOpacity
        style={[styles.primaryButton, (!loginEmail.trim() || !loginPassword.trim()) && styles.disabledButton]}
        onPress={handleLogin}
        disabled={!loginEmail.trim() || !loginPassword.trim()}
      >
        <Text style={styles.primaryButtonText}>{"\uB85C\uADF8\uC778"}</Text>
      </TouchableOpacity>

      {/* Signup button */}
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => animateTransition(() => setMode("signup"))}
      >
        <Text style={styles.secondaryButtonText}>{"\uD68C\uC6D0\uAC00\uC785"}</Text>
      </TouchableOpacity>

      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>{"\uB458\uB7EC\uBCF4\uAE30"}</Text>
      </TouchableOpacity>
    </View>
  );

  // ===== RENDER: Forgot Password =====
  const renderForgot = () => (
    <View style={styles.loginContainer}>
      <View style={styles.brandContainer}>
        <Text style={styles.brandInfinity}>{"\u221E"}</Text>
        <Text style={[T.h2, { color: CLight.gray900, marginTop: 8 }]}>{"\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30"}</Text>
        <Text style={[T.caption, { color: CLight.gray500, marginTop: 4, textAlign: "center" }]}>
          {"\uAC00\uC785\uD55C \uC774\uBA54\uC77C\uC744 \uC785\uB825\uD558\uBA74\n\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815 \uB9C1\uD06C\uB97C \uBCF4\uB0B4\uB4DC\uB9BD\uB2C8\uB2E4."}
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <TextInput
          style={styles.input}
          placeholder={"\uC774\uBA54\uC77C"}
          placeholderTextColor={CLight.gray400}
          value={forgotEmail}
          onChangeText={setForgotEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, !forgotEmail.trim().includes("@") && styles.disabledButton]}
        onPress={handleForgotPassword}
        disabled={!forgotEmail.trim().includes("@")}
      >
        <Text style={styles.primaryButtonText}>{"\uC7AC\uC124\uC815 \uB9C1\uD06C \uBC1B\uAE30"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => animateTransition(() => setMode("login"))}
      >
        <Text style={styles.secondaryButtonText}>{"\uB85C\uADF8\uC778\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"}</Text>
      </TouchableOpacity>
    </View>
  );

  // ===== RENDER: Signup Steps =====
  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${((signupStep + 1) / TOTAL_STEPS) * 100}%` },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>
        {signupStep + 1} / {TOTAL_STEPS}
      </Text>
    </View>
  );

  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{"\uAE30\uBCF8 \uC815\uBCF4"}</Text>
      <Text style={styles.stepSubtitle}>{"\uACC4\uC815\uC744 \uB9CC\uB4E4\uC5B4 \uBCFC\uAE4C\uC694?"}</Text>

      <View style={styles.inputGroup}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{"\uC774\uB984"}</Text>
          <TextInput
            style={styles.input}
            placeholder={"\uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694"}
            placeholderTextColor={CLight.gray400}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{"\uC774\uBA54\uC77C"}</Text>
          <TextInput
            style={styles.input}
            placeholder="email@example.com"
            placeholderTextColor={CLight.gray400}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{"\uBE44\uBC00\uBC88\uD638"}</Text>
          <TextInput
            style={styles.input}
            placeholder={"\u0036\uC790 \uC774\uC0C1"}
            placeholderTextColor={CLight.gray400}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{"\uBE44\uBC00\uBC88\uD638 \uD655\uC778"}</Text>
          <TextInput
            style={[
              styles.input,
              confirmPassword.length > 0 && confirmPassword !== password && styles.inputError,
            ]}
            placeholder={"\uBE44\uBC00\uBC88\uD638\uB97C \uB2E4\uC2DC \uC785\uB825\uD574\uC8FC\uC138\uC694"}
            placeholderTextColor={CLight.gray400}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <Text style={styles.errorText}>{"\uBE44\uBC00\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4"}</Text>
          )}
        </View>
      </View>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{"\uC5B4\uB5A4 \uC608\uC220\uAC00\uC2E0\uAC00\uC694?"}</Text>
      <Text style={styles.stepSubtitle}>{"\uB2F9\uC2E0\uC5D0\uAC8C \uB9DE\uB294 \uACBD\uD5D8\uC744 \uB4DC\uB9B4\uAC8C\uC694"}</Text>

      <View style={styles.optionGrid}>
        {userTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.optionCard,
              selectedUserType === type.id && styles.optionCardActive,
            ]}
            onPress={() => setSelectedUserType(type.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionEmoji}>{type.emoji}</Text>
            <Text
              style={[
                styles.optionLabel,
                selectedUserType === type.id && styles.optionLabelActive,
              ]}
            >
              {type.label}
            </Text>
            <Text
              style={[
                styles.optionDesc,
                selectedUserType === type.id && styles.optionDescActive,
              ]}
            >
              {type.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{"\uC608\uC220 \uBD84\uC57C"}</Text>
      <Text style={styles.stepSubtitle}>{"\uAD00\uC2EC \uC788\uB294 \uBD84\uC57C\uB97C \uBAA8\uB450 \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}</Text>

      <View style={styles.fieldGrid}>
        {artFields.map((field) => {
          const isSelected = selectedFields.includes(field.id);
          return (
            <TouchableOpacity
              key={field.id}
              style={[styles.fieldCard, isSelected && styles.fieldCardActive]}
              onPress={() => setSelectedFields(toggleInArray(selectedFields, field.id))}
              activeOpacity={0.7}
            >
              <Text style={styles.fieldEmoji}>{field.emoji}</Text>
              <Text style={[styles.fieldLabel, isSelected && styles.fieldLabelActive]}>
                {field.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{"\uB864 \uBAA8\uB378"}</Text>
      <Text style={styles.stepSubtitle}>{"\uC874\uACBD\uD558\uB294 \uC544\uD2F0\uC2A4\uD2B8\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694 (\uC120\uD0DD\uC0AC\uD56D)"}</Text>

      <View style={styles.pillGrid}>
        {availableRoleModels.map((model) => {
          const isSelected = selectedRoleModels.includes(model);
          return (
            <TouchableOpacity
              key={model}
              style={[styles.pill, isSelected && styles.pillActive]}
              onPress={() => setSelectedRoleModels(toggleInArray(selectedRoleModels, model))}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                {model}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {availableRoleModels.length === 0 && (
        <Text style={styles.emptyHint}>{"\uC774\uC804 \uB2E8\uACC4\uC5D0\uC11C \uBD84\uC57C\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}</Text>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{"\uAD00\uC2EC \uBD84\uC57C"}</Text>
      <Text style={styles.stepSubtitle}>{"\uD2B9\uBCC4\uD788 \uAD00\uC2EC \uC788\uB294 \uC601\uC5ED\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694 (\uC120\uD0DD\uC0AC\uD56D)"}</Text>

      <View style={styles.pillGrid}>
        {availableInterests.map((interest) => {
          const isSelected = selectedInterests.includes(interest);
          return (
            <TouchableOpacity
              key={interest}
              style={[styles.pill, isSelected && styles.pillActive]}
              onPress={() => setSelectedInterests(toggleInArray(selectedInterests, interest))}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                {interest}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {availableInterests.length === 0 && (
        <Text style={styles.emptyHint}>{"\uC774\uC804 \uB2E8\uACC4\uC5D0\uC11C \uBD84\uC57C\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694"}</Text>
      )}
    </View>
  );

  const renderSignupStep = () => {
    switch (signupStep) {
      case 0: return renderStep0();
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return null;
    }
  };

  const renderSignup = () => (
    <View style={styles.signupContainer}>
      {/* Header with back button */}
      <View style={styles.signupHeader}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>{"\u2190"}</Text>
        </TouchableOpacity>
        <Text style={[T.title, { color: CLight.gray900, flex: 1, textAlign: "center" }]}>
          {"\uD68C\uC6D0\uAC00\uC785"}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {renderProgressBar()}

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          style={styles.signupScroll}
          contentContainerStyle={styles.signupScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderSignupStep()}
        </ScrollView>
      </Animated.View>

      {/* Bottom actions */}
      <View style={styles.signupActions}>
        <TouchableOpacity
          style={[styles.primaryButton, !canProceed() && styles.disabledButton]}
          onPress={handleNext}
          disabled={!canProceed()}
        >
          <Text style={styles.primaryButtonText}>
            {signupStep === TOTAL_STEPS - 1 ? "\uC2DC\uC791\uD558\uAE30" : "\uB2E4\uC74C"}
          </Text>
        </TouchableOpacity>
        {signupStep >= 3 && (
          <TouchableOpacity style={styles.skipStepButton} onPress={handleNext}>
            <Text style={styles.skipStepText}>{"\uAC74\uB108\uB6B0\uAE30"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ===== MAIN RENDER =====
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {mode === "login" && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderLogin()}
          </ScrollView>
        )}
        {mode === "forgot" && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderForgot()}
          </ScrollView>
        )}
        {mode === "signup" && renderSignup()}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CLight.bg,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // ---- Brand ----
  loginContainer: {
    alignItems: "center",
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  brandInfinity: {
    fontSize: 56,
    fontWeight: "800",
    color: CLight.pink,
    marginBottom: 4,
  },
  brandName: {
    fontSize: 32,
    fontWeight: "800",
    color: CLight.gray900,
    letterSpacing: -0.5,
  },
  brandTagline: {
    ...T.caption,
    color: CLight.gray500,
    marginTop: 8,
  },

  // ---- Inputs ----
  inputGroup: {
    width: "100%",
    gap: 12,
    marginBottom: 16,
  },
  inputWrapper: {
    gap: 6,
  },
  inputLabel: {
    ...T.captionBold,
    color: CLight.gray700,
    marginLeft: 4,
  },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: CLight.inputBg,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    ...T.body,
    color: CLight.gray900,
  },
  inputError: {
    borderColor: CLight.red,
    borderWidth: 1.5,
  },
  errorText: {
    ...T.micro,
    color: CLight.red,
    marginLeft: 4,
    marginTop: 2,
  },

  // ---- Buttons ----
  primaryButton: {
    width: "100%",
    height: 52,
    backgroundColor: CLight.pink,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    ...T.bodyBold,
    color: "#FFFFFF",
  },
  disabledButton: {
    backgroundColor: CLight.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  secondaryButton: {
    width: "100%",
    height: 52,
    backgroundColor: CLight.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CLight.pink,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: {
    ...T.bodyBold,
    color: CLight.pink,
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 20,
    paddingVertical: 4,
  },
  forgotText: {
    ...T.small,
    color: CLight.gray500,
  },
  skipButton: {
    marginTop: 20,
    paddingVertical: 8,
  },
  skipText: {
    ...T.caption,
    color: CLight.gray400,
    textDecorationLine: "underline",
  },

  // ---- Signup layout ----
  signupContainer: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
  },
  signupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CLight.gray100,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 20,
    color: CLight.gray700,
    fontWeight: "600",
  },
  signupScroll: {
    flex: 1,
  },
  signupScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  signupActions: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    paddingTop: 12,
    backgroundColor: CLight.bg,
    borderTopWidth: 1,
    borderTopColor: CLight.gray200,
  },
  skipStepButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  skipStepText: {
    ...T.caption,
    color: CLight.gray400,
  },

  // ---- Progress bar ----
  progressContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: CLight.gray200,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: CLight.pink,
    borderRadius: 2,
  },
  progressLabel: {
    ...T.microBold,
    color: CLight.gray500,
    minWidth: 32,
    textAlign: "right",
  },

  // ---- Step content ----
  stepContent: {
    paddingTop: 16,
  },
  stepTitle: {
    ...T.h2,
    color: CLight.gray900,
    marginBottom: 6,
  },
  stepSubtitle: {
    ...T.caption,
    color: CLight.gray500,
    marginBottom: 24,
  },

  // ---- User type option cards ----
  optionGrid: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CLight.gray200,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  optionCardActive: {
    borderColor: CLight.pink,
    backgroundColor: CLight.pinkSoft,
    shadowColor: CLight.pink,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  optionEmoji: {
    fontSize: 28,
  },
  optionLabel: {
    ...T.bodyBold,
    color: CLight.gray900,
    flex: 0,
  },
  optionLabelActive: {
    color: CLight.pink,
  },
  optionDesc: {
    ...T.small,
    color: CLight.gray500,
    flex: 1,
  },
  optionDescActive: {
    color: CLight.pinkLight,
  },

  // ---- Art field cards ----
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  fieldCard: {
    width: (SCREEN_WIDTH - 48 - 24) / 3,
    aspectRatio: 1,
    backgroundColor: CLight.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: CLight.gray200,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  fieldCardActive: {
    borderColor: CLight.pink,
    backgroundColor: CLight.pinkSoft,
    shadowColor: CLight.pink,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldEmoji: {
    fontSize: 32,
  },
  fieldLabel: {
    ...T.captionBold,
    color: CLight.gray700,
  },
  fieldLabelActive: {
    color: CLight.pink,
  },

  // ---- Pill tags ----
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CLight.gray200,
    backgroundColor: CLight.white,
  },
  pillActive: {
    borderColor: CLight.pink,
    backgroundColor: CLight.pinkSoft,
  },
  pillText: {
    ...T.small,
    color: CLight.gray700,
  },
  pillTextActive: {
    color: CLight.pink,
    fontWeight: "600",
  },
  emptyHint: {
    ...T.caption,
    color: CLight.gray400,
    textAlign: "center",
    marginTop: 32,
  },
});
