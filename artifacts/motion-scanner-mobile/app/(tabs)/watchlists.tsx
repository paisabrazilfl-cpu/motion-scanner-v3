import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createWatchlist,
  deleteWatchlist,
  getListWatchlistsQueryKey,
  updateWatchlist,
  useListWatchlists,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface WatchlistItem {
  id: number;
  name: string;
  tickers: string[];
  description?: string | null;
}

function WatchlistCard({
  item,
  onDelete,
  onEdit,
  colors,
}: {
  item: WatchlistItem;
  onDelete: () => void;
  onEdit: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.row}>
        <View style={cardStyles.info}>
          <Text style={[cardStyles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{item.name}</Text>
          <Text style={[cardStyles.count, { color: colors.mutedForeground }]}>
            {item.tickers.length} ticker{item.tickers.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity onPress={onEdit} style={cardStyles.iconBtn}>
            <Feather name="edit-2" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={cardStyles.iconBtn}>
            <Feather name="trash-2" size={16} color={colors.abort} />
          </TouchableOpacity>
        </View>
      </View>
      {item.tickers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cardStyles.chipScroll}>
          {item.tickers.map((t) => (
            <View key={t} style={[cardStyles.chip, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Text style={[cardStyles.chipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{t}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function WatchlistsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<WatchlistItem | null>(null);
  const [name, setName] = useState("");
  const [tickersInput, setTickersInput] = useState("");

  const { data: watchlists, isLoading } = useListWatchlists();

  const createMutation = useMutation({
    mutationFn: () =>
      createWatchlist({
        name,
        tickers: tickersInput
          .split(/[\s,]+/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
      closeModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateWatchlist(editing!.id, {
        name,
        tickers: tickersInput
          .split(/[\s,]+/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
      closeModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteWatchlist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setTickersInput("");
    setModalVisible(true);
  };

  const openEdit = (item: WatchlistItem) => {
    setEditing(item);
    setName(item.name);
    setTickersInput(item.tickers.join(", "));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditing(null);
    setName("");
    setTickersInput("");
  };

  const handleDelete = (id: number, watchlistName: string) => {
    Alert.alert("Delete Watchlist", `Remove "${watchlistName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "web" ? 67 : 0,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 20, color: colors.foreground, fontFamily: "Inter_700Bold" },
    addBtn: {
      backgroundColor: colors.go,
      borderRadius: colors.radius,
      padding: 8,
    },
    list: { padding: 16 },
    empty: { alignItems: "center", paddingVertical: 80 },
    emptyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 12 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: Platform.OS === "web" ? 34 : 40,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    modalTitle: { fontSize: 18, color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 16 },
    label: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 6, letterSpacing: 0.5 },
    input: {
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      marginBottom: 14,
    },
    saveBtn: {
      backgroundColor: colors.go,
      borderRadius: colors.radius,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 15 },
    cancelBtn: {
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 8,
    },
    cancelBtnText: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 15 },
    modalHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Watchlists</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate} testID="add-watchlist">
          <Feather name="plus" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={watchlists ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[s.list, Platform.OS === "web" && { paddingBottom: 34 }]}
          renderItem={({ item }) => (
            <WatchlistCard
              item={item as WatchlistItem}
              colors={colors}
              onDelete={() => handleDelete(item.id, item.name)}
              onEdit={() => openEdit(item as WatchlistItem)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          scrollEnabled={!!(watchlists && watchlists.length > 0)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="bookmark" size={44} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No watchlists yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <Pressable style={s.modalOverlay} onPress={closeModal}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>{editing ? "Edit Watchlist" : "New Watchlist"}</Text>
              <Text style={s.label}>NAME</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Momentum Plays"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                testID="watchlist-name-input"
              />
              <Text style={s.label}>TICKERS</Text>
              <TextInput
                style={[s.input, { height: 80, textAlignVertical: "top" }]}
                placeholder="AAPL, TSLA, MSFT..."
                placeholderTextColor={colors.mutedForeground}
                value={tickersInput}
                onChangeText={setTickersInput}
                multiline
                autoCapitalize="characters"
                testID="watchlist-tickers-input"
              />
              <TouchableOpacity
                style={[s.saveBtn, !name.trim() && s.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
              >
                <Text style={s.saveBtnText}>{editing ? "Save Changes" : "Create"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { flex: 1 },
  name: { fontSize: 15, marginBottom: 2 },
  count: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 12, paddingLeft: 12 },
  iconBtn: { padding: 4 },
  chipScroll: { marginTop: 10 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 6,
  },
  chipText: { fontSize: 12 },
});
