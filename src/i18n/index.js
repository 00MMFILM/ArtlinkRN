import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import ko from "./locales/ko.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import vi from "./locales/vi.json";
import th from "./locales/th.json";
import id from "./locales/id.json";
import ar from "./locales/ar.json";
import es from "./locales/es.json";

const LANGUAGE_KEY = "artlink-language";

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  vi: { translation: vi },
  th: { translation: th },
  id: { translation: id },
  ar: { translation: ar },
  es: { translation: es },
};

const getDeviceLanguage = () => {
  const locale = Localization.getLocales()?.[0]?.languageTag || "ko";
  // Map device locale to our supported languages
  if (locale.startsWith("ko")) return "ko";
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("zh-Hant") || locale.startsWith("zh-TW")) return "zh-TW";
  if (locale.startsWith("zh")) return "zh-CN";
  if (locale.startsWith("vi")) return "vi";
  if (locale.startsWith("th")) return "th";
  if (locale.startsWith("id") || locale.startsWith("ms")) return "id";
  if (locale.startsWith("ar")) return "ar";
  if (locale.startsWith("es")) return "es";
  if (locale.startsWith("en")) return "en";
  return "en";
};

const initI18n = async () => {
  let savedLang = null;
  try {
    savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLang) savedLang = JSON.parse(savedLang);
  } catch {}

  const lng = savedLang || getDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
  });
};

export { initI18n, LANGUAGE_KEY };
export default i18n;
