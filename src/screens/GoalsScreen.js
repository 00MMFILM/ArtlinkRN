import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Modal,
  Alert,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS } from "../constants/theme";
import TopBar from "../components/TopBar";
import { FIELDS, getFieldLabel, getFieldEmoji } from "../utils/helpers";

export default function GoalsScreen({ navigation }) {
  const { goals, handleUpdateGoals } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formField, setFormField] = useState("acting");
  const [formTarget, setFormTarget] = useState("");
  const [formDeadline, setFormDeadline] = useState("");

  const handleAddGoal = () => {
    if (!formTitle.trim()) {
      Alert.alert("오류", "목표 제목을 입력해주세요.");
      return;
    }
    const target = parseInt(formTarget, 10) || 10;
    const newGoal = {
      id: Date.now(),
      title: formTitle.trim(),
      field: formField,
      targetCount: target,
      currentCount: 0,
      deadline: formDeadline.trim() || "2026-06-30",
      completed: false,
      createdAt: new Date().toISOString(),
    };
    handleUpdateGoals([...goals, newGoal]);
    setFormTitle("");
    setFormField("acting");
    setFormTarget("");
    setFormDeadline("");
    setShowForm(false);
  };

  const handleToggleComplete = (goalId) => {
    const updated = goals.map((g) =>
      g.id === goalId
        ? { ...g, completed: !g.completed, currentCount: !g.completed ? g.targetCount : g.currentCount }
        : g
    );
    handleUpdateGoals(updated);
  };

  const handleDeleteGoal = (goalId) => {
    Alert.alert("목표 삭제", "이 목표를 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => handleUpdateGoals(goals.filter((g) => g.id !== goalId)),
      },
    ]);
  };

  const getProgress = (goal) => {
    if (goal.targetCount === 0) return 0;
    return Math.min(100, Math.round((goal.currentCount / goal.targetCount) * 100));
  };

  const getDaysLeft = (deadline) => {
    const diff = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    if (diff <= 0) return "기한 초과";
    return `${diff}일 남음`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="목표 관리"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} 뒤로</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity onPress={() => setShowForm(true)}>
            <Text style={[T.captionBold, { color: CLight.pink }]}>+ 추가</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[T.h3, { color: CLight.pink }]}>{goals.length}</Text>
            <Text style={[T.micro, { color: CLight.gray500 }]}>전체 목표</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[T.h3, { color: CLight.green }]}>
              {goals.filter((g) => g.completed).length}
            </Text>
            <Text style={[T.micro, { color: CLight.gray500 }]}>달성 완료</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[T.h3, { color: CLight.orange }]}>
              {goals.filter((g) => !g.completed).length}
            </Text>
            <Text style={[T.micro, { color: CLight.gray500 }]}>진행 중</Text>
          </View>
        </View>

        {/* Goal list */}
        {goals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
              아직 설정된 목표가 없습니다.
            </Text>
            <Text style={[T.small, { color: CLight.gray400, textAlign: "center", marginTop: 4 }]}>
              우측 상단 '+ 추가' 버튼으로 첫 목표를 만들어보세요!
            </Text>
          </View>
        ) : (
          goals.map((goal) => (
            <View
              key={goal.id}
              style={[styles.goalCard, goal.completed && styles.goalCardCompleted]}
            >
              <View style={styles.goalHeader}>
                <View
                  style={[
                    styles.fieldBadge,
                    { backgroundColor: (FIELD_COLORS[goal.field] || CLight.pink) + "18" },
                  ]}
                >
                  <Text style={[T.micro, { color: FIELD_COLORS[goal.field] || CLight.pink }]}>
                    {getFieldEmoji(goal.field)} {getFieldLabel(goal.field)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteGoal(goal.id)}>
                  <Text style={[T.caption, { color: CLight.gray400 }]}>X</Text>
                </TouchableOpacity>
              </View>

              <Text
                style={[
                  T.title,
                  {
                    color: goal.completed ? CLight.gray400 : CLight.gray900,
                    marginTop: 8,
                    textDecorationLine: goal.completed ? "line-through" : "none",
                  },
                ]}
              >
                {goal.title}
              </Text>

              {/* Progress */}
              <View style={styles.progressSection}>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${getProgress(goal)}%`,
                        backgroundColor: goal.completed
                          ? CLight.green
                          : FIELD_COLORS[goal.field] || CLight.pink,
                      },
                    ]}
                  />
                </View>
                <Text style={[T.microBold, { color: CLight.gray500, marginTop: 4 }]}>
                  {goal.currentCount} / {goal.targetCount} ({getProgress(goal)}%)
                </Text>
              </View>

              {/* Footer */}
              <View style={styles.goalFooter}>
                <Text
                  style={[
                    T.micro,
                    {
                      color: getDaysLeft(goal.deadline) === "기한 초과"
                        ? CLight.red
                        : CLight.gray400,
                    },
                  ]}
                >
                  {goal.deadline} | {getDaysLeft(goal.deadline)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.completeBtn,
                    goal.completed && styles.completeBtnDone,
                  ]}
                  onPress={() => handleToggleComplete(goal.id)}
                >
                  <Text
                    style={[
                      T.microBold,
                      { color: goal.completed ? CLight.white : CLight.green },
                    ]}
                  >
                    {goal.completed ? "달성!" : "완료"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Add goal button */}
        <TouchableOpacity
          style={styles.addBtnLarge}
          onPress={() => setShowForm(true)}
        >
          <Text style={[T.captionBold, { color: CLight.pink }]}>
            + 새 목표 추가
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add goal modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[T.h3, { color: CLight.gray900, marginBottom: 20 }]}>
              목표 추가
            </Text>

            {/* Title */}
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 6 }]}>
              목표 제목
            </Text>
            <TextInput
              style={styles.input}
              placeholder="예: 연기 노트 30개 작성하기"
              placeholderTextColor={CLight.gray400}
              value={formTitle}
              onChangeText={setFormTitle}
            />

            {/* Field picker */}
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 6, marginTop: 14 }]}>
              분야
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={styles.fieldPicker}>
                {FIELDS.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.fieldChip,
                      formField === f && {
                        backgroundColor: (FIELD_COLORS[f] || CLight.pink) + "18",
                        borderColor: FIELD_COLORS[f] || CLight.pink,
                      },
                    ]}
                    onPress={() => setFormField(f)}
                  >
                    <Text
                      style={[
                        T.micro,
                        {
                          color: formField === f
                            ? FIELD_COLORS[f] || CLight.pink
                            : CLight.gray500,
                        },
                      ]}
                    >
                      {getFieldEmoji(f)} {getFieldLabel(f)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Target count */}
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 6, marginTop: 14 }]}>
              목표 횟수
            </Text>
            <TextInput
              style={styles.input}
              placeholder="예: 30"
              placeholderTextColor={CLight.gray400}
              keyboardType="number-pad"
              value={formTarget}
              onChangeText={setFormTarget}
            />

            {/* Deadline */}
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 6, marginTop: 14 }]}>
              목표 기한 (YYYY-MM-DD)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="예: 2026-06-30"
              placeholderTextColor={CLight.gray400}
              value={formDeadline}
              onChangeText={setFormDeadline}
            />

            {/* Buttons */}
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowForm(false)}
              >
                <Text style={[T.captionBold, { color: CLight.gray500 }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddGoal}>
                <Text style={[T.captionBold, { color: CLight.white }]}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    justifyContent: "space-around",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryItem: { alignItems: "center" },
  emptyCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  goalCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  goalCardCompleted: {
    opacity: 0.7,
    backgroundColor: CLight.gray50,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  progressSection: { marginTop: 12 },
  progressBarBg: {
    height: 8,
    backgroundColor: CLight.gray100,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  goalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  completeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: CLight.green,
  },
  completeBtnDone: {
    backgroundColor: CLight.green,
    borderColor: CLight.green,
  },
  addBtnLarge: {
    marginTop: 8,
    backgroundColor: CLight.white,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: CLight.pink,
    borderStyle: "dashed",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: CLight.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: CLight.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  input: {
    backgroundColor: CLight.inputBg,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...T.body,
    color: CLight.gray900,
  },
  fieldPicker: {
    flexDirection: "row",
    gap: 8,
  },
  fieldChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CLight.gray200,
    backgroundColor: CLight.white,
  },
  modalBtns: {
    flexDirection: "row",
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CLight.gray100,
    alignItems: "center",
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CLight.pink,
    alignItems: "center",
  },
});
