import React from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { CLight } from "../constants/theme";

/**
 * 프리미엄 왕관 배지.
 * 결제해도 앱 어디에도 표시가 없어 구독자가 "결제 전과 똑같다"고 느끼던 문제(2026-09-17) 대응.
 *
 * @param {number}  size  왕관 글자 크기 (기본 14)
 * @param {boolean} label "프리미엄" 라벨 동반 여부
 */
export default function PremiumBadge({ size = 14, label = false, style }) {
  const { t } = useTranslation();
  return (
    <Text testID="premium-badge" style={[{ fontSize: size }, style]}>
      {"👑"}
      {label ? (
        <Text style={{ fontSize: Math.round(size * 0.85), color: CLight.pink, fontWeight: "700" }}>
          {" "}{t("premium.badge")}
        </Text>
      ) : null}
    </Text>
  );
}
