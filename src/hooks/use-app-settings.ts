"use client";

import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * App-wide switches an admin can flip without a deploy (`app_settings`, 0009).
 *
 * **Every setting has a default here, and a missing row, a missing table or no
 * backend at all reads as that default.** The app has always worked with no
 * project configured (ADR 0031), so a switch that needed a row to exist before
 * the screen could render would be a new way for ember to be down.
 */
export const APP_SETTING_DEFAULTS = {
  /** Show Pro's price converted into the reader's base currency. */
  pricing_local_currency: true,
} as const;

export type AppSettingKey = keyof typeof APP_SETTING_DEFAULTS;
export type AppSettings = { -readonly [K in AppSettingKey]: (typeof APP_SETTING_DEFAULTS)[K] };

export const APP_SETTINGS_KEY = ["app-settings"] as const;

async function fetchAppSettings(): Promise<AppSettings> {
  const settings: AppSettings = { ...APP_SETTING_DEFAULTS };
  const supabase = supabaseBrowser();
  if (!supabase) return settings;
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error || !data) return settings;
  for (const row of data as { key: string; value: unknown }[]) {
    if (row.key in settings && typeof row.value === typeof settings[row.key as AppSettingKey]) {
      (settings as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return settings;
}

export function useAppSettings(): AppSettings {
  const query = useQuery({
    queryKey: APP_SETTINGS_KEY,
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
  });
  return query.data ?? APP_SETTING_DEFAULTS;
}
