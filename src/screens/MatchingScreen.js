import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS } from "../constants/theme";
import TopBar from "../components/TopBar";

const TABS = ["프로젝트", "오디션", "콜라보"];

const SAMPLE_PROJECTS = [
  {
    id: 1,
    tab: "프로젝트",
    title: "단편영화 '빛의 경계' 출연자 모집",
    field: "acting",
    description: "20대 여성 주연. 독립영화제 출품 예정 단편영화로, 경계인의 정체성을 탐구하는 작품입니다.",
    deadline: "2026-03-15",
    matchPercent: 92,
  },
  {
    id: 2,
    tab: "프로젝트",
    title: "뮤지컬 'Seasons' 앙상블 캐스팅",
    field: "music",
    description: "창작 뮤지컬 앙상블 캐스트. 노래와 연기를 동시에 소화할 수 있는 분을 찾습니다.",
    deadline: "2026-03-20",
    matchPercent: 78,
  },
  {
    id: 3,
    tab: "오디션",
    title: "드라마 '새벽의 문' 공개 오디션",
    field: "acting",
    description: "OTT 오리지널 드라마. 다양한 연령대의 조연 역할 다수 오디션 진행 중.",
    deadline: "2026-03-10",
    matchPercent: 85,
  },
  {
    id: 4,
    tab: "오디션",
    title: "국립무용단 시즌 단원 오디션",
    field: "dance",
    description: "2026 시즌 객원 단원 모집. 현대무용 경력 2년 이상 우대.",
    deadline: "2026-04-01",
    matchPercent: 65,
  },
  {
    id: 5,
    tab: "콜라보",
    title: "시각예술 x 음악 융합 전시 참여자",
    field: "art",
    description: "인터랙티브 미디어 전시 프로젝트. 미술과 음악의 경계를 허무는 실험적 작업.",
    deadline: "2026-03-25",
    matchPercent: 88,
  },
];

export default function MatchingScreen({ navigation }) {
  const { artistProfile, userProfile } = useApp();
  const [activeTab, setActiveTab] = useState("프로젝트");

  const filtered = SAMPLE_PROJECTS.filter((item) => item.tab === activeTab);

  const getMatchColor = (percent) => {
    if (percent >= 85) return CLight.green;
    if (percent >= 70) return CLight.orange;
    return CLight.gray400;
  };

  const getDaysLeft = (deadline) => {
    const diff = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    if (diff <= 0) return "마감";
    if (diff <= 3) return `D-${diff}`;
    return `D-${diff}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="매칭"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} 뒤로</Text>
          </TouchableOpacity>
        }
      />

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User skill summary */}
        <View style={styles.summaryCard}>
          <Text style={[T.captionBold, { color: CLight.gray700 }]}>
            내 매칭 프로필
          </Text>
          <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]}>
            {artistProfile.displayName} | {artistProfile.displayFields || "미설정"} | 종합 점수{" "}
            {artistProfile.overallScore}점
          </Text>
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
              이 카테고리에 매칭 항목이 없습니다.
            </Text>
          </View>
        ) : (
          filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              {/* Match badge */}
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.fieldBadge,
                    { backgroundColor: (FIELD_COLORS[item.field] || CLight.pink) + "18" },
                  ]}
                >
                  <Text
                    style={[
                      T.micro,
                      { color: FIELD_COLORS[item.field] || CLight.pink, fontWeight: "600" },
                    ]}
                  >
                    {FIELD_LABELS[item.field] || item.field}
                  </Text>
                </View>
                <View
                  style={[
                    styles.matchBadge,
                    { backgroundColor: getMatchColor(item.matchPercent) + "18" },
                  ]}
                >
                  <Text
                    style={[
                      T.microBold,
                      { color: getMatchColor(item.matchPercent) },
                    ]}
                  >
                    {item.matchPercent}% 매칭
                  </Text>
                </View>
              </View>

              <Text style={[T.title, { color: CLight.gray900, marginTop: 8 }]}>
                {item.title}
              </Text>
              <Text
                style={[T.small, { color: CLight.gray500, marginTop: 6 }]}
                numberOfLines={2}
              >
                {item.description}
              </Text>

              {/* Match bar */}
              <View style={styles.matchBarContainer}>
                <View style={styles.matchBarBg}>
                  <View
                    style={[
                      styles.matchBarFill,
                      {
                        width: `${item.matchPercent}%`,
                        backgroundColor: getMatchColor(item.matchPercent),
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Footer */}
              <View style={styles.cardFooter}>
                <Text style={[T.micro, { color: CLight.gray400 }]}>
                  마감: {item.deadline}
                </Text>
                <View
                  style={[
                    styles.dDayBadge,
                    getDaysLeft(item.deadline).includes("마감")
                      ? { backgroundColor: CLight.red + "18" }
                      : {},
                  ]}
                >
                  <Text
                    style={[
                      T.microBold,
                      {
                        color: getDaysLeft(item.deadline).includes("마감")
                          ? CLight.red
                          : CLight.pink,
                      },
                    ]}
                  >
                    {getDaysLeft(item.deadline)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.applyBtn}>
                <Text style={[T.captionBold, { color: CLight.white }]}>
                  상세 보기
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CLight.white,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  tabActive: {
    backgroundColor: CLight.pink,
    borderColor: CLight.pink,
  },
  tabText: { ...T.captionBold, color: CLight.gray500 },
  tabTextActive: { color: CLight.white },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  summaryCard: {
    backgroundColor: CLight.pinkSoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  emptyContainer: { paddingTop: 60 },
  card: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchBarContainer: { marginTop: 12 },
  matchBarBg: {
    height: 6,
    backgroundColor: CLight.gray100,
    borderRadius: 3,
    overflow: "hidden",
  },
  matchBarFill: {
    height: 6,
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  dDayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: CLight.pinkSoft,
  },
  applyBtn: {
    marginTop: 12,
    backgroundColor: CLight.pink,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
});
