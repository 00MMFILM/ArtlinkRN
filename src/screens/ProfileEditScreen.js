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
import { useTranslation } from "react-i18next";

const SCREEN_WIDTH = Dimensions.get("window").width;
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS } from "../constants/theme";
import {
  FIELDS, GENDER_OPTIONS, SPECIALTY_SUGGESTIONS, CAREER_TYPES,
  calculateAge,
} from "../utils/helpers";
import TopBar from "../components/TopBar";

const GENDER_EMOJIS = { male: "\uD83D\uDC68", female: "\uD83D\uDC69", other: "\uD83E\uDDD1" };

export default function ProfileEditScreen({ navigation }) {
  const { t } = useTranslation();
  const { userProfile, handleUpdateProfile, dataConsent, handleSetDataConsent } = useApp();

  const [name, setName] = useState(userProfile.name || "");
  const [gender, setGender] = useState(userProfile.gender || "");
  const [birthDate, setBirthDate] = useState(userProfile.birthDate || "");
  const [height, setHeight] = useState(userProfile.height ? String(userProfile.height) : "");
  const [weight, setWeight] = useState(userProfile.weight ? String(userProfile.weight) : "");
  const [heightPrivate, setHeightPrivate] = useState(userProfile.heightPrivate || false);
  const [weightPrivate, setWeightPrivate] = useState(userProfile.weightPrivate || false);
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
        Alert.alert(t("common.permission_required"), t("common.photo_permission"));
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
      Alert.alert(t("common.error"), t("common.photo_load_error"));
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
      Alert.alert(t("profileEdit.name_required"), t("profileEdit.name_required_msg"));
      return;
    }
    const localPhotos = photos.filter((p) => p.startsWith("file://"));
    handleUpdateProfile({
      name: name.trim(),
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
      bio: bio.trim(),
      career,
      fields: selectedFields,
      profilePublic,
      photos,
      photoUrl: photos[0] || null,
      pendingPhotoUris: localPhotos.length > 0 ? localPhotos : undefined,
    });
    navigation.goBack();
  }, [name, gender, birthDate, height, weight, heightPrivate, weightPrivate, specialties, school, location, agency, bio, career, selectedFields, profilePublic, photos, handleUpdateProfile, navigation]);

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
        title={t("profileEdit.title")}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtn}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveBtn}>{t("common.save")}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* 프로필 사진 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.profile_photos")}</Text>
        <View style={styles.card}>
          <Text style={[T.micro, { color: CLight.gray500, marginBottom: 10 }]}>{t("profileEdit.photo_hint")}</Text>
          <View style={styles.photoGrid}>
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoGridItem}>
                <Image source={{ uri }} style={styles.photoGridImg} />
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => handleRemovePhoto(i)}>
                  <Text style={styles.photoRemoveText}>x</Text>
                </TouchableOpacity>
                {i === 0 && <View style={styles.mainBadge}><Text style={styles.mainBadgeText}>{t("profileEdit.main_photo")}</Text></View>}
              </View>
            ))}
            {photos.length < 6 && (
              <TouchableOpacity style={styles.photoAddBtn} onPress={handleAddPhoto} activeOpacity={0.7}>
                <Text style={{ fontSize: 28, color: CLight.gray400 }}>+</Text>
                <Text style={[T.micro, { color: CLight.gray400 }]}>{t("profileEdit.add_photo")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 기본 정보 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.basic_info")}</Text>
        <View style={styles.card}>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{t("profileEdit.name")}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t("profileEdit.name_placeholder")} placeholderTextColor={CLight.gray400} />
          </View>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{t("profileEdit.bio")}</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={bio} onChangeText={setBio} placeholder={t("profileEdit.bio_placeholder")} placeholderTextColor={CLight.gray400} multiline maxLength={200} />
          </View>
        </View>

        {/* 분야 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.art_fields")}</Text>
        <View style={styles.card}>
          <View style={styles.pillGrid}>
            {FIELDS.map((f) => {
              const isSelected = selectedFields.includes(f);
              return (
                <TouchableOpacity key={f} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => setSelectedFields(toggleInArray(selectedFields, f))}>
                  <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{FIELD_EMOJIS[f]} {t("fields." + f)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 신체 정보 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.body_info")}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t("profileEdit.gender")}</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity key={g.key} style={[styles.genderCard, gender === g.key && styles.genderCardActive]} onPress={() => setGender(g.key)}>
                <Text style={styles.genderEmoji}>{GENDER_EMOJIS[g.key]}</Text>
                <Text style={[styles.genderLabel, gender === g.key && styles.genderLabelActive]}>{t(g.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{t("profileEdit.birth_date")}{age ? ` (${age}${t("common.years_old")})` : ""}</Text>
            <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" placeholderTextColor={CLight.gray400} keyboardType="numbers-and-punctuation" maxLength={10} />
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.label}>{t("profileEdit.height")}</Text>
                <TouchableOpacity onPress={() => setHeightPrivate(!heightPrivate)} style={[styles.privacyToggle, heightPrivate && styles.privacyToggleActive]}>
                  <Text style={[styles.privacyToggleText, heightPrivate && styles.privacyToggleTextActive]}>{heightPrivate ? t("common.private") : t("common.public")}</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} value={height} onChangeText={setHeight} placeholder="170" placeholderTextColor={CLight.gray400} keyboardType="number-pad" maxLength={3} />
            </View>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.label}>{t("profileEdit.weight")}</Text>
                <TouchableOpacity onPress={() => setWeightPrivate(!weightPrivate)} style={[styles.privacyToggle, weightPrivate && styles.privacyToggleActive]}>
                  <Text style={[styles.privacyToggleText, weightPrivate && styles.privacyToggleTextActive]}>{weightPrivate ? t("common.private") : t("common.public")}</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholder="60" placeholderTextColor={CLight.gray400} keyboardType="number-pad" maxLength={3} />
            </View>
          </View>
          <Text style={[T.micro, { color: CLight.gray400, marginTop: 4, lineHeight: 18 }]}>
            {t("profileEdit.private_notice")}
          </Text>
        </View>

        {/* 활동 정보 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.activity_info")}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t("profileEdit.specialty")}</Text>
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
            <TextInput style={styles.tagInput} placeholder={t("profileEdit.custom_input")} placeholderTextColor={CLight.gray400} value={customSpecialty} onChangeText={setCustomSpecialty} onSubmitEditing={handleAddCustomSpecialty} returnKeyType="done" maxLength={20} />
            <TouchableOpacity style={[styles.tagAddBtn, !customSpecialty.trim() && styles.tagAddBtnDisabled]} onPress={handleAddCustomSpecialty} disabled={!customSpecialty.trim()}>
              <Text style={[styles.tagAddText, !customSpecialty.trim() && styles.tagAddTextDisabled]}>{t("common.add")}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <Text style={styles.label}>{t("profileEdit.school")}</Text>
              <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholder={t("profileEdit.school_placeholder")} placeholderTextColor={CLight.gray400} />
            </View>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <Text style={styles.label}>{t("profileEdit.location")}</Text>
              <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder={t("profileEdit.location_placeholder")} placeholderTextColor={CLight.gray400} />
            </View>
          </View>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>{t("profileEdit.agency")}</Text>
            <TextInput style={styles.input} value={agency} onChangeText={setAgency} placeholder={t("profileEdit.agency_placeholder")} placeholderTextColor={CLight.gray400} />
          </View>
        </View>

        {/* 경력 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.career")}</Text>
        <View style={styles.card}>
          {career.map((c, i) => (
            <View key={i} style={styles.careerItem}>
              <View style={{ flex: 1 }}>
                <Text style={[T.captionBold, { color: CLight.gray900 }]}>{c.title}</Text>
                <Text style={[T.micro, { color: CLight.gray500 }]}>
                  {c.role}{c.year ? ` | ${c.year}` : ""} | {t("careerTypes." + c.type)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))}>
                <Text style={{ color: CLight.red, fontSize: 18 }}>x</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[styles.input, { flex: 2 }]} placeholder={t("profileEdit.work_title")} placeholderTextColor={CLight.gray400} value={careerTitle} onChangeText={setCareerTitle} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder={t("profileEdit.role")} placeholderTextColor={CLight.gray400} value={careerRole} onChangeText={setCareerRole} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TextInput style={[styles.input, { width: 80 }]} placeholder={t("profileEdit.year")} placeholderTextColor={CLight.gray400} value={careerYear} onChangeText={setCareerYear} keyboardType="number-pad" maxLength={4} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
              {CAREER_TYPES.map((ct) => (
                <TouchableOpacity key={ct.key} style={[styles.miniPill, careerType === ct.key && styles.miniPillActive]} onPress={() => setCareerType(ct.key)}>
                  <Text style={[styles.miniPillText, careerType === ct.key && styles.miniPillTextActive]}>{t(ct.labelKey)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <TouchableOpacity style={[styles.addCareerBtn, !careerTitle.trim() && styles.disabledBtn]} onPress={handleAddCareer} disabled={!careerTitle.trim()}>
            <Text style={[T.captionBold, { color: CLight.white }]}>{t("profileEdit.add_career")}</Text>
          </TouchableOpacity>
        </View>

        {/* 공개 설정 */}
        <Text style={styles.sectionTitle}>{t("profileEdit.public_settings")}</Text>
        <View style={styles.card}>
          <View style={styles.consentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("profileEdit.profile_public")}</Text>
              <Text style={[T.micro, { color: CLight.gray500, lineHeight: 18 }]}>
                {t("profileEdit.profile_public_desc")}
              </Text>
            </View>
            <Switch
              value={profilePublic}
              onValueChange={setProfilePublic}
              trackColor={{ false: CLight.gray200, true: CLight.pink }}
              thumbColor={CLight.white}
            />
          </View>
          <View style={[styles.consentRow, { marginTop: 16 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("profileEdit.ai_training")}</Text>
              <Text style={[T.micro, { color: CLight.gray500, lineHeight: 18 }]}>
                {t("profileEdit.ai_training_desc")}
              </Text>
            </View>
            <Switch
              value={dataConsent}
              onValueChange={handleSetDataConsent}
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

  privacyToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: CLight.gray100, borderWidth: 1, borderColor: CLight.gray200 },
  privacyToggleActive: { backgroundColor: CLight.pinkSoft, borderColor: CLight.pink },
  privacyToggleText: { ...T.micro, color: CLight.gray500 },
  privacyToggleTextActive: { color: CLight.pink, fontWeight: "600" },
});
