import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";

import wineriesData from "../../data/wineries.json";
import type { Winery } from "../types/winery";
import { haversineDistanceMiles } from "../utils/geo";

const wineries = wineriesData as Winery[];

type WineryWithDistance = Winery & { distanceMiles: number | null };

export default function ListScreen() {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Location permission is required to sort wineries by distance.");
        setLoading(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync();
      setCoords(position.coords);
      setLoading(false);
    })();
  }, []);

  const sortedWineries: WineryWithDistance[] = useMemo(() => {
    if (!coords) {
      return wineries.map((winery) => ({ ...winery, distanceMiles: null }));
    }

    return wineries
      .map((winery) => ({
        ...winery,
        distanceMiles: haversineDistanceMiles(
          coords.latitude,
          coords.longitude,
          winery.lat,
          winery.lng
        ),
      }))
      .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
  }, [coords]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <FlatList
        data={sortedWineries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            {item.distanceMiles !== null && (
              <Text style={styles.distance}>
                {item.distanceMiles.toFixed(1)} mi
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    padding: 16,
    color: "#b00020",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  name: {
    fontSize: 16,
    flexShrink: 1,
  },
  distance: {
    fontSize: 14,
    color: "#666",
    marginLeft: 12,
  },
});
