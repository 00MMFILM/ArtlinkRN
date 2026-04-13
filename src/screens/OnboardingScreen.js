import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: W, height: H } = Dimensions.get("window");

// Artlink brand colors from the logo
const ORBS = [
  { color: "#4A6CF7", size: 220, x: -40, y: H * 0.06, duration: 7000 },
  { color: "#FF2D78", size: 180, x: W * 0.55, y: H * 0.02, duration: 8000 },
  { color: "#AF52DE", size: 160, x: W * 0.2, y: H * 0.22, duration: 9000 },
  { color: "#FF9500", size: 120, x: W * 0.65, y: H * 0.28, duration: 6500 },
  { color: "#5AC8FA", size: 100, x: W * 0.05, y: H * 0.35, duration: 7500 },
  { color: "#34C759", size: 80, x: W * 0.7, y: H * 0.38, duration: 8500 },
];

const GlowOrb = ({ color, size, x, y, duration }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 1500, useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 12, 0] });
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 1] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    />
  );
};

// Animated line that draws itself
const AnimatedLine = ({ delay, startX, width: lineW }) => {
  const scaleX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(scaleX, { toValue: 1, tension: 40, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: startX,
        height: 2,
        width: lineW,
        borderRadius: 1,
        backgroundColor: "rgba(255,255,255,0.06)",
        transform: [{ scaleX }],
      }}
    />
  );
};

export default function OnboardingScreen({ onComplete }) {
  // Staggered entrance animations
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(40)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(40)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const tagsOpacity = useRef(new Animated.Value(0)).current;
  const tagsY = useRef(new Animated.Value(30)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.stagger(250, [
      // Logo
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
      // Title
      Animated.parallel([
        Animated.timing(titleY, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      // Subtitle
      Animated.parallel([
        Animated.timing(subtitleY, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      // Tags
      Animated.parallel([
        Animated.timing(tagsY, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(tagsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      // Button
      Animated.parallel([
        Animated.timing(btnY, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const FIELDS = [
    { label: "Acting", color: "#FF2D78" },
    { label: "Music", color: "#AF52DE" },
    { label: "Art", color: "#FF9500" },
    { label: "Dance", color: "#5AC8FA" },
    { label: "Literature", color: "#34C759" },
    { label: "Film", color: "#4A6CF7" },
  ];

  return (
    <View style={styles.container}>
      {/* Dark gradient background */}
      <LinearGradient
        colors={["#0A0A1A", "#121228", "#0A0A1A"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Animated glow orbs */}
      {ORBS.map((orb, i) => (
        <GlowOrb key={i} {...orb} />
      ))}

      {/* Content */}
      <View style={styles.content}>
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Image
            source={require("../../assets/logo-full.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Title */}
        <Animated.Text style={[styles.title, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          {"Your AI Art Coach"}
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] }]}>
          {"Record your practice.\nGet personalized feedback.\nTrack your growth."}
        </Animated.Text>

        {/* Field tags */}
        <Animated.View style={[styles.tagsRow, { opacity: tagsOpacity, transform: [{ translateY: tagsY }] }]}>
          {FIELDS.map((f, i) => (
            <View key={i} style={[styles.tag, { borderColor: f.color + "40" }]}>
              <View style={[styles.tagDot, { backgroundColor: f.color }]} />
              <Text style={styles.tagText}>{f.label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>

      {/* Bottom CTA */}
      <Animated.View style={[styles.bottomArea, { opacity: btnOpacity, transform: [{ translateY: btnY }] }]}>
        <TouchableOpacity onPress={onComplete} activeOpacity={0.8} style={styles.ctaWrap}>
          <LinearGradient
            colors={["#FF2D78", "#AF52DE", "#4A6CF7"]}
            style={styles.ctaBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.ctaText}>Get Started</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Free for all artists
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -40,
  },

  // Logo
  logoWrap: { marginBottom: 32 },
  logo: { width: 200, height: 120 },

  // Title
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  // Subtitle
  subtitle: {
    fontSize: 17,
    fontWeight: "400",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 36,
  },

  // Tags
  tagsRow: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 5,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  tagDot: { width: 4, height: 4, borderRadius: 2 },
  tagText: { fontSize: 11, fontWeight: "500", color: "rgba(255,255,255,0.7)" },

  // Bottom
  bottomArea: {
    paddingHorizontal: 32,
    paddingBottom: 56,
    alignItems: "center",
  },
  ctaWrap: { width: "100%", marginBottom: 16 },
  ctaBtn: {
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  footerText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "400",
  },
});
