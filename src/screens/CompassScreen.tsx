import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as Location from "expo-location";

import wineriesData from "../../data/wineries.json";
import type { Winery } from "../types/winery";
import { getBearing, haversineDistanceMiles } from "../utils/geo";

const wineries = wineriesData as Winery[];

const FIELD_OF_VIEW_DEGREES = 60;
const HALF_FIELD_OF_VIEW = FIELD_OF_VIEW_DEGREES / 2;
const LABEL_WIDTH = 140;

/** Normalizes an angle difference to the range (-180, 180]. */
function normalizeAngleDiff(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export default function CompassScreen() {
  const { width } = useWindowDimensions();
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null
  );
  const [heading, setHeading] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let headingSubscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Location permission is required to use the compass.");
        return;
      }

      const position = await Location.getCurrentPositionAsync();
      setCoords(position.coords);

      headingSubscription = await Location.watchHeadingAsync((update) => {
        const trueOrMagnetic =
          update.trueHeading >= 0 ? update.trueHeading : update.magHeading;
        setHeading(trueOrMagnetic);
      });
    })();

    return () => {
      headingSubscription?.remove();
    };
  }, []);

  const visibleWineries = useMemo(() => {
    if (!coords || heading === null) {
      return [];
    }

    return wineries
      .map((winery) => {
        const bearing = getBearing(
          coords.latitude,
          coords.longitude,
          winery.lat,
          winery.lng
        );
        const distanceMiles = haversineDistanceMiles(
          coords.latitude,
          coords.longitude,
          winery.lat,
          winery.lng
        );
        const angleFromHeading = normalizeAngleDiff(bearing - heading);

        return { winery, distanceMiles, angleFromHeading };
      })
      .filter((entry) => Math.abs(entry.angleFromHeading) <= HALF_FIELD_OF_VIEW);
  }, [coords, heading]);

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (!coords || heading === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {visibleWineries.map(({ winery, distanceMiles, angleFromHeading }) => {
        const fraction =
          (angleFromHeading + HALF_FIELD_OF_VIEW) / FIELD_OF_VIEW_DEGREES;
        const x = fraction * width - LABEL_WIDTH / 2;

        return (
          <View key={winery.id} style={[styles.label, { left: x }]}>
            <Text style={styles.name} numberOfLines={1}>
              {winery.name}
            </Text>
            <Text style={styles.distance}>{distanceMiles.toFixed(1)} mi</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c1c1e",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1c1c1e",
  },
  errorText: {
    padding: 16,
    color: "#ff6b6b",
    textAlign: "center",
  },
  label: {
    position: "absolute",
    top: "45%",
    width: LABEL_WIDTH,
    alignItems: "center",
  },
  name: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  distance: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 2,
  },
});
