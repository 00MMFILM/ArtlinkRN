import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Modal,
  Dimensions,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import { GENDER_OPTIONS, SPECIALTY_SUGGESTIONS, CAREER_TYPES, calculateAge, FIELDS } from "../utils/helpers";
import TopBar from "../components/TopBar";

const SCREEN_W = Dimensions.get("window").width;

const DEMO_ACTORS = [
  { id: 1, name: "김수현", fields: ["acting"], gender: "male", birthDate: "1998-03-15", height: 178, weight: 72, specialties: ["검도", "수영", "영어"], career: [{ title: "드라마 '별의 시간'", role: "주연", year: "2025", type: "drama" }, { title: "영화 '그림자'", role: "조연", year: "2024", type: "film" }], location: "서울", agency: "스타엔터", score: 94, notes: 156, streak: 45 },
  { id: 2, name: "이지은", fields: ["music", "acting"], gender: "female", birthDate: "1999-05-20", height: 165, weight: 50, specialties: ["피아노", "영어", "발레"], career: [{ title: "뮤지컬 'Spring'", role: "주연", year: "2025", type: "musical" }], location: "서울", agency: "", score: 91, notes: 203, streak: 32 },
  { id: 3, name: "박서준", fields: ["acting", "film"], gender: "male", birthDate: "1997-07-10", height: 182, weight: 75, specialties: ["태권도", "운전", "승마"], career: [{ title: "영화 '도시의 밤'", role: "주연", year: "2025", type: "film" }, { title: "드라마 '첫사랑'", role: "주연", year: "2024", type: "drama" }], location: "서울", agency: "아티스트컴퍼니", score: 88, notes: 98, streak: 28 },
  { id: 4, name: "최예나", fields: ["dance", "music"], gender: "female", birthDate: "2001-11-03", height: 170, weight: 52, specialties: ["발레", "요가", "필라테스"], career: [{ title: "국립무용단 시즌공연", role: "객원", year: "2025", type: "other" }], location: "서울", agency: "", score: 85, notes: 134, streak: 21 },
  { id: 5, name: "정호연", fields: ["art"], gender: "female", birthDate: "1996-01-22", height: 175, weight: 55, specialties: ["영어", "일본어"], career: [{ title: "서울아트페어", role: "참여작가", year: "2025", type: "other" }], location: "서울", agency: "", score: 82, notes: 67, streak: 15 },
  { id: 6, name: "한소희", fields: ["film", "acting"], gender: "female", birthDate: "2000-08-18", height: 168, weight: 49, specialties: ["수영", "요가"], career: [{ title: "단편영화 '빛'", role: "주연", year: "2025", type: "short_film" }, { title: "웹드라마 '연결'", role: "주연", year: "2024", type: "web_drama" }], location: "서울", agency: "키이스트", score: 79, notes: 112, streak: 19 },
  { id: 7, name: "김민재", fields: ["acting"], gender: "male", birthDate: "1995-04-12", height: 185, weight: 80, specialties: ["복싱", "운전", "기타연주"], career: [{ title: "뮤지컬 '시카고'", role: "앙상블", year: "2024", type: "musical" }], location: "부산", agency: "", score: 76, notes: 89, streak: 12 },
  { id: 8, name: "서윤아", fields: ["literature", "film"], gender: "female", birthDate: "1993-12-05", height: 162, weight: 48, specialties: ["영어", "피아노"], career: [{ title: "문학잡지 '새길' 등단", role: "소설가", year: "2023", type: "other" }], location: "제주", agency: "", score: 73, notes: 210, streak: 60 },
];

const DEMO_STATS = { registeredArtists: 1247, activeProjects: 23, castingProposals: 89, matchRate: 76 };

const DEMO_ACTIVITIES = [
  { id: 1, type: "casting", text: "'빛의 경계' 프로젝트에 3명의 아티스트가 지원했습니다.", time: "30분 전" },
  { id: 2, type: "match", text: "김수현 님이 뮤지컬 'Seasons' 캐스팅에 92% 매칭되었습니다.", time: "2시간 전" },
  { id: 3, type: "project", text: "새 프로젝트 '도시의 밤' 등록이 완료되었습니다.", time: "5시간 전" },
  { id: 4, type: "casting", text: "'새벽의 문' 오디션에 12명의 지원자가 접수되었습니다.", time: "어제" },
];

const ACTIVITY_ICONS = { casting: { icon: "C", color: CLight.pink }, match: { icon: "M", color: CLight.green }, project: { icon: "P", color: CLight.blue }, report: { icon: "R", color: CLight.orange } };

