import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { summarizeUnassignedLegacyData } from "../utils/accountStorage";
import { CLight, T } from "../constants/theme";
import TopBar from "../components/TopBar";

// 소유자를 확인할 수 없는 구버전 기록의 복구 화면.
// 이 기기에 남아 있는 로컬 자료만 다루고, 사용자가 명시적으로 확인해야만 옮긴다.
export default function LegacyRecoveryScreen({ navigation }) {
  const { t } = useTranslation();
  const { userProfile, handleClaimLegacyRecords } = useApp();
  const [summary, setSummary] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const signedIn = !!userProfile?.authUserId;

  useEffect(() => {
    let cancelled = false;
    summarizeUnassignedLegacyData()
      .then((value) => { if (!cancelled) setSummary(value); })
      .catch(() => { if (!cancelled) setSummary({ notes: 0, portfolioItems: 0, from: null, to: null }); });
    return () => { cancelled = true; };
  }, []);

  const handleMove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await handleClaimLegacyRecords();
      Alert.alert(t("common.notice"), t("legacyRecovery.moved"), [
        { text: t("common.confirm"), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(t("common.notice"), t("legacyRecovery.failed"));
    } finally {
      setBusy(false);
    }
  }, [busy, handleClaimLegacyRecords, navigation, t]);

  const day = (value) => (value ? String(value).slice(0, 10) : "");
  const canMove = signedIn && confirmed && !busy && (summary?.notes > 0 || summary?.portfolioItems > 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <TopBar
        title={t("legacyRecovery.title")}
        left={<TouchableOpacity onPress={() => navigation.goBack()}><Text style={[T.body, { color: CLight.gray500 }]}>{t("common.back")}</Text></TouchableOpacity>}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[T.caption, { color: CLight.gray700, lineHeight: 20 }]}>{t("legacyRecovery.desc")}</Text>

        <View style={styles.card}>
          {summary === null ? (
            <ActivityIndicator color={CLight.pink} />
          ) : summary.notes === 0 && summary.portfolioItems === 0 ? (
            <Text style={[T.body, { color: CLight.gray700 }]}>{t("legacyRecovery.summary_empty")}</Text>
          ) : (
            <>
              <Text style={[T.body, { color: CLight.gray900 }]}>{t("legacyRecovery.summary_notes", { count: summary.notes })}</Text>
              <Text style={[T.body, { color: CLight.gray900, marginTop: 6 }]}>{t("legacyRecovery.summary_portfolio", { count: summary.portfolioItems })}</Text>
              {summary.from ? (
                <Text style={[T.caption, { color: CLight.gray500, marginTop: 6 }]}>
                  {t("legacyRecovery.summary_period", { from: day(summary.from), to: day(summary.to) })}
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.confirmRow}>
          <Text style={[T.caption, { color: CLight.gray700, flex: 1, lineHeight: 20 }]}>{t("legacyRecovery.confirm_label")}</Text>
          <Switch
            value={confirmed}
            onValueChange={setConfirmed}
            trackColor={{ false: CLight.gray200, true: CLight.pink }}
            thumbColor={CLight.white}
          />
        </View>

        {!signedIn ? (
          <Text style={[T.caption, { color: CLight.pink, marginTop: 8 }]}>{t("legacyRecovery.login_required")}</Text>
        ) : null}

        <TouchableOpacity style={[styles.primaryBtn, !canMove && styles.disabledBtn]} disabled={!canMove} onPress={handleMove}>
          <Text style={[T.captionBold, { color: CLight.white }]}>{t("legacyRecovery.move")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={[T.captionBold, { color: CLight.gray700 }]}>{t("legacyRecovery.keep")}</Text>
        </TouchableOpacity>
        <Text style={[T.micro, { color: CLight.gray500, textAlign: "center", marginTop: 8, lineHeight: 18 }]}>
          {t("legacyRecovery.keep_desc")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CLight.bg },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: CLight.white, borderRadius: 16, padding: 18, marginTop: 16 },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 },
  primaryBtn: { height: 50, borderRadius: 14, backgroundColor: CLight.pink, alignItems: "center", justifyContent: "center", marginTop: 20 },
  disabledBtn: { backgroundColor: CLight.gray200 },
  secondaryBtn: { height: 50, borderRadius: 14, backgroundColor: CLight.gray100, alignItems: "center", justifyContent: "center", marginTop: 10 },
});
