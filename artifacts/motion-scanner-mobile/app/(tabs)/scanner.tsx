import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
  getListWatchlistsQueryKey,
  runScan,
  useListWatchlists,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Verdict = "GO" | "HOLD" | "ABORT";

interface Candidate {
  ticker: string;
  verdict: Verdict;
  score: number;
  reason?: string;
  technical?: Record<string, unknown> | null;
}

interface ScanResult {
  candidates: Candidate[];
  hold: Candidate[];
  rejected: Candidate[];
}

function VerdictBadge({ verdict, colors }: { verdict: Verdict; colors: ReturnType<typeof useColors> }) {
  const color =
    verdict === "GO" ? colors.go :
    verdict === "HOLD" ? colors.hold :
    colors.abort;
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: color + "22" }]}>
      <Text style={[styles.badgeText, { color }]}>{verdict}</Text>
    </View>
  );
}

function CandidateRow({ item, colors }: { item: Candidate; colors: ReturnType<typeof useColors> }) {
  const rsi = (item.technical as Record<string, unknown> | null)?.rsi;
  const adx = (item.technical as Record<string, unknown> | null)?.adx;
  return (
    <View style={[styles.candidateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.candidateLeft}>
        <Text style={[styles.ticker, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{item.ticker}</Text>
        {typeof rsi === "number" && (
          <Text style={[styles.candidateMeta, { color: colors.mutedForeground }]}>
            RSI {rsi.toFixed(1)}
            {typeof adx === "number" ? `  ADX ${adx.toFixed(1)}` : ""}
          </Text>
        )}
      </View>
      <View style={styles.candidateRight}>
        <Text style={[styles.score, { color: colors.mutedForeground }]}>{Math.round(item.score)}</Text>
        <VerdictBadge verdict={item.verdict} colors={colors} />
      </View>
    </View>
  );
}

export default function ScannerScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();

  const [tickerInput, setTickerInput] = useState("");
  const [selectedWatchlist, setSelectedWatchlist] = useState<number | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [activeTab, setActiveTab] = useState<"go" | "hold" | "abort">("go");

  const { data: watchlists } = useListWatchlists();

  const scanMutation = useMutation({
    mutationFn: async () => {
      const tickers = tickerInput
        .split(/[\s,]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      return runScan({
        tickers: tickers.length > 0 ? tickers : [],
        watchlistId: selectedWatchlist,
      });
    },
    onSuccess: (data) => {
      setResult(data as unknown as ScanResult);
      queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : 0,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 20,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 12,
    },
    inputRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
    input: {
      flex: 1,
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
    },
    scanBtn: {
      backgroundColor: colors.go,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    scanBtnText: { color: "#000", fontFamily: "Inter_700Bold", fontSize: 14 },
    watchlistScroll: { marginBottom: 4 },
    watchlistChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      marginRight: 8,
    },
    watchlistChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 8,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: colors.radius,
      alignItems: "center",
      borderWidth: 1,
    },
    tabBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    list: { padding: 16 },
    empty: { alignItems: "center", paddingVertical: 60 },
    emptyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 8 },
    emptyHint: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
    error: { color: colors.abort, fontFamily: "Inter_400Regular", fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
    sectionLabel: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  });

  const currentList = activeTab === "go"
    ? result?.candidates.filter((c) => c.verdict === "GO") ?? []
    : activeTab === "hold"
    ? result?.hold ?? []
    : result?.rejected ?? [];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Scanner</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Tickers: AAPL, TSLA, MSFT..."
            placeholderTextColor={colors.mutedForeground}
            value={tickerInput}
            onChangeText={setTickerInput}
            autoCapitalize="characters"
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[s.scanBtn, scanMutation.isPending && { opacity: 0.6 }]}
            onPress={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            testID="scan-button"
          >
            {scanMutation.isPending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={s.scanBtnText}>RUN</Text>
            )}
          </TouchableOpacity>
        </View>
        {watchlists && watchlists.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.watchlistScroll}>
            <TouchableOpacity
              style={[
                s.watchlistChip,
                {
                  borderColor: selectedWatchlist === null ? colors.primary : colors.border,
                  backgroundColor: selectedWatchlist === null ? colors.accent : "transparent",
                },
              ]}
              onPress={() => setSelectedWatchlist(null)}
            >
              <Text style={[s.watchlistChipText, { color: selectedWatchlist === null ? colors.foreground : colors.mutedForeground }]}>
                Custom
              </Text>
            </TouchableOpacity>
            {watchlists.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[
                  s.watchlistChip,
                  {
                    borderColor: selectedWatchlist === w.id ? colors.primary : colors.border,
                    backgroundColor: selectedWatchlist === w.id ? colors.accent : "transparent",
                  },
                ]}
                onPress={() => {
                  setSelectedWatchlist(w.id);
                  setTickerInput("");
                }}
              >
                <Text style={[s.watchlistChipText, { color: selectedWatchlist === w.id ? colors.foreground : colors.mutedForeground }]}>
                  {w.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {scanMutation.isError && (
        <Text style={s.error}>Scan failed — check your tickers and try again.</Text>
      )}

      {result && (
        <View style={s.tabs}>
          {(["go", "hold", "abort"] as const).map((tab) => {
            const count =
              tab === "go"
                ? result.candidates.filter((c) => c.verdict === "GO").length
                : tab === "hold"
                ? result.hold.length
                : result.rejected.length;
            const color = tab === "go" ? colors.go : tab === "hold" ? colors.hold : colors.abort;
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[
                  s.tabBtn,
                  {
                    borderColor: active ? color : colors.border,
                    backgroundColor: active ? color + "22" : "transparent",
                  },
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.tabBtnText, { color: active ? color : colors.mutedForeground }]}>
                  {tab.toUpperCase()} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {scanMutation.isPending ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.go} />
          <Text style={[s.emptyText, { marginTop: 16 }]}>Scanning markets...</Text>
        </View>
      ) : result ? (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.ticker}
          contentContainerStyle={[s.list, Platform.OS === "web" && { paddingBottom: 34 }]}
          renderItem={({ item }) => <CandidateRow item={item} colors={colors} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          scrollEnabled={!!currentList.length}
          ListEmptyComponent={
            <View style={s.empty}>
              <MaterialCommunityIcons name="chart-line" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No {activeTab.toUpperCase()} results</Text>
            </View>
          }
        />
      ) : (
        <View style={s.empty}>
          <Feather name="search" size={40} color={colors.mutedForeground} />
          <Text style={s.emptyText}>Enter tickers or select a watchlist</Text>
          <Text style={s.emptyHint}>Separate tickers with spaces or commas</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  candidateLeft: { flex: 1 },
  candidateRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  ticker: { fontSize: 15, marginBottom: 2 },
  candidateMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  score: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
