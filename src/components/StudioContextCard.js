import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { STUDIO } from "../constants/studioTheme";
import { sanitizeStudioMetadata } from "../utils/studioMetadata";

export default function StudioContextCard({ note }) {
  const { t, i18n } = useTranslation();
  const [scriptOpen, setScriptOpen] = useState(false);
  const ko = String(i18n?.language).startsWith("ko");
  const meta = sanitizeStudioMetadata(note);
  if (!meta.rehearsalContext && !meta.applicationContext) return null;
  return <View style={styles.card} testID="studio-context-card">
    <Text style={styles.heading}>{t(meta.rehearsalContext ? "studio.rehearsal" : "studio.application")}</Text>
    {meta.applicationContext?.title ? <Text style={styles.body}>{meta.applicationContext.title}</Text> : null}
    {meta.applicationContext?.country || meta.applicationContext?.location ? <Text style={styles.body}>{[meta.applicationContext.country, meta.applicationContext.location].filter(Boolean).join(" · ")}</Text> : null}
    {meta.rehearsalContext?.role ? <Text style={styles.body}>{meta.rehearsalContext.role}</Text> : null}
    {meta.scriptLanguage ? <Text style={styles.body}>{t("studio.script", { language: t(`studio.language_${meta.scriptLanguage}`) })}</Text> : null}
    {meta.feedbackLanguage ? <Text style={styles.body}>{t("studio.feedback", { language: t(`studio.language_${meta.feedbackLanguage}`) })}</Text> : null}
    {meta.rehearsalContext?.script ? <>
      <TouchableOpacity testID="rehearsal-script-toggle" accessibilityRole="button" accessibilityState={{ expanded: scriptOpen }} style={styles.scriptButton} onPress={() => setScriptOpen(value => !value)}>
        <Text style={styles.heading}>{ko ? (scriptOpen ? "연습 대사 접기" : "같은 대사 펼치기") : (scriptOpen ? "Hide rehearsal script" : "Read the same script")}</Text>
      </TouchableOpacity>
      {scriptOpen ? <Text testID="rehearsal-script" selectable style={styles.body}>{meta.rehearsalContext.script}</Text> : null}
    </> : null}
    <Text style={styles.caption}>{t(meta.rehearsalContext ? "studio.audio_hint" : "studio.application_hint")}</Text>
  </View>;
}

const styles = StyleSheet.create({
  scriptButton: { minHeight: 44, justifyContent: "center", marginTop: 8 },
  card: { padding: 16, marginVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: STUDIO.line, backgroundColor: STUDIO.background },
  heading: { fontSize: 14, fontWeight: "700", color: STUDIO.ink, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21, color: STUDIO.ink },
  caption: { fontSize: 12, lineHeight: 18, color: STUDIO.muted, marginTop: 8 },
});
