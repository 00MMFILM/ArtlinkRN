import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";

export default function MatchingPostDetailScreen({ route, navigation }) {
  const { post } = route.params;
  const { handleBlockUser, handleReportContent } = useApp();

  const fieldColor = FIELD_COLORS[post.field] || CLight.pink;
  const fieldEmoji = FIELD_EMOJIS[post.field] || "";
  const fieldLabel = FIELD_LABELS[post.field] || post.field;

  const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    if (diff <= 0) return "마감";
    return `D-${diff}`;
  };

  const daysLeft = getDaysLeft(post.deadline);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleReport = useCallback(() => {
    Alert.alert("게시물 관리", null, [
      {
        text: "신고하기",
        onPress: () => {
          Alert.alert("신고하기", "이 게시물을 신고하시겠습니까?", [
            { text: "취소", style: "cancel" },
            {
              text: "부적절한 콘텐츠",
              onPress: () =>
                handleReportContent({
                  contentId: post.id,
                  type: "matching_post",
                  reason: "inappropriate_content",
                  title: post.title,
                }),
            },
            {
              text: "스팸/사기",
              onPress: () =>
                handleReportContent({
                  contentId: post.id,
                  type: "matching_post",
                  reason: "spam",
                  title: post.title,
                }),
            },
          ]);
        },
      },
      {
        text: "작성자 차단",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "차단하기",
            "이 작성자를 차단하시겠습니까?\n차단하면 이 사용자의 콘텐츠가 피드에서 즉시 제거됩니다.",
            [
              { text: "취소", style: "cancel" },
              {
                text: "차단",
                style: "destructive",
                onPress: () => {
                  handleBlockUser(post.authorName || `user_${post.id}`);
                  navigation.goBack();
                },
              },
            ]
          );
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  }, [post, handleBlockUser, handleReportContent, navigation]);

  const isCrawled = post.source === "ai";

  const handleBottomAction = useCallback(() => {
    if (isCrawled && post.sourceUrl) {
      Linking.openURL(post.sourceUrl).catch(() =>
        Alert.alert("오류", "원본 사이트를 열 수 없습니다.")
      );
    } else if (post.contact) {
      const c = post.contact.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
      const isPhone = /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(c.replace(/\s/g, ""));

      const buttons = [{ text: "닫기", style: "cancel" }];
      if (isEmail) {
        buttons.unshift({ text: "메일 보내기", onPress: () => Linking.openURL(`mailto:${c}`) });
      } else if (isPhone) {
        buttons.unshift({ text: "전화하기", onPress: () => Linking.openURL(`tel:${c.replace(/\s/g, "")}`) });
      }

      Alert.alert("연락처", c, buttons);
    } else {
      Alert.alert("안내", "등록자가 연락처를 입력하지 않았습니다.");
    }
  }, [isCrawled, post.sourceUrl, post.contact]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.topBarBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.topBarBtnText}>{"←"}</Text>
        </TouchableOpacity>
        <Text style={[T.title, { color: CLight.gray900 }]}>매칭 상세</Text>
        <TouchableOpacity
          onPress={handleReport}
          style={styles.topBarBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.topBarBtnText}>{"⋯"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Card */}
        <View style={styles.card}>
          {/* Badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.fieldBadge, { backgroundColor: `${fieldColor}18` }]}>
              <Text style={[T.small, { color: fieldColor, fontWeight: "600" }]}>
                {fieldEmoji} {fieldLabel}
              </Text>
            </View>
            <View style={[styles.tabBadge]}>
              <Text style={[T.micro, { color: CLight.gray500 }]}>{post.tab}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[T.h3, { color: CLight.gray900, marginTop: 14 }]}>
            {post.title}
          </Text>

          {/* Deadline */}
          {post.deadline && (
            <View style={styles.deadlineRow}>
              <Text style={[T.caption, { color: CLight.gray500 }]}>
                마감일: {post.deadline}
              </Text>
              {daysLeft && (
                <View
                  style={[
                    styles.dDayBadge,
                    daysLeft === "마감" && { backgroundColor: `${CLight.red}18` },
                  ]}
                >
                  <Text
                    style={[
                      T.microBold,
                      { color: daysLeft === "마감" ? CLight.red : CLight.pink },
                    ]}
                  >
                    {daysLeft}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Match percent */}
          {post.matchPercent != null && (
            <View style={styles.matchSection}>
              <Text style={[T.captionBold, { color: CLight.gray700 }]}>
                매칭률
              </Text>
              <View style={styles.matchBarBg}>
                <View
                  style={[
                    styles.matchBarFill,
                    {
                      width: `${post.matchPercent}%`,
                      backgroundColor:
                        post.matchPercent >= 70
                          ? CLight.green
                          : post.matchPercent >= 40
                          ? CLight.orange
                          : CLight.gray400,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  T.microBold,
                  {
                    color:
                      post.matchPercent >= 70
                        ? CLight.green
                        : post.matchPercent >= 40
                        ? CLight.orange
                        : CLight.gray400,
                    marginTop: 4,
                  },
                ]}
              >
                {post.matchPercent}% 매칭
              </Text>
            </View>
          )}
        </View>

        {/* Description Card */}
        <View style={styles.card}>
          <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
            상세 설명
          </Text>
          <Text style={[T.body, { color: CLight.gray900, lineHeight: 26 }]}>
            {post.description}
          </Text>
        </View>

        {/* Casting Requirements */}
        {post.casting && (
          <View style={styles.card}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              캐스팅 요건
            </Text>
            {post.casting.gender && (
              <InfoRow label="성별" value={post.casting.gender} />
            )}
            {post.casting.ageRange && (
              <InfoRow label="연령" value={post.casting.ageRange} />
            )}
            {post.casting.heightRange && (
              <InfoRow label="키" value={post.casting.heightRange} />
            )}
            {post.casting.specialties?.length > 0 && (
              <InfoRow label="특기" value={post.casting.specialties.join(", ")} />
            )}
            {post.casting.location && (
              <InfoRow label="지역" value={post.casting.location} />
            )}
          </View>
        )}

        {/* Tags */}
        {post.tags?.length > 0 && (
          <View style={styles.card}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              태그
            </Text>
            <View style={styles.tagsRow}>
              {post.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={[T.small, { color: CLight.pink }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.applyBtn} onPress={handleBottomAction} activeOpacity={0.85}>
          <Text style={[T.bodyBold, { color: CLight.white }]}>
            {isCrawled ? "원본 사이트 보기" : "연락하기"}
          </Text>
        </TouchableOpacity>
        {isCrawled && post.sourcePlatform && (
          <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginTop: 6 }]}>
            {post.sourcePlatform}에서 가져온 공고입니다
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[T.caption, { color: CLight.gray500, width: 60 }]}>{label}</Text>
      <Text style={[T.caption, { color: CLight.gray900, flex: 1 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CLight.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: CLight.topBarBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: CLight.gray100,
  },
  topBarBtnText: { fontSize: 20 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },

  card: {
    backgroundColor: CLight.cardBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CLight.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  tabBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: CLight.gray100,
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  dDayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: CLight.pinkSoft,
  },
  matchSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
  },
  matchBarBg: {
    height: 8,
    backgroundColor: CLight.gray100,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  matchBarFill: {
    height: 8,
    borderRadius: 4,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: CLight.pinkSoft,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray100,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CLight.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
  },
  applyBtn: {
    backgroundColor: CLight.pink,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
});
