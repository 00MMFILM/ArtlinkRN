import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import TopBar from "../components/TopBar";
import { truncate, formatDate } from "../utils/helpers";

export default function PortfolioScreen({ navigation }) {
  const { artistProfile, userProfile, savedNotes } = useApp();

  const totalNotes = savedNotes.length;
  const topFields = artistProfile.topFields || [];

  const scores = [
    { label: "기록량", value: artistProfile.noteScore, color: CLight.pink },
    { label: "AI 활용", value: artistProfile.aiScore, color: CLight.purple },
    { label: "다양성", value: artistProfile.diversityScore, color: CLight.orange },
    { label: "깊이", value: artistProfile.depthScore, color: CLight.blue },
    { label: "꾸준함", value: artistProfile.consistencyScore, color: CLight.green },
  ];

  const featuredNotes = artistProfile.featuredNotes || [];

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="포트폴리오"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} 뒤로</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Portfolio header */}
        <View style={styles.headerCard}>
          <View style={styles.avatarCircle}>
            <Text style={[T.h1, { color: CLight.pink }]}>
              {(userProfile.name || "A").charAt(0)}
            </Text>
          </View>
          <Text style={[T.h2, { color: CLight.gray900, marginTop: 12 }]}>
            {artistProfile.displayName}
          </Text>
          <Text style={[T.caption, { color: CLight.pink, marginTop: 4 }]}>
            {artistProfile.displayFields || "아티스트"}
          </Text>
          <Text style={[T.small, { color: CLight.gray500, marginTop: 10, textAlign: "center", lineHeight: 22 }]}>
            {totalNotes > 0
              ? `${totalNotes}개의 노트를 기록하며 성장 중인 아티스트입니다. ${artistProfile.streak}일 연속 기록 중이며, 종합 점수 ${artistProfile.overallScore}점을 달성했습니다.`
              : "아직 노트를 기록하지 않았습니다. 첫 번째 노트를 작성하고 포트폴리오를 만들어보세요!"}
          </Text>

          {/* Quick stats */}
          <View style={styles.quickStats}>
            <View style={styles.statItem}>
              <Text style={[T.h3, { color: CLight.pink }]}>{totalNotes}</Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>노트</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[T.h3, { color: CLight.pink }]}>{artistProfile.streak}</Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>연속일</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[T.h3, { color: CLight.pink }]}>{artistProfile.overallScore}</Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>점수</Text>
            </View>
          </View>
        </View>

        {/* Skill scores */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          스킬 점수
        </Text>
        <View style={styles.card}>
          {scores.map((score) => (
            <View key={score.label} style={styles.scoreRow}>
              <Text style={[T.caption, { color: CLight.gray700, width: 60 }]}>
                {score.label}
              </Text>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${score.value}%`, backgroundColor: score.color },
                  ]}
                />
              </View>
              <Text style={[T.captionBold, { color: score.color, width: 36, textAlign: "right" }]}>
                {score.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Featured notes */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          대표 노트
        </Text>
        {featuredNotes.length > 0 ? (
          featuredNotes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <View style={styles.noteHeader}>
                <View
                  style={[
                    styles.noteBadge,
                    { backgroundColor: (FIELD_COLORS[note.field] || CLight.pink) + "18" },
                  ]}
                >
                  <Text style={[T.micro, { color: FIELD_COLORS[note.field] || CLight.pink }]}>
                    {FIELD_EMOJIS[note.field] || ""} {FIELD_LABELS[note.field] || note.field}
                  </Text>
                </View>
                {note.starred && (
                  <Text style={[T.micro, { color: CLight.yellow }]}>★</Text>
                )}
              </View>
              <Text style={[T.captionBold, { color: CLight.gray900, marginTop: 6 }]}>
                {note.title || "제목 없음"}
              </Text>
              <Text
                style={[T.small, { color: CLight.gray500, marginTop: 4 }]}
                numberOfLines={2}
              >
                {truncate(note.content, 120)}
              </Text>
              <Text style={[T.tiny, { color: CLight.gray400, marginTop: 6 }]}>
                {formatDate(note.createdAt)}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={[T.small, { color: CLight.gray400, textAlign: "center" }]}>
              아직 대표 노트가 없습니다.{"\n"}내용이 풍부한 노트를 작성해보세요!
            </Text>
          </View>
        )}

        {/* Field distribution */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          분야 분포
        </Text>
        <View style={styles.card}>
          {topFields.length > 0 ? (
            topFields.map(([field, count]) => {
              const maxCount = topFields[0][1];
              const percent = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              return (
                <View key={field} style={styles.fieldRow}>
                  <Text style={[T.caption, { color: CLight.gray700, width: 50 }]}>
                    {FIELD_EMOJIS[field] || ""} {FIELD_LABELS[field] || field}
                  </Text>
                  <View style={styles.fieldBarBg}>
                    <View
                      style={[
                        styles.fieldBarFill,
                        {
                          width: `${percent}%`,
                          backgroundColor: FIELD_COLORS[field] || CLight.gray400,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[T.microBold, { color: CLight.gray500, width: 30, textAlign: "right" }]}>
                    {count}
                  </Text>
                </View>
              );
            })
          ) : (
            <Text style={[T.small, { color: CLight.gray400, textAlign: "center", paddingVertical: 16 }]}>
              노트를 작성하면 분야 분포가 표시됩니다.
            </Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  headerCard: {
    backgroundColor: CLight.white,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CLight.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: CLight.gray100,
    width: "100%",
    justifyContent: "space-around",
  },
  statItem: { alignItems: "center" },
  statDivider: { width: 1, height: 28, backgroundColor: CLight.gray200 },
  card: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: CLight.gray100,
    borderRadius: 4,
    overflow: "hidden",
    marginHorizontal: 10,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  noteCard: {
    backgroundColor: CLight.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  noteBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyCard: {
    backgroundColor: CLight.white,
    borderRadius: 14,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  fieldBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: CLight.gray100,
    borderRadius: 5,
    overflow: "hidden",
    marginHorizontal: 10,
  },
  fieldBarFill: {
    height: 10,
    borderRadius: 5,
  },
});
