import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  Switch,
  Image,
  Dimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

const SCREEN_WIDTH = Dimensions.get("window").width;
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_EMOJIS } from "../constants/theme";
import {
  FIELDS, GENDER_OPTIONS, SPECIALTY_SUGGESTIONS, CAREER_TYPES,
  calculateAge,
} from "../utils/helpers";
import TopBar from "../components/TopBar";

const GENDER_EMOJIS = { male: "\uD83D\uDC68", female: "\uD83D\uDC69", other: "\uD83E\uDDD1" };

export default function ProfileEditScreen({ navigation }) {
  const { userProfile, handleUpdateProfile } = useApp();

  const [name, setName] = useState(userProfile.name || "");
  const [gender, setGender] = useState(userProfile.gender || "");
  const [birthDate, setBirthDate] = useState(userProfile.birthDate || "");
  const [height, setHeight] = useState(userProfile.height ? String(userProfile.height) : "");
  const [weight, setWeight] = useState(userProfile.weight ? String(userProfile.weight) : "");
  const [specialties, setSpecialties] = useState(userProfile.specialties || []);
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [school, setSchool] = useState(userProfile.school || "");
  const [location, setLocation] = useState(userProfile.location || "");
  const [agency, setAgency] = useState(userProfile.agency || "");
  const [bio, setBio] = useState(userProfile.bio || "");
  const [career, setCareer] = useState(userProfile.career || []);
  const [selectedFields, setSelectedFields] = useState(userProfile.fields || []);
  const [profilePublic, setProfilePublic] = useState(userProfile.profilePublic || false);
  const [photos, setPhotos] = useState(userProfile.photos || []);

  const handleAddPhoto = async () => {
    if (photos.length >= 6) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 필요", "사진 앨범 접근 권한을 허용해주세요.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        setPhotos((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (e) {
      Alert.alert("오류", "사진을 불러올 수 없습니다.");
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Career add fields
  const [careerTitle, setCareerTitle] = useState("");
  const [careerRole, setCareerRole] = useState("");
  const [careerYear, setCareerYear] = useState("");
  const [careerType, setCareerType] = useState("drama");

  const toggleInArray = (arr, item) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert("이름 필요", "이름을 입력해주세요.");
      return;
    }
    const localPhotos = photos.filter((p) => p.startsWith("file://"));
    handleUpdateProfile({
      name: name.trim(),
      gender,
      birthDate: birthDate.trim(),
      height: height ? Number(height) : null,
      weight: weight ? Number(weight) : null,
      specialties,
      school: school.trim(),
      location: location.trim(),
      agency: agency.trim(),
      bio: bio.trim(),
      career,
      fields: selectedFields,
      profilePublic,
      photos,
      photoUrl: photos[0] || null,
      pendingPhotoUris: localPhotos.length > 0 ? localPhotos : undefined,
    });
    navigation.goBack();
  }, [name, gender, birthDate, height, weight, specialties, school, location, agency, bio, career, selectedFields, profilePublic, photos, handleUpdateProfile, navigation]);

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

  const age = calculateAge(birthDate);

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="프로필 편집"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtn}>취소</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveBtn}>저장</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* 프로필 사진 */}
        <Text style={styles.sectionTitle}>프로필 사진</Text>
        <View style={styles.card}>
          <Text style={[T.micro, { color: CLight.gray500, marginBottom: 10 }]}>전신, 상반신 등 전문 프로필 사진을 등록하세요 (최대 6장)</Text>
          <View style={styles.photoGrid}>
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoGridItem}>
                <Image source={{ uri }} style={styles.photoGridImg} />
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(i)}>
                  <Text style={styles.photoRemoveText}>x</Text>
                </TouchableOpacity>
                {i === 0 && <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>대표</Text></View>}
              </View>
            ))}
            {photos.length < 6 && (
              <TouchableOpacity style={styles.photoAddBtn} onPress={handleAddPhoto} activeOpacity={0.7}>
                <Text style={{ fontSize: 28, color: CLight.gray400 }}>+</Text>
                <Text style={[T.micro, { color: CLight.gray400 }]}>추가</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 기본 정보 */}
        <Text style={styles.sectionTitle}>기본 정보</Text>
        <View style={styles.card}>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>이름</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="이름" placeholderTextColor={CLight.gray400} />
          </View>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>소개</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={bio} onChangeText={setBio} placeholder="간단한 자기소개" placeholderTextColor={CLight.gray400} multiline maxLength={200} />
          </View>
        </View>

        {/* 분야 */}
        <Text style={styles.sectionTitle}>예술 분야</Text>
        <View style={styles.card}>
          <View style={styles.pillGrid}>
            {FIELDS.map((f) => {
              const isSelected = selectedFields.includes(f);
              return (
                <TouchableOpacity key={f} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => setSelectedFields(toggleInArray(selectedFields, f))}>
                  <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{FIELD_EMOJIS[f]} {FIELD_LABELS[f]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 신체 정보 */}
        <Text style={styles.sectionTitle}>신체 정보</Text>
        <View style={styles.card}>
          <Text style={styles.label}>성별</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity key={g.key} style={[styles.genderCard, gender === g.key && styles.genderCardActive]} onPress={() => setGender(g.key)}>
                <Text style={styles.genderEmoji}>{GENDER_EMOJIS[g.key]}</Text>
                <Text style={[styles.genderLabel, gender === g.key && styles.genderLabelActive]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>생년월일 {age ? `(${age}세)` : ""}</Text>
            <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" placeholderTextColor={CLight.gray400} keyboardType="numbers-and-punctuation" maxLength={10} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <Text style={styles.label}>키 (cm)</Text>
              <TextInput style={styles.input} value={height} onChangeText={setHeight} placeholder="170" placeholderTextColor={CLight.gray400} keyboardType="number-pad" maxLength={3} />
            </View>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <Text style={styles.label}>몸무게 (kg)</Text>
              <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder="60" placeholderTextColor={CLight.gray400} keyboardType="number-pad" maxLength={3} />
            </View>
          </View>
        </View>

        {/* 활동 정보 */}
        <Text style={styles.sectionTitle}>활동 정보</Text>
        <View style={styles.card}>
          <Text style={styles.label}>특기</Text>
          <View style={styles.pillGrid}>
            {SPECIALTY_SUGGESTIONS.map((s) => {
              const isSelected = specialties.includes(s);
              return (
                <TouchableOpacity key={s} style={[styles.miniPill, isSelected && styles.miniPillActive]} onPress={() => setSpecialties(toggleInArray(specialties, s))}>
                  <Text style={[styles.miniPillText, isSelected && styles.miniPillTextActive]}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.tagInputRow, { marginTop: 8 }]}>
            <TextInput style={styles.tagInput} placeholder="직접 입력" placeholderTextColor={CLight.gray400} value={customSpecialty} onChangeText={setCustomSpecialty} onSubmitEditing={handleAddCustomSpecialty} returnKeyType="done" maxLength={20} />
            <TouchableOpacity style={[styles.tagAddBtn, !customSpecialty.trim() && styles.tagAddBtnDisabled]} onPress={handleAddCustomSpecialty} disabled={!customSpecialty.trim()}>
              <Text style={[styles.tagAddText, !customSpecialty.trim() && styles.tagAddTextDisabled]}>추가</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <Text style={styles.label}>학교</Text>
              <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholder="학교명" placeholderTextColor={CLight.gray400} />
            </View>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <Text style={styles.label}>거주지</Text>
              <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="서울" placeholderTextColor={CLight.gray400} />
            </View>
          </View>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>소속사</Text>
            <TextInput style={styles.input} value={agency} onChangeText={setAgency} placeholder="소속사명" placeholderTextColor={CLight.gray400} />
          </View>
        </View>

        {/* 경력 */}
        <Text style={styles.sectionTitle}>경력</Text>
        <View style={styles.card}>
          {career.map((c, i) => (
            <View key={i} style={styles.careerItem}>
              <View style={{ flex: 1 }}>
                <Text style={[T.captionBold, { color: CLight.gray900 }]}>{c.title}</Text>
                <Text style={[T.micro, { color: CLight.gray500 }]}>
                  {c.role}{c.year ? ` | ${c.year}` : ""} | {CAREER_TYPES.find((ct) => ct.key === c.type)?.label || c.type}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))}>
                <Text style={{ color: CLight.red, fontSize: 18 }}>x</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder="작품명" placeholderTextColor={CLight.gray400} value={careerTitle} onChangeText={setCareerTitle} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="역할" placeholderTextColor={CLight.gray400} value={careerRole} onChangeText={setCareerRole} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TextInput style={[styles.input, { width: 80 }]} placeholder="년도" placeholderTextColor={CLight.gray400} value={careerYear} onChangeText={setCareerYear} keyboardType="number-pad" maxLength={4} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
              {CAREER_TYPES.map((ct) => (
                <TouchableOpacity key={ct.key} style={[styles.miniPill, careerType === ct.key && styles.miniPillActive]} onPress={() => setCareerType(ct.key)}>
                  <Text style={[styles.miniPillText, careerType === ct.key && styles.miniPillTextActive]}>{ct.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <TouchableOpacity style={[styles.addCareerBtn, !careerTitle.trim() && styles.disabledBtn]} onPress={handleAddCareer} disabled={!careerTitle.trim()}>
            <Text style={[T.captionBold, { color: CLight.white }]}>+ 경력 추가</Text>
          </TouchableOpacity>
        </View>

        {/* 공개 설정 */}
        <Text style={styles.sectionTitle}>공개 설정</Text>
        <View style={styles.card}>
          <View style={styles.consentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>프로필 공개</Text>
              <Text style={[T.micro, { color: CLight.gray500, lineHeight: 18 }]}>
                업계 관계자가 B2B 대시보드에서 프로필을 열람할 수 있습니다.
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  cancelBtn: { ...T.body, color: CLight.gray500 },
  saveBtn: { ...T.bodyBold, color: CLight.pink },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoGridItem: { width: (SCREEN_WIDTH - 32 - 32 - 20) / 3, aspectRatio: 3 / 4, borderRadius: 10, overflow: "hidden", position: "relative" },
  photoGridImg: { width: "100%", height: "100%", borderRadius: 10 },
  photoRemoveBtn: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  photoRemoveText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  mainBadge: { position: "absolute", bottom: 4, left: 4, backgroundColor: CLight.pink, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mainBadgeText: { ...T.micro, color: "#fff", fontWeight: "700" },
  photoAddBtn: { width: (SCREEN_WIDTH - 32 - 32 - 20) / 3, aspectRatio: 3 / 4, borderRadius: 10, borderWidth: 2, borderColor: CLight.gray200, borderStyle: "dashed", justifyContent: "center", alignItems: "center", backgroundColor: CLight.gray50 },

  sectionTitle: { ...T.title, color: CLight.gray900, marginTop: 20, marginBottom: 10 },

  card: {
    backgroundColor: CLight.white, borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },

  inputWrapper: { marginBottom: 12 },
  label: { ...T.captionBold, color: CLight.gray700, marginBottom: 6, marginLeft: 4 },
  input: { height: 48, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 12, paddingHorizontal: 14, ...T.body, color: CLight.gray900 },

  genderRow: { flexDirection: "row", gap: 10, marginBottom: 12, marginTop: 4 },
  genderCard: { flex: 1, backgroundColor: CLight.gray50, borderRadius: 14, borderWidth: 1.5, borderColor: CLight.gray200, paddingVertical: 14, alignItems: "center", gap: 4 },
  genderCardActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  genderEmoji: { fontSize: 24 },
  genderLabel: { ...T.micro, color: CLight.gray500 },
  genderLabelActive: { color: CLight.pink, fontWeight: "600" },

  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: CLight.white },
  pillActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  pillText: { ...T.small, color: CLight.gray700 },
  pillTextActive: { color: CLight.pink, fontWeight: "600" },

  miniPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: CLight.white },
  miniPillActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  miniPillText: { ...T.micro, color: CLight.gray500 },
  miniPillTextActive: { color: CLight.pink, fontWeight: "600" },

  tagInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagInput: { flex: 1, height: 40, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 12, paddingHorizontal: 12, ...T.caption, color: CLight.gray900 },
  tagAddBtn: { backgroundColor: CLight.pink, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  tagAddBtnDisabled: { backgroundColor: CLight.gray200 },
  tagAddText: { ...T.captionBold, color: CLight.white },
  tagAddTextDisabled: { color: CLight.gray400 },

  careerItem: { flexDirection: "row", alignItems: "center", backgroundColor: CLight.gray50, borderRadius: 10, padding: 10, marginBottom: 8 },
  addCareerBtn: { backgroundColor: CLight.pink, borderRadius: 12, paddingVertical: 10, alignItems: "center", marginTop: 10 },
  disabledBtn: { backgroundColor: CLight.gray300 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 14 },
});
