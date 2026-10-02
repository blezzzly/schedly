"use server";

import { auth } from "@/server/lib/auth";
import { headers } from "next/headers";
import { checkRateLimitDb } from "@/server/lib/security";
import { db } from "@/server/db/client";

const WEATHER_MAX = 30;
const WEATHER_WINDOW_MS = 60 * 60 * 1000;

export type WeatherResult =
  | { success: true; data: WeatherData }
  | { success: false; error: string };

export type WeatherData = {
  city: string;
  country: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  sunrise: number;
  sunset: number;
  timezone: number;
};

function getWeatherIcon(iconCode: string): string {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
}

/** Map a WMO weather code to an OpenWeather icon code + friendly description.
 *  OpenWeather icons are reused even for the keyless Open-Meteo source so the
 *  weather card can keep rendering the same icon images. */
const WMO = new Map<number, { icon: string; text: string }>([
  [0, { icon: "01d", text: "clear sky" }],
  [1, { icon: "02d", text: "mainly clear" }],
  [2, { icon: "03d", text: "partly cloudy" }],
  [3, { icon: "04d", text: "overcast" }],
  [45, { icon: "50d", text: "fog" }],
  [48, { icon: "50d", text: "rime fog" }],
  [51, { icon: "09d", text: "light drizzle" }],
  [53, { icon: "09d", text: "drizzle" }],
  [55, { icon: "09d", text: "dense drizzle" }],
  [56, { icon: "09d", text: "freezing drizzle" }],
  [57, { icon: "09d", text: "freezing drizzle" }],
  [61, { icon: "10d", text: "light rain" }],
  [63, { icon: "10d", text: "rain" }],
  [65, { icon: "10d", text: "heavy rain" }],
  [66, { icon: "10d", text: "freezing rain" }],
  [67, { icon: "10d", text: "freezing rain" }],
  [71, { icon: "13d", text: "light snow" }],
  [73, { icon: "13d", text: "snow" }],
  [75, { icon: "13d", text: "heavy snow" }],
  [77, { icon: "13d", text: "snow grains" }],
  [80, { icon: "09d", text: "light rain showers" }],
  [81, { icon: "09d", text: "rain showers" }],
  [82, { icon: "09d", text: "heavy rain showers" }],
  [85, { icon: "13d", text: "snow showers" }],
  [86, { icon: "13d", text: "heavy snow showers" }],
  [95, { icon: "11d", text: "thunderstorm" }],
  [96, { icon: "11d", text: "thunderstorm with hail" }],
  [99, { icon: "11d", text: "thunderstorm with hail" }],
]);

async function fetchWeather(
  lat: number,
  lon: number,
  apiKey: string
): Promise<WeatherData | null> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    city: data.name,
    country: data.sys.country,
    temperature: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    description: data.weather[0]?.description || "Clear",
    icon: getWeatherIcon(data.weather[0]?.icon || "01d"),
    windSpeed: Math.round(data.wind.speed * 3.6),
    sunrise: data.sys.sunrise,
    sunset: data.sys.sunset,
    timezone: data.timezone,
  };
}

/** Keyless fallback via Open-Meteo (free, no API key) — used when
 *  OPENWEATHER_API_KEY is not configured so the weather card works out of the
 *  box on any host (local dev included). */
async function fetchWeatherOpenMeteo(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const [geoRes, wRes] = await Promise.all([
      fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
        { next: { revalidate: 86_400 } }
      ),
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
          `&daily=sunrise,sunset&timezone=auto`,
        { next: { revalidate: 600 } }
      ),
    ]);
    if (!wRes.ok) return null;

    const geo = (await geoRes.json()) as { city?: string; countryCode?: string };

    const data = (await wRes.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        apparent_temperature?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      daily?: { sunrise?: string[]; sunset?: string[] };
      utc_offset_seconds?: number;
    };

    if (!data.current) return null;

    const wmo = WMO.get(data.current.weather_code ?? -1) ?? { icon: "02d", text: "variable" };

    return {
      city: geo.city || "Your location",
      country: geo.countryCode || "",
      temperature: Math.round(data.current.temperature_2m ?? 0),
      feelsLike: Math.round(data.current.apparent_temperature ?? data.current.temperature_2m ?? 0),
      humidity: Math.round(data.current.relative_humidity_2m ?? 0),
      description: wmo.text,
      icon: getWeatherIcon(wmo.icon),
      windSpeed: Math.round(data.current.wind_speed_10m ?? 0),
      sunrise: data.daily?.sunrise?.[0] ? Date.parse(data.daily.sunrise[0]) / 1000 : 0,
      sunset: data.daily?.sunset?.[0] ? Date.parse(data.daily.sunset[0]) / 1000 : 0,
      timezone: data.utc_offset_seconds ?? 0,
    };
  } catch (err) {
    console.error("[WEATHER_OPEN_METEO]", err);
    return null;
  }
}

