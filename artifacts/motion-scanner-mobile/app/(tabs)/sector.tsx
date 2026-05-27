import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGetSectorRotation } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface SectorEntry {
  etf: string;
  name: string;
  ret1d?: number | null;
  ret5d?: number | null;
  ret20d?: number | null;
  rs1d?: number | null;
  rs5d?: number | null;
  rs20d?: number | null;
  leader?: boolean | null;
  laggard?: boolean | null;
}

interface SectorRotation {
  regime: string;
  cyclicalRs?: number | null;
  defensiveRs?: number | null;
  sectors: SectorEntry[];
}

function ReturnBadge({ value, colors }: { value: number | null | undefined; colors: ReturnType<typeof useColors> }) {
  if (value == null) return null;
  const color = value > 0 ? colors.go : value < 0 ? colors.abort : colors.mutedForeground;
  return (
    <Text style={[styles.returnBadge, { color }]}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </Text>
  );
}

function SectorRow({ item, colors }: { item: SectorEntry; colors: ReturnType<typeof useColors> }) {
  const leaderColor = item.leader ? colors.go : item.laggard ? colors.abort : colors.mutedForeground;
  const label = item.leader ? "LEADER" : item.laggard ? "LAGGARD" : "NEUTRAL";

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.etf, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{item.etf}</Text>
        <Text style={[styles.sectorName, { color: colors.mutedForeground }]} numberOfLines={1}>{item.name}</Text>
      </View>
      <View style={styles.rowReturns}>
        <ReturnBadge value={item.ret1d} colors={colors} />
        <ReturnBadge value={item.ret5d} colors={colors} />
        <ReturnBadge value={item.ret20d} colors={colors} />
      </View>
      <View style={[styles.badge, { borderColor: leaderColor, backgroundColor: leaderColor + "22" }]}>
        <Text style={[styles.badgeText, { color: leaderColor }]}>{label}</Text>
      </View>
    </View>
  );
}

function RegimeBanner({ regime, colors }: { regime: string; colors: ReturnType<typeof useColors> }) {
  const upper = regime.toUpperCase();
  const isRiskOn = upper.includes("RISK_ON") || upper.includes("RISK-ON");
  const isRiskOff = upper.includes("RISK_OFF") || upper.includes("RISK-OFF");
  const color = isRiskOn ? colors.go : isRiskOff ? colors.abort : colors.hold;
  const icon = isRiskOn ? "trending-up" : isRiskOff ? "trending-down" : "minus";

  return (
    <View style={[styles.regimeBanner, { backgroundColor: color + "18", borderColor: color }]}>
      <MaterialCommunityIcons name={icon as "trending-up"} size={20} color={color} />
      <View style={{ marginLeft: 10 }}>
        <Text style={[styles.regimeLabel, { color: colors.mutedForeground }]}>MARKET REGIME</Text>
        <Text style={[styles.regimeValue, { color, fontFamily: "Inter_700Bold" }]}>{regime}</Text>
      </View>
    </View>
  );
}

export default function SectorScreen() {
  const colors = useColors();
  const { data, isLoading, isError, refetch } = useGetSectorRotation();
  const rotation = data as SectorRotation | undefined;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : 0,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerTitle: { fontSize: 20, color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 10 },
    colLabels: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 4,
    },
    colLabel: { width: 56, textAlign: "center", fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
    list: { padding: 16, paddingTop: 0 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { color: colors.abort, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 8 },
    retryBtn: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    retryText: { color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14 },
    rsRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    rsCard: {
      flex: 1,
      padding: 10,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    rsLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
    rsValue: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  });

  if (isLoading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={colors.go} />
        <Text style={[s.errorText, { color: colors.mutedForeground, marginTop: 12 }]}>Loading sectors...</Text>
      </View>
    );
  }

  if (isError || !rotation) {
    return (
      <View style={[s.container, s.center]}>
        <MaterialCommunityIcons name="chart-line-variant" size={44} color={colors.mutedForeground} />
        <Text style={s.errorText}>Failed to load sector data</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Sector Rotation</Text>
        <RegimeBanner regime={rotation.regime} colors={colors} />
      </View>

      {(rotation.cyclicalRs != null || rotation.defensiveRs != null) && (
        <View style={s.rsRow}>
          {rotation.cyclicalRs != null && (
            <View style={s.rsCard}>
              <Text style={s.rsLabel}>CYCLICAL RS</Text>
              <Text style={[s.rsValue, { color: colors.go }]}>{rotation.cyclicalRs.toFixed(1)}</Text>
            </View>
          )}
          {rotation.defensiveRs != null && (
            <View style={s.rsCard}>
              <Text style={s.rsLabel}>DEFENSIVE RS</Text>
              <Text style={[s.rsValue, { color: colors.hold }]}>{rotation.defensiveRs.toFixed(1)}</Text>
            </View>
          )}
        </View>
      )}

      <View style={s.colLabels}>
        <Text style={s.colLabel}>1D</Text>
        <Text style={s.colLabel}>5D</Text>
        <Text style={s.colLabel}>20D</Text>
      </View>

      <FlatList
        data={rotation.sectors ?? []}
        keyExtractor={(item) => item.etf}
        contentContainerStyle={[s.list, Platform.OS === "web" && { paddingBottom: 34 }]}
        renderItem={({ item }) => <SectorRow item={item} colors={colors} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        scrollEnabled={!!(rotation.sectors && rotation.sectors.length > 0)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowLeft: { flex: 1 },
  etf: { fontSize: 14, marginBottom: 2 },
  sectorName: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rowReturns: { flexDirection: "row", gap: 4, marginRight: 10 },
  returnBadge: { width: 56, textAlign: "center", fontSize: 12, fontFamily: "Inter_500Medium" },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  regimeBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  regimeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  regimeValue: { fontSize: 15 },
});
