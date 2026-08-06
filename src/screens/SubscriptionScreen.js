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
} from "react-native";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";
import {
  purchasesReady,
  getPremiumOffering,
  purchasePremium,
  restorePurchases,
} from "../services/purchasesService";

// Apple 심사 필수: 이용약관(표준 EULA)·개인정보 링크 + 자동갱신 고지
const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://art-link.kr/privacy/";

export default function SubscriptionScreen({ navigation }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [offering, setOffering] = useState(null);
  const [selected, setSelected] = useState("yearly"); // 연간이 기본 (마진·리텐션 유리)

  useEffect(() => {
    (async () => {
      if (purchasesReady()) {
        const o = await getPremiumOffering();
        setOffering(o);
      }
      setLoading(false);
    })();
  }, []);

  const monthlyPkg = offering?.monthly || null;
  const yearlyPkg = offering?.annual || null;
  const selectedPkg = selected === "yearly" ? yearlyPkg : monthlyPkg;

  const handlePurchase = async () => {
    if (!selectedPkg) {
      Alert.alert(t("premium.title"), t("premium.not_ready"));
      return;
    }
    setBuying(true);
    const { success, cancelled } = await purchasePremium(selectedPkg);
    setBuying(false);
    if (success) {
      Alert.alert(t("premium.title"), t("premium.purchase_success"), [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } else if (!cancelled) {
      Alert.alert(t("premium.title"), t("premium.purchase_fail"));
    }
  };

  const handleRestore = async () => {
    setBuying(true);
    const restored = await restorePurchases();
    setBuying(false);
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <Text style={styles.badge}>{t("premium.trial_badge")}</Text>
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
              {selected === "yearly" ? t("premium.cta_trial") : t("premium.cta_subscribe")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={buying}>
          <Text style={[T.small, { color: CLight.gray500 }]}>{t("premium.restore")}</Text>
        </TouchableOpacity>

        <Text style={[T.caption, styles.note]}>{t("premium.auto_renew_note")}</Text>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => Linking.openURL(APPLE_EULA_URL)}>
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
