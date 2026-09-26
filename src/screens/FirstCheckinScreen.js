import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { trackFunnelEvent } from "../services/mauService";
import { abandonPractice } from "../services/practiceService";
import { ensureCheckinSession, saveCheckinNote } from "../services/checkinNote";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { FIELDS } from "../utils/helpers";

// 가입 직후 한 번만 — 가입자의 63%가 노트 0건으로 끝난다(2026-09 실측). 홈의 여러 선택지 대신
// "한 줄 남기기" 하나만 남겨 첫 기록을 끝내게 한다. 저장하거나 "나중에"를 누르면 다시 뜨지 않는다.
export default function FirstCheckinScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { userProfile, fieldOrder, handleSaveNote, dismissFirstCheckin, showToast } = useApp();

  const orderedFields = fieldOrder && fieldOrder.length > 0 ? fieldOrder : FIELDS;
  const [field, setField] = useState(userProfile?.fields?.[0] || orderedFields[0]);
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState(null); // 저장 성공하면 { noteId }
  const sessionRef = useRef(null);
  const savingRef = useRef(false);

  useEffect(() => {
    trackFunnelEvent("first_checkin_shown", i18n.language);
  }, [i18n.language]);

  // 저장 없이 떠나면 이탈 1건 (저장한 세션은 이미 완료로 닫혀 중복되지 않는다)
  useEffect(() => () => abandonPractice(sessionRef.current), []);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      sessionRef.current = ensureCheckinSession(sessionRef.current, field);
      const noteId = await saveCheckinNote({ field, memo, session: sessionRef.current, saveNote: handleSaveNote });
      sessionRef.current = null;
      trackFunnelEvent("first_checkin_saved", i18n.language);
      setSaved({ noteId });
    } catch (_) {
      showToast(t("common.save_failed_msg"), "error");
    } finally {
      savingRef.current = false;
    }
  }, [field, memo, handleSaveNote, i18n.language, showToast, t]);

  const handleLater = useCallback(() => {
    trackFunnelEvent("first_checkin_skipped", i18n.language);
    dismissFirstCheckin();
  }, [dismissFirstCheckin, i18n.language]);

  // AI 피드백은 저장한 노트 화면에서 사용자가 직접 누른다 — 여기서 분석을 발사하지 않는다.
  // 이 화면은 스택의 첫 화면이라 dismiss되면 스택에서 빠진다. navigate만 하면 NoteDetail 아래에
  // 아무것도 없어 뒤로가기가 앱을 종료시킨다(에뮬레이터 실측) — MainTabs를 아래에 깔고 reset.
  const goFeedback = useCallback(() => {
    navigation.reset({
      index: 1,
      routes: [{ name: "MainTabs" }, { name: "NoteDetail", params: { noteId: saved?.noteId } }],
    });
    dismissFirstCheckin();
  }, [navigation, saved, dismissFirstCheckin]);

  if (saved) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 48 }]}>
        <Text style={styles.emoji}>{"🎉"}</Text>
        <Text style={[T.h3, styles.title]}>{t("first_checkin.done_title")}</Text>
        <Text style={[T.caption, styles.desc]}>{t("first_checkin.done_desc")}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={goFeedback} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>{t("first_checkin.ai_cta")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={dismissFirstCheckin} activeOpacity={0.7}>
          <Text style={styles.linkText}>{t("first_checkin.home_cta")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48 }]}>
      <Text style={[T.h3, styles.title]}>{t("first_checkin.title")}</Text>
      <Text style={[T.caption, styles.desc]}>{t("first_checkin.desc")}</Text>

      <View style={styles.chipRow}>
        {orderedFields.map((f) => {
          const color = FIELD_COLORS[f] || CLight.gray500;
          const on = f === field;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.chip, { backgroundColor: on ? `${color}20` : CLight.white, borderColor: on ? color : CLight.gray200 }]}
              onPress={() => setField(f)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>
                {FIELD_EMOJIS[f] || "📝"} {t("fields." + f)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        style={styles.input}
        placeholder={t("first_checkin.memo_placeholder")}
        placeholderTextColor={CLight.gray400}
        value={memo}
        onChangeText={setMemo}
        // 분야를 고르기만 한 건 연습이 아니다 — 메모를 쓰기 시작할 때 세션이 열린다
        onFocus={() => { sessionRef.current = ensureCheckinSession(sessionRef.current, field); }}
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>{t("first_checkin.save")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkBtn} onPress={handleLater} activeOpacity={0.7}>
        <Text style={styles.linkText}>{t("first_checkin.later")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CLight.bg, paddingHorizontal: 24 },
  emoji: { fontSize: 44, textAlign: "center", marginBottom: 12 },
  title: { color: CLight.gray900, textAlign: "center" },
  desc: { color: CLight.gray500, textAlign: "center", marginTop: 8, marginBottom: 28, lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginBottom: 20 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, margin: 4 },
  chipText: { fontSize: 14, color: CLight.gray900 },
  input: {
    height: 52, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder,
    borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: CLight.gray900, marginBottom: 20,
  },
  primaryBtn: { height: 52, backgroundColor: CLight.pink, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: CLight.white },
  linkBtn: { alignItems: "center", paddingVertical: 16 },
  linkText: { fontSize: 14, color: CLight.gray400 },
});
