import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";
import { useApp } from "../context/AppContext";
import { formatDate } from "../utils/helpers";
import {
  purchasesReady,
  getPremiumOffering,
  purchasePremium,
  restorePurchases,
  getPremiumEntitlement,
} from "../services/purchasesService";

// 이용약관·개인정보 링크 + 자동갱신 고지
// iOS: Apple 심사 필수 표준 EULA / Android: Google Play 이용약관
const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const GOOGLE_PLAY_TERMS_URL = "https://play.google.com/intl/ko/about/play-terms/index.html";
const TERMS_URL = Platform.OS === "ios" ? APPLE_EULA_URL : GOOGLE_PLAY_TERMS_URL;
const PRIVACY_URL = "https://art-link.kr/privacy/";

// 구독 관리는 스토어에서만 가능하다 (심사 요건)
const ANDROID_PACKAGE = "com.mm00.artlink";
function manageUrl(planCode) {
  if (Platform.OS === "ios") return "https://apps.apple.com/account/subscriptions";
  const sku = planCode ? `&sku=artlink_premium_${planCode}` : "";
  return `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}${sku}`;
}

export default function SubscriptionScreen({ navigation }) {
  const { t } = useTranslation();
  const { premium, markPremiumActive, refreshPremium, userProfile, setAuthState } = useApp();
  const isActive = !!premium?.active;

  // 게스트(비로그인) 결제 방지 — RevenueCat 익명 ID로 결제하면 서버 웹훅이 계정과 못 묶어 프리미엄이 안 켜진다
  const requireLogin = () => {
    if (userProfile?.authUserId) return false;
    Alert.alert(t("premium.login_required_title"), t("premium.login_required_message"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.confirm"), onPress: () => setAuthState("auth") },
    ]);
    return true;
  };

  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [offering, setOffering] = useState(null);
  const [entitlement, setEntitlement] = useState(null);
  const [selected, setSelected] = useState("yearly"); // 연간이 기본 (마진·리텐션 유리)

  useEffect(() => {
    (async () => {
      if (purchasesReady()) {
        // 구독 중이면 결제 상품 목록 대신 만료일(다음 결제일)만 필요하다
        if (isActive) setEntitlement(await getPremiumEntitlement());
        else setOffering(await getPremiumOffering());
      }
      setLoading(false);
    })();
  }, [isActive]);

  const monthlyPkg = offering?.monthly || null;
  const yearlyPkg = offering?.annual || null;
  const selectedPkg = selected === "yearly" ? yearlyPkg : monthlyPkg;

  const handlePurchase = async () => {
    if (requireLogin()) return;
    if (!selectedPkg) {
      Alert.alert(t("premium.title"), t("premium.not_ready"));
      return;
    }
    setBuying(true);
    const { success, cancelled } = await purchasePremium(selectedPkg);
    setBuying(false);
    if (success) {
      // 서버 웹훅 반영 전에도 화면은 즉시 프리미엄으로 바뀌어야 한다
      markPremiumActive({ kind: "sub", plan: selected });
      refreshPremium();
      Alert.alert(t("premium.title"), t("premium.purchase_success"), [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } else if (!cancelled) {
      Alert.alert(t("premium.title"), t("premium.purchase_fail"));
    }
  };

  // 복원은 로그인 없이도 열어 둔다 — 재설치한 유료 사용자와 스토어 심사가 계정 없이 복원을 시도한다
  const handleRestore = async () => {
    setBuying(true);
    const restored = await restorePurchases();
    setBuying(false);
    if (restored) {
      markPremiumActive({ kind: "sub" });
      refreshPremium();
    }
    Alert.alert(
      t("premium.title"),
      restored ? t("premium.restore_success") : t("premium.restore_none"),
      restored ? [{ text: "OK", onPress: () => navigation.goBack() }] : undefined
    );
  };

  const benefits = [
    { icon: "✨", text: t("premium.benefit_text") },
    { icon: "🎥", text: t("premium.benefit_video") },
    { icon: "🧠", text: t("premium.benefit_model") },
  ];

  // ─── 구독 중: 결제창 대신 상태 화면 ───
  if (isActive) {
    // 플랜은 서버 값이 정본. 없으면 RevenueCat 상품 식별자로 유추한다.
    const productId = entitlement?.productIdentifier || "";
    const planCode =
      premium.plan ||
      (/month/i.test(productId) ? "monthly" : /year|annual/i.test(productId) ? "yearly" : null);
    const isComp = premium.kind === "comp";
    const planLabel = isComp
      ? t("premium.active_plan_comp")
      : planCode === "monthly"
      ? t("premium.active_plan_monthly")
      : planCode === "yearly"
      ? t("premium.active_plan_yearly")
      : null;
    // 무료 이용권에는 결제일이 없다
    const nextBilling = !isComp && entitlement?.expirationDate ? entitlement.expirationDate : null;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.activeHeader}>
            <Text style={styles.activeCrown}>{"\uD83D\uDC51"}</Text>
            <Text style={[T.h1, styles.title]}>{t("premium.active_title")}</Text>
            {planLabel ? (
              <Text style={[T.body, { color: CLight.gray500, marginTop: 4 }]}>{planLabel}</Text>
            ) : null}
            {premium.since ? (
              <Text style={[T.caption, { color: CLight.gray400, marginTop: 4 }]}>
                {t("premium.since", { date: formatDate(premium.since) })}
              </Text>
            ) : null}
            {nextBilling ? (
              <Text style={[T.caption, { color: CLight.gray400, marginTop: 2 }]}>
                {t("premium.next_billing", { date: formatDate(nextBilling) })}
              </Text>
            ) : null}
          </View>

          <View style={styles.benefits}>
            {benefits.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>{b.icon}</Text>
                <Text style={[T.body, styles.benefitText]}>{b.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.ctaBtn} onPress={() => Linking.openURL(manageUrl(planCode))}>
            <Text style={[T.bodyBold, { color: "#FFFFFF" }]}>{t("premium.manage")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={buying}>
            <Text style={[T.small, { color: CLight.gray500 }]}>{t("premium.restore")}</Text>
          </TouchableOpacity>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={[T.caption, styles.linkText]}>{t("premium.terms")}</Text>
            </TouchableOpacity>
            <Text style={[T.caption, { color: CLight.gray300 }]}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={[T.caption, styles.linkText]}>{t("premium.privacy")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <Text style={[T.h1, styles.title]}>{t("premium.title")}</Text>
        <Text style={[T.body, styles.subtitle]}>{t("premium.subtitle")}</Text>

        <View style={styles.benefits}>
          {benefits.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Text style={styles.benefitIcon}>{b.icon}</Text>
              <Text style={[T.body, styles.benefitText]}>{b.text}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={CLight.pink} style={{ marginVertical: 32 }} />
        ) : (
          <View style={styles.plans}>
            <TouchableOpacity
              style={[styles.planCard, selected === "yearly" && styles.planSelected]}
              onPress={() => setSelected("yearly")}
              activeOpacity={0.8}
            >
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>{t("premium.yearly_save")}</Text>
              </View>
              <Text style={[T.bodyBold, styles.planName]}>{t("premium.yearly")}</Text>
              <Text style={[T.title, styles.planPrice]}>
                {yearlyPkg?.product?.priceString || "₩49,000"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.planCard, selected === "monthly" && styles.planSelected]}
              onPress={() => setSelected("monthly")}
              activeOpacity={0.8}
            >
              <Text style={[T.bodyBold, styles.planName]}>{t("premium.monthly")}</Text>
              <Text style={[T.title, styles.planPrice]}>
                {monthlyPkg?.product?.priceString || "₩6,900"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.ctaBtn, (buying || loading) && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={buying || loading}
        >
          {buying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[T.bodyBold, { color: "#FFFFFF" }]}>
              {t("premium.cta_subscribe")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={buying}>
          <Text style={[T.small, { color: CLight.gray500 }]}>{t("premium.restore")}</Text>
        </TouchableOpacity>

        <Text style={[T.caption, styles.note]}>
          {t(Platform.OS === "android" ? "premium.renew_notice_android" : "premium.renew_notice", {
            plan: selected === "yearly" ? t("premium.yearly") : t("premium.monthly"),
            price: selectedPkg?.product?.priceString || (selected === "yearly" ? "₩49,000" : "₩6,900"),
          })}
        </Text>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
            <Text style={[T.caption, styles.linkText]}>{t("premium.terms")}</Text>
          </TouchableOpacity>
          <Text style={[T.caption, { color: CLight.gray300 }]}> · </Text>
          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
            <Text style={[T.caption, styles.linkText]}>{t("premium.privacy")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CLight.bg },
  scroll: { padding: 24, paddingTop: 64, paddingBottom: 48 },
  closeBtn: { position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: CLight.gray100, justifyContent: "center", alignItems: "center", zIndex: 10 },
  closeText: { fontSize: 18, color: CLight.gray700 },
  badge: { alignSelf: "flex-start", backgroundColor: CLight.pink, color: "#FFFFFF", fontSize: 12, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  title: { color: CLight.gray900, marginBottom: 6 },
  subtitle: { color: CLight.gray500, marginBottom: 24 },
  activeHeader: { alignItems: "center", marginBottom: 28 },
  activeCrown: { fontSize: 44, marginBottom: 10 },
  benefits: { marginBottom: 28, gap: 14 },
  benefitRow: { flexDirection: "row", alignItems: "center" },
  benefitIcon: { fontSize: 20, marginRight: 12 },
  benefitText: { color: CLight.gray900, flex: 1 },
  plans: { flexDirection: "row", gap: 12, marginBottom: 20 },
  planCard: { flex: 1, borderWidth: 1.5, borderColor: CLight.gray200, borderRadius: 16, padding: 16, backgroundColor: CLight.white },
  planSelected: { borderColor: CLight.pink, backgroundColor: "#FFF5F8" },
  saveBadge: { position: "absolute", top: -10, right: 10, backgroundColor: CLight.pink, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  saveBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  planName: { color: CLight.gray500, marginBottom: 6 },
  planPrice: { color: CLight.gray900 },
  ctaBtn: { width: "100%", height: 54, backgroundColor: CLight.pink, borderRadius: 14, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  restoreBtn: { alignItems: "center", paddingVertical: 8, marginBottom: 16 },
  note: { color: CLight.gray400, textAlign: "center", marginBottom: 12, lineHeight: 16 },
  links: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  linkText: { color: CLight.gray500, textDecorationLine: "underline" },
});
