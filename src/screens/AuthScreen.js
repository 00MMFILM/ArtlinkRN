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
import {
  ROLE_MODELS_BY_FIELD, INTERESTS_BY_FIELD, USER_TYPES,
  GENDER_OPTIONS, SPECIALTY_SUGGESTIONS, CAREER_TYPES,
} from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const userTypes = [
  { id: "professional", emoji: "\uD83C\uDF96\uFE0F", label: "전문 예술가", desc: "현업에서 활동 중인 아티스트" },
  { id: "aspiring", emoji: "\uD83C\uDF31", label: "예술 지망생", desc: "전공 학생이거나 데뷔를 준비 중" },
  { id: "hobby", emoji: "\uD83C\uDFA8", label: "취미 예술가", desc: "즐기면서 예술 활동을 하고 있어요" },
  { id: "industry", emoji: "\uD83C\uDFE2", label: "업계 관계자", desc: "프로덕션, 기획사, 교육기관 등" },
];

const artFields = [
  { id: "acting", emoji: "\uD83C\uDFAD", label: "연기" },
  { id: "music", emoji: "\uD83C\uDFB5", label: "음악" },
  { id: "art", emoji: "\uD83C\uDFA8", label: "미술" },
  { id: "dance", emoji: "\uD83D\uDC83", label: "무용" },
  { id: "literature", emoji: "\u270D\uFE0F", label: "문학" },
  { id: "film", emoji: "\uD83C\uDFAC", label: "영화" },
];

const GENDER_EMOJIS = { male: "\uD83D\uDC68", female: "\uD83D\uDC69", other: "\uD83E\uDDD1" };

const TOTAL_STEPS = 7;

