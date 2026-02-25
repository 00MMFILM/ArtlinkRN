import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  ActionSheetIOS,
  Platform,
  Alert,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { timeAgo, truncate, FIELDS } from "../utils/helpers";
import EmptyState from "../components/EmptyState";

const SORT_OPTIONS = [
  { key: "newest", label: "최신순" },
  { key: "oldest", label: "오래된순" },
  { key: "starred", label: "즐겨찾기" },
];

export default function NotesScreen({ navigation }) {
  const { savedNotes, handleDeleteNote, handleToggleStar, fieldOrder } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedField, setSelectedField] = useState("all");
  const [sortKey, setSortKey] = useState("newest");

  // Build the ordered field tabs using fieldOrder from context
  const fieldTabs = useMemo(() => {
    const ordered = fieldOrder && fieldOrder.length > 0 ? fieldOrder : FIELDS;
    return [{ key: "all", label: "전체", emoji: "📋" }, ...ordered.map((f) => ({
      key: f,
      label: FIELD_LABELS[f] || f,
      emoji: FIELD_EMOJIS[f] || "📝",
    }))];
  }, [fieldOrder]);

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let notes = [...savedNotes];

    // Field filter
    if (selectedField !== "all") {
      notes = notes.filter((n) => n.field === selectedField);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      notes = notes.filter(
        (n) =>
          (n.title || "").toLowerCase().includes(q) ||
          (n.content || "").toLowerCase().includes(q) ||
          (n.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortKey === "newest") {
      notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortKey === "oldest") {
      notes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortKey === "starred") {
      notes.sort((a, b) => {
        if (a.starred === b.starred) return new Date(b.createdAt) - new Date(a.createdAt);
        return a.starred ? -1 : 1;
      });
    }

    return notes;
  }, [savedNotes, selectedField, searchQuery, sortKey]);

  // Delete confirmation
  const confirmDelete = useCallback(
    (noteId, noteTitle) => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: noteTitle || "이 노트",
            options: ["취소", "삭제", "즐겨찾기 토글"],
            destructiveButtonIndex: 1,
            cancelButtonIndex: 0,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) handleDeleteNote(noteId);
            if (buttonIndex === 2) handleToggleStar(noteId);
          }
        );
      } else {
        Alert.alert("노트 관리", noteTitle || "이 노트", [
          { text: "취소", style: "cancel" },
          { text: "즐겨찾기 토글", onPress: () => handleToggleStar(noteId) },
          { text: "삭제", style: "destructive", onPress: () => handleDeleteNote(noteId) },
        ]);
      }
    },
    [handleDeleteNote, handleToggleStar]
  );

  // Navigate to detail
  const handleNotePress = useCallback(
    (note) => {
      navigation.navigate("NoteDetail", { noteId: note.id });
    },
    [navigation]
  );

  // Navigate to create
  const handleCreatePress = useCallback(() => {
    navigation.navigate("NoteCreate");
  }, [navigation]);

  // Render a single note card
  const renderNoteCard = useCallback(
    ({ item: note }) => (
      <NoteCard
        note={note}
        onPress={() => handleNotePress(note)}
        onLongPress={() => confirmDelete(note.id, note.title)}
        onToggleStar={() => handleToggleStar(note.id)}
      />
    ),
    [handleNotePress, confirmDelete, handleToggleStar]
  );

  const keyExtractor = useCallback((item) => String(item.id), []);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="노트 검색..."
            placeholderTextColor={CLight.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Field Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {fieldTabs.map((tab) => {
            const isActive = selectedField === tab.key;
            const color = tab.key === "all" ? CLight.pink : FIELD_COLORS[tab.key] || CLight.gray500;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isActive ? `${color}15` : CLight.white,
                    borderColor: isActive ? color : CLight.gray200,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
                onPress={() => setSelectedField(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.filterEmoji}>{tab.emoji}</Text>
                <Text
                  style={[
                    styles.filterLabel,
                    { color: isActive ? color : CLight.gray500, fontWeight: isActive ? "600" : "400" },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Sort Options */}
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.sortChip, sortKey === opt.key && styles.sortChipActive]}
            onPress={() => setSortKey(opt.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.sortChipText,
                sortKey === opt.key && styles.sortChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.noteCount}>{filteredNotes.length}개의 노트</Text>
      </View>

      {/* Notes List */}
      {filteredNotes.length > 0 ? (
        <FlatList
          data={filteredNotes}
          renderItem={renderNoteCard}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      ) : (
        <EmptyState
          icon={selectedField !== "all" ? FIELD_EMOJIS[selectedField] || "📝" : "📝"}
          title={searchQuery ? "검색 결과가 없어요" : "아직 노트가 없어요"}
          message={
            searchQuery
              ? "다른 검색어로 시도해보세요"
              : "오른쪽 아래 + 버튼을 눌러\n첫 번째 연습 노트를 기록해보세요!"
          }
        />
      )}

      {/* FAB Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreatePress}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Note Card Component ───
function NoteCard({ note, onPress, onLongPress, onToggleStar }) {
  const fieldColor = FIELD_COLORS[note.field] || CLight.gray500;
  const fieldEmoji = FIELD_EMOJIS[note.field] || "📝";
  const fieldLabel = FIELD_LABELS[note.field] || note.field;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      delayLongPress={400}
    >
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.fieldBadge, { backgroundColor: `${fieldColor}15` }]}>
          <Text style={styles.fieldBadgeEmoji}>{fieldEmoji}</Text>
          <Text style={[styles.fieldBadgeLabel, { color: fieldColor }]}>{fieldLabel}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          {note.aiComment ? (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={onToggleStar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.starIcon}>{note.starred ? "★" : "☆"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.cardTitle} numberOfLines={1}>
        {note.title || "제목 없음"}
      </Text>

      {/* Content Preview */}
      {note.content ? (
        <Text style={styles.cardContent} numberOfLines={2}>
          {truncate(note.content, 120)}
        </Text>
      ) : null}

      {/* Tags */}
      {note.tags && note.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {note.tags.slice(0, 4).map((tag, idx) => (
            <View key={idx} style={[styles.tagPill, { backgroundColor: `${fieldColor}10` }]}>
              <Text style={[styles.tagPillText, { color: fieldColor }]}>#{tag}</Text>
            </View>
          ))}
          {note.tags.length > 4 && (
            <Text style={styles.tagMore}>+{note.tags.length - 4}</Text>
          )}
        </View>
      ) : null}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{timeAgo(note.createdAt)}</Text>
        {note.seriesName ? (
          <View style={styles.seriesBadge}>
            <Text style={styles.seriesText}>{note.seriesName}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CLight.bg,
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: CLight.topBarBg,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLight.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    ...T.body,
    color: CLight.gray900,
    paddingVertical: 0,
  },

  // Field Filter
  filterSection: {
    backgroundColor: CLight.topBarBg,
    paddingBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  filterEmoji: {
    fontSize: 14,
  },
  filterLabel: {
    fontSize: 13,
  },

  // Sort
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: CLight.white,
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  sortChipActive: {
    backgroundColor: CLight.pink,
    borderColor: CLight.pink,
  },
  sortChipText: {
    ...T.micro,
    color: CLight.gray500,
  },
  sortChipTextActive: {
    color: CLight.white,
    fontWeight: "600",
  },
  noteCount: {
    ...T.micro,
    color: CLight.gray400,
    marginLeft: "auto",
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 100,
  },

  // Card
  card: {
    backgroundColor: CLight.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CLight.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  fieldBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  fieldBadgeEmoji: {
    fontSize: 12,
  },
  fieldBadgeLabel: {
    ...T.microBold,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiBadge: {
    backgroundColor: CLight.pinkSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  aiBadgeText: {
    ...T.tinyBold,
    color: CLight.pink,
  },
  starIcon: {
    fontSize: 18,
    color: CLight.orange,
  },
  cardTitle: {
    ...T.title,
    color: CLight.gray900,
    marginBottom: 4,
  },
  cardContent: {
    ...T.caption,
    color: CLight.gray500,
    marginBottom: 8,
  },

  // Tags
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagPillText: {
    ...T.tiny,
    fontWeight: "500",
  },
  tagMore: {
    ...T.tiny,
    color: CLight.gray400,
    alignSelf: "center",
  },

  // Footer
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: {
    ...T.micro,
    color: CLight.gray400,
  },
  seriesBadge: {
    backgroundColor: CLight.gray100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  seriesText: {
    ...T.tiny,
    color: CLight.gray500,
  },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CLight.pink,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: CLight.white,
    fontWeight: "300",
    marginTop: -2,
  },
});
