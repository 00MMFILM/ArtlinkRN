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
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";

export default function MatchingPostDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { post } = route.params;
  const { handleBlockUser, handleReportContent } = useApp();

  const fieldColor = FIELD_COLORS[post.field] || CLight.pink;
  const fieldEmoji = FIELD_EMOJIS[post.field] || "";
  const fieldLabel = t("fields." + post.field);

  const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    if (diff <= 0) return t("matchingDetail.deadline_expired");
    return `D-${diff}`;
  };

  const daysLeft = getDaysLeft(post.deadline);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleReport = useCallback(() => {
    Alert.alert(t("common.post_management"), null, [
      {
        text: t("common.report_title"),
        onPress: () => {
          Alert.alert(t("common.report_title"), t("common.report_confirm"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.inappropriate_content"),
              onPress: () =>
                handleReportContent({
                  contentId: post.id,
                  type: "matching_post",
                  reason: "inappropriate_content",
                  title: post.title,
                }),
            },
            {
              text: t("common.spam_scam"),
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
        text: t("common.block_author"),
        style: "destructive",
        onPress: () => {
          Alert.alert(
            t("common.block_title"),
            t("common.block_confirm", { name: post.authorName || `user_${post.id}` }),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("common.block"),
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
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [post, handleBlockUser, handleReportContent, navigation, t]);

  const isCrawled = post.source === "ai";

  const handleBottomAction = useCallback(() => {
    if (isCrawled && post.sourceUrl) {
      Linking.openURL(post.sourceUrl).catch(() =>
        Alert.alert(t("common.error"), t("matchingDetail.open_error"))
      );
    } else if (post.contact) {
      const c = post.contact.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
      const isPhone = /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(c.replace(/\s/g, ""));

      const buttons = [{ text: t("common.close"), style: "cancel" }];
      if (isEmail) {
        buttons.unshift({ text: t("matchingDetail.send_email"), onPress: () => Linking.openURL(`mailto:${c}`) });
      } else if (isPhone) {
        buttons.unshift({ text: t("matchingDetail.call"), onPress: () => Linking.openURL(`tel:${c.replace(/\s/g, "")}`) });
      }

      Alert.alert(t("matchingDetail.contact_title"), c, buttons);
    } else {
      Alert.alert(t("matchingDetail.no_contact"), t("matchingDetail.no_contact_msg"));
    }
  }, [isCrawled, post.sourceUrl, post.contact, t]);

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
        <Text style={[T.title, { color: CLight.gray900 }]}>{t("matchingDetail.title")}</Text>
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
                {t("matchingDetail.deadline_prefix", { date: post.deadline })}
              </Text>
              {daysLeft && (
                <View
                  style={[
                    styles.dDayBadge,
                    daysLeft === t("matchingDetail.deadline_expired") && { backgroundColor: `${CLight.red}18` },
                  ]}
                >
                  <Text
                    style={[
                      T.microBold,
                      { color: daysLeft === t("matchingDetail.deadline_expired") ? CLight.red : CLight.pink },
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
                {t("matchingDetail.match_rate")}
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
                {t("matchingDetail.match_percent", { percent: post.matchPercent })}
              </Text>
            </View>
          )}
        </View>

        {/* Description Card */}
        <View style={styles.card}>
          <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
            {t("matchingDetail.description")}
          </Text>
          <Text style={[T.body, { color: CLight.gray900, lineHeight: 26 }]}>
            {post.description}
          </Text>
        </View>

        {/* Casting Requirements */}
        {post.casting && (
          <View style={styles.card}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("matchingDetail.casting_requirements")}
            </Text>
            {post.casting.gender && (
              <InfoRow label={t("matchingDetail.gender")} value={post.casting.gender} />
            )}
            {post.casting.ageRange && (
              <InfoRow label={t("matchingDetail.age")} value={post.casting.ageRange} />
            )}
            {post.casting.heightRange && (
              <InfoRow label={t("matchingDetail.height")} value={post.casting.heightRange} />
            )}
            {post.casting.specialties?.length > 0 && (
              <InfoRow label={t("matchingDetail.skills")} value={post.casting.specialties.join(", ")} />
            )}
            {post.casting.location && (
              <InfoRow label={t("matchingDetail.region")} value={post.casting.location} />
            )}
          </View>
        )}

        {/* Tags */}
        {post.tags?.length > 0 && (
          <View style={styles.card}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("matchingDetail.tags")}
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
            {isCrawled ? t("matchingDetail.view_original") : t("matchingDetail.contact_action")}
          </Text>
        </TouchableOpacity>
        {isCrawled && post.sourcePlatform && (
          <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginTop: 6 }]}>
            {t("matchingDetail.source_attribution", { platform: post.sourcePlatform })}
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
