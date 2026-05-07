"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, MessageCircleHeart, Linkedin, Search, ArrowRight, Loader2 } from "lucide-react";

type Step = 1 | 2 | 3 | 4;

const DEFAULT_BANK = {
  work_authorization: "Indian citizen, no sponsorship needed for India roles.",
  visa_status: "Indian citizen.",
  notice_period: "30 days.",
  salary_expectation: "Open to discussion based on role and market — early-career level.",
  willing_to_relocate: "Yes.",
  open_to_remote: "Yes.",
  open_to_hybrid: "Yes.",
  open_to_onsite: "Yes.",
  why_interested_template: "I'm drawn to this role because it sits at the intersection of communication and people — areas where I've consistently delivered measurable results in my apprenticeship at Fidelity.",
  preferred_pronouns: "She/Her",
  disability_status: "Decline to answer.",
  veteran_status: "Not applicable.",
  race_ethnicity: "Decline to answer.",
  gender: "Female.",
  current_company: "Fidelity Investments",
  current_title: "Corporate Communications Apprentice",
};

const DEFAULT_KEYWORDS = [
  "HR coordinator",
  "Event coordinator",
  "Corporate communications",
  "Internal communications",
  "Content writer",
  "Employee experience",
];

export function Wizard({ initialStatus }: { initialStatus: any }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [parsed, setParsed] = useState<boolean>(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [bank, setBank] = useState<Record<string, string>>(DEFAULT_BANK);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [locations, setLocations] = useState<string[]>(["Bengaluru, Karnataka, India"]);
  const [remote, setRemote] = useState(true);
  const [postedDays, setPostedDays] = useState(7);
  const [exclusions, setExclusions] = useState<string[]>(["unpaid", "internship", "intern"]);

  const [sessionLoggedIn, setSessionLoggedIn] = useState(initialStatus?.session_logged_in ?? false);
  const [cookiesText, setCookiesText] = useState("");
  const [submittingCookies, setSubmittingCookies] = useState(false);
  const [cookieError, setCookieError] = useState<string | null>(null);

  const [finishing, setFinishing] = useState(false);

  async function parseResumes() {
    setParsing(true);
    setParseError(null);
    try {
      const r = await fetch("/api/parse-resumes", { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? "Parsing failed");
      }
      setParsed(true);
    } catch (e: any) {
      setParseError(e?.message ?? "Failed to parse resumes");
    } finally {
      setParsing(false);
    }
  }

  async function submitCookies() {
    setSubmittingCookies(true);
    setCookieError(null);
    try {
      let cookies: any[] = [];
      try {
        const parsed = JSON.parse(cookiesText.trim());
        cookies = Array.isArray(parsed) ? parsed : (parsed?.cookies ?? []);
      } catch {
        throw new Error("That doesn't look like JSON. Use the Cookie-Editor extension's Export → JSON.");
      }
      if (!Array.isArray(cookies) || cookies.length === 0) throw new Error("No cookies found in the JSON.");
      const r = await fetch("/api/login/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `worker error ${r.status}`);
      if (j?.signed_in) {
        setSessionLoggedIn(true);
      } else {
        throw new Error("Cookies imported but LinkedIn didn't recognize the session — they may be expired. Re-export and try again.");
      }
    } catch (e: any) {
      setCookieError(e?.message ?? "Could not connect");
    } finally {
      setSubmittingCookies(false);
    }
  }

  async function finish() {
    setFinishing(true);
    await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank, keywords, locations, remote, postedDays, exclusions }),
    });
    router.push("/");
  }

  return (
    <div className="mt-8">
      <Stepper step={step} />

      {step === 1 && (
        <div className="card mt-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText size={20} style={{ color: "var(--color-primary)" }} />
            <h2 className="text-xl">Detect your resumes</h2>
          </div>
          <p className="text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
            We've found three resumes in <code>pookie/resumes/</code>: <strong>general</strong>, <strong>events</strong>, and <strong>hr</strong>. Pookie picks the best one per job.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button className="btn btn-primary" disabled={parsing || parsed} onClick={parseResumes}>
              {parsing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Parsing…
                </>
              ) : parsed ? (
                <>
                  <Check size={14} /> Parsed
                </>
              ) : (
                <>Parse resumes (1 min, ~$0.05)</>
              )}
            </button>
            {parsed && (
              <button className="btn btn-ghost" onClick={() => setStep(2)}>
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
          {parseError && (
            <div className="mt-3 text-[13px]" style={{ color: "var(--color-danger)" }}>
              {parseError}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card mt-6">
          <div className="flex items-center gap-3 mb-4">
            <MessageCircleHeart size={20} style={{ color: "var(--color-primary)" }} />
            <h2 className="text-xl">Question bank</h2>
          </div>
          <p className="text-[14px] mb-5" style={{ color: "var(--color-ink-soft)" }}>
            Defaults for the questions every form asks. Pookie reuses these so you never re-type them.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(bank).map(([k, v]) => (
              <div key={k} className={k === "why_interested_template" ? "col-span-2" : ""}>
                <label className="label">{k.replace(/_/g, " ")}</label>
                {v.length > 60 || k === "why_interested_template" ? (
                  <textarea className="textarea" rows={3} value={v} onChange={(e) => setBank({ ...bank, [k]: e.target.value })} />
                ) : (
                  <input className="input" value={v} onChange={(e) => setBank({ ...bank, [k]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next <ArrowRight size={14} /></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Linkedin size={20} style={{ color: "var(--color-primary)" }} />
            <h2 className="text-xl">Connect LinkedIn</h2>
          </div>

          {sessionLoggedIn ? (
            <div className="flex items-center gap-3">
              <span className="pill pill-success"><Check size={12} /> Connected</span>
              <button className="btn btn-ghost" onClick={() => setStep(4)}>Next <ArrowRight size={14} /></button>
            </div>
          ) : (
            <>
              <p className="text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
                Pookie runs in the cloud, so it can't open a sign-in window for you. Instead, sign in to LinkedIn yourself in your browser, then export your cookies once. Pookie reuses them.
              </p>
              <ol className="mt-4 text-[13px] flex flex-col gap-2" style={{ color: "var(--color-ink-soft)" }}>
                <li><strong>1.</strong> Install the <a className="link" href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noreferrer">Cookie-Editor</a> extension on Chrome.</li>
                <li><strong>2.</strong> Open <a className="link" href="https://www.linkedin.com/feed/" target="_blank" rel="noreferrer">linkedin.com/feed</a> and make sure you're signed in.</li>
                <li><strong>3.</strong> Click the Cookie-Editor icon → <em>Export</em> → <em>Export as JSON</em> (copies to clipboard).</li>
                <li><strong>4.</strong> Paste below and hit Connect.</li>
              </ol>
              <textarea
                className="textarea mt-4 font-mono text-[12px]"
                rows={6}
                placeholder="[ { &quot;name&quot;: &quot;li_at&quot;, &quot;value&quot;: &quot;...&quot;, &quot;domain&quot;: &quot;.linkedin.com&quot;, ... } ]"
                value={cookiesText}
                onChange={(e) => setCookiesText(e.target.value)}
              />
              {cookieError && (
                <div className="text-[13px] mt-2" style={{ color: "var(--color-warn)" }}>
                  {cookieError}
                </div>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button className="btn btn-primary" disabled={submittingCookies || !cookiesText.trim()} onClick={submitCookies}>
                  {submittingCookies && <Loader2 size={14} className="animate-spin" />} Connect
                </button>
                <p className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
                  Cookies stay on Pookie's server — never sent anywhere else.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="card mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Search size={20} style={{ color: "var(--color-primary)" }} />
            <h2 className="text-xl">Search filters</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Keywords (one per line)</label>
              <textarea
                className="textarea"
                rows={6}
                value={keywords.join("\n")}
                onChange={(e) => setKeywords(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <div>
              <label className="label">Locations (one per line)</label>
              <textarea
                className="textarea"
                rows={3}
                value={locations.join("\n")}
                onChange={(e) => setLocations(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <div>
              <label className="label">Posted within (days)</label>
              <input className="input" type="number" min={1} max={30} value={postedDays} onChange={(e) => setPostedDays(Number(e.target.value))} />
              <label className="label mt-3">Exclusions (comma-separated)</label>
              <input className="input" value={exclusions.join(", ")} onChange={(e) => setExclusions(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
              <label className="flex items-center gap-2 text-[13px] mt-3">
                <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
                Include remote roles
              </label>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-primary" onClick={finish} disabled={finishing}>
              {finishing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Start applying
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Resumes" },
    { n: 2, label: "Question bank" },
    { n: 3, label: "Connect LinkedIn" },
    { n: 4, label: "Search filters" },
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map((it, i) => (
        <div key={it.n} className="flex items-center gap-3">
          <div
            className="grid place-items-center w-8 h-8 rounded-full text-[13px] font-medium"
            style={{
              background: step >= it.n ? "var(--color-primary)" : "var(--color-surface-2)",
              color: step >= it.n ? "white" : "var(--color-ink-soft)",
            }}
          >
            {step > it.n ? <Check size={14} /> : it.n}
          </div>
          <span className="text-[13px]" style={{ color: step === it.n ? "var(--color-ink)" : "var(--color-ink-soft)" }}>
            {it.label}
          </span>
          {i < items.length - 1 && <span className="w-8 h-px" style={{ background: "var(--color-border)" }} />}
        </div>
      ))}
    </div>
  );
}
