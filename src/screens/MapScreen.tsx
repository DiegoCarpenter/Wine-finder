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
const MAPTILER_STYLE_URL = MAPTILER_API_KEY
  ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_API_KEY}`
  : null;
// MapTiler's own "outdoor-v2" style already ships a raster-dem source under
// this id (used for its 2D hillshading/contour layers) — reuse it for 3D
// terrain instead of fetching a redundant duplicate DEM source.
const TERRAIN_SOURCE_ID = "terrain-rgb";
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

  // Switches to MapTiler's "outdoor" style (roads, place names, hillshading
  // — much more legible than the bare demotiles placeholder) and turns on
  // its already-bundled terrain-rgb source via the style's `terrain`
  // property. If no key is configured, or the fetch fails for any reason,
  // silently keep the flat fallback style.
  //
  // Note: as of the pinned MapLibre Native version, `terrain` isn't
  // rendered yet on mobile (it's still in development upstream — see
  // https://maplibre.org/news/2026-01-03-maplibre-newsletter-december-2025/).
  // This is inert until that lands, at which point it should just start
  // working with no code changes here.
  useEffect(() => {
    if (!MAPTILER_STYLE_URL) {
      return;
    }

    (async () => {
      try {
        const response = await fetch(MAPTILER_STYLE_URL);
        const baseStyle = await response.json();

        // Drop the fetched style's own default view (MapTiler's outdoor-v2
        // bakes in center [0, 0], zoom 1) — applying this style wholesale
        // would reset the live camera to that instead of leaving the
        // already-established Paso Robles position alone.
        const { center, zoom, bearing, pitch, ...baseStyleWithoutViewState } =
          baseStyle;

        setMapStyle({
          ...baseStyleWithoutViewState,
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
