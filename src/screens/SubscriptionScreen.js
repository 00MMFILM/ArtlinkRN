import React from "react";
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

const PLANS = [
  {
    key: "free",
    name: "Free",
    nameKo: "무료",
    price: "무료",
    priceDesc: "영원히 무료",
    color: CLight.gray500,
    features: [
      { text: "월 10개 노트 작성", included: true },
      { text: "기본 AI 분석", included: true },
      { text: "아티스트 프로필", included: true },
      { text: "커뮤니티 접근", included: true },
      { text: "고급 AI 분석", included: false },
      { text: "무제한 노트", included: false },
      { text: "포트폴리오 내보내기", included: false },
      { text: "매칭 서비스", included: false },
      { text: "B2B 대시보드", included: false },
    ],
  },
  {
    key: "pro",
    name: "Pro",
    nameKo: "프로",
    price: "9,900원/월",
    priceDesc: "월 구독",
    color: CLight.pink,
    popular: true,
    features: [
      { text: "무제한 노트 작성", included: true },
      { text: "고급 AI 분석", included: true },
      { text: "아티스트 프로필", included: true },
      { text: "커뮤니티 접근", included: true },
      { text: "포트폴리오 내보내기", included: true },
      { text: "매칭 서비스 (월 5회)", included: true },
      { text: "공유 카드 생성", included: true },
      { text: "목표 관리", included: true },
      { text: "B2B 대시보드", included: false },
    ],
  },
  {
    key: "premium",
    name: "Premium",
    nameKo: "프리미엄",
    price: "19,900원/월",
    priceDesc: "월 구독",
    color: CLight.purple,
    features: [
      { text: "무제한 노트 작성", included: true },
      { text: "최고급 AI 분석", included: true },
      { text: "아티스트 프로필", included: true },
      { text: "커뮤니티 접근", included: true },
      { text: "포트폴리오 내보내기", included: true },
      { text: "무제한 매칭 서비스", included: true },
      { text: "공유 카드 생성", included: true },
      { text: "목표 관리", included: true },
      { text: "B2B 대시보드", included: true },
    ],
  },
];

export default function SubscriptionScreen({ navigation }) {
  const { subscription, handleUpdateSubscription } = useApp();

  const currentPlan = subscription?.plan || "free";

  const handleChangePlan = (planKey) => {
    handleUpdateSubscription({ plan: planKey });
  };

  const getCurrentPlanInfo = () => {
    return PLANS.find((p) => p.key === currentPlan) || PLANS[0];
  };

  const current = getCurrentPlanInfo();

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="구독 관리"
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
        {/* Current plan */}
        <View style={[styles.currentPlanCard, { borderColor: current.color }]}>
          <Text style={[T.micro, { color: current.color, fontWeight: "600" }]}>현재 플랜</Text>
          <Text style={[T.h2, { color: CLight.gray900, marginTop: 4 }]}>
            {current.name} ({current.nameKo})
          </Text>
          <Text style={[T.caption, { color: CLight.gray500, marginTop: 2 }]}>
            {current.price}
          </Text>
        </View>

        {/* Plan cards */}
        {PLANS.map((plan) => {
          const isActive = currentPlan === plan.key;
          return (
            <View
              key={plan.key}
              style={[
                styles.planCard,
                isActive && { borderWidth: 2, borderColor: plan.color },
              ]}
            >
              {/* Popular badge */}
              {plan.popular && (
                <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                  <Text style={[T.tinyBold, { color: CLight.white }]}>인기</Text>
                </View>
              )}

              {/* Plan header */}
              <View style={styles.planHeader}>
                <View>
                  <Text style={[T.h3, { color: CLight.gray900 }]}>
                    {plan.name}
                  </Text>
                  <Text style={[T.micro, { color: CLight.gray500 }]}>
                    {plan.nameKo}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[T.title, { color: plan.color }]}>
                    {plan.price}
                  </Text>
                  <Text style={[T.tiny, { color: CLight.gray400 }]}>
                    {plan.priceDesc}
                  </Text>
                </View>
              </View>

              {/* Feature list */}
              <View style={styles.featureList}>
                {plan.features.map((feature, idx) => (
                  <View key={idx} style={styles.featureRow}>
                    <View
                      style={[
                        styles.checkCircle,
                        {
                          backgroundColor: feature.included
                            ? plan.color + "18"
                            : CLight.gray100,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          T.micro,
                          {
                            color: feature.included ? plan.color : CLight.gray300,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {feature.included ? "O" : "-"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        T.small,
                        {
                          color: feature.included
                            ? CLight.gray700
                            : CLight.gray400,
                          flex: 1,
                          marginLeft: 10,
                          textDecorationLine: feature.included
                            ? "none"
                            : "line-through",
                        },
                      ]}
                    >
                      {feature.text}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Action button */}
              {isActive ? (
                <View style={[styles.activeBadge, { borderColor: plan.color }]}>
                  <Text style={[T.captionBold, { color: plan.color }]}>
                    현재 이용 중
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.changePlanBtn, { backgroundColor: plan.color }]}
                  onPress={() => handleChangePlan(plan.key)}
                >
                  <Text style={[T.captionBold, { color: CLight.white }]}>
                    플랜 변경
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Disclaimer */}
        <Text style={[T.tiny, { color: CLight.gray400, textAlign: "center", marginTop: 16, lineHeight: 18 }]}>
          구독은 언제든지 변경하거나 취소할 수 있습니다.{"\n"}
          결제는 App Store / Google Play를 통해 진행됩니다.
        </Text>

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
  currentPlanCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  planCard: {
    backgroundColor: CLight.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    position: "relative",
    overflow: "hidden",
  },
  popularBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  featureList: { marginBottom: 16 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  activeBadge: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  changePlanBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
});
