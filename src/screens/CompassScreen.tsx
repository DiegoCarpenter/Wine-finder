import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion } from "expo-sensors";

import wineriesData from "../../data/wineries.json";
import type { Winery } from "../types/winery";
import { getBearing, haversineDistanceMiles } from "../utils/geo";

const wineries = wineriesData as Winery[];

const HORIZONTAL_FIELD_OF_VIEW_DEGREES = 60;
const HALF_HORIZONTAL_FIELD_OF_VIEW = HORIZONTAL_FIELD_OF_VIEW_DEGREES / 2;
const VERTICAL_FIELD_OF_VIEW_DEGREES = 60;
const LABEL_WIDTH = 140;
const METERS_PER_MILE = 1609.34;

/** Normalizes an angle difference to the range (-180, 180]. */
function normalizeAngleDiff(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export default function CompassScreen() {
  const { width, height } = useWindowDimensions();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null
  );
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
  }, [cameraPermission, requestCameraPermission]);

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

  useEffect(() => {
    DeviceMotion.setUpdateInterval(100);

    const subscription = DeviceMotion.addListener((motion) => {
      if (!motion.rotation) {
        return;
      }

      // expo-sensors reports `rotation.beta` straight from CMAttitude.pitch,
      // in radians, where 0 = device lying flat on a table. Holding the
      // phone upright in portrait with the rear camera aimed at the horizon
      // reads close to +/-90 degrees, so we shift the zero point there to
      // get "degrees above/below where the camera is currently pointed".
      const pitchDegrees = (motion.rotation.beta * 180) / Math.PI - 90;
      setPitch(pitchDegrees);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const visibleWineries = useMemo(() => {
    if (!coords || heading === null || pitch === null) {
      return [];
    }

    const userElevation = coords.altitude ?? 0;

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

        const horizontalDistanceMeters = distanceMiles * METERS_PER_MILE;
        const elevationAngle =
          (Math.atan2(winery.elevation - userElevation, horizontalDistanceMeters) *
            180) /
          Math.PI;
        const angleFromPitch = elevationAngle - pitch;

        return { winery, distanceMiles, angleFromHeading, angleFromPitch };
      })
      .filter(
        (entry) => Math.abs(entry.angleFromHeading) <= HALF_HORIZONTAL_FIELD_OF_VIEW
      );
  }, [coords, heading, pitch]);

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  if (!cameraPermission || !cameraPermission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          Camera permission is required to use the compass.
        </Text>
      </View>
    );
  }

  if (!coords || heading === null || pitch === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      {visibleWineries.map(
        ({ winery, distanceMiles, angleFromHeading, angleFromPitch }) => {
          const fractionX =
            (angleFromHeading + HALF_HORIZONTAL_FIELD_OF_VIEW) /
            HORIZONTAL_FIELD_OF_VIEW_DEGREES;
          const x = fractionX * width - LABEL_WIDTH / 2;

          const fractionY = 0.5 - angleFromPitch / VERTICAL_FIELD_OF_VIEW_DEGREES;
          const y = fractionY * height;

          return (
            <View key={winery.id} style={[styles.label, { left: x, top: y }]}>
              <Text style={styles.name} numberOfLines={1}>
                {winery.name}
              </Text>
              <Text style={styles.distance}>{distanceMiles.toFixed(1)} mi</Text>
            </View>
          );
        }
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1c1c1e",
  },
  errorText: {
    padding: 16,
    color: "#fff",
    textAlign: "center",
  },
  label: {
    position: "absolute",
    width: LABEL_WIDTH,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingVertical: 4,
  },
  name: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  distance: {
    color: "#ddd",
    fontSize: 12,
    marginTop: 2,
  },
});
