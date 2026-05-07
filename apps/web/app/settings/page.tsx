import { SettingsForm } from "./settings-form";
import { worker } from "../../lib/worker";
import { IS_DEMO } from "../../lib/demo";

export const dynamic = "force-dynamic";

const demoData = {
  bank: {
    "phone": "(555) 123-4567",
    "years_of_experience": "3",
    "authorized_to_work_us": "Yes",
    "willing_to_relocate": "Open",
    "salary_expectation": "$70,000-$90,000",
  },
  filters: {
    keywords: ["recruiting coordinator", "events coordinator", "people operations"],
    locations: ["Remote", "New York, NY", "San Francisco, CA"],
    remote: true,
    postedDays: 7,
    exclusions: ["sales", "BDR"],
  },
  settings: {
    mode: "shadow",
    daily_cap: 22,
    paused: false,
  },
};

async function loadServerData() {
  if (IS_DEMO) return demoData;
  try {
    return await worker.getSettings();
  } catch {
    return demoData;
  }
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
