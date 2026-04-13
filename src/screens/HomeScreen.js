import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { timeAgo, truncate, FIELDS } from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const {
    savedNotes,
    handleSaveNote,
    userProfile,
    artistProfile,
    fieldOrder,
  } = useApp();

  const [expandedField, setExpandedField] = useState(null);
  const [checkinMemo, setCheckinMemo] = useState("");

  // ---- Computed data ----
  const recentNotes = useMemo(() => savedNotes.slice(0, 5), [savedNotes]);

  const weeklySummary = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const thisWeekNotes = savedNotes.filter(
      (n) => new Date(n.createdAt) >= weekStart
    );
    const prevWeekNotes = savedNotes.filter(
      (n) => new Date(n.createdAt) >= prevWeekStart && new Date(n.createdAt) < weekStart
    );

    const thisCount = thisWeekNotes.length;
    const prevCount = prevWeekNotes.length;
    const weekGrowth =
      prevCount > 0 ? Math.round(((thisCount - prevCount) / prevCount) * 100) : thisCount > 0 ? 100 : 0;

    // Calculate streak (consecutive days with notes, counting back from today)
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().split("T")[0];
      const hasNote = savedNotes.some((n) => n.createdAt && n.createdAt.startsWith(dayStr));
      if (hasNote) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return { count: thisCount, streak, weekGrowth };
  }, [savedNotes]);

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
  const todayKey = new Date().toISOString().slice(0, 10);
  const orderedFields = fieldOrder && fieldOrder.length > 0 ? fieldOrder : FIELDS;

  const todayCheckins = useMemo(() => {
    const set = new Set();
    savedNotes.forEach((n) => {
      if (n.type === "checkin" && n.createdAt && n.createdAt.slice(0, 10) === todayKey) {
        set.add(n.field);
      }
    });
    return set;
  }, [savedNotes, todayKey]);

  const handleCheckinTap = useCallback((field) => {
    setExpandedField((prev) => (prev === field ? null : field));
    setCheckinMemo("");
  }, []);

  const handleCheckinSave = useCallback((field) => {
    const title = checkinMemo.trim() || t("fields." + field) + " " + t("notes.checkin_badge");
    handleSaveNote({ title, field, type: "checkin" });
    setExpandedField(null);
    setCheckinMemo("");
  }, [checkinMemo, handleSaveNote, t]);

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
  ];

  // ===== RENDER =====
  return (
    <View style={[styles.container, { backgroundColor: CLight.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Top section: greeting + bell ---- */}
        <View style={styles.topSection}>
          <View style={styles.greetingContainer}>
            <Text style={[T.h3, { color: CLight.gray900 }]}>
              {greeting},{" "}
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

        {/* ---- Weekly summary card ---- */}
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
        </View>

        {/* ---- Recent notes ---- */}
        <View style={styles.sectionHeader}>
          <Text style={[T.title, { color: CLight.gray900 }]}>{t("home.recent_notes")}</Text>
          {savedNotes.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate("Notes")}>
              <Text style={[T.small, { color: CLight.pink }]}>{t("home.view_all")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentNotes.length > 0 ? (
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
        ) : (
          /* ---- Empty state ---- */
          <View style={[styles.emptyCard, { backgroundColor: CLight.surface }]}>
            <Text style={styles.emptyEmoji}>{"\uD83C\uDFB5"}</Text>
            <Text style={[T.title, { color: CLight.gray900, marginTop: 12 }]}>
              {t("home.empty_title")}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 6, textAlign: "center" }]}>
              {t("home.empty_desc")}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate("NoteCreate")}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyButtonText}>{t("home.write_note")}</Text>
            </TouchableOpacity>
          </View>
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
    paddingTop: Platform.OS === "ios" ? 60 : 24,
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

  // ---- Empty state ----
  emptyCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyEmoji: {
    fontSize: 48,
  },
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
