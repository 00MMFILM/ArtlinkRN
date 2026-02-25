import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { FIELDS, GENDER_OPTIONS, SPECIALTY_SUGGESTIONS } from "../utils/helpers";
import TopBar from "../components/TopBar";

const TABS = ["프로젝트", "오디션", "콜라보"];

export default function MatchingPostCreateScreen({ navigation, route }) {
  const { handleAddMatchingPost, handleUpdateMatchingPost } = useApp();
  const editPost = route.params?.post;

  const [tab, setTab] = useState(editPost?.tab || "프로젝트");
  const [title, setTitle] = useState(editPost?.title || "");
  const [field, setField] = useState(editPost?.field || FIELDS[0]);
  const [description, setDescription] = useState(editPost?.description || "");
  const [deadline, setDeadline] = useState(editPost?.deadline || "");
  const [tags, setTags] = useState(editPost?.tags || []);
  const [tagInput, setTagInput] = useState("");

  // Casting requirements
  const [showRequirements, setShowRequirements] = useState(!!editPost?.requirements);
  const [reqGender, setReqGender] = useState(editPost?.requirements?.gender || "");
  const [reqAgeMin, setReqAgeMin] = useState(editPost?.requirements?.ageRange?.[0]?.toString() || "");
  const [reqAgeMax, setReqAgeMax] = useState(editPost?.requirements?.ageRange?.[1]?.toString() || "");
  const [reqHeightMin, setReqHeightMin] = useState(editPost?.requirements?.heightRange?.[0]?.toString() || "");
  const [reqHeightMax, setReqHeightMax] = useState(editPost?.requirements?.heightRange?.[1]?.toString() || "");
  const [reqSpecialties, setReqSpecialties] = useState(editPost?.requirements?.specialties || []);
  const [reqLocation, setReqLocation] = useState(editPost?.requirements?.location || "");

  // Warn on unsaved changes
  const [hasChanges, setHasChanges] = useState(false);
  useEffect(() => {
    if (title || description || tags.length > 0 || deadline) setHasChanges(true);
  }, [title, description, tags, deadline]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (!hasChanges) return;
      e.preventDefault();
      Alert.alert("저장하지 않고 나가기", "작성 중인 내용이 사라집니다.", [
        { text: "계속 작성", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation, hasChanges]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (!trimmed || tags.includes(trimmed)) { setTagInput(""); return; }
    setTags((prev) => [...prev, trimmed]);
    setTagInput("");
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((t) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

  const handleSave = useCallback(() => {
    if (!title.trim()) { Alert.alert("제목 필요", "제목을 입력해주세요."); return; }
    if (!description.trim()) { Alert.alert("내용 필요", "설명을 입력해주세요."); return; }

    const requirements = {};
    if (showRequirements) {
      if (reqGender) requirements.gender = reqGender;
      if (reqAgeMin && reqAgeMax) requirements.ageRange = [Number(reqAgeMin), Number(reqAgeMax)];
      if (reqHeightMin && reqHeightMax) requirements.heightRange = [Number(reqHeightMin), Number(reqHeightMax)];
      if (reqSpecialties.length > 0) requirements.specialties = reqSpecialties;
      if (reqLocation.trim()) requirements.location = reqLocation.trim();
    }

    const postData = {
      tab,
      title: title.trim(),
      field,
      description: description.trim(),
      deadline: deadline.trim() || undefined,
      tags,
      ...(Object.keys(requirements).length > 0 ? { requirements } : {}),
    };

    if (editPost) {
      handleUpdateMatchingPost({ ...editPost, ...postData });
    } else {
      handleAddMatchingPost(postData);
    }
    setHasChanges(false);
    navigation.goBack();
  }, [tab, title, field, description, deadline, tags, editPost, handleAddMatchingPost, handleUpdateMatchingPost, navigation]);

  const handleCancel = useCallback(() => {
    if (hasChanges) {
      Alert.alert("저장하지 않고 나가기", "작성 중인 내용이 사라집니다.", [
        { text: "계속 작성", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  }, [hasChanges, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TopBar
        title={editPost ? "글 수정" : "매칭 글 등록"}
        left={
          <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.cancelBtn}>취소</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity onPress={handleSave} activeOpacity={0.7}>
            <Text style={styles.saveBtn}>저장</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Tab Selector */}
        <Text style={styles.sectionLabel}>카테고리</Text>
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <TextInput
          style={styles.titleInput}
          placeholder="제목을 입력하세요"
          placeholderTextColor={CLight.gray400}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          returnKeyType="next"
        />

        {/* Description */}
        <TextInput
          style={styles.descInput}
          placeholder="공고 내용을 작성해주세요..."
          placeholderTextColor={CLight.gray400}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
        />

        <View style={styles.divider} />

        {/* Field Selector */}
        <Text style={styles.sectionLabel}>분야</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fieldScroll}
        >
          {FIELDS.map((f) => {
            const isActive = field === f;
            const color = FIELD_COLORS[f] || CLight.gray500;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.fieldPill,
                  {
                    backgroundColor: isActive ? `${color}18` : CLight.white,
                    borderColor: isActive ? color : CLight.gray200,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
                onPress={() => setField(f)}
                activeOpacity={0.7}
              >
                <Text style={styles.fieldEmoji}>{FIELD_EMOJIS[f]}</Text>
                <Text style={[styles.fieldLabel, { color: isActive ? color : CLight.gray500, fontWeight: isActive ? "600" : "400" }]}>
                  {FIELD_LABELS[f]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Deadline */}
        <Text style={styles.sectionLabel}>마감일 (선택)</Text>
        <TextInput
          style={styles.deadlineInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={CLight.gray400}
          value={deadline}
          onChangeText={setDeadline}
          maxLength={10}
          returnKeyType="done"
          keyboardType="numbers-and-punctuation"
        />

        {/* Tags */}
        <Text style={styles.sectionLabel}>태그</Text>
        <View style={styles.tagInputRow}>
          <TextInput
            style={styles.tagTextInput}
            placeholder="태그 입력"
            placeholderTextColor={CLight.gray400}
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={handleAddTag}
            returnKeyType="done"
            maxLength={20}
          />
          <TouchableOpacity
            style={[styles.tagAddBtn, !tagInput.trim() && styles.tagAddBtnDisabled]}
            onPress={handleAddTag}
            disabled={!tagInput.trim()}
          >
            <Text style={[styles.tagAddText, !tagInput.trim() && styles.tagAddTextDisabled]}>추가</Text>
          </TouchableOpacity>
        </View>
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((t, idx) => (
              <TouchableOpacity key={idx} style={styles.tagChip} onPress={() => handleRemoveTag(t)}>
                <Text style={styles.tagChipText}>#{t}</Text>
                <Text style={styles.tagChipRemove}>×</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Casting Requirements (collapsible) */}
        <View style={styles.divider} />
        <TouchableOpacity style={styles.requirementToggle} onPress={() => setShowRequirements(!showRequirements)} activeOpacity={0.7}>
          <Text style={styles.sectionLabel}>캐스팅 조건 (선택)</Text>
          <Text style={[T.caption, { color: CLight.gray400 }]}>{showRequirements ? "접기 ▲" : "펼치기 ▼"}</Text>
        </TouchableOpacity>

        {showRequirements && (
          <View style={styles.requirementSection}>
            <Text style={styles.reqLabel}>성별</Text>
            <View style={styles.reqRow}>
              <TouchableOpacity style={[styles.reqPill, !reqGender && styles.reqPillActive]} onPress={() => setReqGender("")}>
                <Text style={[styles.reqPillText, !reqGender && styles.reqPillTextActive]}>무관</Text>
              </TouchableOpacity>
              {GENDER_OPTIONS.map((g) => (
                <TouchableOpacity key={g.key} style={[styles.reqPill, reqGender === g.key && styles.reqPillActive]} onPress={() => setReqGender(g.key)}>
                  <Text style={[styles.reqPillText, reqGender === g.key && styles.reqPillTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.reqLabel}>나이 범위</Text>
            <View style={styles.reqRow}>
              <TextInput style={styles.reqSmallInput} placeholder="최소" placeholderTextColor={CLight.gray400} value={reqAgeMin} onChangeText={setReqAgeMin} keyboardType="number-pad" maxLength={2} />
              <Text style={[T.caption, { color: CLight.gray500 }]}>~</Text>
              <TextInput style={styles.reqSmallInput} placeholder="최대" placeholderTextColor={CLight.gray400} value={reqAgeMax} onChangeText={setReqAgeMax} keyboardType="number-pad" maxLength={2} />
              <Text style={[T.micro, { color: CLight.gray400 }]}>세</Text>
            </View>

            <Text style={styles.reqLabel}>키 범위</Text>
            <View style={styles.reqRow}>
              <TextInput style={styles.reqSmallInput} placeholder="최소" placeholderTextColor={CLight.gray400} value={reqHeightMin} onChangeText={setReqHeightMin} keyboardType="number-pad" maxLength={3} />
              <Text style={[T.caption, { color: CLight.gray500 }]}>~</Text>
              <TextInput style={styles.reqSmallInput} placeholder="최대" placeholderTextColor={CLight.gray400} value={reqHeightMax} onChangeText={setReqHeightMax} keyboardType="number-pad" maxLength={3} />
              <Text style={[T.micro, { color: CLight.gray400 }]}>cm</Text>
            </View>

            <Text style={styles.reqLabel}>필요 특기</Text>
            <View style={styles.reqPillGrid}>
              {SPECIALTY_SUGGESTIONS.slice(0, 12).map((s) => {
                const isSelected = reqSpecialties.includes(s);
                return (
                  <TouchableOpacity key={s} style={[styles.reqPill, isSelected && styles.reqPillActive]} onPress={() => setReqSpecialties(isSelected ? reqSpecialties.filter((x) => x !== s) : [...reqSpecialties, s])}>
                    <Text style={[styles.reqPillText, isSelected && styles.reqPillTextActive]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.reqLabel}>지역</Text>
            <TextInput style={styles.deadlineInput} placeholder="서울" placeholderTextColor={CLight.gray400} value={reqLocation} onChangeText={setReqLocation} />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CLight.bg },
  cancelBtn: { ...T.body, color: CLight.gray500 },
  saveBtn: { ...T.bodyBold, color: CLight.pink },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

  sectionLabel: { ...T.captionBold, color: CLight.gray700, marginBottom: 10, marginTop: 4 },

  // Tab selector
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: CLight.white,
    alignItems: "center", borderWidth: 1, borderColor: CLight.gray200,
  },
  tabBtnActive: { backgroundColor: CLight.pink, borderColor: CLight.pink },
  tabText: { ...T.captionBold, color: CLight.gray500 },
  tabTextActive: { color: CLight.white },

  // Title
  titleInput: {
    ...T.h2, color: CLight.gray900, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: CLight.gray200,
  },

  // Description
  descInput: {
    ...T.body, color: CLight.gray900, minHeight: 120, paddingVertical: 14, lineHeight: 26,
  },

  divider: { height: 1, backgroundColor: CLight.gray200, marginVertical: 16 },

  // Field selector
  fieldScroll: { gap: 8, paddingBottom: 16 },
  fieldPill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 5,
  },
  fieldEmoji: { fontSize: 15 },
  fieldLabel: { fontSize: 13 },

  // Deadline
  deadlineInput: {
    ...T.body, color: CLight.gray900, backgroundColor: CLight.inputBg,
    borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },

  // Tags
  tagInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  tagTextInput: {
    flex: 1, ...T.body, color: CLight.gray900, backgroundColor: CLight.inputBg,
    borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  tagAddBtn: { backgroundColor: CLight.pink, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  tagAddBtnDisabled: { backgroundColor: CLight.gray200 },
  tagAddText: { ...T.captionBold, color: CLight.white },
  tagAddTextDisabled: { color: CLight.gray400 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  tagChip: {
    flexDirection: "row", alignItems: "center", backgroundColor: CLight.pinkSoft,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, gap: 4,
  },
  tagChipText: { ...T.small, color: CLight.pink, fontWeight: "500" },
  tagChipRemove: { fontSize: 16, color: CLight.pinkLight, fontWeight: "600", marginLeft: 2 },

  // Requirements
  requirementToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  requirementSection: { marginBottom: 16 },
  reqLabel: { ...T.captionBold, color: CLight.gray700, marginBottom: 8, marginTop: 12 },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqPillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reqPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: CLight.white },
  reqPillActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  reqPillText: { ...T.small, color: CLight.gray500 },
  reqPillTextActive: { color: CLight.pink, fontWeight: "600" },
  reqSmallInput: { width: 70, height: 40, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 10, paddingHorizontal: 10, textAlign: "center", ...T.caption, color: CLight.gray900 },
});
