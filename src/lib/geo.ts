import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

export interface GeoPoint {
  lat: number;
  lng: number;
}
export interface GeoAddress {
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  display?: string;
}

export async function getCurrentLocation(): Promise<GeoPoint | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      try {
        await Geolocation.requestPermissions();
      } catch {
        /* segue */
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    return await new Promise<GeoPoint | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  } catch {
    return null;
  }
}

/** Lê o GPS de dentro da própria foto (EXIF). */
export async function getPhotoLocation(base64: string): Promise<GeoPoint | null> {
  try {
    const mod = (await import("exifr")) as unknown as { default?: { gps: (d: Uint8Array) => Promise<{ latitude?: number; longitude?: number }> }; gps: (d: Uint8Array) => Promise<{ latitude?: number; longitude?: number }> };
    const exifr = mod.default || mod;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const gps = await exifr.gps(bytes);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      return { lat: gps.latitude, lng: gps.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoAddress | null> {
  try {
    const { data, error } = await supabase.functions.invoke("reverse-geocode", { body: { lat, lng } });
    if (error) return null;
    return data as GeoAddress;
  } catch {
    return null;
  }
}


export interface GeocodedAddress extends GeoPoint {
  label: string;
  city?: string;
  state?: string;
  country?: string;
}

function geoText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Busca um endereço/cidade no OpenStreetMap (Photon) e devolve lat/lng.
 * Serve para definir um ponto de partida remoto, sem depender do GPS.
 */
export async function geocodeAddress(query: string): Promise<GeocodedAddress | null> {
  const q = query.trim();
  if (!q) return null;

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      features?: Array<{
        properties?: Record<string, unknown>;
        geometry?: { coordinates?: number[] };
      }>;
    };
    const feature = body.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;

    const lat = Number(coords[1]);
    const lng = Number(coords[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const p = feature?.properties || {};
    const type = geoText(p.type);
    const name = geoText(p.name);
    const street = [geoText(p.street), geoText(p.housenumber)].filter(Boolean).join(" ");
    const city = geoText(p.city) || (type === "city" ? name : "") || geoText(p.county) || geoText(p.district);
    const state = geoText(p.state);
    const country = geoText(p.countrycode) || geoText(p.country);

    const primary = type === "city" ? city : street || name || city;
    const labelParts = [primary, city !== primary ? city : "", state].filter(Boolean);
    const label = labelParts.filter((part, index, all) => all.indexOf(part) === index).join(", ") || q;

    return { lat, lng, label, city: city || undefined, state: state || undefined, country: country || undefined };
  } catch {
    return null;
  }
}

/** Sobe a foto no bucket `lead_photos` e devolve a URL pública. */
export async function uploadLeadPhoto(base64: string, mime: string, userId: string): Promise<string | null> {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime || "image/jpeg" });
    const ext = (mime || "image/jpeg").includes("png") ? "png" : "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("lead_photos").upload(path, blob, { upsert: true, contentType: mime || "image/jpeg" });
    if (error) throw error;
    const { data } = supabase.storage.from("lead_photos").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn("[uploadLeadPhoto]", e);
    return null;
  }
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