/** Prefer the configured OpenWeather key; fall back to keyless Open-Meteo. */
async function getWeatherSmart(lat: number, lon: number): Promise<WeatherData | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (apiKey) {
    const weather = await fetchWeather(lat, lon, apiKey);
    if (weather) return weather;
  }
  return fetchWeatherOpenMeteo(lat, lon);
}

export async function getWeatherByCoords(
  lat: number,
  lon: number
): Promise<WeatherResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const rate = await checkRateLimitDb(
    `weather:${session.user.id}`,
    WEATHER_MAX,
    WEATHER_WINDOW_MS,
  );
  if (!rate.allowed) {
    return { success: false, error: "Too many weather requests. Try again later." };
  }

  try {
    const weather = await getWeatherSmart(lat, lon);
    if (!weather) {
      return { success: false, error: "Failed to fetch weather data" };
    }

    return { success: true, data: weather };
  } catch (err) {
    console.error("[WEATHER]", err);
    return { success: false, error: "Could not fetch weather. Please try again." };
  }
}

function getClientIp(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

// Best-effort IP geolocation with a fallback chain. The browser geolocation
// path (getWeatherByCoords) is preferred — this runs only when that permission
// is missing. We never show weather for a location the user isn't in, so a
// failed lookup ends as an honest error instead of a wrong hardcoded city.
async function locateByIp(clientIp: string | null): Promise<{ lat: number; lon: number } | null> {
  const targets = clientIp
    ? [
        `https://ipwho.is/${encodeURIComponent(clientIp)}`,
        `http://ip-api.com/json/${encodeURIComponent(clientIp)}?fields=status,lat,lon`,
      ]
    : ["https://ipwho.is/", "http://ip-api.com/json/?fields=status,lat,lon"];

  for (const url of targets) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const lat = data.latitude ?? data.lat;
      const lon = data.longitude ?? data.lon;
      if (typeof lat === "number" && typeof lon === "number") {
        return { lat, lon };
      }
    } catch {
      // Try the next service.
    }
  }
  return null;
}

// Locate the city the user entered in their profile (if any). Prefers
// OpenWeather's geocoding API when a key exists, otherwise falls back to
// Open-Meteo's free keyless geocoding API.
async function locateByCity(city: string, apiKey?: string): Promise<{ lat: number; lon: number } | null> {
  if (apiKey) {
    try {
      const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 86_400 } });
      if (res.ok) {
        const list = (await res.json()) as Array<{ lat: number; lon: number }>;
        const first = Array.isArray(list) ? list[0] : null;
        if (first && typeof first.lat === "number" && typeof first.lon === "number") {
          return { lat: first.lat, lon: first.lon };
        }
      }
    } catch {
      // Fall through to the keyless geocoder below.
    }
  }
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const res = await fetch(url, { next: { revalidate: 86_400 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ latitude?: number; longitude?: number }> };
    const first = Array.isArray(data.results) ? data.results[0] : null;
    if (first && typeof first.latitude === "number" && typeof first.longitude === "number") {
      return { lat: first.latitude, lon: first.longitude };
    }
  } catch {
    // Fall through to the honest error below.
  }
  return null;
}

// IP-based fallback — approximate location from the CLIENT's IP (taken from the
// request headers), used when the browser denies geolocation permission.
export async function getWeatherByIp(): Promise<WeatherResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false, error: "Unauthorized" };

  const rate = await checkRateLimitDb(
    `weather:${session.user.id}`,
    WEATHER_MAX,
    WEATHER_WINDOW_MS,
  );
  if (!rate.allowed) {
    return { success: false, error: "Too many weather requests. Try again later." };
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;

  try {
    const h = await headers();
    const clientIp = getClientIp(h);

    // 1) Best effort from the client's IP (multi-service chain).
    const ipLoc = await locateByIp(clientIp);
    if (ipLoc) {
      const weather = await getWeatherSmart(ipLoc.lat, ipLoc.lon);
      if (weather) return { success: true, data: weather };
    }

    // 2) Fall back to the city the user saved in their profile.
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { city: true },
    });
    if (user?.city) {
      const cityLoc = await locateByCity(user.city, apiKey);
      if (cityLoc) {
        const weather = await getWeatherSmart(cityLoc.lat, cityLoc.lon);
        if (weather) return { success: true, data: weather };
      }
    }

    // 3) Honest failure — never show weather for a place the user isn't in.
    return {
      success: false,
      error: "Could not detect your location. Allow location access, or set your city in Profile.",
    };
  } catch (err) {
    console.error("[WEATHER_IP]", err);
    return { success: false, error: "Could not fetch weather. Please try again." };
  }
}