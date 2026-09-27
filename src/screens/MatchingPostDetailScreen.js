import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Linking,
  Clipboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import { resolveMatchingApplication, matchingDeadlineDays, isMatchingClosed, matchingSourceName } from "../utils/matchingApplication";

export default function MatchingPostDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { post } = route.params;
  const { handleBlockUser, handleReportContent } = useApp();

  const fieldColor = FIELD_COLORS[post.field] || CLight.pink;
  const fieldEmoji = FIELD_EMOJIS[post.field] || "";
  const fieldLabel = t("fields." + post.field);

  const getDaysLeft = (deadline) => {
    const diff = matchingDeadlineDays(deadline);
    if (diff === null) return t("matching.deadline_none");
    if (diff < 0) return t("matchingDetail.deadline_expired");
    if (diff === 0) return t("matchingDetail.deadline_today");
    return `D-${diff}`;
  };

  const closed = isMatchingClosed(post);
  const daysLeft = closed ? t("matchingDetail.deadline_expired") : getDaysLeft(post.deadline);

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

  const application = resolveMatchingApplication(post.contact, post.sourceUrl);
  const sourceName = matchingSourceName(post) || t(post.source === "ai" ? "matchingDetail.source_unknown" : "matching.badge_user");
  const directApplication = !closed && ["email", "phone", "form"].includes(application.kind);
  const actionHref = directApplication ? application.href : application.sourceUrl;
  const actionLabel = directApplication
    ? { email: "send_email", phone: "call", form: "open_form" }[application.kind]
    : application.sourceUrl ? "check_source" : "info_unavailable";

  const copyValue = useCallback((value) => {
    try {
      Clipboard.setString(value);
      Alert.alert(t("matchingDetail.copied"));
    } catch {
      Alert.alert(t("common.error"), t("matchingDetail.copy_error"));
    }
  }, [t]);

  const openLink = useCallback(async (href, copyText) => {
    if (!href) return;
    try {
      await Linking.openURL(href);
    } catch {
      Alert.alert(t("common.error"), t("matchingDetail.link_error"), [
        { text: t("matchingDetail.copy_contact"), onPress: () => copyValue(copyText) },
        { text: t("common.close"), style: "cancel" },
      ]);
    }
  }, [copyValue, t]);

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

          {/* Missing or invalid dates are unknown, not an unlimited application window. */}
          {daysLeft && (
            <View style={styles.deadlineRow}>
              {matchingDeadlineDays(post.deadline) !== null && <Text style={[T.caption, { color: CLight.gray500 }]}>
                {t("matchingDetail.deadline_prefix", { date: post.deadline })}
              </Text>}
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

          {/* Source and application instructions stay visible without opening an alert. */}
          <View style={styles.applicationSection}>
            <Text style={[T.captionBold, { color: CLight.gray700 }]}>{t("matchingDetail.source_title")}</Text>
            <Text selectable style={[T.body, { color: CLight.gray900, marginTop: 6 }]}>{sourceName}</Text>
            {!!application.sourceUrl && (
              <TouchableOpacity accessibilityRole="link" style={styles.secondaryBtn} onPress={() => openLink(application.sourceUrl, application.sourceUrl)}>
                <Text style={[T.captionBold, { color: CLight.pink }]}>{t("matchingDetail.view_original")}</Text>
              </TouchableOpacity>
            )}
            <Text style={[T.captionBold, { color: CLight.gray700, marginTop: 12 }]}>{t("matchingDetail.application_method")}</Text>
            {closed ? (
              <Text style={[T.caption, { color: CLight.red, marginTop: 6 }]}>{t("matchingDetail.closed_notice")}</Text>
            ) : application.value ? (
              <>
                <Text selectable style={[T.body, { color: CLight.gray900, marginTop: 6 }]}>{application.value}</Text>
                <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={() => copyValue(application.value)}>
                  <Text style={[T.captionBold, { color: CLight.pink }]}>{t("matchingDetail.copy_contact")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[T.caption, { color: CLight.gray500, marginTop: 6 }]}>{t(`matchingDetail.${application.sourceUrl ? "check_source" : "info_unavailable"}`)}</Text>
            )}
          </View>

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
        {!!post.description?.trim() && <View style={styles.card}>
          <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
            {t("matchingDetail.description")}
          </Text>
          <Text selectable style={[T.body, { color: CLight.gray900, lineHeight: 26 }]}>
            {post.description}
          </Text>
        </View>}

        {/* Casting Requirements */}
        {post.requirements && Object.keys(post.requirements).length > 0 && (
          <View style={styles.card}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("matchingDetail.casting_requirements")}
            </Text>
            {post.requirements.gender && (
              <InfoRow label={t("matchingDetail.gender")} value={post.requirements.gender} />
            )}
            {post.requirements.ageRange?.length === 2 && (
              <InfoRow label={t("matchingDetail.age")} value={`${post.requirements.ageRange[0]}~${post.requirements.ageRange[1]}`} />
            )}
            {post.requirements.heightRange?.length === 2 && (
              <InfoRow label={t("matchingDetail.height")} value={`${post.requirements.heightRange[0]}~${post.requirements.heightRange[1]}`} />
            )}
            {post.requirements.specialties?.length > 0 && (
              <InfoRow label={t("matchingDetail.skills")} value={post.requirements.specialties.join(", ")} />
            )}
            {post.requirements.location && (
              <InfoRow label={t("matchingDetail.region")} value={post.requirements.location} />
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
        <TouchableOpacity
          testID="matching-primary-action"
          accessibilityRole="button"
          accessibilityState={{ disabled: !actionHref }}
          disabled={!actionHref}
          style={[styles.applyBtn, !actionHref && { backgroundColor: CLight.gray400 }]}
          onPress={() => openLink(actionHref, directApplication ? application.value : application.sourceUrl)}
          activeOpacity={0.85}
        >
          <Text style={[T.bodyBold, { color: CLight.white }]}>
            {t(`matchingDetail.${actionLabel}`)}
          </Text>
        </TouchableOpacity>
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
  applicationSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
  },
  secondaryBtn: {
    alignSelf: "flex-start",
    paddingVertical: 12,
    paddingRight: 16,
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
