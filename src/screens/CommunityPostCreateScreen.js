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
  ActivityIndicator,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";
import { createPost } from "../services/communityService";

const TYPES = ["공지", "팁 공유", "작품 공유", "질문", "콜라보"];

const BLOCKED_PATTERNS = [
  /porn/i, /sex(?:ual)?/i, /nude/i, /naked/i,
  /약물/, /마약/, /대마/, /필로폰/,
  /성매매/, /원조교제/, /조건만남/,
  /도박/, /불법/, /사기/,
];

function containsObjectionableContent(text) {
  if (!text) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

export default function CommunityPostCreateScreen({ navigation }) {
  const { deviceUserId, userProfile, showToast } = useApp();
  const [type, setType] = useState("팁 공유");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const hasChangesRef = React.useRef(false);

  useEffect(() => {
    if (title || content) hasChangesRef.current = true;
  }, [title, content]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (!hasChangesRef.current) return;
      e.preventDefault();
      Alert.alert("저장하지 않고 나가기", "작성 중인 내용이 사라집니다.", [
        { text: "계속 작성", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert("제목 필요", "제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      Alert.alert("내용 필요", "내용을 입력해주세요.");
      return;
    }
    if (containsObjectionableContent(title) || containsObjectionableContent(content)) {
      Alert.alert("게시 불가", "부적절한 내용이 포함되어 있습니다. 이용약관에 따라 부적절한 콘텐츠는 게시할 수 없습니다.");
      return;
    }
    if (!deviceUserId) {
      Alert.alert("오류", "커뮤니티 연결에 실패했습니다. 앱을 재시작해주세요.");
      return;
    }

    setSaving(true);
    try {
      await createPost({
        userId: deviceUserId,
        authorName: userProfile.name || "익명",
        authorField: userProfile.fields?.[0] || null,
        type,
        title: title.trim(),
        content: content.trim(),
      });
      hasChangesRef.current = false;
      showToast("게시물이 등록되었습니다!", "success");
      navigation.goBack();
    } catch (_) {
      Alert.alert("오류", "게시물 작성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }, [title, content, type, deviceUserId, userProfile, navigation, showToast]);

  const handleCancel = useCallback(() => {
    if (hasChangesRef.current) {
      Alert.alert("저장하지 않고 나가기", "작성 중인 내용이 사라집니다.", [
        { text: "계속 작성", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TopBar
        title="글 작성"
        left={
          <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.cancelBtn}>취소</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.7}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={CLight.pink} />
            ) : (
              <Text style={styles.saveBtn}>게시</Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type Selector */}
        <Text style={styles.sectionLabel}>카테고리</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, type === t && styles.typeBtnActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeText, type === t && styles.typeTextActive]}>{t}</Text>
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

        {/* Content */}
        <TextInput
          style={styles.contentInput}
          placeholder="내용을 작성해주세요..."
          placeholderTextColor={CLight.gray400}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
        />

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

  // Type selector
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: CLight.white,
    alignItems: "center", borderWidth: 1, borderColor: CLight.gray200,
  },
  typeBtnActive: { backgroundColor: CLight.pink, borderColor: CLight.pink },
  typeText: { ...T.captionBold, color: CLight.gray500 },
  typeTextActive: { color: CLight.white },

  // Title
  titleInput: {
    ...T.h2, color: CLight.gray900, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: CLight.gray200,
  },

  // Content
  contentInput: {
    ...T.body, color: CLight.gray900, minHeight: 200, paddingVertical: 14, lineHeight: 26,
  },
});
