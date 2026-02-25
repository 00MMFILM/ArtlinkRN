import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS } from "../constants/theme";
import TopBar from "../components/TopBar";

const DEMO_STATS = {
  registeredArtists: 1247,
  activeProjects: 23,
  castingProposals: 89,
  matchRate: 76,
};

const DEMO_ARTISTS = [
  { id: 1, name: "김수현", field: "acting", score: 94, notes: 156, streak: 45 },
  { id: 2, name: "이지은", field: "music", score: 91, notes: 203, streak: 32 },
  { id: 3, name: "박서준", field: "acting", score: 88, notes: 98, streak: 28 },
  { id: 4, name: "최예나", field: "dance", score: 85, notes: 134, streak: 21 },
  { id: 5, name: "정호연", field: "art", score: 82, notes: 67, streak: 15 },
  { id: 6, name: "한소희", field: "film", score: 79, notes: 112, streak: 19 },
];

const DEMO_ACTIVITIES = [
  {
    id: 1,
    type: "casting",
    text: "'빛의 경계' 프로젝트에 3명의 아티스트가 지원했습니다.",
    time: "30분 전",
  },
  {
    id: 2,
    type: "match",
    text: "김수현 님이 뮤지컬 'Seasons' 캐스팅에 92% 매칭되었습니다.",
    time: "2시간 전",
  },
  {
    id: 3,
    type: "project",
    text: "새 프로젝트 '도시의 밤' 등록이 완료되었습니다.",
    time: "5시간 전",
  },
  {
    id: 4,
    type: "casting",
    text: "'새벽의 문' 오디션에 12명의 지원자가 접수되었습니다.",
    time: "어제",
  },
  {
    id: 5,
    type: "report",
    text: "2월 월간 리포트가 생성되었습니다. 확인해보세요.",
    time: "2일 전",
  },
];

const ACTIVITY_ICONS = {
  casting: { icon: "C", color: CLight.pink },
  match: { icon: "M", color: CLight.green },
  project: { icon: "P", color: CLight.blue },
  report: { icon: "R", color: CLight.orange },
};

export default function B2BDashboardScreen({ navigation }) {
  const { subscription } = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredArtists = DEMO_ARTISTS.filter((a) =>
    searchQuery.trim()
      ? a.name.includes(searchQuery) ||
        (FIELD_LABELS[a.field] || "").includes(searchQuery)
      : true
  );

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="B2B 대시보드"
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
        {/* Stats overview */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: CLight.pink }]}>
            <Text style={[T.h2, { color: CLight.pink }]}>
              {DEMO_STATS.registeredArtists.toLocaleString()}
            </Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>
              등록 아티스트
            </Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: CLight.blue }]}>
            <Text style={[T.h2, { color: CLight.blue }]}>
              {DEMO_STATS.activeProjects}
            </Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>
              활성 프로젝트
            </Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: CLight.purple }]}>
            <Text style={[T.h2, { color: CLight.purple }]}>
              {DEMO_STATS.castingProposals}
            </Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>
              캐스팅 제안
            </Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: CLight.green }]}>
            <Text style={[T.h2, { color: CLight.green }]}>
              {DEMO_STATS.matchRate}%
            </Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>
              매칭 성공률
            </Text>
          </View>
        </View>

        {/* Artist search */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          아티스트 검색
        </Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="이름 또는 분야로 검색..."
            placeholderTextColor={CLight.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Artist list */}
        {filteredArtists.map((artist) => (
          <View key={artist.id} style={styles.artistCard}>
            <View style={styles.artistRow}>
              <View
                style={[
                  styles.artistAvatar,
                  { backgroundColor: (FIELD_COLORS[artist.field] || CLight.pink) + "18" },
                ]}
              >
                <Text
                  style={[
                    T.captionBold,
                    { color: FIELD_COLORS[artist.field] || CLight.pink },
                  ]}
                >
                  {artist.name.charAt(0)}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[T.captionBold, { color: CLight.gray900 }]}>
                  {artist.name}
                </Text>
                <Text style={[T.micro, { color: CLight.gray500 }]}>
                  {FIELD_LABELS[artist.field] || artist.field} | 노트 {artist.notes}개 | {artist.streak}일 연속
                </Text>
              </View>
              <View style={styles.scoreCircle}>
                <Text style={[T.captionBold, { color: CLight.pink }]}>
                  {artist.score}
                </Text>
              </View>
            </View>
            {/* Score bar */}
            <View style={styles.artistBarBg}>
              <View
                style={[
                  styles.artistBarFill,
                  {
                    width: `${artist.score}%`,
                    backgroundColor: FIELD_COLORS[artist.field] || CLight.pink,
                  },
                ]}
              />
            </View>
          </View>
        ))}

        {filteredArtists.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={[T.small, { color: CLight.gray400, textAlign: "center" }]}>
              검색 결과가 없습니다.
            </Text>
          </View>
        )}

        {/* Recent activity */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          최근 활동
        </Text>
        <View style={styles.activityCard}>
          {DEMO_ACTIVITIES.map((activity, idx) => {
            const iconInfo = ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.project;
            return (
              <View
                key={activity.id}
                style={[
                  styles.activityRow,
                  idx < DEMO_ACTIVITIES.length - 1 && styles.activityBorder,
                ]}
              >
                <View
                  style={[
                    styles.activityIcon,
                    { backgroundColor: iconInfo.color + "18" },
                  ]}
                >
                  <Text style={[T.microBold, { color: iconInfo.color }]}>
                    {iconInfo.icon}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[T.small, { color: CLight.gray700 }]}>
                    {activity.text}
                  </Text>
                  <Text style={[T.tiny, { color: CLight.gray400, marginTop: 3 }]}>
                    {activity.time}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Demo notice */}
        <View style={styles.demoNotice}>
          <Text style={[T.micro, { color: CLight.gray500, textAlign: "center" }]}>
            이 페이지는 데모 데이터를 표시하고 있습니다.{"\n"}
            실제 B2B 기능은 Premium 플랜에서 이용 가능합니다.
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: CLight.white,
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  searchContainer: { marginBottom: 12 },
  searchInput: {
    backgroundColor: CLight.white,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...T.body,
    color: CLight.gray900,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  artistCard: {
    backgroundColor: CLight.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  artistAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CLight.pinkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  artistBarBg: {
    height: 4,
    backgroundColor: CLight.gray100,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 10,
  },
  artistBarFill: {
    height: 4,
    borderRadius: 2,
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
  activityCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CLight.gray100,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  demoNotice: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: CLight.gray50,
    borderRadius: 10,
  },
});
