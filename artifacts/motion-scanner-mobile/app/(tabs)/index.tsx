import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useGetDashboardSummary, useGetSectorRotation } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

interface TopTicker {
  ticker: string;
  goCount: number;
  avgScore: number;
}

interface RecentActivity {
  id: number;
  timestamp: string;
  goCount?: number | null;
  holdCount?: number | null;
  rejectedCount?: number | null;
  avgScore?: number | null;
  tickerCount?: number | null;
}

function StatCard({
  label,
  value,
  icon,
  accent,
  colors,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[statStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MaterialCommunityIcons
        name={icon as "fire"}
        size={20}
        color={accent ?? colors.mutedForeground}
        style={statStyles.icon}
      />
      <Text style={[statStyles.value, { color: accent ?? colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function TopTickerRow({
  item,
  index,
  colors,
}: {
  item: TopTicker;
  index: number;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[tickerStyles.row, { borderColor: colors.border }]}>
      <Text style={[tickerStyles.rank, { color: colors.mutedForeground }]}>{index + 1}</Text>
      <Text style={[tickerStyles.ticker, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {item.ticker}
      </Text>
      <View style={tickerStyles.right}>
        <Text style={[tickerStyles.goCount, { color: colors.go }]}>{item.goCount}× GO</Text>
        <Text style={[tickerStyles.score, { color: colors.mutedForeground }]}>avg {Math.round(item.avgScore)}</Text>
      </View>
    </View>
  );
}

function ActivityRow({ item, colors }: { item: RecentActivity; colors: ReturnType<typeof useColors> }) {
  const date = new Date(item.timestamp);
  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const total = (item.tickerCount ?? 0);
  return (
    <View style={[actStyles.row, { borderColor: colors.border }]}>
      <View>
        <Text style={[actStyles.time, { color: colors.mutedForeground }]}>{formatted}</Text>
        <Text style={[actStyles.tickers, { color: colors.foreground }]}>
          {total > 0 ? `${total} ticker${total !== 1 ? "s" : ""}` : "Scan"}
        </Text>
      </View>
      <View style={actStyles.badges}>
        {(item.goCount ?? 0) > 0 && (
          <Text style={[actStyles.badge, { color: colors.go, borderColor: colors.go + "44" }]}>
            {item.goCount} GO
          </Text>
        )}
        {(item.holdCount ?? 0) > 0 && (
          <Text style={[actStyles.badge, { color: colors.hold, borderColor: colors.hold + "44" }]}>
            {item.holdCount} HOLD
          </Text>
        )}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
    isRefetching: summaryRefetching,
  } = useGetDashboardSummary();

  const { data: sectorData, isLoading: sectorLoading } = useGetSectorRotation();
  const sectorRotation = sectorData as { regime?: string } | undefined;

  const isRefreshing = summaryRefetching;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      paddingTop: Platform.OS === "web" ? 67 : 16,
      paddingBottom: Platform.OS === "web" ? 34 : 24,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginBottom: 20,
    },
    appName: {
      fontSize: 22,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    regimePill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
    },
    regimePillText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    statsRow: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 20,
    },
    section: {
      paddingHorizontal: 16,
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 1,
      marginBottom: 10,
    },
    center: { alignItems: "center", paddingVertical: 40 },
    emptyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 8 },
  });

  const regime = sectorRotation?.regime;
  const isRiskOn = regime?.toUpperCase().includes("RISK_ON") || regime?.toUpperCase().includes("RISK-ON");
  const isRiskOff = regime?.toUpperCase().includes("RISK_OFF") || regime?.toUpperCase().includes("RISK-OFF");
  const regimeColor = isRiskOn ? colors.go : isRiskOff ? colors.abort : colors.hold;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refetchSummary}
          tintColor={colors.go}
          colors={[colors.go]}
        />
      }
    >
      <View style={s.headerRow}>
        <Text style={s.appName}>Motion Scanner</Text>
        {regime && (
          <View style={[s.regimePill, { borderColor: regimeColor, backgroundColor: regimeColor + "22" }]}>
            <Text style={[s.regimePillText, { color: regimeColor }]}>{regime}</Text>
          </View>
        )}
      </View>

      {summaryLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.go} />
        </View>
      ) : (
        <>
          <View style={s.statsRow}>
            <StatCard
              label="Total Scans"
              value={summary?.totalScans ?? 0}
              icon="radar"
              colors={colors}
            />
            <StatCard
              label="Avg GO Count"
              value={typeof summary?.avgGoCount === "number" ? summary.avgGoCount.toFixed(1) : "—"}
              icon="check-circle"
              accent={colors.go}
              colors={colors}
            />
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>TOP TICKERS</Text>
            {(summary?.topTickers && summary.topTickers.length > 0) ? (
              (summary.topTickers as TopTicker[]).slice(0, 5).map((t, i) => (
                <TopTickerRow key={t.ticker} item={t} index={i} colors={colors} />
              ))
            ) : (
              <View style={s.center}>
                <MaterialCommunityIcons name="chart-bar" size={32} color={colors.mutedForeground} />
                <Text style={s.emptyText}>No scans yet</Text>
              </View>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>RECENT ACTIVITY</Text>
            {(summary?.recentActivity && summary.recentActivity.length > 0) ? (
              (summary.recentActivity as unknown as RecentActivity[]).slice(0, 6).map((a) => (
                <ActivityRow key={a.id} item={a} colors={colors} />
              ))
            ) : (
              <View style={s.center}>
                <MaterialCommunityIcons name="history" size={32} color={colors.mutedForeground} />
                <Text style={s.emptyText}>No recent activity</Text>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  icon: { marginBottom: 8 },
  value: { fontSize: 24, marginBottom: 2 },
  label: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

const tickerStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 24, fontSize: 13, fontFamily: "Inter_400Regular" },
  ticker: { flex: 1, fontSize: 15 },
  right: { alignItems: "flex-end" },
  goCount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  score: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

const actStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  time: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  tickers: { fontSize: 14, fontFamily: "Inter_500Medium" },
  badges: { flexDirection: "row", gap: 6 },
  badge: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
});
