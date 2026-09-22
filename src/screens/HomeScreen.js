import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { trackFunnelEvent } from "../services/mauService";
import { startPractice, completePractice, getPracticeLog } from "../services/practiceService";
import { buildPracticeActivities } from "../utils/practiceStats";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { timeAgo, truncate, FIELDS, toLocalDateKey } from "../utils/helpers";
import PremiumBadge from "../components/PremiumBadge";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function HomeScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    savedNotes,
    handleSaveNote,
    userProfile,
    artistProfile,
    fieldOrder,
    isKoreanLocale,
    premium,
    showToast,
  } = useApp();

  // 2인 대사 연습 — 한국어 콘텐츠라 KR 로케일만 노출.
  // 연기·영화 유저: 상단 전폭 카드 / 그 외: 오늘의 연습 퀵 노트 안 한 줄 링크 (2026-09-02 대표 지시)
  const isActingUser = (userProfile?.fields || []).some((f) => /acting|film/i.test(String(f)));
  const duetCard = isKoreanLocale ? (
    <TouchableOpacity
      style={{
        backgroundColor: CLight.surface, borderRadius: 16, padding: 16, marginBottom: 16,
        flexDirection: "row", alignItems: "center",
        borderWidth: 1, borderColor: isActingUser ? CLight.pinkGlow : CLight.cardBorder,
      }}
      onPress={() => navigation.navigate("DuetPractice")}
      activeOpacity={0.8}
    >
      <Text style={{ fontSize: 28, marginRight: 12 }}>🎭</Text>
      <View style={{ flex: 1 }}>
        <Text style={[T.titleBold, { color: CLight.gray900 }]}>{t("home.duet_title")}</Text>
        <Text style={[T.small, { color: CLight.gray500, marginTop: 2 }]}>
          {t("home.duet_desc")}
        </Text>
      </View>
      <Text style={[T.title, { color: CLight.gray400 }]}>›</Text>
    </TouchableOpacity>
  ) : null;

  // 한국어 + 노트 0개 = 첫 경험. 입시·오디션 맥락 문구로 바꾸고 2인 대사 진입을 히어로 바로 아래 둔다.
  // 단, 분야가 이미 설정돼 있고 그 안에 연기가 없으면(음악·미술 등) 연기 전용 문구는 어색하다 — 일반 히어로로.
  // 분야 미설정(게스트·신규)은 지금처럼 연기 히어로 유지.
  const hasFields = (userProfile?.fields || []).length > 0;
  const koFirstRun = isKoreanLocale && savedNotes.length === 0 && (!hasFields || isActingUser);

  const [expandedField, setExpandedField] = useState(null);
  const [checkinMemo, setCheckinMemo] = useState("");

  // ---- 연습 기록(2인 대사 등, 노트를 안 남기는 연습) ----
  // 노트 저장만 세면 2인 대사 연습이 대시보드에 안 잡힌다 — 기기 기록을 합쳐서 쓴다.
  // 화면 포커스마다 다시 읽어서, 2인 대사를 마치고 홈으로 돌아오면 바로 반영되게 한다.
  const [practiceLog, setPracticeLog] = useState([]);
  useEffect(() => {
    const loadPracticeLog = () => {
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
      prevCount > 0 ? Math.round(((thisCount - prevCount) / prevCount) * 100) : thisCount > 0 ? 100 : 0;

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

  // 체크인 한 번 = 연습 세션 하나 (펼칠 때 시작 → 저장 때 완료)
  const checkinSessionRef = useRef(null);

  const handleCheckinTap = useCallback((field) => {
    // 오늘 이미 체크인한 분야는 다시 눌러도 안내만 — 중복 노트 방지
    if (todayCheckins.has(field)) {
      showToast(t("home.checkin_already"), "success");
      return;
    }
    if (expandedField === field) {
      // 같은 원을 다시 눌러 접기 — 세션은 그대로 둔다
      setExpandedField(null);
    } else if (expandedField) {
      // 입력창을 연 채 다른 분야로 바꾼다 — 새 세션을 또 시작하지 않고 기존 세션의 field만 교체
      checkinSessionRef.current = { ...checkinSessionRef.current, subjectKey: field, field };
      setExpandedField(field);
    } else {
      checkinSessionRef.current = startPractice("checkin", field, field);
      setExpandedField(field);
    }
    setCheckinMemo("");
  }, [expandedField, todayCheckins, t, showToast]);

  const handleCheckinSave = useCallback((field) => {
    const title = checkinMemo.trim() || t("fields." + field) + " " + t("notes.checkin_badge");
    handleSaveNote({
      title,
      field,
      type: "checkin",
      // 이 체크인이 어느 연습 세션에서 나왔는지 — 연습 기록(getPracticeLog)과 중복 집계 방지
      practiceSessionId: checkinSessionRef.current?.sessionId,
    });
    // 홈 체크인도 노트 저장이다 — 계측이 빠져 있어 실사용 저장의 75%가 집계되지 않았다(2026-09-07)
    trackFunnelEvent("note_saved", i18n.language);
    if (checkinSessionRef.current) {
      completePractice(checkinSessionRef.current, { subjectKey: field, field });
      checkinSessionRef.current = null;
    }
    setExpandedField(null);
    setCheckinMemo("");
  }, [checkinMemo, handleSaveNote, t, i18n.language]);

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
      label: t("home.matching"),
      color: CLight.teal,
      route: "Matching",
    },
  ].filter((a) => a.key !== "matching" || isKoreanLocale); // \uB9E4\uCE6D\uC740 \uD55C\uAD6D\uC5B4 \uCF58\uD150\uCE20 \u2014 ProfileScreen\uACFC \uB3D9\uC77C\uD558\uAC8C koOnly

  // ===== RENDER =====
  return (
    <View style={[styles.container, { backgroundColor: CLight.bg }]}>
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

        {/* ---- Weekly summary (연습 활동이 0이면 첫 기록 히어로 카드) ---- */}
        {!hasPracticeActivity ? (
          <View style={[styles.summaryCard, { backgroundColor: CLight.surface, alignItems: "center" }]}>
            <Text style={[T.h3, { color: CLight.gray900, textAlign: "center" }]}>
              {t(koFirstRun ? "home.hero_title_ko_acting" : "home.hero_title")}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 8, textAlign: "center" }]}>
              {t(koFirstRun ? "home.hero_desc_ko_acting" : "home.hero_desc")}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate("NoteCreate")}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyButtonText}>{t(koFirstRun ? "home.hero_cta_ko_acting" : "home.hero_cta")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
                  { color: weeklySummary.weekGrowth >= 0 ? CLight.green : CLight.red },
                ]}
              >
                {weeklySummary.weekGrowth >= 0 ? "+" : ""}
                {weeklySummary.weekGrowth}%
              </Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>{t("home.weekly_growth")}</Text>
            </View>
          </View>
        </View>
        )}

        {koFirstRun ? duetCard : null}
        {!koFirstRun && isActingUser && duetCard}
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
                onChangeText={setCheckinMemo}
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
          {/* 위 duetCard(히어로 아래 전폭 카드)가 이미 떠 있으면 중복이라 숨긴다 */}
          {isKoreanLocale && !isActingUser && !koFirstRun && (
            <TouchableOpacity
              style={{
                flexDirection: "row", alignItems: "center", marginTop: 12,
                paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CLight.gray200,
              }}
              onPress={() => navigation.navigate("DuetPractice")}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, marginRight: 8 }}>🎭</Text>
              <Text style={[T.small, { color: CLight.gray500, flex: 1 }]}>{t("home.duet_row")}</Text>
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
