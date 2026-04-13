import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";

const ROADMAP = [
  {
    phase: "Phase 1",
    title: "코어 기능 (v1.0)",
    color: CLight.green,
    items: [
      { text: "노트 작성/저장/삭제", done: true },
      { text: "분야별 카테고리 (연기/음악/미술/무용/문학/영화)", done: true },
      { text: "AI 코멘트 분석", done: true },
      { text: "태그 시스템", done: true },
      { text: "즐겨찾기/별표", done: true },
      { text: "로컬 데이터 저장 (AsyncStorage)", done: true },
      { text: "다크 모드", done: true },
      { text: "온보딩/프로필 설정", done: true },
    ],
  },
  {
    phase: "Phase 2",
    title: "분석 & 프로필 (v1.2)",
    color: CLight.blue,
    items: [
      { text: "아티스트 프로필 자동 생성", done: true },
      { text: "종합 점수 계산 (기록량/AI활용/다양성/깊이/꾸준함)", done: true },
      { text: "연속 기록 스트릭", done: true },
      { text: "주간 성장 리포트", done: true },
      { text: "분야 분포 통계", done: true },
      { text: "태그 클라우드", done: true },
      { text: "대표 노트 선정", done: true },
      { text: "관련 노트 추천", done: true },
    ],
  },
  {
    phase: "Phase 3",
    title: "소셜 & 공유 (v1.5)",
    color: CLight.purple,
    items: [
      { text: "공유 카드 생성 (3가지 스타일)", done: true },
      { text: "포트폴리오 자동 생성", done: true },
      { text: "커뮤니티 게시판", done: true },
    ],
  },
  {
    phase: "Phase 4",
    title: "매칭 & 비즈니스 (v2.0)",
    color: CLight.pink,
    items: [
      { text: "프로젝트/오디션 매칭", done: true },
      { text: "매칭 알고리즘 (스킬 기반)", done: true },
      { text: "알림 시스템", done: true },
      { text: "전체 기능 무료 개방", done: true },
      { text: "목표 관리", done: true },
      { text: "B2B 대시보드", done: true },
    ],
  },
];

export default function DevRoadmapScreen({ navigation }) {
  const { t } = useTranslation();
  const { userProfile } = useApp();

  const totalItems = ROADMAP.reduce((sum, phase) => sum + phase.items.length, 0);
  const doneItems = ROADMAP.reduce(
    (sum, phase) => sum + phase.items.filter((item) => item.done).length,
    0
  );
  const overallPercent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title={t("devRoadmap.title")}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} {t("common.back")}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall progress */}
        <View style={styles.overallCard}>
          <Text style={[T.title, { color: CLight.gray900 }]}>{t("devRoadmap.progress_title")}</Text>
          <View style={styles.overallRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.overallBarBg}>
                <View
                  style={[
                    styles.overallBarFill,
                    { width: `${overallPercent}%` },
                  ]}
                />
              </View>
            </View>
            <Text style={[T.h3, { color: CLight.pink, marginLeft: 12 }]}>
              {overallPercent}%
            </Text>
          </View>
          <Text style={[T.micro, { color: CLight.gray500, marginTop: 6 }]}>
            {t("devRoadmap.progress_desc", { total: totalItems, done: doneItems })}
          </Text>
        </View>

        {/* Phase cards */}
        {ROADMAP.map((phase, phaseIdx) => {
          const phaseDone = phase.items.filter((i) => i.done).length;
          const phaseTotal = phase.items.length;
          const phasePercent = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
          const isComplete = phaseDone === phaseTotal;

          return (
            <View key={phaseIdx} style={styles.phaseCard}>
              {/* Phase header */}
              <View style={styles.phaseHeader}>
                <View style={styles.phaseHeaderLeft}>
                  <View
                    style={[
                      styles.phaseBadge,
                      { backgroundColor: phase.color + "18" },
                    ]}
                  >
                    <Text style={[T.microBold, { color: phase.color }]}>
                      {phase.phase}
                    </Text>
                  </View>
                  {isComplete && (
                    <View style={[styles.completeBadge, { backgroundColor: CLight.green + "18" }]}>
                      <Text style={[T.tinyBold, { color: CLight.green }]}>{t("devRoadmap.phase_complete")}</Text>
                    </View>
                  )}
                </View>
                <Text style={[T.microBold, { color: phase.color }]}>
                  {phaseDone}/{phaseTotal}
                </Text>
              </View>

              <Text style={[T.title, { color: CLight.gray900, marginTop: 6 }]}>
                {phase.title}
              </Text>

              {/* Phase progress bar */}
              <View style={styles.phaseBarBg}>
                <View
                  style={[
                    styles.phaseBarFill,
                    { width: `${phasePercent}%`, backgroundColor: phase.color },
                  ]}
                />
              </View>

              {/* Items */}
              <View style={styles.itemList}>
                {phase.items.map((item, itemIdx) => (
                  <View key={itemIdx} style={styles.itemRow}>
                    <View
                      style={[
                        styles.checkBox,
                        item.done
                          ? { backgroundColor: phase.color, borderColor: phase.color }
                          : { borderColor: CLight.gray300 },
                      ]}
                    >
                      {item.done && (
                        <Text style={[T.tiny, { color: CLight.white, fontWeight: "700" }]}>
                          V
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        T.small,
                        {
                          color: item.done ? CLight.gray700 : CLight.gray400,
                          flex: 1,
                          marginLeft: 10,
                          textDecorationLine: item.done ? "none" : "none",
                        },
                      ]}
                    >
                      {item.text}
                    </Text>
                    {item.done && (
                      <View style={[styles.doneDot, { backgroundColor: phase.color }]} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Footer note */}
        <View style={styles.footerNote}>
          <Text style={[T.micro, { color: CLight.gray500, textAlign: "center", lineHeight: 20 }]}>
            {t("devRoadmap.footer")}
          </Text>
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
  overallCard: {
    backgroundColor: CLight.white,
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  overallBarBg: {
    height: 12,
    backgroundColor: CLight.gray100,
    borderRadius: 6,
    overflow: "hidden",
  },
  overallBarFill: {
    height: 12,
    borderRadius: 6,
    backgroundColor: CLight.pink,
  },
  phaseCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  phaseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phaseHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phaseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  phaseBarBg: {
    height: 6,
    backgroundColor: CLight.gray100,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 14,
  },
  phaseBarFill: {
    height: 6,
    borderRadius: 3,
  },
  itemList: {},
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  doneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 8,
  },
  footerNote: {
    marginTop: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: CLight.pinkSoft,
    borderRadius: 14,
  },
});
