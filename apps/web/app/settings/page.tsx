import { SettingsForm } from "./settings-form";
import { getSqlite } from "@pookie/db";

export const dynamic = "force-dynamic";

async function loadServerData() {
  const sqlite = getSqlite();
  const bank = sqlite.prepare("SELECT key, value FROM question_bank").all() as any[];
  const filters = sqlite.prepare("SELECT * FROM search_filters WHERE active = 1 ORDER BY id DESC LIMIT 1").get() as any;
  const settingsRows = sqlite.prepare("SELECT key, value FROM settings").all() as any[];
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    bank: Object.fromEntries(bank.map((r) => [r.key, r.value])),
    filters: filters
      ? {
          keywords: JSON.parse(filters.keywords),
          locations: JSON.parse(filters.locations),
          remote: !!filters.remote,
          postedDays: filters.posted_within_days,
          exclusions: JSON.parse(filters.exclusions),
        }
      : null,
    settings,
  };
}

export default async function SettingsPage() {
  const data = await loadServerData();
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl">Settings</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
          Tweak filters, the question bank, and pookie's behaviour.
        </p>
      </header>
      <SettingsForm data={data} />
    </div>
  );
}
