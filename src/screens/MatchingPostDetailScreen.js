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
import { CLight, T } from "../constants/theme";
import { STUDIO as S } from "../constants/studioTheme";
import { opportunityFacts, buildApplicationPrefill } from "../utils/opportunities";
import { resolveMatchingApplication, matchingDeadlineDays, isMatchingClosed, matchingSourceName } from "../utils/matchingApplication";

export default function MatchingPostDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { post } = route.params;
  const { handleBlockUser, handleReportContent } = useApp();

  const fieldColor = S.accent;
  const facts = opportunityFacts(post);
  const unspecified = t("opportunities.unspecified");
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
        <Text style={[T.title, { color: S.ink }]}>{t("opportunities.title")}</Text>
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
                {fieldLabel}
              </Text>
            </View>
            <View style={[styles.tabBadge]}>
              <Text style={[T.micro, { color: S.muted }]}>{t({ "프로젝트": "matching.tab_project", "오디션": "matching.tab_audition", "콜라보": "matching.tab_collab" }[post.tab] || "opportunities.title")}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[T.h3, { color: S.ink, marginTop: 14 }]}>
            {post.title}
          </Text>

          {/* Missing or invalid dates are unknown, not an unlimited application window. */}
          {daysLeft && (
            <View style={styles.deadlineRow}>
              {matchingDeadlineDays(post.deadline) !== null && <Text style={[T.caption, { color: S.muted }]}>
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
                      { color: daysLeft === t("matchingDetail.deadline_expired") ? CLight.red : S.accent },
                    ]}
                  >
                    {daysLeft}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.factsSection}>
            <Text style={styles.sectionTitle}>{t("opportunities.known_conditions")}</Text>
            <InfoRow label={t("opportunities.location")} value={[facts.country, facts.location].filter(Boolean).join(" · ") || unspecified} />
            <InfoRow label={t("opportunities.pay")} value={facts.pay || unspecified} />
            <InfoRow label={t("opportunities.language")} value={facts.languages.join(", ") || unspecified} />
            <InfoRow label={t("opportunities.remote")} value={facts.remote === null ? unspecified : t(facts.remote ? "opportunities.remote_yes" : "opportunities.remote_no")} />
            <Text style={styles.note}>{t("opportunities.facts_notice")}</Text>
          </View>

          {/* Source and application instructions stay visible without opening an alert. */}
          <View style={styles.applicationSection}>
            <Text style={[T.captionBold, { color: S.ink }]}>{t("matchingDetail.source_title")}</Text>
            <Text selectable style={[T.body, { color: S.ink, marginTop: 6 }]}>{sourceName}</Text>
            {!!application.sourceUrl && (
              <TouchableOpacity accessibilityRole="link" style={styles.secondaryBtn} onPress={() => openLink(application.sourceUrl, application.sourceUrl)}>
                <Text style={[T.captionBold, { color: S.accent }]}>{t("matchingDetail.view_original")}</Text>
              </TouchableOpacity>
            )}
            <Text style={[T.captionBold, { color: S.ink, marginTop: 12 }]}>{t("matchingDetail.application_method")}</Text>
            {closed ? (
              <Text style={[T.caption, { color: CLight.red, marginTop: 6 }]}>{t("matchingDetail.closed_notice")}</Text>
            ) : application.value ? (
              <>
                <Text selectable style={[T.body, { color: S.ink, marginTop: 6 }]}>{application.value}</Text>
                <TouchableOpacity accessibilityRole="button" style={styles.secondaryBtn} onPress={() => copyValue(application.value)}>
                  <Text style={[T.captionBold, { color: S.accent }]}>{t("matchingDetail.copy_contact")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[T.caption, { color: S.muted, marginTop: 6 }]}>{t(`matchingDetail.${application.sourceUrl ? "check_source" : "info_unavailable"}`)}</Text>
            )}
          </View>


        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("opportunities.materials")}</Text>
          <Text selectable style={styles.materials}>{facts.submissions.length ? facts.submissions.join("\n") : t("opportunities.materials_unknown")}</Text>
        </View>

        {/* Description Card */}
        {!!post.description?.trim() && <View style={styles.card}>
          <Text style={[T.captionBold, { color: S.ink, marginBottom: 10 }]}>
            {t("matchingDetail.description")}
          </Text>
          <Text selectable style={[T.body, { color: S.ink, lineHeight: 26 }]}>
            {post.description}
          </Text>
        </View>}

        {/* Casting Requirements */}
        {post.requirements && Object.keys(post.requirements).length > 0 && (
          <View style={styles.card}>
            <Text style={[T.captionBold, { color: S.ink, marginBottom: 10 }]}>
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
            <Text style={[T.captionBold, { color: S.ink, marginBottom: 10 }]}>
              {t("matchingDetail.tags")}
            </Text>
            <View style={styles.tagsRow}>
              {post.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={[T.small, { color: S.accent }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomBar}>
        <Text style={styles.prepareNotice}>{t("opportunities.prepare_notice")}</Text>
        <View style={styles.bottomActions}>
        <TouchableOpacity testID="matching-prepare-action" accessibilityRole="button" disabled={closed}
          accessibilityState={{ disabled: closed }} style={[styles.prepareBtn, closed && { opacity: 0.45 }]}
          onPress={() => { if (!isMatchingClosed(post)) navigation.navigate("NoteCreate", { prefill: buildApplicationPrefill(post, t) }); }}>
          <Text style={styles.prepareText}>{t("opportunities.prepare")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="matching-primary-action"
          accessibilityRole="button"
          accessibilityState={{ disabled: !actionHref }}
          disabled={!actionHref}
          style={[styles.applyBtn, !actionHref && { backgroundColor: CLight.gray400 }]}
          onPress={() => {
            const expired = isMatchingClosed(post);
            openLink(expired ? application.sourceUrl : actionHref, expired || !directApplication ? application.sourceUrl : application.value);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.applicationText}>
            {t(`matchingDetail.${actionLabel}`)}
          </Text>
        </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[T.caption, { color: S.muted, width: 88, fontSize: 12 }]}>{label}</Text>
      <Text style={[T.caption, { color: S.ink, flex: 1 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: S.background },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, minHeight: 58 },
  topBarBtn: { width: 42, height: 44, justifyContent: "center", alignItems: "center" }, topBarBtnText: { fontSize: 24, color: S.ink },
  scrollView: { flex: 1 }, scrollContent: { padding: 20, paddingBottom: 8 },
  card: { backgroundColor: S.paper, borderRadius: 20, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: S.line },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  fieldBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  tabBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: S.background },
  deadlineRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "space-between", marginTop: 14 },
  dDayBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: S.accentSoft },
  applicationSection: { marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: S.line },
  secondaryBtn: { alignSelf: "flex-start", paddingVertical: 12, paddingRight: 16 },
  factsSection: { marginTop: 24 }, sectionTitle: { fontSize: 14, fontWeight: "700", color: S.ink, marginBottom: 10 },
  note: { fontSize: 11, lineHeight: 18, color: S.muted, marginTop: 10 }, materials: { fontSize: 14, lineHeight: 23, color: S.muted },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, tagChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: S.accentSoft },
  infoRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.line },
  bottomBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: S.paper, borderTopWidth: 1, borderTopColor: S.line },
  prepareNotice: { fontSize: 10, lineHeight: 15, color: S.muted, marginBottom: 10 }, bottomActions: { flexDirection: "row", gap: 10 },
  prepareBtn: { flex: 1, backgroundColor: S.ink, borderRadius: 13, paddingVertical: 16, paddingHorizontal: 8, justifyContent: "center", alignItems: "center" }, prepareText: { color: S.paper, fontSize: 13, fontWeight: "700", textAlign: "center" },
  applyBtn: { flex: 1, backgroundColor: S.accent, borderRadius: 13, paddingVertical: 16, paddingHorizontal: 8, justifyContent: "center", alignItems: "center" }, applicationText: { color: S.paper, fontSize: 13, fontWeight: "700", textAlign: "center" },
});
