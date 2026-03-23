import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { CLight, T } from "../constants/theme";

const TERMS_TEXT = `ArtLink 이용약관

최종 수정일: 2026년 3월 1일

제1조 (목적)
본 약관은 ArtLink(이하 "앱")가 제공하는 서비스의 이용 조건 및 절차, 이용자와 앱 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (서비스 개요)
ArtLink는 예술가 및 창작자를 위한 연습 노트 관리, 매칭, 포트폴리오 관리 서비스를 제공합니다.

제3조 (이용자의 의무)
1. 이용자는 다음 행위를 해서는 안 됩니다:
   - 타인에 대한 괴롭힘, 위협, 차별적 발언
   - 불법적이거나 유해한 콘텐츠 게시
   - 음란물, 폭력적 콘텐츠, 혐오 발언 게시
   - 타인의 개인정보 무단 수집 및 유포
   - 스팸, 사기, 허위 정보 유포
   - 지적재산권 침해
2. 이용자는 본인이 게시한 콘텐츠에 대한 책임을 집니다.

제4조 (콘텐츠 정책)
1. 본 앱은 부적절한 콘텐츠 및 악용 행위에 대해 무관용 정책을 적용합니다.
2. 부적절한 콘텐츠에는 다음이 포함되나 이에 국한되지 않습니다:
   - 성적으로 노골적인 콘텐츠
   - 폭력을 조장하는 콘텐츠
   - 인종, 성별, 종교, 장애 등에 기반한 차별적 콘텐츠
   - 불법 활동을 조장하는 콘텐츠
3. 부적절한 콘텐츠가 발견될 경우, 사전 통지 없이 삭제될 수 있습니다.

제5조 (신고 및 차단)
1. 이용자는 부적절한 콘텐츠나 악용 행위를 앱 내 신고 기능을 통해 신고할 수 있습니다.
2. 이용자는 다른 이용자를 차단할 수 있으며, 차단 시 해당 이용자의 콘텐츠가 즉시 피드에서 제거됩니다.
3. 신고된 콘텐츠는 운영팀이 24시간 이내에 검토하고 조치합니다.

제6조 (제재)
1. 본 약관을 위반한 이용자는 다음과 같은 제재를 받을 수 있습니다:
   - 콘텐츠 삭제
   - 서비스 이용 일시 정지
   - 계정 영구 정지
2. 부적절한 콘텐츠를 게시한 이용자는 서비스에서 즉시 퇴출될 수 있습니다.

제7조 (개인정보 보호)
1. 앱은 서비스 제공에 필요한 최소한의 개인정보만 수집합니다.
2. 수집된 정보는 서비스 제공 목적으로만 사용되며 제3자에게 제공하지 않습니다.
3. 이용자는 언제든지 계정 삭제를 통해 개인정보를 삭제할 수 있습니다.

제8조 (면책)
1. 앱은 이용자 간 분쟁에 대해 책임지지 않습니다.
2. 앱은 서비스 중단, 데이터 손실 등으로 인한 손해에 대해 책임지지 않습니다.

제9조 (문의)
서비스 이용 관련 문의사항은 아래로 연락해 주세요:
이메일: lcy1152@naver.com
`;

export default function EULAScreen({ onAccept, onDataConsent }) {
  const [agreed, setAgreed] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={[T.h2, { color: CLight.gray900 }]}>이용약관</Text>
        <Text style={[T.caption, { color: CLight.gray500, marginTop: 4 }]}>
          서비스 이용을 위해 약관에 동의해 주세요
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Text style={styles.termsText}>{TERMS_TEXT}</Text>
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
            위 이용약관에 동의합니다
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
            AI 품질 개선을 위해 연습 노트와 피드백을 익명으로 수집하는 데 동의합니다 (선택)
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
          <Text style={styles.acceptBtnText}>동의하고 계속하기</Text>
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
