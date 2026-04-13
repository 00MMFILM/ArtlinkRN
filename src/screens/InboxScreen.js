import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";
import {
  fetchReceivedProposals,
  fetchSentProposals,
  updateProposalStatus,
  replyToProposal,
  fetchReplies,
  deleteProposal,
} from "../services/proposalService";

const STATUS_CONFIG = {
  pending: { labelKey: "inbox.status_pending", color: CLight.orange, bg: CLight.orange + "18" },
  accepted: { labelKey: "inbox.status_accepted", color: CLight.green, bg: CLight.green + "18" },
  declined: { labelKey: "inbox.status_declined", color: CLight.gray400, bg: CLight.gray100 },
};

const TYPE_CONFIG = {
  casting: { labelKey: "inbox.type_casting", color: CLight.pink },
  collaboration: { labelKey: "inbox.type_collab", color: CLight.purple },
};

function formatTime(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("common.just_now");
  if (mins < 60) return t("common.mins_ago", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("common.hours_ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("common.yesterday");
  if (days < 30) return t("common.days_ago", { count: days });
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

function ProposalCard({ proposal, isReceived, onAccept, onDecline, onReply, onDelete, deviceUserId }) {
  const { t } = useTranslation();
  const typeInfo = TYPE_CONFIG[proposal.type] || TYPE_CONFIG.casting;
  const statusInfo = STATUS_CONFIG[proposal.status] || STATUS_CONFIG.pending;
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [sending, setSending] = useState(false);

  const loadReplies = useCallback(async () => {
    setLoadingReplies(true);
    try {
      const data = await fetchReplies(proposal.id);
      setReplies(data);
    } catch (_) {}
    setLoadingReplies(false);
  }, [proposal.id]);

  const handleToggle = useCallback(() => {
    if (!expanded) loadReplies();
    setExpanded((v) => !v);
  }, [expanded, loadReplies]);

  const handleSendReply = useCallback(async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      const newReply = await onReply(proposal.id, replyText.trim());
      if (newReply) setReplies((prev) => [...prev, newReply]);
      setReplyText("");
    } catch (_) {}
    setSending(false);
  }, [replyText, sending, proposal.id, onReply]);

  const isAccepted = proposal.status === "accepted";

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={handleToggle} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeInfo.color + "18" }]}>
            <Text style={[T.microBold, { color: typeInfo.color }]}>{t(typeInfo.labelKey)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[T.micro, { color: statusInfo.color, fontWeight: "600" }]}>{t(statusInfo.labelKey)}</Text>
          </View>
          <Text style={[T.tiny, { color: CLight.gray400, marginLeft: "auto" }]}>
            {formatTime(proposal.created_at, t)}
          </Text>
        </View>

        <Text style={[T.bodyBold, { color: CLight.gray900, marginTop: 10 }]}>{proposal.title}</Text>
        <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]} numberOfLines={expanded ? undefined : 3}>
          {proposal.content}
        </Text>

        <View style={styles.senderRow}>
          <Text style={[T.micro, { color: CLight.gray500 }]}>
            {isReceived ? t("inbox.from") : t("inbox.to")}: {isReceived ? proposal.sender_name : (proposal.recipient_name || t("common.artist"))}
          </Text>
          {proposal.sender_field && isReceived && (
            <Text style={[T.micro, { color: CLight.gray400 }]}> | {proposal.sender_field}</Text>
          )}
        </View>
      </TouchableOpacity>

      {isReceived && proposal.status === "pending" && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(proposal.id)} activeOpacity={0.7}>
            <Text style={[T.captionBold, { color: CLight.white }]}>{t("inbox.accept")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={() => onDecline(proposal.id)} activeOpacity={0.7}>
            <Text style={[T.captionBold, { color: CLight.gray500 }]}>{t("inbox.decline")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reply thread - visible when expanded and accepted */}
      {expanded && isAccepted && (
        <View style={styles.replySection}>
          {loadingReplies ? (
            <ActivityIndicator size="small" color={CLight.pink} style={{ marginVertical: 10 }} />
          ) : (
            <>
              {replies.length > 0 && replies.map((r) => (
                <View key={r.id} style={[styles.replyBubble, r.sender_id === deviceUserId ? styles.replyMine : styles.replyTheirs]}>
                  <Text style={[T.micro, { color: CLight.gray500, marginBottom: 2 }]}>{r.sender_name}</Text>
                  <Text style={[T.small, { color: CLight.gray900 }]}>{r.content}</Text>
                  <Text style={[T.tiny, { color: CLight.gray400, marginTop: 2, alignSelf: "flex-end" }]}>{formatTime(r.created_at, t)}</Text>
                </View>
              ))}
              {replies.length === 0 && (
                <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginVertical: 8 }]}>{t("inbox.no_replies")}</Text>
              )}
              <View style={styles.replyInputRow}>
                <TextInput
                  style={styles.replyInput}
                  placeholder={t("inbox.reply_placeholder")}
                  placeholderTextColor={CLight.gray400}
                  value={replyText}
                  onChangeText={setReplyText}
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.replySendBtn, (!replyText.trim() || sending) && { opacity: 0.4 }]}
                  onPress={handleSendReply}
                  disabled={!replyText.trim() || sending}
                >
                  <Text style={[T.captionBold, { color: CLight.white }]}>{sending ? "..." : t("common.send")}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {isAccepted && !expanded && (
        <TouchableOpacity onPress={handleToggle} style={styles.replyHint}>
          <Text style={[T.micro, { color: CLight.pink }]}>{t("inbox.reply_hint")}</Text>
        </TouchableOpacity>
      )}

      {/* Delete button */}
      <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(proposal.id)} activeOpacity={0.7}>
        <Text style={[T.micro, { color: CLight.gray400 }]}>{t("common.delete")}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function InboxScreen({ navigation }) {
  const { t } = useTranslation();
  const { deviceUserId, userProfile, showToast } = useApp();
  const [activeTab, setActiveTab] = useState("received");
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProposals = useCallback(async () => {
    if (!deviceUserId) { setLoading(false); return; }
    try {
      const [r, s] = await Promise.all([
        fetchReceivedProposals(deviceUserId),
        fetchSentProposals(deviceUserId),
      ]);
      setReceived(r);
      setSent(s);
    } catch (_) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [deviceUserId]);

  useEffect(() => { loadProposals(); }, [loadProposals]);

  const handleAccept = useCallback(async (proposalId) => {
    try {
      await updateProposalStatus(proposalId, "accepted");
      setReceived((prev) => prev.map((p) => p.id === proposalId ? { ...p, status: "accepted" } : p));
      showToast(t("inbox.accepted_toast"), "success");
    } catch (_) {
      Alert.alert(t("common.error"), t("inbox.status_error"));
    }
  }, [showToast]);

  const handleReply = useCallback(async (proposalId, content) => {
    try {
      const reply = await replyToProposal(proposalId, deviceUserId, userProfile.name || t("common.anonymous"), content);
      return reply;
    } catch (_) {
      Alert.alert(t("common.error"), t("inbox.reply_error"));
      return null;
    }
  }, [deviceUserId, userProfile.name]);

  const handleDecline = useCallback(async (proposalId) => {
    Alert.alert(t("inbox.decline_title"), t("inbox.decline_msg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("inbox.decline"),
        style: "destructive",
        onPress: async () => {
          try {
            await updateProposalStatus(proposalId, "declined");
            setReceived((prev) => prev.map((p) => p.id === proposalId ? { ...p, status: "declined" } : p));
            showToast(t("inbox.declined_toast"), "success");
          } catch (_) {
            Alert.alert(t("common.error"), t("inbox.status_error"));
          }
        },
      },
    ]);
  }, [showToast]);

  const handleDelete = useCallback(async (proposalId) => {
    Alert.alert(t("inbox.delete_title"), t("inbox.delete_msg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProposal(proposalId);
            setReceived((prev) => prev.filter((p) => p.id !== proposalId));
            setSent((prev) => prev.filter((p) => p.id !== proposalId));
            showToast(t("inbox.deleted_toast"), "success");
          } catch (_) {
            Alert.alert(t("common.error"), t("inbox.delete_error"));
          }
        },
      },
    ]);
  }, [showToast]);

  const currentList = activeTab === "received" ? received : sent;

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title={t("inbox.title")}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} {t("common.back")}</Text>
          </TouchableOpacity>
        }
      />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "received" && styles.tabActive]}
          onPress={() => setActiveTab("received")}
        >
          <Text style={[T.captionBold, { color: activeTab === "received" ? CLight.pink : CLight.gray400 }]}>
            {t("inbox.received_tab")} ({received.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "sent" && styles.tabActive]}
          onPress={() => setActiveTab("sent")}
        >
          <Text style={[T.captionBold, { color: activeTab === "sent" ? CLight.pink : CLight.gray400 }]}>
            {t("inbox.sent_tab")} ({sent.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CLight.pink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {currentList.length > 0 ? (
            currentList.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                isReceived={activeTab === "received"}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onDelete={handleDelete}
                onReply={handleReply}
                deviceUserId={deviceUserId}
              />
            ))
          ) : (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>{"📬"}</Text>
              <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
                {activeTab === "received" ? t("inbox.empty_received") : t("inbox.empty_sent")}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingVertical: 8, backgroundColor: CLight.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CLight.gray200 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: CLight.pinkSoft },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { paddingVertical: 60, alignItems: "center" },

  card: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  senderRow: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CLight.gray200 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  acceptBtn: { flex: 1, backgroundColor: CLight.pink, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  declineBtn: { flex: 1, backgroundColor: CLight.gray100, borderRadius: 12, paddingVertical: 10, alignItems: "center" },

  replySection: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CLight.gray200 },
  replyBubble: { padding: 10, borderRadius: 12, marginBottom: 8, maxWidth: "85%" },
  replyMine: { backgroundColor: CLight.pinkSoft, alignSelf: "flex-end" },
  replyTheirs: { backgroundColor: CLight.gray100, alignSelf: "flex-start" },
  replyInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  replyInput: { flex: 1, backgroundColor: CLight.gray100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, ...T.small, color: CLight.gray900 },
  replySendBtn: { backgroundColor: CLight.pink, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  replyHint: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CLight.gray200, alignItems: "center" },
  deleteBtn: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CLight.gray200, alignItems: "center" },
});
