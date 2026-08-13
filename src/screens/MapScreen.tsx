import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";

import wineriesData from "../../data/wineries.json";
import type { Winery } from "../types/winery";

const wineries = wineriesData as Winery[];

const MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

export default function MapScreen() {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      const position = await Location.getCurrentPositionAsync();
      setCoords(position.coords);
    })();
  }, []);

  if (!coords) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Map style={styles.map} mapStyle={MAP_STYLE_URL}>
      <Camera
        initialViewState={{
          center: [coords.longitude, coords.latitude],
          zoom: 11,
        }}
      />
      {wineries.map((winery) => (
        <Marker key={winery.id} id={winery.id} lngLat={[winery.lng, winery.lat]}>
          <View style={styles.pin} />
        </Marker>
      ))}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#7b1e3a",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
