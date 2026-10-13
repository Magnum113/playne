let loading: Promise<void> | undefined;
const authListeners = new Set<() => void>();

declare global {
  interface Window {
    __playneMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

export function onMapsAuthFailure(listener: () => void) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function loadGoogleMaps() {
  if (typeof google !== "undefined" && google.maps?.StreetViewService)
    return Promise.resolve();
  if (loading) return loading;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("Maps key missing"));
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 25_000);
    let settled = false;
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error("Maps unavailable"));
    }
    window.gm_authFailure = () => {
      fail();
      authListeners.forEach((listener) => listener());
    };
    window.__playneMapsReady = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    script.async = true;
    script.dataset.playneMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, callback: "__playneMapsReady", loading: "async", v: "quarterly", language: "ru" })}`;
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}

export async function findPanorama(point: { lat: number; lng: number }) {
  const response = new google.maps.StreetViewService().getPanorama({
    location: point,
    radius: 500,
    sources: [
      google.maps.StreetViewSource.GOOGLE,
      google.maps.StreetViewSource.OUTDOOR,
    ],
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Panorama timeout")), 12_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const hasStreetViewLinks = (
  links: readonly { pano?: string | null }[] | undefined,
  pano: string,
) => !!links?.some((link) => link.pano && link.pano !== pano);
