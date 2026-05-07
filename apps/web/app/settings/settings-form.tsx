"use client";
import { useState, useEffect } from "react";
import { Save, Square } from "lucide-react";

export function SettingsForm({ data }: { data: any }) {
  const [bank, setBank] = useState<Record<string, string>>(data.bank ?? {});
  const [keywords, setKeywords] = useState<string[]>(data.filters?.keywords ?? []);
  const [locations, setLocations] = useState<string[]>(data.filters?.locations ?? []);
  const [remote, setRemote] = useState<boolean>(data.filters?.remote ?? true);
  const [postedDays, setPostedDays] = useState<number>(data.filters?.postedDays ?? 7);
  const [exclusions, setExclusions] = useState<string[]>(data.filters?.exclusions ?? []);
  const [dailyCap, setDailyCap] = useState<number>(data.settings?.daily_cap ?? 22);
  const [coverLetters, setCoverLetters] = useState<boolean>(data.settings?.cover_letters_enabled ?? true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+Shift+P → kill switch
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        fetch("/api/control/pause", { method: "POST" });
        alert("Pookie paused.");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank, keywords, locations, remote, postedDays, exclusions }),
    });
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_cap: dailyCap, cover_letters_enabled: coverLetters }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function pause() {
    await fetch("/api/control/pause", { method: "POST" });
    alert("Pookie paused.");
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="card col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Kill switch</h3>
          <button className="btn btn-danger" onClick={pause}>
            <Square size={14} fill="white" /> Stop pookie now
          </button>
        </div>
        <div className="text-[13px]" style={{ color: "var(--color-ink-soft)" }}>
          Stops the queue immediately and pauses any in-flight application. Hotkey: <kbd>⌘ + Shift + P</kbd>.
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-medium mb-4">Filters</h3>
        <label className="label">Keywords (one per line)</label>
        <textarea className="textarea" rows={6} value={keywords.join("\n")} onChange={(e) => setKeywords(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
        <label className="label mt-3">Locations</label>
        <textarea className="textarea" rows={2} value={locations.join("\n")} onChange={(e) => setLocations(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="label">Posted within (days)</label>
            <input className="input" type="number" min={1} max={30} value={postedDays} onChange={(e) => setPostedDays(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Daily cap</label>
            <input className="input" type="number" min={1} max={30} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
          </div>
        </div>
        <label className="label mt-3">Exclusions (comma)</label>
        <input className="input" value={exclusions.join(", ")} onChange={(e) => setExclusions(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
        <label className="flex items-center gap-2 text-[13px] mt-3">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} /> Include remote
        </label>
        <label className="flex items-center gap-2 text-[13px] mt-2">
          <input type="checkbox" checked={coverLetters} onChange={(e) => setCoverLetters(e.target.checked)} /> Generate AI cover letters
        </label>
      </div>

      <div className="card">
        <h3 className="text-lg font-medium mb-4">Question bank</h3>
        <div className="flex flex-col gap-3 max-h-[520px] overflow-auto pr-2">
          {Object.entries(bank).map(([k, v]) => (
            <div key={k}>
              <label className="label">{k.replace(/_/g, " ")}</label>
              {v.length > 60 ? (
                <textarea className="textarea" rows={2} value={v} onChange={(e) => setBank({ ...bank, [k]: e.target.value })} />
              ) : (
                <input className="input" value={v} onChange={(e) => setBank({ ...bank, [k]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-2 flex justify-end gap-2">
        {saved && <span className="pill pill-success">Saved</span>}
        <button className="btn btn-primary" onClick={save}>
          <Save size={14} /> Save changes
        </button>
      </div>
    </div>
  );
}