export default function B2BDashboardScreen({ navigation }) {
  const { showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterGender, setFilterGender] = useState("");
  const [filterAgeMin, setFilterAgeMin] = useState("");
  const [filterAgeMax, setFilterAgeMax] = useState("");
  const [filterHeightMin, setFilterHeightMin] = useState("");
  const [filterHeightMax, setFilterHeightMax] = useState("");
  const [filterField, setFilterField] = useState("");
  const [filterSpecialties, setFilterSpecialties] = useState([]);
  const [filterLocation, setFilterLocation] = useState("");
  const [selectedActor, setSelectedActor] = useState(null);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterGender) count++;
    if (filterAgeMin || filterAgeMax) count++;
    if (filterHeightMin || filterHeightMax) count++;
    if (filterField) count++;
    if (filterSpecialties.length > 0) count++;
    if (filterLocation) count++;
    return count;
  }, [filterGender, filterAgeMin, filterAgeMax, filterHeightMin, filterHeightMax, filterField, filterSpecialties, filterLocation]);

  const filteredArtists = useMemo(() => {
    return DEMO_ACTORS.filter((a) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = a.name.toLowerCase().includes(q);
        const matchField = (a.fields || []).some((f) => (FIELD_LABELS[f] || "").includes(q));
        const matchSpec = (a.specialties || []).some((s) => s.includes(q));
        if (!matchName && !matchField && !matchSpec) return false;
      }
      if (filterGender && a.gender !== filterGender) return false;
      const age = calculateAge(a.birthDate);
      if (filterAgeMin && age && age < Number(filterAgeMin)) return false;
      if (filterAgeMax && age && age > Number(filterAgeMax)) return false;
      if (filterHeightMin && a.height && a.height < Number(filterHeightMin)) return false;
      if (filterHeightMax && a.height && a.height > Number(filterHeightMax)) return false;
      if (filterField && !(a.fields || []).includes(filterField)) return false;
      if (filterSpecialties.length > 0 && !filterSpecialties.some((s) => (a.specialties || []).includes(s))) return false;
      if (filterLocation && a.location && !a.location.includes(filterLocation)) return false;
      return true;
    });
  }, [searchQuery, filterGender, filterAgeMin, filterAgeMax, filterHeightMin, filterHeightMax, filterField, filterSpecialties, filterLocation]);

  const clearFilters = () => {
    setFilterGender("");
    setFilterAgeMin("");
    setFilterAgeMax("");
    setFilterHeightMin("");
    setFilterHeightMax("");
    setFilterField("");
    setFilterSpecialties([]);
    setFilterLocation("");
  };

  const renderActorCard = useCallback((actor) => {
    const age = calculateAge(actor.birthDate);
    const genderLabel = GENDER_OPTIONS.find((g) => g.key === actor.gender)?.label || "";
    const primaryField = actor.fields?.[0];
    const fieldColor = FIELD_COLORS[primaryField] || CLight.pink;

    return (
      <TouchableOpacity key={actor.id} style={styles.actorCard} onPress={() => setSelectedActor(actor)} activeOpacity={0.7}>
        <View style={styles.actorRow}>
          <View style={[styles.actorAvatar, { backgroundColor: fieldColor + "18" }]}>
            <Text style={[T.bodyBold, { color: fieldColor }]}>{actor.name.charAt(0)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[T.captionBold, { color: CLight.gray900 }]}>{actor.name}</Text>
              {actor.agency ? <Text style={[T.tiny, { color: CLight.gray400 }]}>{actor.agency}</Text> : null}
            </View>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>
              {genderLabel}{age ? ` | ${age}세` : ""}{actor.height ? ` | ${actor.height}cm` : ""}
            </Text>
            <Text style={[T.micro, { color: fieldColor, marginTop: 2 }]}>
              {(actor.fields || []).map((f) => FIELD_LABELS[f] || f).join(", ")}
            </Text>
          </View>
          <View style={styles.scoreCircle}>
            <Text style={[T.captionBold, { color: CLight.pink }]}>{actor.score}</Text>
          </View>
        </View>
        {/* Specialties pills */}
        {actor.specialties && actor.specialties.length > 0 && (
          <View style={styles.specRow}>
            {actor.specialties.slice(0, 4).map((s) => (
              <View key={s} style={styles.specPill}>
                <Text style={styles.specPillText}>{s}</Text>
              </View>
            ))}
            {actor.specialties.length > 4 && (
              <Text style={[T.tiny, { color: CLight.gray400 }]}>+{actor.specialties.length - 4}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }, []);

  const renderActorDetailModal = () => {
    if (!selectedActor) return null;
    const actor = selectedActor;
    const age = calculateAge(actor.birthDate);
    const genderLabel = GENDER_OPTIONS.find((g) => g.key === actor.gender)?.label || "";
    const primaryField = actor.fields?.[0];
    const fieldColor = FIELD_COLORS[primaryField] || CLight.pink;

    return (
      <Modal visible={!!selectedActor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedActor(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedActor(null)}>
              <Text style={[T.body, { color: CLight.gray500 }]}>닫기</Text>
            </TouchableOpacity>
            <Text style={[T.title, { color: CLight.gray900 }]}>배우 상세</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {/* Profile header */}
            <View style={styles.modalProfile}>
              <View style={[styles.modalAvatar, { backgroundColor: fieldColor + "18" }]}>
                <Text style={{ fontSize: 32, color: fieldColor }}>{FIELD_EMOJIS[primaryField] || actor.name.charAt(0)}</Text>
              </View>
              <Text style={[T.h2, { color: CLight.gray900, marginTop: 12 }]}>{actor.name}</Text>
              {actor.agency ? <Text style={[T.caption, { color: CLight.gray500, marginTop: 2 }]}>{actor.agency}</Text> : null}
              <View style={styles.modalBadgeRow}>
                {genderLabel ? <View style={styles.modalBadge}><Text style={styles.modalBadgeText}>{genderLabel}</Text></View> : null}
                {age ? <View style={styles.modalBadge}><Text style={styles.modalBadgeText}>{age}세</Text></View> : null}
                {actor.height ? <View style={styles.modalBadge}><Text style={styles.modalBadgeText}>{actor.height}cm</Text></View> : null}
                {actor.weight ? <View style={styles.modalBadge}><Text style={styles.modalBadgeText}>{actor.weight}kg</Text></View> : null}
              </View>
            </View>

            {/* Fields */}
            <Text style={styles.modalSectionTitle}>분야</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(actor.fields || []).map((f) => (
                <View key={f} style={[styles.fieldTag, { backgroundColor: (FIELD_COLORS[f] || CLight.pink) + "18" }]}>
                  <Text style={{ fontSize: 14 }}>{FIELD_EMOJIS[f]}</Text>
                  <Text style={[T.caption, { color: FIELD_COLORS[f] || CLight.pink, fontWeight: "600" }]}>{FIELD_LABELS[f]}</Text>
                </View>
              ))}
            </View>

            {/* Specialties */}
            {actor.specialties && actor.specialties.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>특기</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {actor.specialties.map((s) => (
                    <View key={s} style={styles.specPill}>
                      <Text style={styles.specPillText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Career */}
            {actor.career && actor.career.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>경력</Text>
                {actor.career.map((c, i) => (
                  <View key={i} style={styles.careerRow}>
                    <View style={styles.careerDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={[T.captionBold, { color: CLight.gray900 }]}>{c.title}</Text>
                      <Text style={[T.micro, { color: CLight.gray500 }]}>
                        {c.role} | {c.year} | {CAREER_TYPES.find((ct) => ct.key === c.type)?.label || c.type}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Skill bar */}
            <Text style={styles.modalSectionTitle}>종합 점수</Text>
            <View style={styles.modalScoreSection}>
              <View style={styles.modalScoreBarBg}>
                <View style={[styles.modalScoreBarFill, { width: `${actor.score}%`, backgroundColor: fieldColor }]} />
              </View>
              <Text style={[T.bodyBold, { color: fieldColor }]}>{actor.score}점</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 20, marginTop: 8 }}>
              <Text style={[T.micro, { color: CLight.gray500 }]}>노트 {actor.notes}개</Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>{actor.streak}일 연속</Text>
              {actor.location ? <Text style={[T.micro, { color: CLight.gray500 }]}>{actor.location}</Text> : null}
            </View>

            {/* Casting proposal button */}
            <TouchableOpacity style={styles.castingBtn} onPress={() => { setSelectedActor(null); showToast("캐스팅 제안이 전송되었습니다!", "success"); }} activeOpacity={0.7}>
              <Text style={[T.bodyBold, { color: CLight.white }]}>캐스팅 제안</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Stats overview */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: CLight.pink }]}>
            <Text style={[T.h2, { color: CLight.pink }]}>{DEMO_STATS.registeredArtists.toLocaleString()}</Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>등록 아티스트</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: CLight.blue }]}>
            <Text style={[T.h2, { color: CLight.blue }]}>{DEMO_STATS.activeProjects}</Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>활성 프로젝트</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: CLight.purple }]}>
            <Text style={[T.h2, { color: CLight.purple }]}>{DEMO_STATS.castingProposals}</Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>캐스팅 제안</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: CLight.green }]}>
            <Text style={[T.h2, { color: CLight.green }]}>{DEMO_STATS.matchRate}%</Text>
            <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>매칭 성공률</Text>
          </View>
        </View>

        {/* Search + Filter */}
        <View style={styles.searchFilterRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="이름, 분야, 특기로 검색..."
            placeholderTextColor={CLight.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]} onPress={() => setShowFilters(!showFilters)}>
            <Text style={[T.captionBold, { color: activeFilterCount > 0 ? CLight.white : CLight.gray700 }]}>
              {activeFilterCount > 0 ? `필터 (${activeFilterCount})` : "필터"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Collapsible Filters */}
        {showFilters && (
          <View style={styles.filterPanel}>
            <Text style={styles.filterLabel}>성별</Text>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.fPill, !filterGender && styles.fPillActive]} onPress={() => setFilterGender("")}>
                <Text style={[styles.fPillText, !filterGender && styles.fPillTextActive]}>전체</Text>
              </TouchableOpacity>
              {GENDER_OPTIONS.map((g) => (
                <TouchableOpacity key={g.key} style={[styles.fPill, filterGender === g.key && styles.fPillActive]} onPress={() => setFilterGender(filterGender === g.key ? "" : g.key)}>
                  <Text style={[styles.fPillText, filterGender === g.key && styles.fPillTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterLabel}>나이</Text>
            <View style={styles.filterRow}>
              <TextInput style={styles.filterSmallInput} placeholder="최소" placeholderTextColor={CLight.gray400} value={filterAgeMin} onChangeText={setFilterAgeMin} keyboardType="number-pad" maxLength={2} />
              <Text style={[T.micro, { color: CLight.gray400 }]}>~</Text>
              <TextInput style={styles.filterSmallInput} placeholder="최대" placeholderTextColor={CLight.gray400} value={filterAgeMax} onChangeText={setFilterAgeMax} keyboardType="number-pad" maxLength={2} />
              <Text style={[T.micro, { color: CLight.gray400 }]}>세</Text>
            </View>

            <Text style={styles.filterLabel}>키</Text>
            <View style={styles.filterRow}>
              <TextInput style={styles.filterSmallInput} placeholder="최소" placeholderTextColor={CLight.gray400} value={filterHeightMin} onChangeText={setFilterHeightMin} keyboardType="number-pad" maxLength={3} />
              <Text style={[T.micro, { color: CLight.gray400 }]}>~</Text>
              <TextInput style={styles.filterSmallInput} placeholder="최대" placeholderTextColor={CLight.gray400} value={filterHeightMax} onChangeText={setFilterHeightMax} keyboardType="number-pad" maxLength={3} />
              <Text style={[T.micro, { color: CLight.gray400 }]}>cm</Text>
            </View>

            <Text style={styles.filterLabel}>분야</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity style={[styles.fPill, !filterField && styles.fPillActive]} onPress={() => setFilterField("")}>
                <Text style={[styles.fPillText, !filterField && styles.fPillTextActive]}>전체</Text>
              </TouchableOpacity>
              {FIELDS.map((f) => (
                <TouchableOpacity key={f} style={[styles.fPill, filterField === f && styles.fPillActive]} onPress={() => setFilterField(filterField === f ? "" : f)}>
                  <Text style={[styles.fPillText, filterField === f && styles.fPillTextActive]}>{FIELD_EMOJIS[f]} {FIELD_LABELS[f]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>특기</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {SPECIALTY_SUGGESTIONS.slice(0, 10).map((s) => {
                const isSelected = filterSpecialties.includes(s);
                return (
                  <TouchableOpacity key={s} style={[styles.fPill, isSelected && styles.fPillActive]} onPress={() => setFilterSpecialties(isSelected ? filterSpecialties.filter((x) => x !== s) : [...filterSpecialties, s])}>
                    <Text style={[styles.fPillText, isSelected && styles.fPillTextActive]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterLabel}>지역</Text>
            <TextInput style={styles.filterLocationInput} placeholder="서울" placeholderTextColor={CLight.gray400} value={filterLocation} onChangeText={setFilterLocation} />

            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.clearFilterBtn} onPress={clearFilters}>
                <Text style={[T.caption, { color: CLight.pink }]}>필터 초기화</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Actor list */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 16, marginBottom: 12 }]}>
          아티스트 ({filteredArtists.length})
        </Text>
        {filteredArtists.map(renderActorCard)}
        {filteredArtists.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={[T.small, { color: CLight.gray400, textAlign: "center" }]}>검색 결과가 없습니다.</Text>
          </View>
        )}

        {/* Recent activity */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>최근 활동</Text>
        <View style={styles.activityCard}>
          {DEMO_ACTIVITIES.map((activity, idx) => {
            const iconInfo = ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.project;
            return (
              <View key={activity.id} style={[styles.activityRow, idx < DEMO_ACTIVITIES.length - 1 && styles.activityBorder]}>
                <View style={[styles.activityIcon, { backgroundColor: iconInfo.color + "18" }]}>
                  <Text style={[T.microBold, { color: iconInfo.color }]}>{iconInfo.icon}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[T.small, { color: CLight.gray700 }]}>{activity.text}</Text>
                  <Text style={[T.tiny, { color: CLight.gray400, marginTop: 3 }]}>{activity.time}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderActorDetailModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%", flexGrow: 1, backgroundColor: CLight.white, borderRadius: 14, padding: 16, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },

  searchFilterRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 8 },
  searchInput: { flex: 1, backgroundColor: CLight.white, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, ...T.body, color: CLight.gray900 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: CLight.white, borderWidth: 1, borderColor: CLight.gray200, justifyContent: "center" },
  filterBtnActive: { backgroundColor: CLight.pink, borderColor: CLight.pink },

  // Filter panel
  filterPanel: { backgroundColor: CLight.white, borderRadius: 16, padding: 16, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  filterLabel: { ...T.captionBold, color: CLight.gray700, marginBottom: 6, marginTop: 10 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterSmallInput: { width: 64, height: 38, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 10, paddingHorizontal: 8, textAlign: "center", ...T.caption, color: CLight.gray900 },
  filterLocationInput: { height: 38, backgroundColor: CLight.inputBg, borderWidth: 1, borderColor: CLight.inputBorder, borderRadius: 10, paddingHorizontal: 12, ...T.caption, color: CLight.gray900, marginBottom: 4 },
  fPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: CLight.gray200, backgroundColor: CLight.white },
  fPillActive: { borderColor: CLight.pink, backgroundColor: CLight.pinkSoft },
  fPillText: { ...T.micro, color: CLight.gray500 },
  fPillTextActive: { color: CLight.pink, fontWeight: "600" },
  clearFilterBtn: { alignSelf: "center", marginTop: 12, paddingVertical: 6, paddingHorizontal: 16 },


  // Actor card
  actorCard: { backgroundColor: CLight.white, borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  actorRow: { flexDirection: "row", alignItems: "center" },
  actorAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  scoreCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: CLight.pinkSoft, alignItems: "center", justifyContent: "center" },
  specRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  specPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: CLight.gray50, borderWidth: 1, borderColor: CLight.gray200 },
  specPillText: { ...T.tiny, color: CLight.gray600 || CLight.gray500 },

  emptyCard: { backgroundColor: CLight.white, borderRadius: 14, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },

  // Activity
  activityCard: { backgroundColor: CLight.white, borderRadius: 16, padding: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  activityRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: CLight.gray100 },
  activityIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  demoNotice: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: CLight.gray50, borderRadius: 10 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: CLight.bg },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CLight.gray200 },
  modalProfile: { alignItems: "center", marginBottom: 20 },
  modalAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  modalBadgeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  modalBadge: { backgroundColor: CLight.pinkSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  modalBadgeText: { ...T.micro, color: CLight.pink, fontWeight: "600" },
  modalSectionTitle: { ...T.title, color: CLight.gray900, marginTop: 20, marginBottom: 10 },
  fieldTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  careerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 10 },
  careerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CLight.pink, marginTop: 6 },
  modalScoreSection: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalScoreBarBg: { flex: 1, height: 10, backgroundColor: CLight.gray100, borderRadius: 5, overflow: "hidden" },
  modalScoreBarFill: { height: 10, borderRadius: 5 },
  castingBtn: { backgroundColor: CLight.pink, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 24, shadowColor: CLight.pink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
});
