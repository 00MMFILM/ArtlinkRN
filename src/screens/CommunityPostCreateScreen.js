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
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";
import { createPost, moderateContent } from "../services/communityService";
import { checkProfanity } from "../utils/profanityFilter";

const TYPE_KEYS = [
  { key: "tab_notice", value: "공지" },
  { key: "tab_tip", value: "팁 공유" },
  { key: "tab_work", value: "작품 공유" },
  { key: "tab_question", value: "질문" },
  { key: "tab_collab", value: "콜라보" },
];

export default function CommunityPostCreateScreen({ navigation }) {
  const { t } = useTranslation();
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
      Alert.alert(t("common.discard_title"), t("common.discard_message"), [
        { text: t("common.keep_editing"), style: "cancel" },
        { text: t("common.leave"), style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation, t]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert(t("communityCreate.title_required"), t("communityCreate.title_required_msg"));
      return;
    }
    if (!content.trim()) {
      Alert.alert(t("communityCreate.content_required"), t("communityCreate.content_required_msg"));
      return;
    }
    // Layer 1: Client-side profanity filter (instant)
    const titleCheck = checkProfanity(title);
    const contentCheck = checkProfanity(content);
    if (titleCheck.blocked || contentCheck.blocked) {
      Alert.alert(t("communityCreate.post_blocked"), t("communityCreate.inappropriate_msg"));
      return;
    }
    if (!deviceUserId) {
      Alert.alert(t("common.error"), t("communityCreate.connection_error"));
      return;
    }

    setSaving(true);
    try {
      // Layer 2: Server AI moderation (fail-open)
      const aiResult = await moderateContent(`${title.trim()}\n${content.trim()}`, "post");
      if (!aiResult.safe) {
        Alert.alert(t("communityCreate.post_blocked"), t("communityCreate.guideline_msg"));
        return;
      }

      await createPost({
        userId: deviceUserId,
        authorName: userProfile.name || t("common.anonymous"),
        authorField: userProfile.fields?.[0] || null,
        type,
        title: title.trim(),
        content: content.trim(),
      });
      hasChangesRef.current = false;
      showToast(t("communityCreate.post_success"), "success");
      navigation.goBack();
    } catch (_) {
      Alert.alert(t("common.error"), t("communityCreate.post_failed"));
    } finally {
      setSaving(false);
    }
  }, [title, content, type, deviceUserId, userProfile, navigation, showToast, t]);

  const handleCancel = useCallback(() => {
    if (hasChangesRef.current) {
      Alert.alert(t("common.discard_title"), t("common.discard_message"), [
        { text: t("common.keep_editing"), style: "cancel" },
        { text: t("common.leave"), style: "destructive", onPress: () => { hasChangesRef.current = false; navigation.goBack(); } },
      ]);
    } else {
      navigation.goBack();
    }
  }, [navigation, t]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TopBar
        title={t("communityCreate.title")}
        left={
          <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.cancelBtn}>{t("common.cancel")}</Text>
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
              <Text style={styles.saveBtn}>{t("communityCreate.post")}</Text>
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
        <Text style={styles.sectionLabel}>{t("communityCreate.category")}</Text>
        <View style={styles.typeRow}>
          {TYPE_KEYS.map(({ key, value }) => (
            <TouchableOpacity
              key={key}
              style={[styles.typeBtn, type === value && styles.typeBtnActive]}
              onPress={() => setType(value)}
            >
              <Text style={[styles.typeText, type === value && styles.typeTextActive]}>
                {t(`community.${key}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <TextInput
          style={styles.titleInput}
          placeholder={t("communityCreate.title_placeholder")}
          placeholderTextColor={CLight.gray400}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          returnKeyType="next"
        />

        {/* Content */}
        <TextInput
          style={styles.contentInput}
          placeholder={t("communityCreate.content_placeholder")}
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
