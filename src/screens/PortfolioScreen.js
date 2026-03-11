import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import { FIELDS, calculateAge, GENDER_OPTIONS } from "../utils/helpers";
import { truncate, formatDate } from "../utils/helpers";
import TopBar from "../components/TopBar";
import EmptyState from "../components/EmptyState";
import { generatePortfolioSummary, generateStructuredPortfolio } from "../services/aiService";

const SCREEN_W = Dimensions.get("window").width;
const GRID_ITEM_SIZE = (SCREEN_W - 32 - 16) / 3;

const FIELD_TABS = [
  { key: "all", label: "전체", emoji: "📋" },
  ...FIELDS.map((f) => ({ key: f, label: FIELD_LABELS[f] || f, emoji: FIELD_EMOJIS[f] || "📝" })),
];

export default function PortfolioScreen({ navigation }) {
  const {
    artistProfile, userProfile, savedNotes,
    portfolioItems, portfolioSummary,
    handleAddPortfolioItem, handleDeletePortfolioItem, handleUpdatePortfolioSummary,
  } = useApp();

  const [selectedField, setSelectedField] = useState("all");
  const [addField, setAddField] = useState(userProfile.fields?.[0] || "acting");
  const [addDescription, setAddDescription] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);

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

  const filteredItems = useMemo(() => {
    if (selectedField === "all") return portfolioItems;
    return portfolioItems.filter((item) => item.field === selectedField);
  }, [portfolioItems, selectedField]);

  // ─── Media Handlers ───

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "카메라 사용을 위해 권한을 허용해주세요.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      handleAddPortfolioItem({
        uri: result.assets[0].uri,
        type: "photo",
        field: addField,
        description: addDescription,
      });
      setAddDescription("");
    }
  }, [addField, addDescription, handleAddPortfolioItem]);

  const handlePickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "갤러리 접근을 위해 권한을 허용해주세요.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      result.assets.forEach((asset) => {
        handleAddPortfolioItem({
          uri: asset.uri,
          type: asset.type === "video" ? "video" : "photo",
          field: addField,
          description: addDescription,
        });
      });
      setAddDescription("");
    }
  }, [addField, addDescription, handleAddPortfolioItem]);

  const confirmDeleteItem = useCallback((itemId) => {
    Alert.alert("삭제", "이 포트폴리오 항목을 삭제할까요?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => handleDeletePortfolioItem(itemId) },
    ]);
  }, [handleDeletePortfolioItem]);

  const handleGenerateCard = useCallback(async () => {
    setCardLoading(true);
    try {
      const text = await generateStructuredPortfolio(userProfile, portfolioItems, artistProfile, savedNotes);
      handleUpdatePortfolioSummary({
        ...portfolioSummary,
        cardText: text,
        cardGeneratedAt: new Date().toISOString(),
      });
    } catch {
      Alert.alert("생성 실패", "프로필 카드 생성에 실패했습니다.");
    } finally {
      setCardLoading(false);
    }
  }, [userProfile, portfolioItems, artistProfile, savedNotes, portfolioSummary, handleUpdatePortfolioSummary]);

  const handleGenerateSummary = useCallback(async () => {
    if (portfolioItems.length === 0) {
      Alert.alert("포트폴리오 필요", "포트폴리오에 작품을 먼저 추가해주세요.");
      return;
    }
    setSummaryLoading(true);
    try {
      const text = await generatePortfolioSummary(portfolioItems, userProfile, artistProfile);
      handleUpdatePortfolioSummary({ summaryText: text, generatedAt: new Date().toISOString() });
    } catch {
      Alert.alert("생성 실패", "요약 생성에 실패했습니다.");
    } finally {
      setSummaryLoading(false);
    }
  }, [portfolioItems, userProfile, artistProfile, handleUpdatePortfolioSummary]);

  // ─── Render ───

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
        {/* ─── Header Card ─── */}
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
          {/* Body info badges */}
          {(userProfile.gender || userProfile.birthDate || userProfile.height) ? (
            <View style={styles.bodyBadgeRow}>
              {userProfile.gender ? (
                <View style={styles.bodyBadge}>
                  <Text style={styles.bodyBadgeText}>{GENDER_OPTIONS.find((g) => g.key === userProfile.gender)?.label || ""}</Text>
                </View>
              ) : null}
              {userProfile.birthDate ? (
                <View style={styles.bodyBadge}>
                  <Text style={styles.bodyBadgeText}>{calculateAge(userProfile.birthDate)}세</Text>
                </View>
              ) : null}
              {userProfile.height ? (
                <View style={styles.bodyBadge}>
                  <Text style={styles.bodyBadgeText}>{userProfile.height}cm</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.quickStats}>
            <View style={styles.statItem}>
              <Text style={[T.h3, { color: CLight.pink }]}>{portfolioItems.length}</Text>
              <Text style={[T.micro, { color: CLight.gray500 }]}>작품</Text>
            </View>
            <View style={styles.statDivider} />
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

        {/* ─── AI Profile Card ─── */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          AI 프로필 카드
        </Text>
        {portfolioSummary?.cardText ? (
          <View style={styles.profileCard}>
            <Text style={[T.body, { color: CLight.gray700, lineHeight: 24 }]}>
              {portfolioSummary.cardText}
            </Text>
            <TouchableOpacity style={styles.summaryRefreshBtn} onPress={handleGenerateCard} disabled={cardLoading}>
              {cardLoading ? (
                <ActivityIndicator size="small" color={CLight.pink} />
              ) : (
                <Text style={[T.micro, { color: CLight.pink }]}>재생성</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.aiGenerateBtn} onPress={handleGenerateCard} disabled={cardLoading} activeOpacity={0.7}>
            {cardLoading ? (
              <ActivityIndicator size="small" color={CLight.white} />
            ) : (
              <Text style={[T.captionBold, { color: CLight.white }]}>AI 프로필 카드 생성</Text>
            )}
          </TouchableOpacity>
        )}

        {/* ─── AI Summary ─── */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          AI 소개글
        </Text>
        {portfolioSummary ? (
          <View style={styles.summaryCard}>
            <Text style={[T.body, { color: CLight.gray700, lineHeight: 24 }]}>
              {portfolioSummary.summaryText}
            </Text>
            <TouchableOpacity
              style={styles.summaryRefreshBtn}
              onPress={handleGenerateSummary}
              disabled={summaryLoading}
            >
              {summaryLoading ? (
                <ActivityIndicator size="small" color={CLight.pink} />
              ) : (
                <Text style={[T.micro, { color: CLight.pink }]}>재생성</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.aiGenerateBtn}
            onPress={handleGenerateSummary}
            disabled={summaryLoading}
            activeOpacity={0.7}
          >
            {summaryLoading ? (
              <ActivityIndicator size="small" color={CLight.white} />
            ) : (
              <Text style={[T.captionBold, { color: CLight.white }]}>
                ✨ AI 소개글 생성
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* ─── Gallery Section ─── */}
        <Text style={[T.title, { color: CLight.gray900, marginTop: 24, marginBottom: 12 }]}>
          갤러리 ({portfolioItems.length})
        </Text>

        {/* Add media controls */}
        <View style={styles.card}>
          {/* Field selector for new items */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, marginBottom: 10 }}
          >
            {FIELDS.map((f) => {
              const isActive = addField === f;
              const color = FIELD_COLORS[f] || CLight.gray500;
              return (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.fieldChip,
                    { backgroundColor: isActive ? `${color}15` : CLight.gray100, borderColor: isActive ? color : "transparent", borderWidth: 1 },
                  ]}
                  onPress={() => setAddField(f)}
                >
                  <Text style={{ fontSize: 13 }}>{FIELD_EMOJIS[f]}</Text>
                  <Text style={[T.micro, { color: isActive ? color : CLight.gray500, fontWeight: isActive ? "600" : "400" }]}>
                    {FIELD_LABELS[f]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Description input */}
          <TextInput
            style={styles.descInput}
            placeholder="작품 설명 (선택)"
            placeholderTextColor={CLight.gray400}
            value={addDescription}
            onChangeText={setAddDescription}
            maxLength={100}
          />

          {/* Media buttons */}
          <View style={styles.mediaButtonRow}>
            <TouchableOpacity style={styles.mediaBtn} onPress={handleTakePhoto} activeOpacity={0.7}>
              <Text style={{ fontSize: 16 }}>📷</Text>
              <Text style={[T.caption, { color: CLight.gray700 }]}>촬영</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={handlePickMedia} activeOpacity={0.7}>
              <Text style={{ fontSize: 16 }}>🖼️</Text>
              <Text style={[T.caption, { color: CLight.gray700 }]}>갤러리</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Field filter tabs */}
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {FIELD_TABS.map((tab) => {
              const isActive = selectedField === tab.key;
              const color = tab.key === "all" ? CLight.pink : FIELD_COLORS[tab.key] || CLight.gray500;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.filterTab,
                    {
                      backgroundColor: isActive ? `${color}15` : CLight.white,
                      borderColor: isActive ? color : CLight.gray200,
                      borderWidth: isActive ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => setSelectedField(tab.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.filterEmoji}>{tab.emoji}</Text>
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: isActive ? color : CLight.gray500, fontWeight: isActive ? "600" : "400" },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Grid */}
        {filteredItems.length > 0 ? (
          <View style={styles.gridContainer}>
            {filteredItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.gridItem, { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE }]}
                onLongPress={() => confirmDeleteItem(item.id)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: item.uri }} style={styles.gridImage} />
                {item.type === "video" && (
                  <View style={styles.videoOverlay}>
                    <Text style={styles.videoOverlayText}>▶</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.gridFieldBadge,
                    { backgroundColor: (FIELD_COLORS[item.field] || CLight.pink) + "CC" },
                  ]}
                >
                  <Text style={{ fontSize: 10 }}>{FIELD_EMOJIS[item.field] || ""}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="🎨"
            title="포트폴리오가 비어있어요"
            message="위의 버튼으로 작품을 추가해보세요!"
          />
        )}

        {/* ─── Skill Scores ─── */}
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

        {/* ─── Featured Notes ─── */}
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

        {/* ─── Field Distribution ─── */}
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

  // Header
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
  bodyBadgeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  bodyBadge: { backgroundColor: CLight.pinkSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  bodyBadgeText: { fontSize: 11, color: CLight.pink, fontWeight: "600" },
  profileCard: {
    backgroundColor: CLight.white, borderRadius: 16, padding: 16,
    borderLeftWidth: 4, borderLeftColor: CLight.pink,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },

  // AI Summary
  summaryCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: CLight.pink,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRefreshBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  aiGenerateBtn: {
    backgroundColor: CLight.pink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  // Gallery controls
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
  fieldChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  descInput: {
    backgroundColor: CLight.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    ...T.caption,
    color: CLight.gray900,
  },
  mediaButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CLight.gray50,
    borderWidth: 1,
    borderColor: CLight.gray200,
  },

  // Filter tabs
  filterSection: { marginTop: 12, marginBottom: 12 },
  filterScroll: { gap: 8 },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  filterEmoji: { fontSize: 14 },
  filterLabel: { fontSize: 13 },

  // Grid
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridItem: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: CLight.gray100,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 10,
  },
  videoOverlayText: { fontSize: 22, color: CLight.white },
  gridFieldBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Score bars
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

  // Notes
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

  // Field distribution
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
