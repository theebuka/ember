"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { Section } from "@/components/common/section";
import { recordAdminAction } from "@/components/admin/record";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Switch } from "@/components/ui/switch";
import { APP_SETTINGS_KEY, useAppSettings } from "@/hooks/use-app-settings";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * How Pro's price is shown, for everybody at once.
 *
 * Writes `app_settings` as the signed-in admin; `is_admin()` refuses anybody
 * else in Postgres (0009), so this switch rendering is a courtesy, not the
 * permission. Needs `0009` applied — until then the write fails with the
 * table's absence and the toast says so.
 */
export function PricingPanel({ user }: { user: User }) {
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function setLocal(next: boolean) {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({
      key: "pricing_local_currency",
      value: next,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });
    setBusy(false);
    if (error) {
      toast.error("Not changed.", { description: error.message });
      return;
    }
    await recordAdminAction(supabase, user.id, "setting.update", "pricing_local_currency", {
      title: next ? "Local-currency pricing on" : "Local-currency pricing off",
    });
    await queryClient.invalidateQueries({ queryKey: APP_SETTINGS_KEY });
    toast.success(next ? "Prices show in local currency." : "Prices show in dollars.");
  }

  return (
    <Section title="Pricing">
      <SettingGroup>
        <SettingRow
          label="Show Pro's price in local currency"
          description="Converted from dollars at today's rate and rounded. Off, everyone sees dollars."
          layout="inline"
          control={
            <Switch
              checked={settings.pricing_local_currency}
              disabled={busy}
              onCheckedChange={(next) => void setLocal(next)}
              aria-label="Show Pro's price in local currency"
            />
          }
        />
      </SettingGroup>
    </Section>
  );
}
