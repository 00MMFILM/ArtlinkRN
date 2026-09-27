import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { View, Text, FlatList, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { T } from "../constants/theme";
import { STUDIO as S } from "../constants/studioTheme";
import { FIELDS } from "../utils/helpers";
import { isMatchingClosed, matchingDeadlineDays, matchingSourceName, resolveMatchingApplication } from "../utils/matchingApplication";
import { opportunityKey, opportunityFacts, filterOpportunities, opportunityReasons } from "../utils/opportunities";
import { getStorageScope } from "../utils/accountStorage";
import { fetchUserMatchingPosts, mergeUserMatchingPosts } from "../services/matchingService";
import { fetchOpportunityPage, loadSavedOpportunities, setOpportunitySaved } from "../services/opportunityService";

const INITIAL_FILTERS = { source: "all", category: "all", field: "all", region: "", language: "", paid: false, remote: false };
const unique = (items) => [...new Map(items.map((post) => [opportunityKey(post), post])).values()];

export default function MatchingScreen({ navigation }) {
  const { t } = useTranslation();
  const { userProfile = {}, matchingPosts = [], matchingDeletedIds = [], blockedUsers = [], handleDeleteMatchingPost, handleBlockUser, handleReportContent } = useApp();
  const scope = getStorageScope();
  const [view, setView] = useState("latest"), [search, setSearch] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS), [filterOpen, setFilterOpen] = useState(false);
  const [posts, setPosts] = useState([]), [serverUserPosts, setServerUserPosts] = useState([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState(null), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [savedState, setSavedState] = useState({ scope: null, rows: [] }), [savedError, setSavedError] = useState(false);
  const [saving, setSaving] = useState(null);
  const requestRef = useRef(0), mountedRef = useRef(true), loadingRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current += 1; };
  }, []);
  const saved = savedState.scope === scope ? savedState.rows : [];
  const savedKeys = new Set(saved.map((row) => opportunityKey(row.post)));

  const reloadSaved = useCallback(async () => {
    const owner = scope;
    try {
      const rows = await loadSavedOpportunities(owner);
      if (mountedRef.current && owner === getStorageScope()) { setSavedState({ scope: owner, rows }); setSavedError(false); }
    } catch { if (mountedRef.current && owner === getStorageScope()) setSavedError(true); }
  }, [scope]);
  useEffect(() => { reloadSaved(); return navigation.addListener?.("focus", reloadSaved); }, [navigation, reloadSaved]);

  const loadPage = useCallback(async (nextPage = 1) => {
    if (nextPage > 1 && loadingRef.current) return;
    const request = ++requestRef.current;
    loadingRef.current = true; setLoading(true); setError(null);
    const result = await fetchOpportunityPage({ page: nextPage, field: filters.field, category: filters.category });
    if (!mountedRef.current || request !== requestRef.current) return;
    if (result.error) setError(result.error);
    else {
      setPosts((previous) => unique(nextPage === 1 ? result.items : [...previous, ...result.items]));
      setPage(nextPage); setHasMore(result.hasMore);
    }
    loadingRef.current = false; setLoading(false);
  }, [filters.field, filters.category]);
  useEffect(() => { setPosts([]); setPage(0); setHasMore(false); loadPage(1); }, [loadPage]);
  useEffect(() => {
    let current = true;
    setServerUserPosts([]);
    fetchUserMatchingPosts().then((rows) => { if (current) setServerUserPosts(rows); });
    return () => { current = false; };
  }, [scope]);

  const userPosts = useMemo(() => mergeUserMatchingPosts(matchingPosts, serverUserPosts, matchingDeletedIds), [matchingPosts, serverUserPosts, matchingDeletedIds]);
  const available = useMemo(() => unique([...posts, ...userPosts]), [posts, userPosts]);
  const savedPosts = saved.map(({ post }) => available.find((current) => opportunityKey(current) === opportunityKey(post)) || post);
  const filtered = filterOpportunities((view === "saved" ? savedPosts : available)
    .filter((post) => !blockedUsers.includes(post.authorName || `user_${post.id}`)), { ...filters, search, view });
  const activeCount = Object.entries(filters).filter(([key, value]) => value && value !== "all" && INITIAL_FILTERS[key] !== value).length;
  const updateFilter = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));

  const toggleSave = async (post) => {
    if (saving) return;
    const owner = scope, key = opportunityKey(post);
    setSaving(key);
    try {
      const rows = await setOpportunitySaved(post, !savedKeys.has(key), owner);
      if (mountedRef.current && owner === getStorageScope()) setSavedState({ scope: owner, rows });
    } catch { if (mountedRef.current && owner === getStorageScope()) Alert.alert(t("common.error"), t("opportunities.save_error")); }
    finally { if (mountedRef.current) setSaving(null); }
  };
  const manage = (post) => {
    const own = post.source !== "ai" && ((post.authUserId && post.authUserId === userProfile.authUserId) || matchingPosts.some((local) => local.id === post.id));
    const actions = own ? [
      { text: t("common.edit"), onPress: () => navigation.navigate("MatchingPostCreate", { post }) },
      { text: t("common.delete"), style: "destructive", onPress: () => Alert.alert(t("matching.delete_confirm"), t("matching.delete_confirm_msg"), [
        { text: t("common.cancel"), style: "cancel" }, { text: t("common.delete"), style: "destructive", onPress: () => handleDeleteMatchingPost(post.id) },
      ]) },
    ] : [
      { text: t("common.report_title"), onPress: () => Alert.alert(t("common.report_title"), t("common.report_confirm"), [
        { text: t("common.cancel"), style: "cancel" },
        ...["inappropriate_content", "spam", "harassment"].map((reason) => ({ text: t(`common.${reason === "spam" ? "spam_scam" : reason}`), onPress: () => handleReportContent({ contentId: post.id, type: "matching_post", reason, title: post.title }) })),
      ]) },
      { text: t("common.block_author"), style: "destructive", onPress: () => Alert.alert(t("common.block_title"), t("common.block_confirm", { name: post.authorName || `user_${post.id}` }), [
        { text: t("common.cancel"), style: "cancel" }, { text: t("common.block"), style: "destructive", onPress: () => handleBlockUser(post.authorName || `user_${post.id}`) },
      ]) },
    ];
    Alert.alert(t("opportunities.manage"), post.title, [...actions, { text: t("common.cancel"), style: "cancel" }]);
  };
  const renderCard = ({ item: post }) => {
    const facts = opportunityFacts(post), closed = isMatchingClosed(post), days = matchingDeadlineDays(post.deadline);
    const deadline = closed ? t("matching.deadline_expired") : days === null ? t("matching.deadline_none") : days === 0 ? t("matchingDetail.deadline_today") : `D-${days}`;
    const application = resolveMatchingApplication(post.contact, post.sourceUrl);
    const route = ["email", "phone", "form"].includes(application.kind) ? "route_ready" : application.sourceUrl ? "route_source" : "route_unknown";
    const key = opportunityKey(post);
    return <View style={styles.card} testID={`opportunity-${key}`}>
      <View style={styles.rowBetween}>
        <Text style={styles.discipline}>{t(`fields.${post.field || "etc"}`)}</Text>
        <TouchableOpacity testID={`save-${key}`} accessibilityRole="button" accessibilityLabel={t(savedKeys.has(key) ? "opportunities.unsave" : "opportunities.save")} disabled={!!saving || !scope || savedState.scope !== scope} onPress={() => toggleSave(post)} style={[styles.saveButton, savedKeys.has(key) && styles.saveActive]}>
          <Text style={[styles.saveText, savedKeys.has(key) && { color: S.accent }]}>{t(savedKeys.has(key) ? "opportunities.saved" : "opportunities.save")}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate("MatchingPostDetail", { post })}>
        <Text style={styles.cardTitle}>{post.title}</Text>
        <View style={styles.factRow}><Text style={styles.factLabel}>{t("opportunities.location")}</Text><Text style={styles.factValue}>{[facts.country, facts.location].filter(Boolean).join(" · ") || t("opportunities.unspecified")}</Text></View>
        <View style={styles.factRow}><Text style={styles.factLabel}>{t("opportunities.pay")}</Text><Text style={styles.factValue}>{facts.pay || t("opportunities.unspecified")}</Text></View>
        <View style={styles.factRow}><Text style={styles.factLabel}>{t("opportunities.language")}</Text><Text style={styles.factValue}>{facts.languages.join(", ") || t("opportunities.unspecified")}</Text></View>
        {!!opportunityReasons(post, userProfile.fields, filters).length && <View style={styles.reasons}>{opportunityReasons(post, userProfile.fields, filters).map((reason) => <Text key={reason} style={styles.reason}>{t(`opportunities.${reason}`)}</Text>)}</View>}
        <View style={styles.cardDivider} />
        <View style={styles.rowBetween}><Text style={styles.source} numberOfLines={1}>{matchingSourceName(post) || t(post.source === "ai" ? "matchingDetail.source_unknown" : "matching.badge_user")}</Text><Text style={[styles.deadline, closed && { color: S.muted }]}>{deadline}</Text></View>
        <Text style={styles.route}>{closed ? t("matchingDetail.closed_notice") : t(`opportunities.${route}`)}</Text>
        <Text style={styles.detailLink}>{t("matching.view_detail")} →</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => manage(post)} accessibilityRole="button" accessibilityLabel={t("opportunities.manage")} style={styles.manage}><Text style={styles.manageText}>···</Text></TouchableOpacity>
    </View>;
  };
  const chips = (key, choices) => <View style={styles.chips}>{choices.map(([value, label]) => <TouchableOpacity key={value} style={[styles.chip, filters[key] === value && styles.chipActive]} onPress={() => updateFilter(key, value)}><Text style={[styles.chipText, filters[key] === value && { color: S.accent }]}>{label}</Text></TouchableOpacity>)}</View>;
  const canLoadMore = view !== "saved" && filters.source !== "user" && (hasMore || error);
  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.topbar}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("opportunities.back")} onPress={() => navigation.goBack()} style={styles.topButton}><Text style={styles.back}>←</Text></TouchableOpacity>
      <Text style={styles.topTitle}>{t("opportunities.title")}</Text>
      <TouchableOpacity onPress={() => navigation.navigate("MatchingPostCreate")} style={styles.topButton} accessibilityLabel={t("opportunities.register")}><Text style={styles.back}>＋</Text></TouchableOpacity>
    </View>
    <FlatList testID="opportunity-list" data={filtered} keyExtractor={opportunityKey} renderItem={renderCard} initialNumToRender={6} windowSize={7} maxToRenderPerBatch={6} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View>
        <Text style={styles.eyebrow}>{t("opportunities.eyebrow")}</Text><Text style={styles.headline}>{t("opportunities.headline")}</Text><Text style={styles.subtitle}>{t("opportunities.subtitle")}</Text>
        <View style={styles.searchRow}><TextInput testID="opportunity-search" style={styles.search} placeholder={t("opportunities.search")} placeholderTextColor={S.muted} value={search} onChangeText={setSearch} returnKeyType="search" /><TouchableOpacity testID="opportunity-filters" onPress={() => setFilterOpen(true)} style={styles.filterButton}><Text style={styles.filterText}>{t("opportunities.filters")}{activeCount ? ` ${activeCount}` : ""}</Text></TouchableOpacity></View>
        <View style={styles.viewTabs}>{[["latest", "latest"], ["deadline", "deadline_view"], ["saved", "saved"]].map(([key, label]) => <TouchableOpacity testID={`opportunity-view-${key}`} key={key} onPress={() => setView(key)} style={[styles.viewTab, view === key && styles.viewTabActive]}><Text style={[styles.viewText, view === key && styles.viewTextActive]}>{t(`opportunities.${label}`)}</Text></TouchableOpacity>)}</View>
        <Text style={styles.listNote}>{view === "saved" ? t("opportunities.snapshot_notice") : t("opportunities.partial_notice")}</Text>
        <Text style={styles.count}>{t("opportunities.loaded_count", { count: filtered.length })}</Text>
        {savedError && <TouchableOpacity onPress={reloadSaved}><Text style={styles.error}>{t("opportunities.saved_error")}</Text></TouchableOpacity>}
        {error && <Text style={styles.error}>{t("opportunities.error")}</Text>}
      </View>}
      ListEmptyComponent={!loading ? <View style={styles.empty}><Text style={styles.emptyTitle}>{t(view === "saved" ? "opportunities.saved_empty" : "opportunities.empty_title")}</Text><Text style={styles.emptyText}>{t(view === "saved" ? "opportunities.saved_empty_body" : "opportunities.empty_body")}</Text></View> : null}
      ListFooterComponent={<View style={styles.footer}>{loading ? <ActivityIndicator color={S.accent} accessibilityLabel={t("opportunities.loading")} /> : canLoadMore ? <TouchableOpacity testID="opportunity-load-more" onPress={() => loadPage(page + 1)} style={styles.loadMore}><Text style={styles.loadMoreText}>{t(error ? "opportunities.retry" : "opportunities.load_more")}</Text></TouchableOpacity> : null}</View>}
    />
    <Modal visible={filterOpen} animationType="slide" onRequestClose={() => setFilterOpen(false)}>
      <SafeAreaView style={styles.safe}><View style={styles.topbar}><TouchableOpacity onPress={() => setFilters(INITIAL_FILTERS)}><Text style={styles.filterText}>{t("opportunities.reset")}</Text></TouchableOpacity><Text style={styles.topTitle}>{t("opportunities.filters")}</Text><TouchableOpacity accessibilityLabel={t("common.close")} onPress={() => setFilterOpen(false)}><Text style={styles.back}>×</Text></TouchableOpacity></View>
        <ScrollView contentContainerStyle={styles.filterContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.filterHeading}>{t("opportunities.field")}</Text>{chips("field", [["all", t("common.all")], ...FIELDS.map((field) => [field, t(`fields.${field}`)])])}
          <Text style={styles.filterHeading}>{t("opportunities.region")}</Text><TextInput testID="opportunity-region" style={styles.filterInput} value={filters.region} onChangeText={(value) => updateFilter("region", value)} placeholder={t("opportunities.region_placeholder")} placeholderTextColor={S.muted} />
          <Text style={styles.filterHeading}>{t("opportunities.language")}</Text><TextInput testID="opportunity-language" style={styles.filterInput} value={filters.language} onChangeText={(value) => updateFilter("language", value)} placeholder={t("opportunities.language_placeholder")} placeholderTextColor={S.muted} />
          <View style={styles.chips}>{["paid", "remote"].map((key) => <TouchableOpacity key={key} testID={`opportunity-${key}-filter`} accessibilityRole="checkbox" accessibilityState={{ checked: filters[key] }} onPress={() => updateFilter(key, !filters[key])} style={[styles.chip, filters[key] && styles.chipActive]}><Text style={styles.chipText}>{filters[key] ? "✓ " : ""}{t(`opportunities.${key}_only`)}</Text></TouchableOpacity>)}</View>
          <Text style={styles.listNote}>{t("opportunities.empty_body")}</Text>
          <Text style={styles.filterHeading}>{t("opportunities.category")}</Text>{chips("category", [["all", t("common.all")], ["프로젝트", t("matching.tab_project")], ["오디션", t("matching.tab_audition")], ["콜라보", t("matching.tab_collab")]])}
          <Text style={styles.filterHeading}>{t("opportunities.source")}</Text>{chips("source", [["all", t("opportunities.source_all")], ["ai", t("opportunities.source_ai")], ["user", t("opportunities.source_user")]])}
        </ScrollView><TouchableOpacity testID="opportunity-apply-filters" style={styles.doneButton} onPress={() => setFilterOpen(false)}><Text style={styles.doneText}>{t("opportunities.done")}</Text></TouchableOpacity>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: S.background }, topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, minHeight: 58 }, topButton: { minWidth: 42, minHeight: 44, alignItems: "center", justifyContent: "center" }, back: { fontSize: 25, color: S.ink }, topTitle: { ...T.title, color: S.ink },
  listContent: { paddingHorizontal: 20, paddingBottom: 28 }, eyebrow: { fontSize: 10, letterSpacing: 2, color: S.accent, fontWeight: "700", marginTop: 20 }, headline: { fontSize: 28, lineHeight: 36, letterSpacing: -0.8, fontWeight: "700", color: S.ink, marginTop: 10 }, subtitle: { fontSize: 14, lineHeight: 21, color: S.muted, marginTop: 8 }, searchRow: { flexDirection: "row", gap: 8, marginTop: 24 }, search: { flex: 1, backgroundColor: S.paper, borderWidth: 1, borderColor: S.line, borderRadius: 13, paddingHorizontal: 14, height: 48, color: S.ink, fontSize: 13 }, filterButton: { justifyContent: "center", paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: S.line, backgroundColor: S.paper }, filterText: { color: S.accent, fontSize: 13, fontWeight: "600" },
  viewTabs: { flexDirection: "row", marginTop: 22, borderBottomWidth: 1, borderBottomColor: S.line, gap: 24 }, viewTab: { paddingBottom: 12, minWidth: 44, borderBottomWidth: 2, borderBottomColor: "transparent" }, viewTabActive: { borderBottomColor: S.ink }, viewText: { fontSize: 15, color: S.muted }, viewTextActive: { color: S.ink, fontWeight: "700" }, listNote: { color: S.muted, fontSize: 11, lineHeight: 17, marginTop: 12 }, count: { color: S.muted, fontSize: 12, marginTop: 16, marginBottom: 12 },
  card: { backgroundColor: S.paper, borderColor: S.line, borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 14 }, rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, discipline: { color: S.accent, fontSize: 12, fontWeight: "700" }, saveButton: { borderRadius: 8, backgroundColor: S.background, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" }, saveActive: { backgroundColor: S.accentSoft }, saveText: { color: S.muted, fontSize: 12, fontWeight: "600" }, cardTitle: { fontSize: 19, lineHeight: 27, color: S.ink, fontWeight: "700", marginTop: 12, marginBottom: 14 }, factRow: { flexDirection: "row", marginBottom: 6, gap: 12 }, factLabel: { width: 75, fontSize: 12, color: S.muted }, factValue: { flex: 1, fontSize: 12, color: S.ink, lineHeight: 18 }, reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }, reason: { fontSize: 10, color: S.positive, backgroundColor: S.positiveSoft, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5 }, cardDivider: { height: 1, backgroundColor: S.line, marginVertical: 13 }, source: { flex: 1, fontSize: 11, color: S.muted }, deadline: { fontSize: 11, color: S.accent, fontWeight: "700" }, route: { fontSize: 11, color: S.muted, marginTop: 7, lineHeight: 17 }, detailLink: { color: S.ink, fontSize: 13, fontWeight: "600", marginTop: 14, paddingVertical: 5 }, manage: { position: "absolute", right: 17, bottom: 13, width: 40, height: 40, justifyContent: "center", alignItems: "center" }, manageText: { color: S.muted, fontSize: 24 },
  empty: { paddingVertical: 36, paddingHorizontal: 8 }, emptyTitle: { color: S.ink, fontSize: 18, fontWeight: "600" }, emptyText: { color: S.muted, fontSize: 13, lineHeight: 21, marginTop: 10 }, footer: { paddingVertical: 20 }, loadMore: { padding: 15, borderWidth: 1, borderColor: S.line, borderRadius: 12, alignItems: "center", backgroundColor: S.paper }, loadMoreText: { color: S.ink, fontSize: 13, fontWeight: "600" }, error: { color: S.warning, fontSize: 12, lineHeight: 20, marginBottom: 12 },
  filterContent: { paddingHorizontal: 24, paddingBottom: 30 }, filterHeading: { color: S.ink, fontSize: 14, fontWeight: "700", marginTop: 24, marginBottom: 12 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }, chip: { paddingHorizontal: 13, paddingVertical: 11, borderRadius: 10, backgroundColor: S.paper, borderWidth: 1, borderColor: S.line }, chipActive: { backgroundColor: S.accentSoft, borderColor: S.accent }, chipText: { color: S.muted, fontSize: 13 }, filterInput: { backgroundColor: S.paper, borderWidth: 1, borderColor: S.line, borderRadius: 12, height: 48, paddingHorizontal: 14, color: S.ink }, doneButton: { backgroundColor: S.ink, marginHorizontal: 24, marginBottom: 20, paddingVertical: 17, borderRadius: 14, alignItems: "center" }, doneText: { color: S.paper, fontWeight: "700", fontSize: 15 },
});
