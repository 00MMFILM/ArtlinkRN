import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";

export default function EULAScreen({ onAccept, onDataConsent }) {
  const { t } = useTranslation();

  const termsText = [
    t("eula_doc.title"),
    "",
    t("eula_doc.last_updated"),
    "",
    t("eula_doc.article1_title"),
    t("eula_doc.article1_body"),
    "",
    t("eula_doc.article2_title"),
    t("eula_doc.article2_body"),
    "",
    t("eula_doc.article3_title"),
    t("eula_doc.article3_body"),
    "",
    t("eula_doc.article4_title"),
    t("eula_doc.article4_body"),
    "",
    t("eula_doc.article5_title"),
    t("eula_doc.article5_body"),
    "",
    t("eula_doc.article6_title"),
    t("eula_doc.article6_body"),
    "",
    t("eula_doc.article7_title"),
    t("eula_doc.article7_body"),
    "",
    t("eula_doc.article8_title"),
    t("eula_doc.article8_body"),
    "",
    t("eula_doc.article9_title"),
    t("eula_doc.article9_body"),
  ].join("\n");
  const [agreed, setAgreed] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={[T.h2, { color: CLight.gray900 }]}>{t("eula.title")}</Text>
        <Text style={[T.caption, { color: CLight.gray500, marginTop: 4 }]}>
          {t("eula.subtitle")}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Text style={styles.termsText}>{termsText}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAgreed(!agreed)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxActive]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[T.body, { color: CLight.gray900, flex: 1 }]}>
            {t("eula.agree_terms")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setDataConsent(!dataConsent)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, dataConsent && styles.checkboxActive]}>
            {dataConsent && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[T.small, { color: CLight.gray600, flex: 1 }]}>
            {t("eula.agree_data")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.acceptBtn, !agreed && styles.acceptBtnDisabled]}
          onPress={() => {
            if (onDataConsent) onDataConsent(dataConsent);
            onAccept();
          }}
          disabled={!agreed}
          activeOpacity={0.8}
        >
          <Text style={styles.acceptBtnText}>{t("eula.accept")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: CLight.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  termsText: {
    ...T.small,
    color: CLight.gray700,
    lineHeight: 24,
  },
  footer: {
    padding: 24,
    backgroundColor: CLight.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: CLight.gray300,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    backgroundColor: CLight.pink,
    borderColor: CLight.pink,
  },
  checkmark: {
    color: CLight.white,
    fontSize: 14,
    fontWeight: "700",
  },
  acceptBtn: {
    backgroundColor: CLight.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  acceptBtnDisabled: {
    backgroundColor: CLight.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptBtnText: {
    ...T.bodyBold,
    color: "#FFFFFF",
  },
});
