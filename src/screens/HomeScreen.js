import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { abandonPractice, getPracticeLog } from "../services/practiceService";
import { ensureCheckinSession, saveCheckinNote } from "../services/checkinNote";
import { buildPracticeActivities } from "../utils/practiceStats";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { timeAgo, truncate, FIELDS, toLocalDateKey } from "../utils/helpers";
import { STUDIO } from "../constants/studioTheme";
import PremiumBadge from "../components/PremiumBadge";
import { buildRepracticePrefill, findResumeTarget } from "../utils/repractice";
import { trackFunnelEvent } from "../services/mauService";
import { findFeedbackToReview } from "../utils/nextPractice";

export default function HomeScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    savedNotes,
    handleSaveNote,
    userProfile,
    fieldOrder,
    premium,
    showToast,
  } = useApp();

  const isActingUser = (userProfile?.fields || []).some((f) => /acting|film/i.test(String(f)));
  const duetCard = (
    <View
      style={styles.studioCard}
    >
      <View style={styles.studioTopline}>
        <Text style={styles.studioEyebrow}>{t("studio.eyebrow")}</Text>
        <Text style={styles.studioLanguages}>{t("studio.languages")}</Text>
      </View>
      <Text style={styles.studioTitle}>{t("studio.title")}</Text>
      <Text style={styles.studioDescription}>{t("studio.description")}</Text>
      <View style={styles.practiceSteps} accessibilityLabel={t("studio.loop")}>
        {["practice", "feedback", "repeat"].map((step, index) => (
          <View key={step} style={styles.practiceStep}>
            <Text style={styles.practiceStepNumber}>{`0${index + 1}`}</Text>
            <Text style={styles.practiceStepLabel}>{t(`studio.step_${step}`)}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        testID="studio-home-card"
        accessibilityRole="button"
        accessibilityLabel={t("studio.action")}
        style={styles.studioAction}
        onPress={() => {
          trackFunnelEvent("home_practice_tapped", i18n.language);
          navigation.navigate("DuetPractice");
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.studioActionText}>{t("studio.action")}</Text>
        <Text style={styles.studioArrow}>↗</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="home-existing-material"
        accessibilityRole="button"
        style={styles.existingMaterial}
        onPress={() => {
          trackFunnelEvent("home_material_tapped", i18n.language);
          navigation.navigate("NoteCreate", { prefill: { field: userProfile?.fields?.find(f => f === "acting" || f === "film") || "acting" } });
        }}
      >
        <Text style={styles.existingMaterialText}>{t("studio.existing_material")} →</Text>
      </TouchableOpacity>
      <Text style={styles.studioCreator}>{t("studio.creator")}</Text>
    </View>
  );

  // Acting/film and undecided newcomers get one studio entry. Other disciplines
  // keep their general practice-note entry instead of an acting-specific prompt.
  const hasFields = (userProfile?.fields || []).length > 0;

  const [expandedField, setExpandedField] = useState(null);
  const [checkinMemo, setCheckinMemo] = useState("");
  // 방금 저장한 체크인 — 저장만 하고 AI 피드백으로 가지 않는다(1.11.8 실측: 완료 3대, 피드백 0)
  const [savedCheckinNoteId, setSavedCheckinNoteId] = useState(null);

  // ---- 연습 기록(2인 대사 등, 노트를 안 남기는 연습) ----
  // 노트 저장만 세면 2인 대사 연습이 대시보드에 안 잡힌다 — 기기 기록을 합쳐서 쓴다.
  // 화면 포커스마다 다시 읽어서, 2인 대사를 마치고 홈으로 돌아오면 바로 반영되게 한다.
  const [practiceLog, setPracticeLog] = useState([]);
  const [resumeNow, setResumeNow] = useState(() => Date.now());
  useEffect(() => {
    const loadPracticeLog = () => {
      setResumeNow(Date.now());
      getPracticeLog().then(setPracticeLog).catch(() => {});
    };
    loadPracticeLog();
    const unsub = navigation.addListener("focus", loadPracticeLog);
    return unsub;
  }, [navigation]);

  // 노트 + 연습 기록을 합친 "연습 활동" 목록 — 같은 세션(practiceSessionId)의 노트가 있으면
  // 연습 기록 쪽은 중복이라 뺀다(2인 대사 → 노트 저장은 1회로).
  const practiceActivities = useMemo(
    () => buildPracticeActivities(savedNotes, practiceLog),
    [savedNotes, practiceLog]
  );

  // ---- Computed data ----
  const recentNotes = useMemo(() => savedNotes.slice(0, 5), [savedNotes]);
  const resumeTarget = useMemo(() => findResumeTarget(savedNotes, resumeNow), [savedNotes, resumeNow]);
  const feedbackTarget = useMemo(() => resumeTarget ? null : findFeedbackToReview(savedNotes, resumeNow), [savedNotes, resumeNow, resumeTarget]);
  const resumePractice = useCallback(() => {
    if (!resumeTarget) return;
    trackFunnelEvent("resume_card_tapped");
    trackFunnelEvent("repractice_started");
    navigation.navigate("NoteCreate", { prefill: buildRepracticePrefill(resumeTarget) });
  }, [resumeTarget, navigation]);
  // 최근 노트 섹션은 실제 저장된 노트 기준 그대로 유지
  const hasNotes = savedNotes.length > 0;
  // 요약 카드 표시 여부는 연습 활동(노트 없이 끝낸 2인 대사 포함) 기준 — 2인 대사만 한 사용자도 요약이 보여야 한다
  const hasPracticeActivity = practiceActivities.length > 0;

  const weeklySummary = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const thisWeekActivities = practiceActivities.filter(
      (n) => new Date(n.createdAt) >= weekStart
    );
    const prevWeekActivities = practiceActivities.filter(
      (n) => new Date(n.createdAt) >= prevWeekStart && new Date(n.createdAt) < weekStart
    );

    const thisCount = thisWeekActivities.length;
    const prevCount = prevWeekActivities.length;
    const weekGrowth =
      prevCount > 0 ? Math.round(((thisCount - prevCount) / prevCount) * 100) : null;

    // Calculate streak (consecutive days with practice activity, counting back from today)
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = toLocalDateKey(day);
      const hasActivity = practiceActivities.some((n) => n.createdAt && toLocalDateKey(n.createdAt) === dayStr);
      if (hasActivity) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return { count: thisCount, streak, weekGrowth };
  }, [practiceActivities]);

  // ---- Greeting based on time ----
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return t("home.greeting_dawn");
    if (hour < 12) return t("home.greeting_morning");
    if (hour < 18) return t("home.greeting_afternoon");
    return t("home.greeting_evening");
  }, [t]);

  const userName = userProfile?.name || t("common.artist");

  // ---- Quick check-in ----
  const todayKey = toLocalDateKey(new Date());
  const orderedFields = fieldOrder && fieldOrder.length > 0 ? fieldOrder : FIELDS;

  const todayCheckins = useMemo(() => {
    const set = new Set();
    savedNotes.forEach((n) => {
      if (n.type === "checkin" && n.createdAt && toLocalDateKey(n.createdAt) === todayKey) {
        set.add(n.field);
      }
    });
    return set;
  }, [savedNotes, todayKey]);

  // 체크인 한 번 = 연습 세션 하나 (메모를 쓰기 시작할 때 시작 → 저장 때 완료)
  const checkinSessionRef = useRef(null);
  const checkinSavingRef = useRef(false);

  // 완료 없이 화면을 떠난 체크인은 이탈 1건 (저장한 세션은 이미 닫혀 중복되지 않는다)
  useEffect(() => () => abandonPractice(checkinSessionRef.current), []);

  const handleCheckinTap = useCallback((field) => {
    if (checkinSavingRef.current) return;
    // 오늘 이미 체크인한 분야는 다시 눌러도 안내만 — 중복 노트 방지
    if (todayCheckins.has(field)) {
      showToast(t("home.checkin_already"), "success");
      return;
    }
    if (expandedField === field) {
      // 같은 원을 다시 눌러 접기 — 쓰다 만 세션은 이탈로 닫는다
      abandonPractice(checkinSessionRef.current);
      checkinSessionRef.current = null;
      setExpandedField(null);
    } else {
      // 입력창을 연 채 다른 분야로 바꾼다 — 새 세션을 또 시작하지 않고 기존 세션의 field만 교체
      if (checkinSessionRef.current) {
        checkinSessionRef.current = { ...checkinSessionRef.current, subjectKey: field, field };
      }
      setExpandedField(field);
    }
    setCheckinMemo("");
  }, [expandedField, todayCheckins, t, showToast]);

  const handleCheckinSave = useCallback(async (field) => {
    if (checkinSavingRef.current) return;
    checkinSavingRef.current = true;
    try {
      checkinSessionRef.current = ensureCheckinSession(checkinSessionRef.current, field);
      const noteId = await saveCheckinNote({ field, memo: checkinMemo, session: checkinSessionRef.current, saveNote: handleSaveNote });
      checkinSessionRef.current = null;
      setExpandedField(null);
      setCheckinMemo("");
      setSavedCheckinNoteId(noteId);
    } catch (_) {
      showToast(t("common.save_failed_msg"), "error");
    } finally {
      checkinSavingRef.current = false;
    }
  }, [checkinMemo, handleSaveNote, t, showToast]);

  // ---- Quick actions ----
  const quickActions = [
    {
      key: "note",
      emoji: "\u270F\uFE0F",
      label: t("home.new_note"),
      color: CLight.pink,
      route: "NoteCreate",
    },
    {
      key: "growth",
      emoji: "\uD83D\uDCC8",
      label: t("home.growth_report"),
      color: CLight.purple,
      route: "Growth",
    },
    {
      key: "matching",
      emoji: "\uD83E\uDD1D",
      label: t("studio.opportunities"),
      color: CLight.teal,
      route: "Matching",
    },
  ];

  // ===== RENDER =====
  return (
    <View style={[styles.container, { backgroundColor: STUDIO.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Top section: greeting + bell ---- */}
        <View style={styles.topSection}>
          <View style={styles.greetingContainer}>
            <Text style={[T.h3, { color: CLight.gray900 }]}>
              {greeting},{" "}
              {premium?.active ? <PremiumBadge size={16} /> : null}
              {premium?.active ? " " : null}
              <Text style={{ color: CLight.pink }}>{userName}</Text>
              {t("home.suffix_nim")}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 2 }]}>
              {t("home.daily_prompt")}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.bellButton, { backgroundColor: CLight.surface }]}
            onPress={() => navigation.navigate("Notifications")}
            activeOpacity={0.7}
          >
            <Text style={styles.bellIcon}>{"\uD83D\uDD14"}</Text>
          </TouchableOpacity>
        </View>

        {resumeTarget ? (
          <TouchableOpacity
            testID="retake-resume-card"
            accessibilityRole="button"
            style={[styles.summaryCard, { backgroundColor: CLight.surface, borderWidth: 1, borderColor: CLight.pinkGlow }]}
            onPress={resumePractice}
            activeOpacity={0.85}
          >
            <Text style={[T.captionBold, { color: CLight.pink }]}>{t("retake.resume_title")}</Text>
            <Text style={[T.titleBold, { color: CLight.gray900, marginTop: 8 }]} numberOfLines={2}>{resumeTarget.title}</Text>
            <Text style={[T.small, { color: CLight.gray700, marginTop: 6 }]}>{resumeTarget.chosenFocus}</Text>
            <Text style={styles.nextStepAction}>{t("studio.resume_action")} →</Text>
          </TouchableOpacity>
        ) : null}

        {feedbackTarget ? (
          <TouchableOpacity
            testID="home-review-feedback"
            accessibilityRole="button"
            style={styles.nextStepCard}
            onPress={() => {
              trackFunnelEvent("home_feedback_tapped", i18n.language);
              navigation.navigate("NoteDetail", { noteId: feedbackTarget.id, initialTab: "ai" });
            }}
          >
            <Text style={styles.studioEyebrow}>{t("studio.next_step")}</Text>
            <Text style={styles.nextStepTitle}>{t("studio.review_title")}</Text>
            <Text style={styles.studioDescription} numberOfLines={2}>{feedbackTarget.title || t("common.untitled")}</Text>
            <Text style={styles.nextStepAction}>{t("studio.review_action")} →</Text>
          </TouchableOpacity>
        ) : null}

        {(!hasFields || isActingUser) && !resumeTarget && !feedbackTarget ? duetCard : null}
        {(!hasFields || isActingUser) && (resumeTarget || feedbackTarget) ? (
          <TouchableOpacity accessibilityRole="button" style={styles.existingMaterial} onPress={() => navigation.navigate("DuetPractice")}>
            <Text style={styles.existingMaterialText}>{t("studio.other_scene")} →</Text>
          </TouchableOpacity>
        ) : null}

        {/* ---- Weekly summary (연습 활동이 0이면 첫 기록 히어로 카드) ---- */}
        {!hasPracticeActivity && hasFields && !isActingUser ? (
          <View style={[styles.summaryCard, { backgroundColor: CLight.surface, alignItems: "center" }]}>
            <Text style={[T.h3, { color: CLight.gray900, textAlign: "center" }]}>
              {t("home.hero_title")}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 8, textAlign: "center" }]}>
              {t("home.hero_desc")}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate("NoteCreate")}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyButtonText}>{t("home.hero_cta")}</Text>
            </TouchableOpacity>
          </View>
        ) : hasPracticeActivity ? (
        <View style={[styles.summaryCard, { backgroundColor: CLight.surface }]}>
          <Text style={[T.captionBold, { color: CLight.gray500, marginBottom: 12 }]}>
            {t("home.weekly_summary")}
          </Text>
          <View style={styles.summaryRow}>
            {/* Practice count */}
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: CLight.pink }]}>
                {weeklySummary.count}
              </Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>{t("home.weekly_practice")}</Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: CLight.gray200 }]} />

            {/* Streak */}
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: CLight.orange }]}>
                {weeklySummary.streak}
                <Text style={[T.small, { color: CLight.gray500 }]}>{t("common.days")}</Text>
              </Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>{t("home.streak")}</Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: CLight.gray200 }]} />

            {/* Growth */}
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: weeklySummary.weekGrowth === null ? CLight.gray500 : weeklySummary.weekGrowth >= 0 ? CLight.green : CLight.red },
                ]}
              >
                {weeklySummary.weekGrowth === null ? "—" : `${weeklySummary.weekGrowth >= 0 ? "+" : ""}${weeklySummary.weekGrowth}%`}
              </Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>{t("studio.practice_change")}</Text>
            </View>
          </View>
        </View>
        ) : null}

        {/* ---- Quick actions ---- */}
        <View style={styles.quickActionsContainer}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.quickActionCard, { backgroundColor: CLight.surface }]}
              onPress={() => navigation.navigate(action.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}15` }]}>
                <Text style={styles.quickActionEmoji}>{action.emoji}</Text>
              </View>
              <Text style={[T.smallBold, { color: CLight.gray900, marginTop: 8 }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ---- Quick Check-in ---- */}
        <View style={[styles.checkinSection, { backgroundColor: CLight.surface }]}>
          <Text style={[T.captionBold, { color: CLight.gray500, marginBottom: 10 }]}>
            {t("notes.today_practice")}
          </Text>
          <View style={styles.checkinRow}>
            {orderedFields.map((field) => {
              const checked = todayCheckins.has(field);
              const color = FIELD_COLORS[field] || CLight.gray500;
              return (
                <TouchableOpacity
                  key={field}
                  style={[
                    styles.checkinCircle,
                    {
                      backgroundColor: checked ? color : expandedField === field ? `${color}20` : CLight.white,
                      borderColor: checked ? color : expandedField === field ? color : CLight.gray200,
                    },
                  ]}
                  onPress={() => handleCheckinTap(field)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.checkinEmoji, { opacity: checked || expandedField === field ? 1 : 0.5 }]}>
                    {checked ? "\u2713" : FIELD_EMOJIS[field] || "\uD83D\uDCDD"}
                  </Text>
                  <Text
                    style={[
                      styles.checkinLabel,
                      { color: checked ? CLight.white : CLight.gray500 },
                    ]}
                    numberOfLines={1}
                  >
                    {t("fields." + field)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {expandedField && (
            <View style={styles.checkinInputRow}>
              <Text style={styles.checkinFieldTag}>
                {FIELD_EMOJIS[expandedField]} {t("fields." + expandedField)}
              </Text>
              <TextInput
                style={[styles.checkinInput, { backgroundColor: CLight.inputBg, borderColor: CLight.inputBorder, color: CLight.gray900 }]}
                placeholder={t("notes.checkin_placeholder")}
                placeholderTextColor={CLight.gray400}
                value={checkinMemo}
                onChangeText={(value) => { if (!checkinSavingRef.current) setCheckinMemo(value); }}
                // 분야 원을 눌러 펼친 것만으로는 연습이 아니다 — 메모를 쓰기 시작할 때 세션이 열린다
                onFocus={() => { checkinSessionRef.current = ensureCheckinSession(checkinSessionRef.current, expandedField); }}
                returnKeyType="done"
                onSubmitEditing={() => handleCheckinSave(expandedField)}
              />
              <TouchableOpacity
                style={[styles.checkinSaveBtn, { backgroundColor: FIELD_COLORS[expandedField] || CLight.pink }]}
                onPress={() => handleCheckinSave(expandedField)}
                activeOpacity={0.8}
              >
                <Text style={styles.checkinSaveBtnText}>{t("common.save")}</Text>
              </TouchableOpacity>
            </View>
          )}
          {savedCheckinNoteId != null && !expandedField && (
            <TouchableOpacity
              style={styles.checkinAiRow}
              onPress={() => {
                const noteId = savedCheckinNoteId;
                setSavedCheckinNoteId(null);
                navigation.navigate("NoteDetail", { noteId, initialTab: "ai" });
              }}
              activeOpacity={0.7}
            >
              <Text style={[T.caption, { color: CLight.gray500, flex: 1 }]}>{t("first_checkin.done_desc")}</Text>
              <Text style={[T.captionBold, { color: CLight.pink, marginLeft: 10 }]}>{t("first_checkin.ai_cta")} →</Text>
            </TouchableOpacity>
          )}
          {/* 위 duetCard(히어로 아래 전폭 카드)가 이미 떠 있으면 중복이라 숨긴다 */}
          {hasFields && !isActingUser && (
            <TouchableOpacity
              style={{
                flexDirection: "row", alignItems: "center", marginTop: 12,
                paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CLight.gray200,
              }}
              onPress={() => navigation.navigate("DuetPractice")}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, marginRight: 8 }}>🎭</Text>
              <Text style={[T.small, { color: CLight.gray500, flex: 1 }]}>{t("studio.action")}</Text>
              <Text style={[T.small, { color: CLight.gray400 }]}>›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ---- Recent notes ---- */}
        {hasNotes && (
        <>
        <View style={styles.sectionHeader}>
          <Text style={[T.title, { color: CLight.gray900 }]}>{t("home.recent_notes")}</Text>
          {savedNotes.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate("Notes")}>
              <Text style={[T.small, { color: CLight.pink }]}>{t("home.view_all")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentNotes.length > 0 && (
          <View style={styles.notesContainer}>
            {recentNotes.map((note) => {
              const fieldColor = note.field ? FIELD_COLORS[note.field] || CLight.gray500 : CLight.gray500;
              const fieldLabel = note.field ? t("fields." + note.field) : null;
              const fieldEmoji = note.field ? FIELD_EMOJIS[note.field] : null;

              return (
                <TouchableOpacity
                  key={note.id}
                  style={[styles.noteCard, { backgroundColor: CLight.surface }]}
                  onPress={() => navigation.navigate("NoteDetail", { noteId: note.id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.noteCardHeader}>
                    {fieldLabel && (
                      <View style={[styles.noteFieldBadge, { backgroundColor: `${fieldColor}15` }]}>
                        <Text style={styles.noteFieldEmoji}>{fieldEmoji}</Text>
                        <Text style={[T.micro, { color: fieldColor, fontWeight: "600" }]}>
                          {fieldLabel}
                        </Text>
                      </View>
                    )}
                    {note.starred && <Text style={styles.starIcon}>{"\u2B50"}</Text>}
                    <Text style={[T.micro, { color: CLight.gray400, marginLeft: "auto" }]}>
                      {timeAgo(note.createdAt)}
                    </Text>
                  </View>

                  <Text style={[T.bodyBold, { color: CLight.gray900, marginTop: 8 }]} numberOfLines={1}>
                    {note.title || t("common.untitled")}
                  </Text>

                  {note.content && (
                    <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]} numberOfLines={2}>
                      {truncate(note.content, 120)}
                    </Text>
                  )}

                  {note.keywords && note.keywords.length > 0 && (
                    <View style={styles.noteKeywords}>
                      {note.keywords.slice(0, 3).map((kw, idx) => (
                        <View key={idx} style={[styles.keywordTag, { backgroundColor: CLight.gray100 }]}>
                          <Text style={[T.tiny, { color: CLight.gray500 }]}>{kw}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  practiceSteps: { flexDirection: "row", gap: 12, marginTop: 24, borderTopWidth: 1, borderColor: STUDIO.line, paddingTop: 18 },
  practiceStep: { flex: 1, gap: 6 },
  practiceStepNumber: { color: STUDIO.accent, fontSize: 12, fontWeight: "700" },
  practiceStepLabel: { color: STUDIO.ink, fontSize: 12, lineHeight: 19, fontWeight: "600" },
  existingMaterial: { paddingVertical: 15, marginBottom: 4, minHeight: 48 },
  existingMaterialText: { color: STUDIO.muted, fontSize: 13, lineHeight: 21, textAlign: "center" },
  nextStepCard: { backgroundColor: STUDIO.paper, borderColor: STUDIO.line, borderWidth: 1, borderRadius: 22, padding: 22, marginBottom: 8 },
  nextStepTitle: { color: STUDIO.ink, fontSize: 24, lineHeight: 33, fontWeight: "700", marginTop: 12 },
  nextStepAction: { color: STUDIO.accent, fontSize: 14, lineHeight: 22, fontWeight: "700", marginTop: 18 },
  studioCard: { backgroundColor: STUDIO.paper, borderColor: STUDIO.line, borderWidth: 1, borderRadius: 24, padding: 22, marginBottom: 18 },
  studioTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  studioEyebrow: { color: STUDIO.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.8 },
  studioLanguages: { color: STUDIO.muted, fontSize: 11, fontWeight: "600", backgroundColor: STUDIO.background, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  studioTitle: { color: STUDIO.ink, fontSize: 27, lineHeight: 36, fontWeight: "700", letterSpacing: -0.8, marginTop: 20 },
  studioDescription: { color: STUDIO.muted, fontSize: 13, lineHeight: 21, marginTop: 10 },
  studioAction: { backgroundColor: STUDIO.ink, borderRadius: 14, paddingHorizontal: 17, paddingVertical: 15, marginTop: 23, flexDirection: "row", alignItems: "center", gap: 12 },
  studioActionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", flex: 1 },
  studioArrow: { color: "#FFFFFF", fontSize: 22 },
  studioCreator: { color: STUDIO.muted, fontSize: 11, lineHeight: 17, marginTop: 13 },
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // paddingTop is set dynamically via insets.top
    paddingHorizontal: 20,
  },

  // ---- Top section ----
  topSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greetingContainer: {
    flex: 1,
    marginRight: 12,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  bellIcon: {
    fontSize: 20,
  },

  // ---- Summary card ----
  summaryCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    ...T.h2,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 8,
  },

  // ---- Quick actions ----
  quickActionsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  quickActionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  quickActionEmoji: {
    fontSize: 20,
  },

  // ---- Quick Check-in ----
  checkinSection: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  checkinRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  checkinCircle: {
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  checkinEmoji: {
    fontSize: 16,
  },
  checkinLabel: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: "500",
  },
  checkinAiRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  checkinInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  checkinFieldTag: {
    fontSize: 13,
    fontWeight: "600",
    color: CLight.gray700,
  },
  checkinInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    ...T.caption,
  },
  checkinSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  checkinSaveBtnText: {
    ...T.microBold,
    color: CLight.white,
  },

  // ---- Section header ----
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  // ---- Note cards ----
  notesContainer: {
    gap: 12,
  },
  noteCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  noteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteFieldBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  noteFieldEmoji: {
    fontSize: 12,
  },
  starIcon: {
    fontSize: 14,
  },
  noteKeywords: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  keywordTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // ---- 첫 기록 히어로 CTA ----
  emptyButton: {
    marginTop: 20,
    backgroundColor: CLight.pink,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyButtonText: {
    ...T.bodyBold,
    color: "#FFFFFF",
  },
});