export default function AuthScreen({ navigation }) {
  const { handleAuth } = useApp();

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
  // Step 3: Body info
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
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

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateTransition = (callback) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      callback();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const toggleInArray = (arr, item) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

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

  const handleComplete = () => {
    const profileData = {
      name: name.trim(),
      email: email.trim(),
      userType: selectedUserType,
      fields: selectedFields,
      gender,
      birthDate: birthDate.trim(),
      height: height ? Number(height) : null,
      weight: weight ? Number(weight) : null,
      specialties,
      school: school.trim(),
      location: location.trim(),
      agency: agency.trim(),
      career,
      bio: "",
      roleModels: selectedRoleModels,
      interests: selectedInterests,
    };
    handleAuth(profileData);
  };

  const handleLogin = () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      Alert.alert("오류", "이메일과 비밀번호를 입력해주세요.");
      return;
    }
    handleAuth({ name: loginEmail.split("@")[0], email: loginEmail.trim() });
  };

  const handleSkip = () => { handleAuth(null); };

  const handleForgotPassword = () => {
    if (!forgotEmail.trim().includes("@")) {
      Alert.alert("오류", "유효한 이메일을 입력해주세요.");
      return;
    }
    Alert.alert("안내", "비밀번호 재설정 링크가 전송되었습니다.", [
      { text: "확인", onPress: () => setMode("login") },
    ]);
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
        <Text style={styles.brandInfinity}>{"\u221E"}</Text>
        <Text style={styles.brandName}>ArtLink</Text>
        <Text style={styles.brandTagline}>{"당신의 예술 여정을 기록하세요"}</Text>
      </View>
      <View style={styles.inputGroup}>
        <TextInput style={styles.input} placeholder="이메일" placeholderTextColor={CLight.gray400} value={loginEmail} onChangeText={setLoginEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextInput style={styles.input} placeholder="비밀번호" placeholderTextColor={CLight.gray400} value={loginPassword} onChangeText={setLoginPassword} secureTextEntry />
      </View>
      <TouchableOpacity style={styles.forgotButton} onPress={() => animateTransition(() => setMode("forgot"))}>
        <Text style={styles.forgotText}>비밀번호를 잊으셨나요?</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.primaryButton, (!loginEmail.trim() || !loginPassword.trim()) && styles.disabledButton]} onPress={handleLogin} disabled={!loginEmail.trim() || !loginPassword.trim()}>
        <Text style={styles.primaryButtonText}>로그인</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => animateTransition(() => setMode("signup"))}>
        <Text style={styles.secondaryButtonText}>회원가입</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>둘러보기</Text>
      </TouchableOpacity>
    </View>
  );

  const renderForgot = () => (
    <View style={styles.loginContainer}>
      <View style={styles.brandContainer}>
        <Text style={styles.brandInfinity}>{"\u221E"}</Text>
        <Text style={[T.h2, { color: CLight.gray900, marginTop: 8 }]}>비밀번호 찾기</Text>
        <Text style={[T.caption, { color: CLight.gray500, marginTop: 4, textAlign: "center" }]}>{"가입한 이메일을 입력하면\n비밀번호 재설정 링크를 보내드립니다."}</Text>
      </View>
      <View style={styles.inputGroup}>
        <TextInput style={styles.input} placeholder="이메일" placeholderTextColor={CLight.gray400} value={forgotEmail} onChangeText={setForgotEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </View>
      <TouchableOpacity style={[styles.primaryButton, !forgotEmail.trim().includes("@") && styles.disabledButton]} onPress={handleForgotPassword} disabled={!forgotEmail.trim().includes("@")}>
        <Text style={styles.primaryButtonText}>재설정 링크 받기</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => animateTransition(() => setMode("login"))}>
        <Text style={styles.secondaryButtonText}>로그인으로 돌아가기</Text>
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
      <Text style={styles.stepTitle}>기본 정보</Text>
      <Text style={styles.stepSubtitle}>계정을 만들어 볼까요?</Text>
      <View style={styles.inputGroup}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>이름</Text>
          <TextInput style={styles.input} placeholder="이름을 입력해주세요" placeholderTextColor={CLight.gray400} value={name} onChangeText={setName} autoCorrect={false} />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>이메일</Text>
          <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor={CLight.gray400} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>비밀번호</Text>
          <TextInput style={styles.input} placeholder="6자 이상" placeholderTextColor={CLight.gray400} value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>비밀번호 확인</Text>
          <TextInput style={[styles.input, confirmPassword.length > 0 && confirmPassword !== password && styles.inputError]} placeholder="비밀번호를 다시 입력해주세요" placeholderTextColor={CLight.gray400} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <Text style={styles.errorText}>비밀번호가 일치하지 않습니다</Text>
          )}
        </View>
      </View>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>어떤 예술가신가요?</Text>
      <Text style={styles.stepSubtitle}>당신에게 맞는 경험을 드릴게요</Text>
      <View style={styles.optionGrid}>
        {userTypes.map((type) => (
          <TouchableOpacity key={type.id} style={[styles.optionCard, selectedUserType === type.id && styles.optionCardActive]} onPress={() => setSelectedUserType(type.id)} activeOpacity={0.7}>
            <Text style={styles.optionEmoji}>{type.emoji}</Text>
            <Text style={[styles.optionLabel, selectedUserType === type.id && styles.optionLabelActive]}>{type.label}</Text>
            <Text style={[styles.optionDesc, selectedUserType === type.id && styles.optionDescActive]}>{type.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>예술 분야</Text>
      <Text style={styles.stepSubtitle}>관심 있는 분야를 모두 선택해주세요</Text>
      <View style={styles.fieldGrid}>
        {artFields.map((field) => {
          const isSelected = selectedFields.includes(field.id);
          return (
            <TouchableOpacity key={field.id} style={[styles.fieldCard, isSelected && styles.fieldCardActive]} onPress={() => setSelectedFields(toggleInArray(selectedFields, field.id))} activeOpacity={0.7}>
              <Text style={styles.fieldEmoji}>{field.emoji}</Text>
              <Text style={[styles.fieldLabel, isSelected && styles.fieldLabelActive]}>{field.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // Step 3: Body info (NEW)
  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>신체 정보</Text>
      <Text style={styles.stepSubtitle}>캐스팅 매칭에 활용됩니다 (건너뛰기 가능)</Text>

      <Text style={styles.inputLabel}>성별</Text>
      <View style={styles.genderRow}>
        {GENDER_OPTIONS.map((g) => (
          <TouchableOpacity
            key={g.key}
            style={[styles.genderCard, gender === g.key && styles.genderCardActive]}
            onPress={() => setGender(g.key)}
          >
            <Text style={styles.genderEmoji}>{GENDER_EMOJIS[g.key]}</Text>
            <Text style={[styles.genderLabel, gender === g.key && styles.genderLabelActive]}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>생년월일</Text>
          <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={CLight.gray400} value={birthDate} onChangeText={setBirthDate} keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <Text style={styles.inputLabel}>키 (cm)</Text>
            <TextInput style={styles.input} placeholder="170" placeholderTextColor={CLight.gray400} value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} />
          </View>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <Text style={styles.inputLabel}>몸무게 (kg)</Text>
            <TextInput style={styles.input} placeholder="60" placeholderTextColor={CLight.gray400} value={weight} onChangeText={setWeight} keyboardType="number-pad" maxLength={3} />
          </View>
        </View>
      </View>
    </View>
  );

  // Step 4: Specialties, school, career (NEW)
  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>활동 정보</Text>
      <Text style={styles.stepSubtitle}>특기, 학교, 경력을 입력해주세요 (건너뛰기 가능)</Text>

      <Text style={styles.inputLabel}>특기</Text>
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
        <TextInput style={styles.tagInput} placeholder="직접 입력" placeholderTextColor={CLight.gray400} value={customSpecialty} onChangeText={setCustomSpecialty} onSubmitEditing={handleAddCustomSpecialty} returnKeyType="done" maxLength={20} />
        <TouchableOpacity style={[styles.tagAddBtn, !customSpecialty.trim() && styles.tagAddBtnDisabled]} onPress={handleAddCustomSpecialty} disabled={!customSpecialty.trim()}>
          <Text style={[styles.tagAddText, !customSpecialty.trim() && styles.tagAddTextDisabled]}>추가</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.inputGroup, { marginTop: 16 }]}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <Text style={styles.inputLabel}>학교</Text>
            <TextInput style={styles.input} placeholder="학교명" placeholderTextColor={CLight.gray400} value={school} onChangeText={setSchool} />
          </View>
          <View style={[styles.inputWrapper, { flex: 1 }]}>
            <Text style={styles.inputLabel}>거주지</Text>
            <TextInput style={styles.input} placeholder="서울" placeholderTextColor={CLight.gray400} value={location} onChangeText={setLocation} />
          </View>
        </View>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>소속사</Text>
          <TextInput style={styles.input} placeholder="소속사명 (없으면 생략)" placeholderTextColor={CLight.gray400} value={agency} onChangeText={setAgency} />
        </View>
      </View>

      {/* Career section */}
      <Text style={[styles.inputLabel, { marginTop: 16 }]}>경력</Text>
      {career.map((c, i) => (
        <View key={i} style={styles.careerItem}>
          <View style={{ flex: 1 }}>
            <Text style={[T.captionBold, { color: CLight.gray900 }]}>{c.title}</Text>
            <Text style={[T.micro, { color: CLight.gray500 }]}>{c.role} | {c.year} | {CAREER_TYPES.find((ct) => ct.key === c.type)?.label || c.type}</Text>
          </View>
          <TouchableOpacity onPress={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))}>
            <Text style={{ color: CLight.red, fontSize: 18 }}>x</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.careerAddSection}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[styles.input, { flex: 2 }]} placeholder="작품명" placeholderTextColor={CLight.gray400} value={careerTitle} onChangeText={setCareerTitle} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="역할" placeholderTextColor={CLight.gray400} value={careerRole} onChangeText={setCareerRole} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="년도" placeholderTextColor={CLight.gray400} value={careerYear} onChangeText={setCareerYear} keyboardType="number-pad" maxLength={4} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }} style={{ flex: 2 }}>
            {CAREER_TYPES.slice(0, 5).map((ct) => (
              <TouchableOpacity key={ct.key} style={[styles.miniPill, careerType === ct.key && styles.miniPillActive]} onPress={() => setCareerType(ct.key)}>
                <Text style={[styles.miniPillText, careerType === ct.key && styles.miniPillTextActive]}>{ct.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <TouchableOpacity style={[styles.addCareerBtn, !careerTitle.trim() && styles.disabledButton]} onPress={handleAddCareer} disabled={!careerTitle.trim()}>
          <Text style={[T.captionBold, { color: CLight.white }]}>+ 경력 추가</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Step 5: Role Models (was step 3)
  const renderStep5 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>롤 모델</Text>
      <Text style={styles.stepSubtitle}>존경하는 아티스트를 선택해주세요 (선택사항)</Text>
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
        <Text style={styles.emptyHint}>이전 단계에서 분야를 선택해주세요</Text>
      )}
    </View>
  );

  // Step 6: Interests (was step 4)
  const renderStep6 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>관심 분야</Text>
      <Text style={styles.stepSubtitle}>특별히 관심 있는 영역을 선택해주세요 (선택사항)</Text>
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
        <Text style={styles.emptyHint}>이전 단계에서 분야를 선택해주세요</Text>
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
        <Text style={[T.title, { color: CLight.gray900, flex: 1, textAlign: "center" }]}>회원가입</Text>
        <View style={{ width: 44 }} />
      </View>
      {renderProgressBar()}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView style={styles.signupScroll} contentContainerStyle={styles.signupScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {renderSignupStep()}
        </ScrollView>
      </Animated.View>
      <View style={styles.signupActions}>
        <TouchableOpacity style={[styles.primaryButton, !canProceed() && styles.disabledButton]} onPress={handleNext} disabled={!canProceed()}>
          <Text style={styles.primaryButtonText}>{signupStep === TOTAL_STEPS - 1 ? "시작하기" : "다음"}</Text>
        </TouchableOpacity>
        {signupStep >= 3 && (
          <TouchableOpacity style={styles.skipStepButton} onPress={handleNext}>
            <Text style={styles.skipStepText}>건너뛰기</Text>
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
  brandInfinity: { fontSize: 56, fontWeight: "800", color: CLight.pink, marginBottom: 4 },
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
});
