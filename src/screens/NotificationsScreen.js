import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";

const NOTIFICATION_TYPES = {
  matching: { icon: "M", color: CLight.pink, bgColor: CLight.pinkSoft },
  streak: { icon: "S", color: CLight.orange, bgColor: "#FFF3E0" },
  community: { icon: "C", color: CLight.purple, bgColor: "#F3E5F5" },
  system: { icon: "!", color: CLight.blue, bgColor: "#E3F2FD" },
};

const SAMPLE_NOTIFICATIONS = [];

export default function NotificationsScreen({ navigation }) {
  const { t } = useTranslation();
  const { userProfile } = useApp();
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title={t("notifications.title")}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} {t("common.back")}</Text>
          </TouchableOpacity>
        }
        right={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead}>
              <Text style={[T.micro, { color: CLight.pink }]}>{t("notifications.mark_all_read")}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Unread count */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={[T.captionBold, { color: CLight.pink }]}>
            {t("notifications.unread_count", { count: unreadCount })}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {notifications.map((notif) => {
          const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.system;
          return (
            <TouchableOpacity
              key={notif.id}
              style={[
                styles.notifCard,
                !notif.read && styles.notifCardUnread,
              ]}
              onPress={() => handleMarkRead(notif.id)}
              activeOpacity={0.7}
            >
              <View style={styles.notifRow}>
                {/* Icon */}
                <View style={[styles.iconCircle, { backgroundColor: typeInfo.bgColor }]}>
                  <Text style={[T.captionBold, { color: typeInfo.color }]}>
                    {typeInfo.icon}
                  </Text>
                </View>

                {/* Content */}
                <View style={styles.notifContent}>
                  <View style={styles.notifHeader}>
                    <Text
                      style={[
                        T.captionBold,
                        { color: notif.read ? CLight.gray500 : CLight.gray900, flex: 1 },
                      ]}
                    >
                      {notif.title}
                    </Text>
                    {!notif.read && <View style={styles.unreadDot} />}
                  </View>
                  <Text
                    style={[
                      T.small,
                      {
                        color: notif.read ? CLight.gray400 : CLight.gray700,
                        marginTop: 3,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {notif.message}
                  </Text>
                  <Text style={[T.tiny, { color: CLight.gray400, marginTop: 6 }]}>
                    {notif.time}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {notifications.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
              {t("notifications.empty")}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  unreadBanner: {
    backgroundColor: CLight.pinkSoft,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  notifCard: {
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
  notifCardUnread: {
    backgroundColor: "#FFFBFD",
    borderLeftWidth: 3,
    borderLeftColor: CLight.pink,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  notifContent: { flex: 1 },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CLight.pink,
    marginLeft: 6,
  },
  emptyContainer: { paddingTop: 60 },
});
