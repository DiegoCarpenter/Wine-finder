import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { type RouteProp, useRoute } from "@react-navigation/native";
import {
  Camera,
  type CameraRef,
  Map,
  Marker,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";

import wineriesData from "../../data/wineries.json";
import type { TabParamList } from "../types/navigation";
import type { Winery } from "../types/winery";

const wineries = wineriesData as Winery[];

const FLAT_MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";
// Client-side env vars must be prefixed EXPO_PUBLIC_ to be inlined by Metro,
// and referenced as a static `process.env.EXPO_PUBLIC_*` expression (no
// bracket/computed access) for that inlining to work.
const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const TERRAIN_SOURCE_ID = "maptiler-terrain";
const TERRAIN_EXAGGERATION = 1.5;
const FLY_TO_ZOOM = 15;
const FLY_TO_DURATION_MS = 2500;

export default function MapScreen() {
  const route = useRoute<RouteProp<TabParamList, "Map">>();
  const cameraRef = useRef<CameraRef>(null);
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null
  );
  const [mapStyle, setMapStyle] = useState<string | StyleSpecification>(
    FLAT_MAP_STYLE_URL
  );
  const [mapReady, setMapReady] = useState(false);

  const flyToWinery = (winery: Winery) => {
    cameraRef.current?.flyTo({
      center: [winery.lng, winery.lat],
      zoom: FLY_TO_ZOOM,
      duration: FLY_TO_DURATION_MS,
      easing: "fly",
    });
  };

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

  // Enables 3D terrain by fetching the base style and adding a MapTiler
  // terrain-RGB source + `terrain` property to it. If no key is configured,
  // or the fetch fails for any reason, silently keep the flat fallback style.
  useEffect(() => {
    if (!MAPTILER_API_KEY) {
      return;
    }

    (async () => {
      try {
        const response = await fetch(FLAT_MAP_STYLE_URL);
        const baseStyle = await response.json();

        // Drop the fetched style's own default view — demotiles.maplibre.org
        // bakes in its own center/zoom/bearing/pitch (e.g. zoom ~0.86 on the
        // Mediterranean), and applying this style wholesale would reset the
        // live camera to that whole-world view instead of leaving the
        // already-established Paso Robles position alone.
        const { center, zoom, bearing, pitch, ...baseStyleWithoutViewState } =
          baseStyle;

        setMapStyle({
          ...baseStyleWithoutViewState,
          sources: {
            ...baseStyleWithoutViewState.sources,
            [TERRAIN_SOURCE_ID]: {
              type: "raster-dem",
              url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`,
            },
          },
          terrain: {
            source: TERRAIN_SOURCE_ID,
            exaggeration: TERRAIN_EXAGGERATION,
          },
        });
      } catch {
        // Keep the flat fallback style.
      }
    })();
  }, []);

  // Flies to a winery selected from the List screen, once the native map
  // has actually finished loading — the camera ref is otherwise not ready
  // to receive commands yet, even though `coords` and the JS view mount.
  useEffect(() => {
    const wineryId = route.params?.wineryId;
    if (!wineryId || !mapReady) {
      return;
    }

    const winery = wineries.find((candidate) => candidate.id === wineryId);
    if (winery) {
      flyToWinery(winery);
    }
  }, [route.params?.wineryId, mapReady]);

  if (!coords) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Map
      style={styles.map}
      mapStyle={mapStyle}
      onDidFinishLoadingMap={() => setMapReady(true)}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: [coords.longitude, coords.latitude],
          zoom: 11,
          pitch: 60,
        }}
      />
      {wineries.map((winery) => (
        <Marker
          key={winery.id}
          id={winery.id}
          lngLat={[winery.lng, winery.lat]}
          onPress={() => flyToWinery(winery)}
        >
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
