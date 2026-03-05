import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";

const NOTIFICATION_TYPES = {
  matching: { icon: "M", color: CLight.pink, bgColor: CLight.pinkSoft },
  streak: { icon: "S", color: CLight.orange, bgColor: "#FFF3E0" },
  community: { icon: "C", color: CLight.purple, bgColor: "#F3E5F5" },
  system: { icon: "!", color: CLight.blue, bgColor: "#E3F2FD" },
};

const SAMPLE_NOTIFICATIONS = [
  {
    id: 1,
    type: "matching",
    title: "새 매칭 프로젝트",
    message: "단편영화 '빛의 경계' 출연자 모집이 회원님의 프로필과 92% 매칭됩니다.",
    time: "10분 전",
    read: false,
  },
  {
    id: 2,
    type: "streak",
    title: "연속 기록 알림",
    message: "오늘 아직 노트를 작성하지 않았어요! 연속 기록을 유지해보세요.",
    time: "1시간 전",
    read: false,
  },
  {
    id: 3,
    type: "community",
    title: "커뮤니티 반응",
    message: "회원님의 '감정 표현 연습법' 노트에 3명이 좋아요를 눌렀습니다.",
    time: "3시간 전",
    read: false,
  },
  {
    id: 4,
    type: "system",
    title: "앱 업데이트",
    message: "Artlink v1.3.0이 출시되었습니다. 새로운 매칭 기능을 확인해보세요!",
    time: "6시간 전",
    read: true,
  },
  {
    id: 5,
    type: "matching",
    title: "오디션 마감 임박",
    message: "드라마 '새벽의 문' 공개 오디션 마감이 3일 남았습니다.",
    time: "어제",
    read: true,
  },
  {
    id: 6,
    type: "streak",
    title: "주간 리포트",
    message: "이번 주 5개의 노트를 작성했어요. 지난주 대비 25% 증가했습니다!",
    time: "2일 전",
    read: true,
  },
  {
    id: 7,
    type: "community",
    title: "새 댓글",
    message: "김예술님이 '발레 기초 훈련 기록' 노트에 댓글을 남겼습니다.",
    time: "3일 전",
    read: true,
  },
  {
    id: 8,
    type: "system",
    title: "보안 업데이트",
    message: "개인정보 보호를 위해 보안 설정을 확인해주세요.",
    time: "5일 전",
    read: true,
  },
];

export default function NotificationsScreen({ navigation }) {
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
        title="알림"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} 뒤로</Text>
          </TouchableOpacity>
        }
        right={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead}>
              <Text style={[T.micro, { color: CLight.pink }]}>모두 읽음</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Unread count */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={[T.captionBold, { color: CLight.pink }]}>
            읽지 않은 알림 {unreadCount}개
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
              알림이 없습니다.
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
