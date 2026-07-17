import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowDownToLine, Copy, Check, ExternalLink, Github, BookOpen, Terminal, Key, FileText, Cpu, Shield, Lock, Package, List, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip, ResponsiveContainer, Cell, LabelList, ComposedChart, ErrorBar } from 'recharts';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const INSTALL_CMD_NPM = 'npm install @transparentguard/sdk';
const INSTALL_CMD_PIP = 'pip install "transparentguard[openai]"';
const INSTALL_CMD_DOCKER = 'docker pull ghcr.io/transparentguard/proxy:latest';
const INSTALL_CMD_CLI = 'npm install -g @transparentguard/cli';

const WRAP_SNIPPET_TS = `import { tg } from "@transparentguard/sdk";
import OpenAI from "openai";

// No await — policy loads on the first call.
const client = tg.wrap(new OpenAI(), {
  policy: "./policies/production.yaml",
  apiKey: process.env.TG_API_KEY,
});

// Identical to the standard OpenAI client.
// Enforcement is invisible.
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: userInput }],
});`;

const WRAP_SNIPPET_PY = `from transparentguard import tg
from openai import OpenAI

# No await — policy loads on the first call.
client = tg.wrap(OpenAI(), policy="./policies/production.yaml")

# Identical to the standard OpenAI client.
# Enforcement is invisible.
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": user_input}],
)`;

const PROXY_SNIPPET = `# Point any OpenAI SDK at the proxy instead of api.openai.com.
# Zero code changes. Full TPS policy enforcement on every request.
docker run -p 8080:8080 \\
  -e UPSTREAM_API_KEY=\\$OPENAI_API_KEY \\
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318 \\
  -v ./policies:/policies:ro \\
  ghcr.io/transparentguard/proxy:latest \\
  --policy /policies/production.yaml \\
  --upstream https://api.openai.com

# Or load from an OCI registry — versioned, signed, auto-deployed:
docker run -p 8080:8080 \\
  -e UPSTREAM_API_KEY=\\$OPENAI_API_KEY \\
  ghcr.io/transparentguard/proxy:latest \\
  --policy oci://ghcr.io/myorg/my-policy:v1.2.0 \\
  --upstream https://api.openai.com`;

const POLICY_SNIPPET = `tps_version: "1.0"
name: "production"
provider:
  - openai/gpt-4o

compliance_frameworks:
  - hipaa

rules:
  - id: redact-phi
    stage: pre-request
    action: redact
    targets:
      - type: pii
        categories: [phi]
        confidence_threshold: 0.75
    on_violation: redact
    log: true

  - id: block-prompt-injection
    stage: pre-request
    action: classify
    classifier: built-in/prompt-injection-v2
    threshold: 0.75
    on_violation: block

audit:
  enabled: true
  destination: "s3://your-bucket/tg-audit/"
  format: ocsf`;

const GITHUB_LINKS = [
  {
    label: "Spec",
    repo: "transparentguard/transparentguard-policy-spec",
    href: "https://github.com/transparentguard/transparentguard-policy-spec",
    description: "TPS v1.0 — the open policy standard. Spec, schema, examples.",
    tag: "MIT",
  },
  {
    label: "Runtime",
    repo: "transparentguard/runtime",
    href: "https://github.com/transparentguard/runtime",
    description: "The enforcement engine. FedRAMP Moderate, SOC 2, HIPAA, GDPR templates. ECDSA-P256 signed receipts. PIE shadow classifiers. Medical & financial PII. S3/Postgres/OTLP audit destinations.",
    tag: "MIT",
  },
  {
    label: "TypeScript SDK",
    repo: "transparentguard/sdk",
    href: "https://github.com/transparentguard/sdk",
    description: "Lazy-init TypeScript wrapper. Zero boilerplate — policy loads on the first call.",
    tag: "MIT",
  },
  {
    label: "Python SDK",
    repo: "transparentguard/sdk-python",
    href: "https://github.com/transparentguard/sdk-python",
    description: "Full Python implementation. OpenAI + Anthropic wrappers, HIPAA/GDPR/EU AI Act/SOC 2.",
    tag: "MIT",
  },
  {
    label: "Proxy",
    repo: "transparentguard/proxy",
    href: "https://github.com/transparentguard/proxy",
    description: "OpenAI-compatible HTTP proxy. OTEL tracing, OCI policies, Cosign signing, Helm chart.",
    tag: "MIT",
  },
];

// ---------------------------------------------------------------------------
// Painting background shared style
// ---------------------------------------------------------------------------

const PAINTING_BG: React.CSSProperties = {
  backgroundImage: `url(${import.meta.env.BASE_URL}painting.webp)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

const PAINTING_BG_START: React.CSSProperties = {
  backgroundImage: `url(${import.meta.env.BASE_URL}paintings/mountains.jpeg)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider transition-colors duration-200 focus:outline-none ${className}`}
    >
      {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-sm font-bold text-foreground mb-5">{children}</div>
  );
}

interface LangTab { label: string; filename: string; snippet: string; singleLine: boolean; }
function LangTabs({ tabs, paintingStyle = PAINTING_BG }: { tabs: LangTab[]; paintingStyle?: React.CSSProperties }) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  return (
    <div style={paintingStyle} className="p-5 md:p-10 overflow-hidden">
      <div className="bg-white text-black overflow-hidden">
        <div className="flex items-center border-b border-black/10">
          {tabs.map((t, i) => (
            <button key={t.label} onClick={() => setActive(i)}
              className={`px-3 sm:px-5 py-3 font-mono text-xs uppercase tracking-widest focus:outline-none transition-colors duration-150 ${i === active ? "text-black border-b-2 border-black -mb-px" : "text-black hover:text-black"}`}>
              {t.label}
            </button>
          ))}
          <CopyButton text={tab?.snippet ?? ""} className="text-black hover:text-black ml-auto pr-3 sm:pr-5" />
        </div>
        {tab?.singleLine ? (
          <div className="flex items-center justify-between px-3 sm:px-6 py-4 sm:py-5 gap-4">
            <code className="font-mono text-xs sm:text-sm md:text-base font-medium tracking-tight break-all text-black">{tab.snippet}</code>
          </div>
        ) : (
          <pre className="px-3 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto text-black"><code>{tab?.snippet}</code></pre>
        )}
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono text-[10px] uppercase tracking-widest border border-foreground px-2 py-0.5 text-foreground">{children}</span>
  );
}

function CodeBlock({ code, label, paintingStyle = PAINTING_BG }: { code: string; label?: string; paintingStyle?: React.CSSProperties }) {
  return (
    <div style={paintingStyle} className="p-5 md:p-10 mb-4 overflow-hidden">
      <div className="bg-white text-black overflow-hidden">
        {label && (
          <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-black/10">
            <span className="font-mono text-xs uppercase tracking-widest text-black">{label}</span>
            <CopyButton text={code} className="text-black hover:text-black" />
          </div>
        )}
        {!label && (
          <div className="flex justify-end px-3 sm:px-6 pt-3">
            <CopyButton text={code} className="text-black hover:text-black" />
          </div>
        )}
        <pre className="px-3 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto text-black"><code>{code}</code></pre>
      </div>
    </div>
  );
}

function DocSection({ id, icon: Icon, title, children }: {
  id: string; icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-20 scroll-mt-20">
      <div className="flex items-center gap-3 mb-6">
        <Icon size={16} strokeWidth={2} className="shrink-0" />
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-tighter uppercase">{title}</h2>
      </div>
      <div className="h-px bg-foreground/20 mb-8" />
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <div className="font-mono text-xs font-bold text-foreground uppercase tracking-widest mb-4 border-l-2 border-foreground pl-3">{title}</div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const EASE_CURVE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: EASE_CURVE, delay: i * 0.07 },
  }),
};

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

type Page = "hero" | "start" | "docs" | "startup" | "growth" | "enterprise" | "oem" | "company" | "research";

function HeroPage({ onStart, onDocs, onStartup, onGrowth, onEnterprise, onOem, onCompany, onResearch }: { onStart: () => void; onDocs: () => void; onStartup: () => void; onGrowth: () => void; onEnterprise: () => void; onOem: () => void; onCompany: () => void; onResearch: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <motion.div key="hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col">

      {/* ── Hero ────────────────────────────────────────────── */}
      <div className="min-h-screen flex flex-col p-6 md:p-12 lg:p-24 max-w-7xl mx-auto w-full">
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-auto gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col">
            <span className="text-xl font-bold tracking-tight uppercase">TransparentGuard</span>
            <span className="text-foreground font-mono text-sm uppercase tracking-wider mt-1">Trust No Model.</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-3 bg-foreground text-background font-mono px-4 py-2 text-sm font-bold uppercase tracking-widest focus:outline-none hover:bg-foreground/90 transition-colors duration-200">
              TPS v1.0
              {menuOpen ? <X size={16} strokeWidth={2.5} /> : <List size={16} strokeWidth={2.5} />}
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-0 md:left-auto md:right-0 top-full mt-1 bg-background border-2 border-foreground min-w-[180px] z-50 flex flex-col">
                  <button onClick={() => { setMenuOpen(false); onCompany(); }}
                    className="px-5 py-3 font-mono text-sm font-bold uppercase tracking-widest text-left hover:bg-foreground hover:text-background transition-colors duration-150 focus:outline-none">
                    Company
                  </button>
                  <button onClick={() => { setMenuOpen(false); onResearch(); }}
                    className="px-5 py-3 font-mono text-sm font-bold uppercase tracking-widest text-left hover:bg-foreground hover:text-background transition-colors duration-150 focus:outline-none border-t border-foreground/20">
                    Research
                  </button>
                  <button onClick={() => { setMenuOpen(false); onDocs(); }}
                    className="px-5 py-3 font-mono text-sm font-bold uppercase tracking-widest text-left hover:bg-foreground hover:text-background transition-colors duration-150 focus:outline-none border-t border-foreground/20">
                    Docs
                  </button>
                  <button onClick={() => { setMenuOpen(false); document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                    className="px-5 py-3 font-mono text-sm font-bold uppercase tracking-widest text-left hover:bg-foreground hover:text-background transition-colors duration-150 focus:outline-none border-t border-foreground/20">
                    Pricing
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </header>

        <main className="flex-1 flex flex-col justify-center py-20 md:py-32">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}>
            <h1 className="text-5xl md:text-8xl lg:text-[110px] font-extrabold tracking-tighter leading-[0.92] mb-10 uppercase">
              The AI Policy<br />Layer That<br />Works<br />Everywhere.
            </h1>
            <div className="h-0.5 bg-foreground w-full mb-10" />
            <p className="font-mono text-sm md:text-lg leading-relaxed max-w-2xl mb-16 text-foreground">
              Your enterprise deals are dying in the AI security review. TransparentGuard is the policy layer that passes it. Enforce HIPAA, GDPR, EU AI Act, and SOC 2 across every provider you use, in a single YAML file that lives in your repo. Version-controlled. Auditor-ready. Live in under an hour.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button onClick={onStart} whileHover={{ x: 6 }} whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="inline-flex items-center justify-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-foreground/20">
                Get Started
                <ArrowDownToLine size={22} strokeWidth={2.5} />
              </motion.button>
              <motion.button onClick={onDocs} whileHover={{ x: 6 }} whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="inline-flex items-center justify-center gap-4 border-2 border-foreground text-foreground px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground hover:text-background transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-foreground/20">
                Developer Docs
                <BookOpen size={22} strokeWidth={2.5} />
              </motion.button>
            </div>
          </motion.div>
        </main>
      </div>

      {/* ── All sections ────────────────────────────────────── */}
      <div className="px-6 md:px-12 lg:px-24 max-w-7xl mx-auto w-full">

        {/* ── Metrics strip ── */}
        <section className="border-t-2 border-foreground">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground">
            {([
              { n: "5", label: "Compliance Frameworks" },
              { n: "8", label: "Audit Backends" },
              { n: "1", label: "YAML File" },
              { n: "<1hr", label: "To Go Live" },
            ] as const).map(({ n, label }) => (
              <div key={label} className="bg-background py-8 md:py-10 flex flex-col items-center justify-center text-center px-4">
                <div className="text-4xl md:text-5xl font-extrabold tracking-tighter">{n}</div>
                <div className="font-mono text-xs uppercase tracking-widest mt-2">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Problem ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <div
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}paintings/sunset-trees.jpeg)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            className="p-5 md:p-10"
          >
            <div className="bg-background p-6 md:p-10 flex flex-col gap-8">
              <div className="flex flex-col gap-5 max-w-4xl">
                {([
                  "Was there PHI in that prompt?",
                  "Is there a log your auditor can read?",
                  "What happens when the model updates?",
                ] as const).map((q) => (
                  <div key={q} className="flex items-start gap-4">
                    <div className="w-2 h-2 bg-foreground shrink-0 mt-3 md:mt-5" />
                    <p className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tighter uppercase leading-[1.0]">{q}</p>
                  </div>
                ))}
              </div>
              <p className="font-mono text-sm md:text-lg max-w-lg leading-relaxed">
                For most teams, none of these questions have a ready answer. TransparentGuard makes every one of them answerable before someone asks.
              </p>
              <p className="font-mono text-xs text-foreground max-w-lg leading-relaxed border-t border-foreground/20 pt-4 mt-2">
                PHI — Protected Health Information. Any individually identifiable health data covered under HIPAA, including names, dates, diagnoses, and treatment records. One of the highest-risk data categories in LLM pipelines.
              </p>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-12 max-w-3xl">
            One File. Every Provider. Live in Under an Hour.
          </h2>
          <div
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}paintings/spring-garden.jpeg)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            className="p-5 md:p-10"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              <div className="bg-background border-l-2 border-foreground pl-5 p-4 flex flex-col gap-4">
                <div className="font-mono text-xs uppercase tracking-widest">01 — Write a policy. Commit it.</div>
                <div className="bg-foreground text-background font-mono text-xs p-4 leading-relaxed overflow-x-auto">
                  <pre>{`version: 1
providers: [openai, anthropic]
frameworks: [hipaa, soc2]
rules:
  - pii: block
  - injection: block`}</pre>
                </div>
                <p className="font-mono text-xs leading-relaxed">Lives in your repo. Goes through code review. Rolls back with git.</p>
              </div>
              <div className="bg-background border-l-2 border-foreground pl-5 p-4 flex flex-col gap-4">
                <div className="font-mono text-xs uppercase tracking-widest">02 — Wrap your client. Two lines.</div>
                <div className="bg-foreground text-background font-mono text-xs p-4 leading-relaxed overflow-x-auto">
                  <pre>{`const client = tg.wrap(new OpenAI(), {
  policy: "./policies/production.yaml"
});

// All calls now enforce your policy.
const res = await client.chat
  .completions.create({ ... });`}</pre>
                </div>
                <p className="font-mono text-xs leading-relaxed">No architecture changes. SDK or proxy, your choice.</p>
              </div>
              <div className="bg-background border-l-2 border-foreground pl-5 p-4 flex flex-col gap-4">
                <div className="font-mono text-xs uppercase tracking-widest">03 — Pull your evidence. One command.</div>
                <div className="bg-foreground text-background font-mono text-xs p-4 leading-relaxed overflow-x-auto">
                  <pre>{`$ tg report --framework hipaa \
           --period 2026-Q2

  Controls satisfied  12 / 12
  Events evaluated    14,832
  Events blocked          47
  Violations               0`}</pre>
                </div>
                <p className="font-mono text-xs leading-relaxed">Structured JSON. Hand it directly to your 3PAO or GC.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── What it catches ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-8 max-w-3xl">
            The Attacks Your Models Cannot Block On Their Own.
          </h2>
          <div
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}paintings/lake-sunset.jpeg)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            className="p-5 md:p-10"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground border-2 border-foreground">
              {([
                { title: "Prompt Injection", body: "ML classifiers catch attempts to override your system prompt before they reach the model." },
                { title: "PHI and PII", body: "HIPAA's 18 identifiers detected in prompts and responses. Redacted or blocked per your policy." },
                { title: "Unauthorized Models", body: "Only approved providers and endpoints can be called. Everything else is blocked at the policy layer." },
                { title: "Policy Drift", body: "Shadow classifiers alert you when model behavior shifts outside the envelope your team approved." },
                { title: "Tampered Logs", body: "SHA-256 Merkle-chained audit events. If a log is altered the chain breaks and tampering is provable." },
                { title: "Jailbreaks", body: "Jailbreak attempts and toxic content blocked in real time. Thresholds configurable per rule." },
              ] as const).map(({ title, body }) => (
                <div key={title} className="bg-background p-5 md:p-6 flex flex-col gap-3">
                  <h3 className="font-extrabold tracking-tight uppercase text-base">{title}</h3>
                  <p className="font-mono text-xs leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
            <div className="bg-background px-5 md:px-6 pb-5 md:pb-6">
              <p className="font-mono text-xs text-foreground max-w-lg leading-relaxed border-t border-foreground/20 pt-4 mt-0">
                PII — Personally Identifiable Information. Any data that can identify a specific individual: names, email addresses, phone numbers, IP addresses, and similar attributes. Distinct from PHI but equally regulated under GDPR, CCPA, and state-level privacy law.
              </p>
            </div>
          </div>
        </section>

        {/* ── Compliance frameworks ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-12 max-w-3xl">
            Five Frameworks. One Policy File.
          </h2>
          <div
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}paintings/meadow-sky.webp)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            className="p-5 md:p-10"
          >
            <div className="bg-background p-6 md:p-8 flex flex-col">
              {([
                { name: "HIPAA",           stat: "18 PHI identifiers detected in real time. Evidence maps to 164.514 Safe Harbor controls.",     tag: "Startup+" },
                { name: "GDPR",            stat: "Article 9 special categories detected in prompt and response. Consent-aware routing.",          tag: "Startup+" },
                { name: "EU AI Act",       stat: "Risk classification and incident logging for high-risk systems. Conformity-ready.",             tag: "Growth+"  },
                { name: "SOC 2",           stat: "Tamper-proof audit trail. Events mapped to CC6, CC7, and A1. Type II-ready.",                  tag: "Growth+"  },
                { name: "FedRAMP Moderate",stat: "NIST 800-53 control mapping. Signed evaluation receipts. Air-gapped via offline keys.",        tag: "Enterprise"},
              ] as const).map(({ name, stat, tag }, i) => (
                <div key={name} className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 py-5 ${i > 0 ? "border-t border-foreground/15" : ""}`}>
                  <h3 className="font-extrabold tracking-tighter uppercase text-xl sm:text-2xl sm:w-52 shrink-0">{name}</h3>
                  <p className="font-mono text-sm md:text-base flex-1">{stat}</p>
                  <div className="font-mono text-xs uppercase tracking-widest shrink-0 border border-foreground px-2 py-1 w-fit">{tag}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Providers strip ── */}
        <section className="border-t-2 border-foreground py-12 md:py-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap items-center gap-6 md:gap-14">
            {([
              { name: "OpenAI",              src: `${import.meta.env.BASE_URL}logos/openai-logo.webp`,  filter: ""                },
              { name: "Anthropic",           src: `${import.meta.env.BASE_URL}logos/anthropic.svg`,     filter: ""                },
              { name: "Microsoft Azure",     src: `${import.meta.env.BASE_URL}logos/azure-logo.png`,    filter: "invert grayscale"},
              { name: "Amazon Web Services", src: `${import.meta.env.BASE_URL}logos/aws-logo.png`,      filter: "invert grayscale"},
              { name: "Google Cloud",        src: `${import.meta.env.BASE_URL}logos/googlecloud.svg`,   filter: ""                },
            ] as const).map(({ name, src, filter }) => (
              <div key={name} className="flex items-center gap-3">
                <img
                  src={src}
                  alt={name}
                  height={22}
                  className={`shrink-0 h-[22px] w-auto ${filter}`}
                />
                <span className="font-mono text-sm uppercase tracking-wider">{name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Audit and Evidence ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-12 max-w-3xl">
            The Evidence Package Your Auditor Asked For. One Command.
          </h2>
          <div
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}paintings/autumn-valley.jpeg)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            className="p-5 md:p-10"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              <div className="bg-foreground text-background font-mono text-xs p-5 leading-relaxed overflow-x-auto self-start">
                <pre>{`{
  "framework": "hipaa",
  "period": "2026-Q2",
  "total_events": 14832,
  "blocked_events": 47,
  "controls": [
    {
      "control_id": "164.514(b)",
      "control_name": "PHI Safe Harbor",
      "status": "satisfied",
      "violations": 0
    }
  ]
}`}</pre>
              </div>
              <div className="bg-background p-5 md:p-6">
                <p className="font-mono text-sm md:text-lg leading-relaxed mb-8">
                  One CLI command generates a structured JSON evidence package ready for your 3PAO, GC, or enterprise infosec team. No spreadsheet assembly. No manual log review. All events in OCSF format, compatible with AWS Security Hub and Splunk.
                </p>
                <div className="font-mono text-xs uppercase tracking-widest mb-4">Audit Backends</div>
                <div className="flex flex-col">
                  {(["Amazon S3", "Google Cloud Storage", "Azure Blob Storage", "PostgreSQL", "OTLP", "Stdout / File", "Webhook"] as const).map((b, i) => (
                    <div key={b} className={`flex items-center gap-4 font-mono text-sm py-2.5 ${i > 0 ? "border-t border-foreground/10" : ""}`}>
                      <div className="w-1.5 h-1.5 bg-foreground shrink-0" />
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Supply Chain ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-6">
                Every Release Is Signed, Attested, and Verifiable.
              </h2>
              <p className="font-mono text-sm md:text-lg leading-relaxed">
                SLSA Level 3 provenance and CycloneDX SBOMs ship with every release. Your security team does not have to trust that the binary matches the source. They can prove it.
              </p>
            </div>
            <div
              style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/cliff-sunset.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
              className="p-5 md:p-10"
            >
              <div className="bg-background p-6 md:p-8 flex flex-col gap-4">
                {([
                  { label: "SLSA Level 3",          desc: "Provenance attestation on every release via GitHub Actions" },
                  { label: "CycloneDX SBOM",        desc: "Bill of materials for runtime, CLI, and OEM packages" },
                  { label: "Sigstore / Cosign",     desc: "Image signing with Sigstore transparency log entry" },
                  { label: "GitHub Attestation API",desc: "gh attestation verify — one command, no extra tooling" },
                ] as const).map(({ label, desc }) => (
                  <div key={label} className="border-l-2 border-foreground pl-5">
                    <div className="font-extrabold text-sm uppercase tracking-tight">{label}</div>
                    <div className="font-mono text-xs mt-1">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="border-t-2 border-foreground py-16 md:py-24">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-3 max-w-3xl">
            Start Free. Add Compliance When It Matters.
          </h2>
          <p className="font-mono text-sm md:text-lg mb-12">No seat limits. Priced by capability.</p>

          <div
            style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/crimson-sunset.webp)`, backgroundSize: "cover", backgroundPosition: "center" }}
            className="p-5 md:p-10"
          >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">

            {/* FREE */}
            <div className="border-2 border-foreground p-6 flex flex-col bg-background">
              <div className="font-mono text-xs uppercase tracking-widest mb-3">Free</div>
              <div className="text-4xl font-extrabold tracking-tighter mb-1">$0</div>
              <div className="font-mono text-xs mb-6">Development and evaluation — self-hosted only</div>
              <div className="h-px bg-foreground/15 mb-5" />
              <ul className="flex flex-col gap-2.5 font-mono text-xs flex-1">
                {(["Core guardrails: PII, injection, content filtering, token budgets", "500,000 LLM calls/month evaluated", "JSON audit logs to any destination", "Full TPS YAML, SDK, and proxy"] as const).map(f => (
                  <li key={f} className="flex gap-2.5 items-start"><span className="shrink-0 mt-px">+</span>{f}</li>
                ))}
              </ul>
              <button onClick={onStart} className="mt-8 border-2 border-foreground px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors duration-200 focus:outline-none w-full">
                Get Started
              </button>
            </div>

            {/* STARTUP */}
            <div className="border-2 border-foreground p-6 flex flex-col bg-background">
              <div className="font-mono text-xs uppercase tracking-widest mb-3">Startup</div>
              <div className="text-4xl font-extrabold tracking-tighter mb-1">$299<span className="text-base font-mono font-normal">/mo</span></div>
              <div className="font-mono text-xs mb-6">First enterprise deals</div>
              <div className="h-px bg-foreground/15 mb-5" />
              <div className="font-mono text-[10px] uppercase tracking-widest mb-3">Everything in Free, plus:</div>
              <ul className="flex flex-col gap-2.5 font-mono text-xs flex-1">
                {(["ML classifiers: injection, toxicity, jailbreak", "One compliance framework (HIPAA or GDPR) with JSON report export", "Hosted managed endpoint — no self-hosting required", "Slack and email support, 48-hour response SLA"] as const).map(f => (
                  <li key={f} className="flex gap-2.5 items-start"><span className="shrink-0 mt-px">+</span>{f}</li>
                ))}
              </ul>
              <button onClick={onStartup} className="mt-8 border-2 border-foreground px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors duration-200 focus:outline-none text-center w-full">
                View Details
              </button>
            </div>

            {/* GROWTH — featured */}
            <div className="bg-foreground text-background p-6 flex flex-col sm:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-xs uppercase tracking-widest">Growth</div>
                <div className="font-mono text-[10px] uppercase tracking-widest bg-background text-foreground px-2 py-1">Most Popular</div>
              </div>
              <div className="text-4xl font-extrabold tracking-tighter mb-1">$799<span className="text-base font-mono font-normal">/mo</span></div>
              <div className="font-mono text-xs mb-6">Active audits and enterprise deals</div>
              <div className="h-px bg-background/15 mb-5" />
              <div className="font-mono text-[10px] uppercase tracking-widest mb-3">Everything in Startup, plus:</div>
              <ul className="flex flex-col gap-2.5 font-mono text-xs flex-1">
                {(["All compliance frameworks — HIPAA, GDPR, EU AI Act, SOC 2", "HIPAA BAA and GDPR DPA available on request", "7-year audit log retention — HIPAA compliant", "Priority support, 8-hour response SLA"] as const).map(f => (
                  <li key={f} className="flex gap-2.5 items-start"><span className="shrink-0 mt-px">+</span>{f}</li>
                ))}
              </ul>
              <button onClick={onGrowth} className="mt-8 bg-background text-foreground px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-background/90 transition-colors duration-200 focus:outline-none text-center w-full">
                View Details
              </button>
            </div>

            {/* ENTERPRISE */}
            <div className="border-2 border-foreground p-6 flex flex-col bg-background">
              <div className="text-4xl font-extrabold tracking-tighter uppercase mb-1">Enterprise</div>
              <div className="font-mono text-xs mb-6">Regulated industries and government</div>
              <div className="h-px bg-foreground/15 mb-5" />
              <div className="font-mono text-[10px] uppercase tracking-widest mb-3">Everything in Growth, plus:</div>
              <ul className="flex flex-col gap-2.5 font-mono text-xs flex-1">
                {(["FedRAMP Moderate with NIST 800-53 mapping", "Custom classifiers trained on your domain vocabulary", "Data residency: EU-only, US-only, or your own infrastructure", "99.99% uptime SLA, custom MSA and enterprise DPA"] as const).map(f => (
                  <li key={f} className="flex gap-2.5 items-start"><span className="shrink-0 mt-px">+</span>{f}</li>
                ))}
              </ul>
              <button onClick={onEnterprise} className="mt-8 border-2 border-foreground px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors duration-200 focus:outline-none text-center w-full">
                View Details
              </button>
            </div>

            {/* OEM */}
            <div className="border-2 border-foreground p-6 flex flex-col bg-background">
              <div className="text-4xl font-extrabold tracking-tighter uppercase mb-1">OEM</div>
              <div className="font-mono text-xs mb-6">Embed AI governance in your product</div>
              <div className="h-px bg-foreground/15 mb-5" />
              <div className="font-mono text-[10px] uppercase tracking-widest mb-3">Everything in Enterprise, plus:</div>
              <ul className="flex flex-col gap-2.5 font-mono text-xs flex-1">
                {(["White-label runtime — embed in your own product", "Full compliance report API — build your own UI on top", "All compliance frameworks included", "Dedicated integration engineering for the first 90 days"] as const).map(f => (
                  <li key={f} className="flex gap-2.5 items-start"><span className="shrink-0 mt-px">+</span>{f}</li>
                ))}
              </ul>
              <button onClick={onOem} className="mt-8 border-2 border-foreground px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors duration-200 focus:outline-none text-center w-full">
                View Details
              </button>
            </div>
          </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t-2 border-foreground py-16 md:py-24">
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tighter uppercase leading-[0.95] mb-6 max-w-3xl">
            Your Next Enterprise Deal Is Already Asking These Questions.
          </h2>
          <p className="font-mono text-sm md:text-lg mb-10 max-w-lg leading-relaxed">
            One YAML file. Every provider. Full audit trail. Live in under an hour.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <motion.button onClick={onStart} whileHover={{ x: 6 }} whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="inline-flex items-center justify-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none">
              Get Started
              <ArrowDownToLine size={22} strokeWidth={2.5} />
            </motion.button>
            <a href="https://transparentguard.com"
              className="inline-flex items-center justify-center gap-4 border-2 border-foreground text-foreground px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground hover:text-background transition-colors duration-200 focus:outline-none">
              Talk to Us
              <ExternalLink size={20} strokeWidth={2.5} />
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t-2 border-foreground pt-8 pb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-mono text-xs uppercase">
          <div>© {new Date().getFullYear()} Transparency Research & Technology</div>
          <div>Strictly Technical. No Compromises.</div>
        </footer>

      </div>
    </motion.div>
  );
}

function ContentPage({ onBack }: { onBack: () => void }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  return (
    <motion.div key="content" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col p-6 md:p-12 lg:p-24 max-w-5xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack}
            className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-foreground hover:text-foreground transition-colors duration-200 focus:outline-none">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="text-xl font-bold tracking-tight uppercase">TransparentGuard</span>
        </div>
        <div className="bg-foreground text-background font-mono px-4 py-2 text-sm font-bold uppercase">TPS v1.0</div>
      </header>

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-16">
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter uppercase mb-5">Get Started</h2>
        <div className="h-0.5 bg-foreground w-full mb-8" />
        <p className="font-mono text-sm leading-relaxed text-foreground max-w-2xl">
          TransparentGuard sits between your application and any LLM provider. You declare policy in a YAML file that lives in your repo, the runtime enforces it on every request and response, and every event lands in your audit log.
        </p>
      </motion.div>

      <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show" className="mb-20">
        <div className="border-2 border-foreground p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="font-mono text-sm text-foreground leading-relaxed max-w-xl">
            Every registered user gets a free API key. No trial period, no credit card. The free tier covers core guardrails and audit logging. If you need compliance frameworks, ML-grade classifiers, or a managed endpoint, Startup starts at $299/mo.
          </p>
          <a href="https://transparentguard.com"
            className="shrink-0 inline-flex items-center gap-3 bg-foreground text-background px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-foreground/90 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-foreground/20">
            Get Your Free API Key <ArrowDownToLine size={15} strokeWidth={2.5} />
          </a>
        </div>
      </motion.div>

      <div className="flex flex-col gap-20">
        <motion.section custom={1} variants={fadeUp} initial="hidden" animate="show">
          <SectionLabel>01 — Install</SectionLabel>
          <LangTabs paintingStyle={PAINTING_BG_START} tabs={[
            { label: "TypeScript / Node", filename: "terminal", snippet: INSTALL_CMD_NPM, singleLine: true },
            { label: "Python", filename: "terminal", snippet: INSTALL_CMD_PIP, singleLine: true },
            { label: "Docker (Proxy)", filename: "terminal", snippet: INSTALL_CMD_DOCKER, singleLine: true },
            { label: "CLI", filename: "terminal", snippet: INSTALL_CMD_CLI, singleLine: true },
          ]} />
          <p className="font-mono text-xs text-foreground mt-3">
            Node 18+ · Python 3.9+ · Docker. No peer dependencies required for the free tier.
          </p>
        </motion.section>

        <motion.section custom={2} variants={fadeUp} initial="hidden" animate="show">
          <SectionLabel>02 — Wrap your client</SectionLabel>
          <p className="font-mono text-sm text-foreground mb-5 max-w-xl">
            Pass your existing OpenAI or Anthropic client to <code className="bg-foreground/8 px-1">tg.wrap()</code>. The returned client is a drop-in replacement.
          </p>
          <LangTabs paintingStyle={PAINTING_BG_START} tabs={[
            { label: "TypeScript", filename: "index.ts", snippet: WRAP_SNIPPET_TS, singleLine: false },
            { label: "Python", filename: "main.py", snippet: WRAP_SNIPPET_PY, singleLine: false },
          ]} />
        </motion.section>

        <motion.section custom={2.5} variants={fadeUp} initial="hidden" animate="show">
          <SectionLabel>02b — Or use the proxy (no SDK required)</SectionLabel>
          <p className="font-mono text-sm text-foreground mb-5 max-w-xl">
            Deploy the proxy in front of any service that calls OpenAI or Anthropic — no code changes at all.
          </p>
          <div style={PAINTING_BG_START} className="p-5 md:p-10 overflow-hidden">
            <div className="bg-white text-black overflow-hidden">
              <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-black/10">
                <span className="font-mono text-xs uppercase tracking-widest text-black">terminal</span>
                <CopyButton text={PROXY_SNIPPET} className="text-black hover:text-black" />
              </div>
              <pre className="px-3 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto text-black"><code>{PROXY_SNIPPET}</code></pre>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["OTEL traces — zero config","Cosign-signed image","OCI-native policies","Helm chart","Buffer-mode streaming","OpenAI + Anthropic"].map(f => <Pill key={f}>{f}</Pill>)}
          </div>
        </motion.section>

        <motion.section custom={3} variants={fadeUp} initial="hidden" animate="show">
          <SectionLabel>03 — Write a policy file</SectionLabel>
          <p className="font-mono text-sm text-foreground mb-5 max-w-xl">
            A policy file is plain YAML. Commit it to your repo. It goes through code review, rolls back with <code className="bg-foreground/8 px-1">git revert</code>, and the runtime validates it against the JSON Schema on every load.
          </p>
          <div style={PAINTING_BG_START} className="p-5 md:p-10 overflow-hidden">
            <div className="bg-white text-black overflow-hidden">
              <div className="flex items-center justify-between px-3 sm:px-6 py-3 border-b border-black/10">
                <span className="font-mono text-xs uppercase tracking-widest text-black">policies/production.yaml</span>
                <CopyButton text={POLICY_SNIPPET} className="text-black hover:text-black" />
              </div>
              <pre className="px-3 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto text-black"><code>{POLICY_SNIPPET}</code></pre>
            </div>
          </div>
          <p className="font-mono text-xs text-foreground mt-3">
            Activate HIPAA, GDPR, EU AI Act, SOC 2, or FedRAMP with one line. Pre-built rule libraries handle the rest.
          </p>
        </motion.section>

        <motion.section custom={4} variants={fadeUp} initial="hidden" animate="show">
          <SectionLabel>04 — Compliance Templates & Trust Chain</SectionLabel>
          <p className="font-mono text-sm text-foreground mb-7 max-w-xl">
            Runtime v0.3.0 ships four pre-built compliance template files. Add one line to your policy and every required rule is enforced automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {[
              { id: "hipaa", name: "HIPAA", detail: "All 18 PHI Safe Harbor identifiers. 7-year retention. Breach threshold alerting.", ref: "45 CFR Part 164" },
              { id: "gdpr", name: "GDPR", detail: "EU personal data minimisation, special-category blocking, Article 33 alerting.", ref: "EU 2016/679" },
              { id: "soc2", name: "SOC 2", detail: "CC6, CC7, CC9 controls. Injection blocking, PII redaction, vendor allowlist.", ref: "AICPA TSC 2022" },
              { id: "fedramp", name: "FedRAMP Moderate", detail: "NIST SP 800-53 Rev 5. AC-3, AU-2/3/9, SI-3/10, RA-5. Chain integrity.", ref: "NIST SP 800-53 Rev 5" },
            ].map(fw => (
              <div key={fw.id} className="border-2 border-foreground p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-base uppercase tracking-tight">{fw.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest border border-foreground/40 text-foreground px-2 py-0.5">{fw.ref}</span>
                </div>
                <p className="font-mono text-xs text-foreground leading-relaxed">{fw.detail}</p>
                <code className="font-mono text-[11px] text-foreground">compliance_frameworks: [{fw.id === "fedramp" ? "fedramp-moderate" : fw.id}]</code>
              </div>
            ))}
          </div>
          <div className="mb-4">
            <div className="font-mono text-xs font-bold text-foreground mb-3 uppercase tracking-widest">Policy Intelligence Engine</div>
            <div className="flex flex-wrap gap-2 mb-6">
              {["Shadow classifier scoring","Disagreement detection","Framework drift alerts","SOC 2 evidence packages","FedRAMP audit export","HIPAA / GDPR evidence"].map(f => <Pill key={f}>{f}</Pill>)}
            </div>
            <div className="font-mono text-xs font-bold text-foreground mb-3 uppercase tracking-widest">Cryptographic Trust Chain</div>
            <div className="flex flex-wrap gap-2">
              {["ECDSA-P256 signed receipts","Tamper-evident audit trail","Independent auditor verify","Key rotation watcher","JWK key set endpoint","Ephemeral or stable keys"].map(f => <Pill key={f}>{f}</Pill>)}
            </div>
          </div>
        </motion.section>

        <motion.section custom={5} variants={fadeUp} initial="hidden" animate="show">
          <SectionLabel>05 — Source</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GITHUB_LINKS.map(link => (
              <a key={link.repo} href={link.href} target="_blank" rel="noopener noreferrer"
                className="group flex flex-col justify-between border-2 border-foreground p-6 bg-background hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#09090b] transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-foreground/20">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <Github size={22} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                  <span className="font-mono text-xs border border-foreground px-2 py-0.5 text-foreground">{link.tag}</span>
                </div>
                <div>
                  <div className="font-mono text-xs text-foreground mb-1">{link.label}</div>
                  <div className="font-bold text-base tracking-tight mb-2 break-all">{link.repo}</div>
                  <p className="font-mono text-xs text-foreground leading-relaxed">{link.description}</p>
                </div>
                <div className="mt-6 flex items-center gap-2 font-mono text-xs text-foreground transition-colors duration-200">
                  View on GitHub <ExternalLink size={12} strokeWidth={2} />
                </div>
              </a>
            ))}
          </div>
        </motion.section>

        <motion.section custom={6} variants={fadeUp} initial="hidden" animate="show">
          <div className="border-2 border-foreground p-8 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-lg">
              <div className="font-mono text-xs font-bold text-foreground mb-3">Free Tier</div>
              <h3 className="text-2xl md:text-3xl font-extrabold tracking-tighter uppercase mb-3">Get your free API key.</h3>
              <p className="font-mono text-sm text-foreground leading-relaxed">
                The free tier is permanently free. You get a real API key, core guardrails across 18 PII categories, and an audit log you can hand to your compliance team. If your work requires HIPAA, GDPR, EU AI Act, or SOC 2 coverage, or you want ML-grade injection and jailbreak detection, Startup and Growth have you covered.
              </p>
            </div>
            <div className="shrink-0">
              <a href="https://transparentguard.com"
                className="inline-flex items-center gap-3 bg-foreground text-background px-8 py-4 font-mono text-sm font-bold uppercase tracking-widest hover:bg-foreground/90 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-foreground/20">
                Get Your Free API Key <ArrowDownToLine size={18} strokeWidth={2.5} />
              </a>
            </div>
          </div>
        </motion.section>
      </div>

      <footer className="mt-24 md:mt-32 border-t-2 border-foreground pt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-mono text-xs uppercase opacity-50">
        <div>© {new Date().getFullYear()} Transparency Research & Technology</div>
        <div>Strictly Technical. No Compromises.</div>
      </footer>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Developer Docs Page
// ---------------------------------------------------------------------------

const DOC_SECTIONS = [
  { id: "cli-validate",  label: "CLI / validate" },
  { id: "cli-test",      label: "CLI / test" },
  { id: "cli-keys",      label: "CLI / keys" },
  { id: "cli-report",    label: "CLI / report" },
  { id: "mcp",           label: "MCP Server" },
  { id: "sdk-ts",        label: "SDK — TypeScript" },
  { id: "sdk-py",        label: "SDK — Python" },
  { id: "policy-ref",    label: "Policy Reference" },
  { id: "frameworks",    label: "Frameworks" },
  { id: "offline",       label: "Offline License" },
  { id: "air-gapped",   label: "Air-Gapped / FedRAMP" },
  { id: "siem",         label: "Integrations — SIEM" },
  { id: "secrets",      label: "Integrations — Secrets" },
  { id: "oem",           label: "OEM Package" },
  { id: "slsa",          label: "Supply Chain" },
];

function DocsPage({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState("cli-validate");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isProgrammaticScroll = useRef(false);

  // Scroll to top on mount
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);

  // Feature 1 — IntersectionObserver: update active section as user scrolls
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    DOC_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !isProgrammaticScroll.current) {
            setActiveSection(id);
          }
        },
        { rootMargin: '-10% 0px -80% 0px', threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(obs => obs.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    isProgrammaticScroll.current = true;
    setActiveSection(id);
    setDrawerOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { isProgrammaticScroll.current = false; }, 900);
  };

  // Feature 3 — active section label shown in mobile header
  const activeSectionLabel = DOC_SECTIONS.find(s => s.id === activeSection)?.label ?? "";

  return (
    <motion.div key="docs" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col">

      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-background border-b-2 border-foreground px-6 md:px-12 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack}
            className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-foreground hover:text-foreground transition-colors duration-200 focus:outline-none shrink-0">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="font-bold tracking-tight uppercase hidden sm:block shrink-0">TransparentGuard</span>
          <span className="font-mono text-xs text-foreground uppercase tracking-widest hidden sm:block shrink-0">Developer Docs</span>
          {/* Feature 3: current section name — mobile only */}
          <span className="font-mono text-[11px] text-foreground uppercase tracking-widest block sm:hidden truncate">{activeSectionLabel}</span>
        </div>
        <div className="bg-foreground text-background font-mono px-3 py-1.5 text-xs font-bold uppercase shrink-0">TPS v1.0</div>
      </header>

      <div className="flex flex-1 min-w-0 overflow-x-hidden">
        {/* Feature 1: sidebar — highlights active section on scroll */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r-2 border-foreground sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto py-8 px-6">
          <div className="font-mono text-[10px] uppercase tracking-widest text-foreground mb-4">Contents</div>
          <nav className="flex flex-col gap-0.5">
            {DOC_SECTIONS.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`text-left font-mono text-xs py-1.5 px-2 transition-colors duration-150 focus:outline-none ${activeSection === s.id ? "bg-foreground text-background" : "text-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 md:px-12 lg:px-16 py-10 max-w-4xl">

          {/* ---------------------------------------------------------------- */}
          <DocSection id="cli-validate" icon={Terminal} title="CLI — validate">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Validate a TPS policy YAML against the JSON schema before deploying. Catches field-level errors, unknown keys, and AJV constraint violations.
            </p>
            <SubSection title="Install">
              <CodeBlock code="npm install -g @transparentguard/cli" label="terminal" />
            </SubSection>
            <SubSection title="Usage">
              <CodeBlock code={`transparentguard validate ./policies/production.yaml\ntg validate https://policies.mycompany.com/hipaa.yaml`} label="terminal" />
            </SubSection>
            <SubSection title="Output">
              <CodeBlock code={`Validating ./policies/production.yaml ...

✓  Valid — "production" (tps_version: 1.0)
   Frameworks : hipaa, soc2
   Rules      : 6
   Inline tests: 3`} label="stdout" />
            </SubSection>
            <p className="font-mono text-xs text-foreground">Exits 0 on success, 1 on failure. Safe to use in CI/CD pipelines.</p>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="cli-test" icon={Terminal} title="CLI — test">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Run the policy test suite (TPS Section 27). Tests are declared inline in the policy file or loaded from a directory of YAML test files. No real LLM calls are made.
            </p>
            <SubSection title="Usage">
              <CodeBlock code={`tg test ./policies/production.yaml\ntg test ./policies/production.yaml --suite ./tests/`} label="terminal" />
            </SubSection>
            <SubSection title="Test file format">
              <CodeBlock code={`# tests/phi-redaction.yaml
tests:
  - id: phi-blocked
    description: SSN in prompt should be redacted
    stage: pre-request
    input:
      messages:
        - role: user
          content: "My SSN is 123-45-6789, help me with my claim."
    expect:
      outcome: allowed_with_modifications
      rules_triggered:
        - rule_id: redact-phi
          action_taken: redacted`} label="tests/phi-redaction.yaml" />
            </SubSection>
            <SubSection title="Output">
              <CodeBlock code={`  PASS  phi-blocked — SSN in prompt should be redacted
  PASS  injection-blocked — Prompt injection attempt blocked
  FAIL  gdpr-check — Expected blocked but got allowed
        Expected outcome "blocked" but got "allowed"

1 failed, 2 passed.`} label="stdout" />
            </SubSection>
            <p className="font-mono text-xs text-foreground">Exits 1 if any test fails. Add to your CI pipeline alongside <code>tg validate</code>.</p>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="cli-keys" icon={Key} title="CLI — keys create">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Generate offline license keys for air-gapped enterprise deployments. Keys encode the customer's tier and feature set, signed with HMAC-SHA256. The runtime validates them without any network call when <code className="bg-foreground/10 px-1">TG_LICENSE_KEY</code> is set.
            </p>
            <SubSection title="Usage">
              <CodeBlock code={`TG_SIGNING_SECRET=<secret> tg keys create \\
  --tier enterprise \\
  --customer acme-corp \\
  --days 365`} label="terminal" />
            </SubSection>
            <SubSection title="Options">
              <div style={PAINTING_BG} className="p-5 md:p-10 overflow-hidden">
                <div className="bg-white overflow-x-auto p-3 sm:p-5 font-mono text-xs leading-loose text-black">
                  <div><span className="text-black">--tier, -t    </span>  startup | growth | enterprise | oem  <span className="text-black">[required]</span></div>
                  <div><span className="text-black">--customer,-c </span>  Customer ID or name                  <span className="text-black">[required]</span></div>
                  <div><span className="text-black">--days, -d    </span>  Validity in days                     <span className="text-black">[default: 365]</span></div>
                  <div><span className="text-black">--features,-f </span>  Comma-separated feature overrides    <span className="text-black">[optional]</span></div>
                  <div><span className="text-black">--env, -e     </span>  Environment tag (e.g. production)    <span className="text-black">[optional]</span></div>
                </div>
              </div>
            </SubSection>
            <SubSection title="Output">
              <CodeBlock code={`Offline License Key:

  tgk1_eyJ2IjoxLCJ0aWVyIjoiZW50ZXJwcmlzZSIsImZlYXR...

Payload:
  Tier     : enterprise
  Customer : acme-corp
  Issued   : 2026-07-13T00:00:00.000Z
  Expires  : 2027-07-13T00:00:00.000Z (365 days)
  Features : ml_classifiers, compliance_frameworks, ...

Usage:
  export TG_LICENSE_KEY="tgk1_eyJ2IjoxLCJ..."`} label="stdout" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="cli-report" icon={FileText} title="CLI — report">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Generate a structured compliance evidence package from NDJSON audit log files. Output is a self-contained JSON document mapping audit events to regulatory controls — hand it directly to your 3PAO or compliance team.
            </p>
            <SubSection title="Usage">
              <CodeBlock code={`tg report \\
  --logs ./audit/2026-07.ndjson \\
  --framework hipaa \\
  --period 2026-Q2 \\
  --output report.json`} label="terminal" />
            </SubSection>
            <SubSection title="Supported frameworks">
              <div className="flex flex-wrap gap-2 mb-4">
                {["hipaa","gdpr","soc2","fedramp-moderate","eu-ai-act"].map(f => <Pill key={f}>{f}</Pill>)}
              </div>
            </SubSection>
            <SubSection title="Output structure">
              <CodeBlock code={`{
  "tg_evidence_version": "1.0",
  "framework": "hipaa",
  "period": { "start": "2026-04-01", "end": "2026-06-30" },
  "total_events": 14832,
  "blocked_events": 47,
  "controls": [
    {
      "control_id": "164.514(b)",
      "control_name": "PHI Safe Harbor De-identification",
      "status": "satisfied",
      "events_supporting": 2341,
      "violations": 0
    }
  ]
}`} label="report.json (excerpt)" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="mcp" icon={Cpu} title="MCP Server">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              <code className="bg-foreground/10 px-1">tg serve --mcp</code> starts a Model Context Protocol server on stdio. Claude Desktop, Cursor, and any MCP-compatible agent host can call TransparentGuard as a native tool inside its own reasoning loop.
            </p>
            <SubSection title="Start the server">
              <CodeBlock code="tg serve --mcp" label="terminal" />
            </SubSection>
            <SubSection title="Claude Desktop config">
              <CodeBlock code={`// ~/.config/claude/claude_desktop_config.json
{
  "mcpServers": {
    "transparentguard": {
      "command": "transparentguard",
      "args": ["serve", "--mcp"]
    }
  }
}`} label="claude_desktop_config.json" />
            </SubSection>
            <SubSection title="Available tools">
              <div style={PAINTING_BG} className="p-5 md:p-10 overflow-hidden">
                <div className="bg-white p-3 sm:p-5 font-mono text-xs leading-loose text-black">
                  <div className="mb-3"><span className="text-black font-bold">tg_validate_policy</span><br /><span className="text-black pl-4">Validate a TPS YAML file — returns valid, rule count, errors</span></div>
                  <div className="mb-3"><span className="text-black font-bold">tg_evaluate</span><br /><span className="text-black pl-4">Evaluate messages against a policy — returns applicable rules + metadata</span></div>
                  <div className="mb-3"><span className="text-black font-bold">tg_get_evidence</span><br /><span className="text-black pl-4">Generate an evidence package from an audit event array</span></div>
                  <div><span className="text-black font-bold">tg_check_violations</span><br /><span className="text-black pl-4">Summarise violations from an audit event array, with optional rule_id filter</span></div>
                </div>
              </div>
            </SubSection>
            <SubSection title="Example agent call">
              <CodeBlock code={`// Inside any MCP-compatible agent:
const result = await callTool("tg_validate_policy", {
  policy_path: "./policies/production.yaml"
});
// => { valid: true, name: "production", rule_count: 6, ... }`} label="agent.ts" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="sdk-ts" icon={Shield} title="SDK — TypeScript">
            <SubSection title="Install">
              <CodeBlock code="npm install @transparentguard/runtime" label="terminal" />
            </SubSection>
            <SubSection title="Drop-in OpenAI wrapper">
              <CodeBlock code={`import { TransparentGuard } from "@transparentguard/runtime";
import OpenAI from "openai";

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  apiKey: process.env.TG_API_KEY,       // online license check
  // licenseKey: process.env.TG_LICENSE_KEY  // offline (air-gapped)
});

const client = tg.wrap(new OpenAI());

// Identical to standard OpenAI — enforcement is invisible
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: userInput }],
});`} label="index.ts" />
            </SubSection>
            <SubSection title="Direct evaluate() API">
              <CodeBlock code={`const result = await tg.evaluate("pre-request", {
  messages: [{ role: "user", content: userInput }],
  provider: "openai/gpt-4o",
});

if (!result.allowed) {
  throw new Error(result.violations[0]?.detail ?? "Blocked by policy");
}

// result.violations also contains redaction metadata
for (const v of result.violations) {
  console.log(v.rule_id, v.outcome, v.detail);
}`} label="index.ts" />
            </SubSection>
            <SubSection title="Run policy tests in CI">
              <CodeBlock code={`import { loadPolicy, runPolicyTests, formatTestResults } from "@transparentguard/runtime";

const policy = await loadPolicy("./policies/production.yaml");
const suite  = await runPolicyTests(policy);

process.stdout.write(formatTestResults(suite));
process.exit(suite.failed > 0 ? 1 : 0);`} label="ci-test.ts" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="sdk-py" icon={Shield} title="SDK — Python">
            <SubSection title="Install">
              <CodeBlock code={`pip install "transparentguard[openai]"
# or: pip install "transparentguard[anthropic]"`} label="terminal" />
            </SubSection>
            <SubSection title="Drop-in wrapper">
              <CodeBlock code={`from transparentguard import TransparentGuard
from openai import OpenAI

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    api_key=os.environ["TG_API_KEY"],
)

client = tg.wrap(OpenAI())

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": user_input}],
)`} label="main.py" />
            </SubSection>
            <SubSection title="Direct evaluate()">
              <CodeBlock code={`result = tg.evaluate(
    stage="pre-request",
    messages=[{"role": "user", "content": user_input}],
    provider="openai/gpt-4o",
)

if not result.allowed:
    raise ValueError(result.violations[0].detail)`} label="main.py" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="policy-ref" icon={FileText} title="Policy Reference">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              A TransparentGuard Policy Spec (TPS) file is plain YAML. It declares rules, compliance frameworks, audit configuration, and optional tests. Full specification: 3,000+ lines covering every field, constraint, and conformance requirement.
            </p>
            <SubSection title="Top-level structure">
              <CodeBlock code={`tps_version: "1.0"
name: "my-policy"
description: "Production HIPAA + SOC 2 enforcement"
provider:
  - openai/*        # match all OpenAI models
  - anthropic/*     # match all Anthropic models

compliance_frameworks:   # Startup tier+ required
  - hipaa
  - soc2

rules:
  - id: redact-phi
    stage: pre-request
    action: redact
    targets:
      - type: pii
        categories: [phi]
    on_violation: redact
    log: true

audit:
  enabled: true
  destination: "s3://my-bucket/tg-audit/"
  format: ocsf
  chain_integrity:        # Startup tier+ required
    enabled: true
    algorithm: sha256

thresholds:
  - id: phi-breach-alert
    rule_id: redact-phi
    violation_type: rule_triggered
    count: 100
    window: 1h
    action: notify           # Startup tier+ required
    notify_url: "https://hooks.mycompany.com/hipaa-alert"
    payload_template: hipaa-breach-v1

tests:
  - id: ssn-redacted
    stage: pre-request
    input:
      messages:
        - role: user
          content: "My SSN is 123-45-6789"
    expect:
      outcome: allowed_with_modifications`} label="policies/production.yaml" />
            </SubSection>
            <div className="border-2 border-foreground p-5">
              <a href="https://github.com/transparentguard/transparentguard-policy-spec"
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 font-mono text-sm font-bold uppercase tracking-wide hover:underline">
                Full TPS v1.0 Specification <ExternalLink size={14} strokeWidth={2} />
              </a>
              <p className="font-mono text-xs text-foreground mt-2">
                Sections 1–32 · Schema · 7 example policies · JSON Schema (tps-v1.json)
              </p>
            </div>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="frameworks" icon={Shield} title="Compliance Frameworks">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Activate pre-built rule sets with one line. Each framework maps to a curated set of rules, PII classifiers, and audit controls that satisfy the corresponding regulatory requirements.
            </p>
            {[
              { id: "hipaa", name: "HIPAA", ref: "45 CFR Part 164", tier: "Startup+",
                rules: ["All 18 PHI Safe Harbor de-identification identifiers", "Breach threshold alerting (164.308 security incidents)", "7-year audit log retention enforcement", "Chain integrity for 164.312(b) audit controls", "SSN, MRN, DOB, device ID, biometric redaction"] },
              { id: "gdpr", name: "GDPR", ref: "EU 2016/679", tier: "Startup+",
                rules: ["Special-category data blocking (Art. 9 — health, biometrics, religion)", "Personal data minimisation (Art. 5)", "Article 33 breach notification triggers", "EU member state data residency tags", "Cross-border transfer detection"] },
              { id: "soc2", name: "SOC 2", ref: "AICPA TSC 2022", tier: "Startup+",
                rules: ["CC6.1 — Logical access (provider allowlist enforcement)", "CC6.5 — Data disposal (PII redaction on all paths)", "CC7.2 — Anomaly detection (threshold alerting)", "CC9.2 — Vendor risk (third-party model controls)"] },
              { id: "fedramp-moderate", name: "FedRAMP Moderate", ref: "NIST SP 800-53 Rev 5", tier: "Enterprise+",
                rules: ["AC-3 Access Enforcement", "AU-2 Event Logging / AU-3 Content / AU-9 Integrity", "SI-3 Malicious Code Protection (prompt injection)", "SI-10 Information Input Validation", "RA-5 Vulnerability Scanning tags", "Tamper-evident chain integrity (required control)"] },
            ].map(fw => (
              <div key={fw.id} className="border-2 border-foreground p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <span className="font-extrabold text-lg uppercase tracking-tight">{fw.name}</span>
                    <span className="font-mono text-[10px] border border-foreground/40 px-2 py-0.5 text-foreground uppercase tracking-widest">{fw.ref}</span>
                  </div>
                  <span className="font-mono text-[10px] bg-foreground text-background px-2 py-0.5 uppercase tracking-widest">{fw.tier}</span>
                </div>
                <ul className="font-mono text-xs text-foreground leading-relaxed space-y-1">
                  {fw.rules.map(r => <li key={r} className="before:content-['—'] before:mr-2 before:text-foreground">{r}</li>)}
                </ul>
                <code className="mt-4 block font-mono text-[11px] text-foreground">compliance_frameworks: [{fw.id}]</code>
              </div>
            ))}
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="offline" icon={Lock} title="Offline License">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Air-gapped enterprise deployments — FedRAMP, ITAR, classified environments — can use an offline license key. The runtime validates the key locally with HMAC-SHA256 and never contacts <code className="bg-foreground/10 px-1">api.transparentguard.com</code>.
            </p>
            <SubSection title="Key format">
              <CodeBlock code={`tgk1_<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>

Payload:
{
  "v": 1,
  "tier": "enterprise",
  "features": ["compliance_frameworks", "trust_chain", ...],
  "cid": "acme-corp",
  "iat": 1752364800,    // issued at (Unix seconds)
  "exp": 1783900800     // expires at (Unix seconds)
}`} label="key structure" />
            </SubSection>
            <SubSection title="Generate a key (internal tool)">
              <CodeBlock code={`TG_SIGNING_SECRET=<secret> tg keys create \\
  --tier enterprise \\
  --customer your-company \\
  --days 365 \\
  --env production`} label="terminal" />
            </SubSection>
            <SubSection title="Deploy without network access">
              <CodeBlock code={`# Set in your deployment environment — no apiKey needed
export TG_LICENSE_KEY="tgk1_eyJ2IjoxLCJ0aWVyIjoiZW50..."

# Runtime picks it up automatically on init
const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  // No apiKey — TG_LICENSE_KEY is read from the environment
});`} label="deployment" />
            </SubSection>
            <div className="border-l-4 border-foreground pl-5 font-mono text-xs text-foreground leading-relaxed">
              The runtime checks <code>TG_LICENSE_KEY</code> before attempting any network call. If the key is set, the license API is never contacted. Keys are validated in &lt;1ms — no latency impact on request paths.
            </div>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="air-gapped" icon={Shield} title="Air-Gapped / FedRAMP">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              TransparentGuard runs in fully air-gapped mode — zero outbound network calls — for FedRAMP High/Moderate, FedRAMP In Process, ITAR, and classified environments. Three components must be configured: an offline license key, locally-bundled ML classifiers, and egress-blocking network policy.
            </p>

            <SubSection title="Step 1 — Offline license key">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Generate a key with <code className="bg-foreground/10 px-1">tg keys create</code> (see CLI — keys create). The runtime validates it locally with HMAC-SHA256 in under 1ms — the license API is never contacted.
              </p>
              <CodeBlock code={`# Generate (run once, store in your secret manager)
TG_SIGNING_SECRET=<secret> tg keys create \\
  --tier enterprise \\
  --customer acme-corp \\
  --days 365 \\
  --env production

# Verify before deploying
TG_SIGNING_SECRET=<secret> tg keys verify $TG_LICENSE_KEY`} label="terminal" />
            </SubSection>

            <SubSection title="Step 2 — Pull and verify the classifier bundle">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                ML classifiers are normally downloaded at runtime. In air-gapped mode, pull them once in your build pipeline, verify the Cosign attestation, and copy them into your OCI image.
              </p>
              <CodeBlock code={`# Pull the classifier bundle for your licensed tier
tg classifiers pull --tier enterprise --output ./classifiers/

# Verify the Cosign attestation (Sigstore transparency log)
cosign verify-blob ./classifiers/bundle.tar.gz \\
  --certificate ./classifiers/bundle.pem \\
  --signature ./classifiers/bundle.sig \\
  --certificate-identity \\
    "https://github.com/transparentguard/runtime/.github/workflows/release.yaml@refs/heads/main" \\
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"`} label="terminal" />
            </SubSection>

            <SubSection title="Step 3 — Initialise in offline mode">
              <CodeBlock code={`import { TransparentGuard } from "@transparentguard/runtime";

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey: process.env.TG_LICENSE_KEY,   // HMAC-verified locally — no API call
  classifierPath: "./classifiers/",          // local bundle — no CDN download
  offline: true,                             // explicit: throw TransparentGuardOfflineError
                                             // on any outbound network attempt
});`} label="index.ts" />
              <CodeBlock code={`from transparentguard import TransparentGuard
import os

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=os.environ["TG_LICENSE_KEY"],
    classifier_path="./classifiers/",
    offline=True,
)`} label="main.py" />
            </SubSection>

            <SubSection title="Step 4 — OCI image pinning">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Pin to a specific digest so the image never resolves <code className="bg-foreground/10 px-1">:latest</code> at runtime. Copy the pre-verified classifier bundle into the image at build time.
              </p>
              <CodeBlock code={`# Dockerfile
FROM ghcr.io/transparentguard/runtime@sha256:a3f8b2c1d9e0f4567890abcdef1234567890abcdef1234567890abcdef123456

# Copy pre-verified classifier bundle into the image
COPY --chown=tg:tg classifiers/ /app/classifiers/

# Copy policy files
COPY --chown=tg:tg policies/ /app/policies/

ENV TG_OFFLINE=true \\
    TG_CLASSIFIER_PATH=/app/classifiers/ \\
    TG_LICENSE_KEY=tgk1_eyJ2IjoxLCJ0aWVyIjoiZW50...

# Run as non-root (satisfies FedRAMP AC-3 / Kubernetes restricted PSS)
USER tg
ENTRYPOINT ["node", "dist/index.js"]`} label="Dockerfile" />
            </SubSection>

            <SubSection title="Step 5 — Kubernetes NetworkPolicy">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Enable the bundled NetworkPolicy template with <code className="bg-foreground/10 px-1">networkPolicy.enabled: true</code> in Helm values. It restricts egress to DNS and HTTPS only, and ingress to same-namespace pods.
              </p>
              <CodeBlock code={`# values.yaml
networkPolicy:
  enabled: true           # off by default — set true for FedRAMP

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
  seccompProfile:
    type: RuntimeDefault

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  capabilities:
    drop: [ALL]
  seccompProfile:
    type: RuntimeDefault`} label="values.yaml" />
              <CodeBlock code={`# Resulting NetworkPolicy — egress: DNS + HTTPS only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: transparentguard-proxy
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: transparentguard-proxy
  policyTypes: [Egress, Ingress]
  egress:
    - ports:            # DNS resolution
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - ports:            # HTTPS to LLM provider endpoints only
        - protocol: TCP
          port: 443
  ingress:
    - from:
        - podSelector: {}     # same namespace only
      ports:
        - protocol: TCP
          port: 8080`} label="networkpolicy.yaml (generated)" />
            </SubSection>

            <SubSection title="Verify zero outbound calls">
              <CodeBlock code={`# Run a smoke test inside a network-isolated container
docker run --network=none \\
  -e TG_OFFLINE=true \\
  -e TG_LICENSE_KEY="$TG_LICENSE_KEY" \\
  -e TG_CLASSIFIER_PATH=/app/classifiers \\
  -v $(pwd)/classifiers:/app/classifiers:ro \\
  -v $(pwd)/policies:/app/policies:ro \\
  ghcr.io/transparentguard/runtime@sha256:... \\
  node -e "
    const { TransparentGuard } = require('@transparentguard/runtime');
    TransparentGuard.init({
      policy: '/app/policies/production.yaml',
      licenseKey: process.env.TG_LICENSE_KEY,
      classifierPath: process.env.TG_CLASSIFIER_PATH,
      offline: true,
    }).then(() => { console.log('✓ Zero outbound calls — air-gap verified'); });
  "`} label="terminal" />
            </SubSection>

            <SubSection title="FedRAMP controls satisfied">
              <div className="flex flex-wrap gap-2">
                {["AC-3 Access Enforcement","AU-2 Event Logging","AU-3 Audit Record Content","AU-9 Audit Integrity","SI-3 Malicious Code Protection","SI-10 Input Validation","NIST SSDF SR.3","FedRAMP Moderate","FedRAMP High"].map(c => <Pill key={c}>{c}</Pill>)}
              </div>
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="siem" icon={List} title="Integrations — SIEM">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              TG audit events are OCSF-formatted NDJSON. Route them to Splunk, Datadog, or Azure Sentinel using a log forwarder from a file or S3 destination — or use the SIEM's native cloud connector for S3-backed ingestion.
            </p>

            <SubSection title="Audit destination config (all SIEMs)">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Configure TG to write OCSF NDJSON to a local file or S3 bucket. The log forwarder or cloud connector picks it up from there.
              </p>
              <CodeBlock code={`audit:
  enabled: true
  # Option A — local file (ship with Vector / Fluent Bit / Datadog Agent)
  destination: "file:///var/log/tg/audit.ndjson"
  format: ocsf

  # Option B — S3 (use SIEM native S3 connector)
  # destination: "s3://my-compliance-bucket/tg-audit/"
  # format: ocsf

  # Batch tuning — flush every 500 events or 5 seconds, whichever comes first
  batch:
    max_events: 500
    flush_interval_ms: 5000

  chain_integrity:
    enabled: true       # tamper-evident SHA-256 chain (FedRAMP AU-9)
    algorithm: sha256`} label="policies/production.yaml" />
            </SubSection>

            <SubSection title="Splunk (HTTP Event Collector)">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Use Vector to tail the NDJSON file and forward to Splunk HEC. Each audit event is forwarded as a separate HEC event with its OCSF fields preserved.
              </p>
              <CodeBlock code={`# vector.toml
[sources.tg_audit]
type = "file"
include = ["/var/log/tg/audit.ndjson"]
read_from = "beginning"

[transforms.parse_ocsf]
type = "remap"
inputs = ["tg_audit"]
source = '''
  . = parse_json!(string!(.message))
'''

[sinks.splunk_hec]
type = "splunk_hec_logs"
inputs = ["parse_ocsf"]
endpoint = "https://splunk.mycompany.com:8088"
token = "${SPLUNK_HEC_TOKEN}"
index = "tg_audit"
source = "transparentguard"
sourcetype = "tg:ocsf"
compression = "gzip"`} label="vector.toml" />
              <CodeBlock code={`| index=tg_audit sourcetype="tg:ocsf"
| where outcome="blocked" OR outcome="redacted"
| table _time, rule_id, stage, provider, outcome, detail, session_id
| sort -_time`} label="Splunk SPL — violations search" />
              <CodeBlock code={`| index=tg_audit sourcetype="tg:ocsf"
| timechart span=1h count BY outcome
| where outcome IN ("blocked","redacted")`} label="Splunk SPL — violation trend (1h buckets)" />
            </SubSection>

            <SubSection title="Datadog">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Configure the Datadog Agent to tail the NDJSON log file. TG events appear in Log Explorer under <code className="bg-foreground/10 px-1">service:transparentguard</code>.
              </p>
              <CodeBlock code={`# /etc/datadog-agent/conf.d/tg_audit.d/conf.yaml
logs:
  - type: file
    path: /var/log/tg/audit.ndjson
    service: transparentguard
    source: transparentguard
    log_processing_rules:
      - type: multi_line
        name: new_log_start
        pattern: '^\{'
    tags:
      - env:production
      - compliance:hipaa`} label="/etc/datadog-agent/conf.d/tg_audit.d/conf.yaml" />
              <CodeBlock code={`service:transparentguard @outcome:(blocked OR redacted)
  | columns @timestamp, @rule_id, @stage, @provider, @outcome, @detail, @session_id`} label="Datadog Log Search — violations" />
              <CodeBlock code={`# Datadog Monitor — alert on >10 blocked events in 5 minutes
{
  "name": "TG — Policy violations spike",
  "type": "log alert",
  "query": "logs(\"service:transparentguard @outcome:blocked\").index(\"*\").rollup(\"count\").by(\"@rule_id\").last(\"5m\") > 10",
  "message": "{{@rule_id}} is blocking more than 10 requests per 5 minutes. Review audit logs."
}`} label="Datadog Monitor (JSON)" />
            </SubSection>

            <SubSection title="Azure Sentinel (Log Analytics)">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Use the Azure Monitor Agent (AMA) with a Data Collection Rule to ingest TG NDJSON logs into a custom table. Query with KQL in Sentinel Workbooks or Analytics rules.
              </p>
              <CodeBlock code={`# Data Collection Rule — custom JSON log ingestion
{
  "dataSources": {
    "logFiles": [{
      "name": "tg-audit",
      "streams": ["Custom-TGAuditLogs_CL"],
      "filePatterns": ["/var/log/tg/audit*.ndjson"],
      "format": "json",
      "settings": {
        "text": { "recordStartTimestampFormat": "ISO 8601" }
      }
    }]
  },
  "destinations": {
    "logAnalytics": [{
      "workspaceResourceId": "/subscriptions/.../workspaces/my-workspace",
      "name": "myWorkspace"
    }]
  },
  "dataFlows": [{
    "streams": ["Custom-TGAuditLogs_CL"],
    "destinations": ["myWorkspace"]
  }]
}`} label="data-collection-rule.json" />
              <CodeBlock code={`// KQL — violations in the last 24 hours
TGAuditLogs_CL
| where TimeGenerated > ago(24h)
| where outcome_s in ("blocked", "redacted")
| project TimeGenerated, rule_id_s, stage_s, provider_s,
          outcome_s, detail_s, session_id_g
| order by TimeGenerated desc`} label="Sentinel KQL — violations" />
              <CodeBlock code={`// KQL — Sentinel Analytics Rule: breach threshold alert
TGAuditLogs_CL
| where TimeGenerated > ago(1h)
| where outcome_s == "blocked"
| summarize ViolationCount = count() by rule_id_s, bin(TimeGenerated, 5m)
| where ViolationCount > 10`} label="Sentinel KQL — Analytics Rule" />
            </SubSection>

            <SubSection title="S3-backed ingestion (all SIEMs)">
              <CodeBlock code={`# Write to S3 — all three SIEMs have native S3 connectors
audit:
  enabled: true
  destination: "s3://my-compliance-bucket/tg-audit/"
  format: ocsf

# Splunk   → Splunk Add-on for AWS (S3 SQS-based ingestion)
# Datadog  → Datadog AWS Lambda log forwarder
# Sentinel → Azure Logic App + Amazon S3 connector`} label="policies/production.yaml" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="secrets" icon={Key} title="Integrations — Secret Managers">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Supply <code className="bg-foreground/10 px-1">TG_LICENSE_KEY</code> and policy signing keys from your secret manager instead of bare environment variables. TG reads secrets at init time — fetch them before calling <code className="bg-foreground/10 px-1">TransparentGuard.init()</code>.
            </p>

            <SubSection title="HashiCorp Vault — Vault Agent (recommended)">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Vault Agent runs as a sidecar, authenticates with AWS IAM / Kubernetes auth, and renders secrets into environment files that are hot-reloaded on rotation. No Vault SDK code in your application.
              </p>
              <CodeBlock code={`# vault-agent.hcl
pid_file = "/run/vault-agent.pid"

vault { address = "https://vault.mycompany.com:8200" }

auto_auth {
  method "kubernetes" {
    config {
      role = "transparentguard-prod"
      token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    }
  }
  sink "file" { config { path = "/run/secrets/.vault-token" } }
}

template {
  source      = "/etc/vault-templates/tg-env.tpl"
  destination = "/run/secrets/tg-env.sh"
  # Reload TG process when secrets rotate
  command     = "kill -HUP $(cat /run/tg.pid)"
  error_on_missing_key = true
}`} label="vault-agent.hcl" />
              <CodeBlock code={`{{/* /etc/vault-templates/tg-env.tpl */}}
{{ with secret "secret/data/transparentguard/prod" -}}
export TG_LICENSE_KEY="{{ .Data.data.license_key }}"
export TG_SIGNING_SECRET="{{ .Data.data.signing_secret }}"
{{- end }}`} label="tg-env.tpl" />
            </SubSection>

            <SubSection title="HashiCorp Vault — direct SDK">
              <CodeBlock code={`import Vault from "node-vault";
import { TransparentGuard } from "@transparentguard/runtime";

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,    // https://vault.mycompany.com:8200
  token:    process.env.VAULT_TOKEN,   // or use AppRole / AWS IAM / K8s auth
});

// Fetch at startup — before TransparentGuard.init()
const { data } = await vault.read("secret/data/transparentguard/prod");
const { license_key } = data.data;

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey: license_key,
});`} label="index.ts" />
              <CodeBlock code={`import hvac
from transparentguard import TransparentGuard

client = hvac.Client(url=os.environ["VAULT_ADDR"], token=os.environ["VAULT_TOKEN"])
secret = client.secrets.kv.v2.read_secret_version(path="transparentguard/prod")
license_key = secret["data"]["data"]["license_key"]

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=license_key,
)`} label="main.py" />
            </SubSection>

            <SubSection title="AWS Secrets Manager — SDK">
              <CodeBlock code={`import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { TransparentGuard } from "@transparentguard/runtime";

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const { SecretString } = await sm.send(
  new GetSecretValueCommand({ SecretId: "prod/transparentguard" })
);

// Secret stored as JSON: { "licenseKey": "tgk1_...", "signingSecret": "..." }
const { licenseKey } = JSON.parse(SecretString!);

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey,
});`} label="index.ts" />
            </SubSection>

            <SubSection title="AWS Secrets Manager — ECS task definition">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                For ECS / Fargate, inject secrets directly into the container environment without any SDK code. ECS decrypts and injects them at task launch.
              </p>
              <CodeBlock code={`{
  "containerDefinitions": [{
    "name": "transparentguard",
    "image": "ghcr.io/transparentguard/runtime@sha256:...",
    "secrets": [
      {
        "name": "TG_LICENSE_KEY",
        "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/transparentguard:licenseKey::"
      },
      {
        "name": "TG_SIGNING_SECRET",
        "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/transparentguard:signingSecret::"
      }
    ],
    "environment": [
      { "name": "TG_OFFLINE", "value": "false" },
      { "name": "NODE_ENV",   "value": "production" }
    ]
  }]
}`} label="ecs-task-definition.json" />
            </SubSection>

            <SubSection title="GCP Secret Manager — SDK">
              <CodeBlock code={`import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { TransparentGuard } from "@transparentguard/runtime";

const sm = new SecretManagerServiceClient();
// Uses Application Default Credentials — no key file needed on Cloud Run / GKE

async function getSecret(secretId: string): Promise<string> {
  const name = \`projects/\${process.env.GCP_PROJECT_ID}/secrets/\${secretId}/versions/latest\`;
  const [version] = await sm.accessSecretVersion({ name });
  return version.payload!.data!.toString();
}

const licenseKey = await getSecret("tg-license-key");

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey,
});`} label="index.ts" />
              <CodeBlock code={`from google.cloud import secretmanager
from transparentguard import TransparentGuard

client = secretmanager.SecretManagerServiceClient()
name = f"projects/{os.environ['GCP_PROJECT_ID']}/secrets/tg-license-key/versions/latest"
response = client.access_secret_version(request={"name": name})
license_key = response.payload.data.decode("UTF-8")

tg = TransparentGuard.init(
    policy="./policies/production.yaml",
    license_key=license_key,
)`} label="main.py" />
            </SubSection>

            <SubSection title="GCP Secret Manager — Cloud Run secret volume (zero SDK)">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-4">
                Mount secrets as files via Cloud Run's native secret volume support. No SDK calls — the runtime reads a file. Secrets rotate without redeployment.
              </p>
              <CodeBlock code={`# service.yaml (Cloud Run)
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: transparentguard-proxy
spec:
  template:
    spec:
      volumes:
        - name: tg-secrets
          secret:
            secretName: tg-license-key
            items:
              - key: latest
                path: license_key
      containers:
        - image: ghcr.io/transparentguard/runtime@sha256:...
          volumeMounts:
            - name: tg-secrets
              mountPath: /run/secrets/tg
              readOnly: true`} label="service.yaml" />
              <CodeBlock code={`import { readFileSync } from "fs";
import { TransparentGuard } from "@transparentguard/runtime";

// Secret mounted as a file by Cloud Run — zero SDK calls at startup
const licenseKey = readFileSync("/run/secrets/tg/license_key", "utf8").trim();

const tg = await TransparentGuard.init({
  policy: "./policies/production.yaml",
  licenseKey,
});`} label="index.ts" />
            </SubSection>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="oem" icon={Package} title="OEM Package">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              <code className="bg-foreground/10 px-1">@transparentguard/runtime-oem</code> is the embedded distribution package for OEM partners. It re-exports the full runtime API with white-label support and usage reporting for revenue-share tracking.
            </p>
            <SubSection title="Install">
              <CodeBlock code="npm install @transparentguard/runtime-oem" label="terminal" />
            </SubSection>
            <SubSection title="White-label initialisation">
              <CodeBlock code={`import { createOemRuntime, reportUsage } from "@transparentguard/runtime-oem";
import OpenAI from "openai";

// brandName replaces "[TransparentGuard]" in all logs and error messages
const tg = await createOemRuntime({
  policy: "./policies/production.yaml",
  licenseKey: process.env.TG_LICENSE_KEY,
  brandName: "AcmeGuard",                      // white-label
  usageWebhook: process.env.TG_OEM_WEBHOOK,
});

const client = tg.wrap(new OpenAI());`} label="index.ts" />
            </SubSection>
            <SubSection title="Usage reporting (billing reconciliation)">
              <CodeBlock code={`// Call daily or per billing period
await reportUsage(process.env.TG_OEM_WEBHOOK!, {
  period_start:   "2026-07-01T00:00:00Z",
  period_end:     "2026-07-31T23:59:59Z",
  call_count:     142_000,
  by_provider:    { "openai/gpt-4o": 98000, "anthropic/claude-3-5-sonnet": 44000 },
  customer_id:    "acme-corp",
  runtime_version: "0.1.0",
});`} label="billing.ts" />
            </SubSection>
            <div className="border-l-4 border-foreground pl-5 font-mono text-xs text-foreground leading-relaxed">
              All exports from <code>@transparentguard/runtime</code> are re-exported from the OEM package. You can use the OEM package as a full drop-in for the standard runtime.
            </div>
          </DocSection>

          {/* ---------------------------------------------------------------- */}
          <DocSection id="slsa" icon={Shield} title="Supply Chain Security">
            <p className="font-mono text-sm text-foreground leading-relaxed mb-6 max-w-xl">
              Every release of the runtime, CLI, and OEM package carries SLSA Level 3 provenance attestations and a CycloneDX SBOM — satisfying FedRAMP NIST SSDF SR.3, NIST SP 800-218, and the EU Cyber Resilience Act.
            </p>
            <SubSection title="Verify a release artifact">
              <CodeBlock code={`# Verify SLSA Level 3 provenance with the GitHub CLI
gh attestation verify runtime-dist.tar.gz \\
  --repo transparentguard/runtime \\
  --format json`} label="terminal" />
            </SubSection>
            <SubSection title="What's attested">
              <div className="flex flex-wrap gap-2 mb-4">
                {["SLSA Level 3 provenance","CycloneDX SBOM","Sigstore transparency log","GitHub Actions build","Cosign image signing","NIST SSDF SR.3"].map(f => <Pill key={f}>{f}</Pill>)}
              </div>
            </SubSection>
            <SubSection title="CycloneDX SBOM">
              <p className="font-mono text-xs text-foreground leading-relaxed mb-3">
                Every GitHub release includes <code>sbom-runtime.cdx.json</code>, <code>sbom-cli.cdx.json</code>, and <code>sbom-runtime-oem.cdx.json</code> — machine-readable bills of materials enumerating every dependency and its exact version. Import directly into your GRC platform or supply-chain scanner.
              </p>
            </SubSection>
            <div className="border-2 border-foreground p-5">
              <a href="https://github.com/transparentguard/runtime/releases" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 font-mono text-sm font-bold uppercase tracking-wide hover:underline">
                View Releases & Attestations <ExternalLink size={14} strokeWidth={2} />
              </a>
            </div>
          </DocSection>

        </main>
      </div>

      <footer className="border-t-2 border-foreground px-6 md:px-12 py-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-mono text-xs uppercase opacity-50">
        <div>© {new Date().getFullYear()} Transparency Research & Technology</div>
        <div>Strictly Technical. No Compromises.</div>
      </footer>

      {/* Feature 2: floating Contents button — mobile only */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-30 lg:hidden flex items-center gap-2 bg-foreground text-background font-mono text-xs font-bold uppercase tracking-widest px-4 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] focus:outline-none active:shadow-none active:translate-x-px active:translate-y-px transition-transform"
      >
        <List size={14} strokeWidth={2.5} /> Contents
      </button>

      {/* Feature 2: slide-up drawer — mobile only */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t-2 border-foreground lg:hidden max-h-[72vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/20 shrink-0">
                <span className="font-mono text-xs uppercase tracking-widest font-bold">Contents</span>
                <button onClick={() => setDrawerOpen(false)}
                  className="text-foreground hover:text-foreground transition-colors focus:outline-none">
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <nav className="flex flex-col overflow-y-auto p-3 gap-0.5">
                {DOC_SECTIONS.map(s => (
                  <button key={s.id} onClick={() => scrollTo(s.id)}
                    className={`text-left font-mono text-sm py-3 px-4 transition-colors duration-150 focus:outline-none ${activeSection === s.id ? "bg-foreground text-background" : "text-foreground hover:text-foreground"}`}>
                    {s.label}
                  </button>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Startup page
// ---------------------------------------------------------------------------

function StartupPage({ onBack }: { onBack: () => void }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  return (
    <motion.div key="startup" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col p-6 md:p-12 lg:p-24 max-w-5xl mx-auto">

      <header className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-foreground focus:outline-none">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="text-xl font-bold tracking-tight uppercase">TransparentGuard</span>
        </div>
        <div className="font-mono text-xs uppercase tracking-widest bg-foreground text-background px-4 py-2">Startup</div>
      </header>

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-16">
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter uppercase mb-3">Startup</h2>
        <div className="font-mono text-sm text-foreground mb-1">$299/mo — 14-day free trial</div>
        <div className="font-mono text-xs text-foreground/60 mb-5">No credit card required to start</div>
        <div className="h-0.5 bg-foreground w-full mb-8" />
        <p className="font-mono text-sm leading-relaxed max-w-2xl">
          Your first enterprise deal will ask for a compliance report. Now you can hand one over.
        </p>
      </motion.div>

      <div className="flex flex-col gap-5">
        <motion.div custom={0.3} variants={fadeUp} initial="hidden" animate="show"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/spring-garden.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="p-5 md:p-10">
          <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
            {([
              {
                label: "Detection & Classification",
                items: [
                  "ML injection classifier: catches prompt injection attempts before they reach your model",
                  "ML toxicity classifier: blocks harmful, abusive, and unsafe output in real time",
                  "ML jailbreak classifier: detects five attack vector categories including persona hijacking, encoding attacks, and nested instruction injection",
                  "All core guardrails from Free: PII detection across 18 categories, content filtering, and token budgets",
                ],
              },
              {
                label: "Compliance",
                items: [
                  "One compliance framework of your choice: HIPAA (45 CFR Part 164) or GDPR (EU 2016/679)",
                  "JSON report export: hand your compliance team a real artifact, not a log dump",
                  "Evidence package maps directly to framework controls, auditor-ready on day one",
                  "Policy file lives in your repo: version-controlled, reviewable, and rollback-ready",
                ],
              },
            ] as const).map(({ label, items }) => (
              <section key={label}>
                <SectionLabel>{label}</SectionLabel>
                <ul className="flex flex-col gap-3">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                      <span className="shrink-0 mt-px">+</span>{item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </motion.div>

        <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/autumn-valley.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="p-5 md:p-10">
          <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
            {([
              {
                label: "Hosting & Infrastructure",
                items: [
                  "Hosted managed endpoint: no Kubernetes, no Terraform, no self-hosting required",
                  "Your policy file is the only thing you manage; we handle the runtime and uptime",
                  "Proxy supports OpenAI and Anthropic out of the box",
                  "Self-hosting still available if your team prefers it",
                ],
              },
              {
                label: "Support",
                items: [
                  "Slack and email support included",
                  "48-hour response SLA on all support requests",
                  "Full access to TPS documentation, SDK references, and CLI guides",
                ],
              },
            ] as const).map(({ label, items }) => (
              <section key={label}>
                <SectionLabel>{label}</SectionLabel>
                <ul className="flex flex-col gap-3">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                      <span className="shrink-0 mt-px">+</span>{item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="border-t-2 border-foreground mt-16 pt-10">
        <a href="https://transparentguard.com"
          className="inline-flex items-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none">
          Start Free Trial <ExternalLink size={20} strokeWidth={2.5} />
        </a>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Growth page
// ---------------------------------------------------------------------------

function GrowthPage({ onBack }: { onBack: () => void }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  return (
    <motion.div key="growth" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col p-6 md:p-12 lg:p-24 max-w-5xl mx-auto">

      <header className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-foreground focus:outline-none">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="text-xl font-bold tracking-tight uppercase">TransparentGuard</span>
        </div>
        <div className="font-mono text-xs uppercase tracking-widest bg-foreground text-background px-4 py-2">Growth</div>
      </header>

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-16">
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter uppercase mb-3">Growth</h2>
        <div className="font-mono text-sm text-foreground mb-1">$799/mo — 14-day free trial</div>
        <div className="font-mono text-xs text-foreground/60 mb-5">No credit card required to start</div>
        <div className="h-0.5 bg-foreground w-full mb-8" />
        <p className="font-mono text-sm leading-relaxed max-w-2xl">
          Active audits need more than one framework. Growth gives you all of them.
        </p>
      </motion.div>

      <div className="flex flex-col gap-5">
        <motion.div custom={0.3} variants={fadeUp} initial="hidden" animate="show"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/red-trees-glow.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="p-5 md:p-10">
          <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
            {([
              {
                label: "Compliance Frameworks",
                items: [
                  "HIPAA (45 CFR Part 164): 18 PHI identifiers detected in real time, evidence mapped to 164.514 Safe Harbor controls",
                  "GDPR (EU 2016/679): Article 9 special categories detected in prompt and response, consent-aware routing",
                  "EU AI Act: risk classification and incident logging for high-risk systems, conformity declaration included",
                  "SOC 2 (AICPA TSC 2022): tamper-proof audit trail with events mapped to CC6, CC7, and A1, Type II-ready",
                ],
              },
              {
                label: "Legal Agreements",
                items: [
                  "HIPAA Business Associate Agreement (BAA) available on request",
                  "GDPR Data Processing Agreement (DPA) available on request",
                  "Agreements are pre-drafted and can be executed without a legal review cycle on our end",
                  "Covers all hosted data processing under your TransparentGuard account",
                ],
              },
            ] as const).map(({ label, items }) => (
              <section key={label}>
                <SectionLabel>{label}</SectionLabel>
                <ul className="flex flex-col gap-3">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                      <span className="shrink-0 mt-px">+</span>{item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </motion.div>

        <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/mountains.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="p-5 md:p-10">
          <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
            {([
              {
                label: "Audit & Retention",
                items: [
                  "7-year audit log retention: meets HIPAA 45 CFR 164.530(j) record-keeping requirements",
                  "Tamper-evident log chaining: every audit event is hash-linked to the previous one",
                  "One CLI command generates a structured JSON evidence package ready for your auditor",
                  "Audit events in OCSF format: compatible with AWS Security Hub, Splunk, and your SIEM",
                ],
              },
              {
                label: "Support",
                items: [
                  "Priority support over Slack and email",
                  "8-hour response SLA on all support requests",
                  "Direct escalation path to the engineering team for compliance-critical issues",
                ],
              },
            ] as const).map(({ label, items }) => (
              <section key={label}>
                <SectionLabel>{label}</SectionLabel>
                <ul className="flex flex-col gap-3">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                      <span className="shrink-0 mt-px">+</span>{item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="border-t-2 border-foreground mt-16 pt-10">
        <a href="https://transparentguard.com"
          className="inline-flex items-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none">
          Start Free Trial <ExternalLink size={20} strokeWidth={2.5} />
        </a>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Enterprise page
// ---------------------------------------------------------------------------

function EnterprisePage({ onBack }: { onBack: () => void }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  return (
    <motion.div key="enterprise" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col p-6 md:p-12 lg:p-24 max-w-5xl mx-auto">

      <header className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-foreground focus:outline-none">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="text-xl font-bold tracking-tight uppercase">TransparentGuard</span>
        </div>
        <div className="font-mono text-xs uppercase tracking-widest bg-foreground text-background px-4 py-2">Enterprise</div>
      </header>

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-16">
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter uppercase mb-3">Enterprise</h2>
        <div className="font-mono text-sm text-foreground mb-5">Starting at $50,000/yr — Custom Quote</div>
        <div className="h-0.5 bg-foreground w-full mb-8" />
        <p className="font-mono text-sm leading-relaxed max-w-2xl">
          For regulated industries and government. Every contract closes with a compliance artifact already in hand.
        </p>
      </motion.div>

      <div className="flex flex-col gap-5">

        {/* Sections 1–2: green path painting */}
        <motion.div custom={0.3} variants={fadeUp} initial="hidden" animate="show"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/green-path.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="p-5 md:p-10">
          <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
            {([
              {
                label: "Compliance & Regulatory",
                items: [
                  "FedRAMP Moderate — NIST 800-53 control mapping with signed evaluation receipts",
                  "Custom compliance framework development — your industry-specific rules, built by our team",
                  "Annual penetration test results available on request",
                  "Custom MSA, enterprise DPA, and legal terms — no standard contracts required",
                ],
              },
              {
                label: "Deployment & Infrastructure",
                items: [
                  "Self-hosted via Kubernetes Helm chart and Terraform modules — dedicated onboarding engineer included",
                  "Air-gapped deployment — offline license keys, zero outbound calls to our servers",
                  "Data residency — EU-only, US-only, or your own infrastructure",
                  "Unlimited LLM calls at a negotiated per-call rate",
                ],
              },
            ] as const).map(({ label, items }) => (
              <section key={label}>
                <SectionLabel>{label}</SectionLabel>
                <ul className="flex flex-col gap-3">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                      <span className="shrink-0 mt-px">+</span>{item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </motion.div>

        {/* Sections 3–4: tropical lake painting */}
        <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/tropical-lake.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="p-5 md:p-10">
          <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
            {([
              {
                label: "AI & Policy",
                items: [
                  "Custom PII and content classifiers trained on your domain vocabulary",
                  "All compliance frameworks included — HIPAA, GDPR, EU AI Act, SOC 2",
                  "Unlimited team members — no seat restrictions of any kind",
                ],
              },
              {
                label: "Support",
                items: [
                  "99.99% uptime SLA (hosted) or deployment SLA (self-hosted)",
                  "Dedicated Slack channel with direct engineering team access",
                  "Quarterly compliance review call",
                ],
              },
            ] as const).map(({ label, items }) => (
              <section key={label}>
                <SectionLabel>{label}</SectionLabel>
                <ul className="flex flex-col gap-3">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                      <span className="shrink-0 mt-px">+</span>{item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </motion.div>

      </div>

      <div className="border-t-2 border-foreground mt-16 pt-10">
        <a href="https://transparentguard.com"
          className="inline-flex items-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none">
          Talk to Us <ExternalLink size={20} strokeWidth={2.5} />
        </a>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// OEM page
// ---------------------------------------------------------------------------

function OemPage({ onBack }: { onBack: () => void }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, []);
  return (
    <motion.div key="oem" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col p-6 md:p-12 lg:p-24 max-w-5xl mx-auto">

      <header className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-6">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-foreground focus:outline-none">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="text-xl font-bold tracking-tight uppercase">TransparentGuard</span>
        </div>
        <div className="font-mono text-xs uppercase tracking-widest bg-foreground text-background px-4 py-2">OEM</div>
      </header>

      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-16">
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter uppercase mb-3">OEM License</h2>
        <div className="font-mono text-sm text-foreground mb-5">$30,000/yr base + $0.04 per 10,000 calls</div>
        <div className="h-0.5 bg-foreground w-full mb-8" />
        <p className="font-mono text-sm leading-relaxed max-w-2xl">
          License the TransparentGuard Runtime and ship AI governance as a feature of your own product. Your brand. Our enforcement engine.
        </p>
      </motion.div>

      <motion.div custom={0.3} variants={fadeUp} initial="hidden" animate="show"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/beach-dunes.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }}
        className="p-5 md:p-10">
        <div className="bg-background p-6 md:p-8 flex flex-col gap-10">
          {([
            {
              label: "What You Ship",
              items: [
                "@transparentguard/runtime-oem — drop into your stack, deploy to your customers",
                "White-label build flags — your brand surfaces everywhere, ours doesn't",
                "Full compliance report API — build your own UI on top; we handle the data and computation",
              ],
            },
            {
              label: "What Your Customers Get",
              items: [
                "All compliance frameworks: HIPAA, GDPR, EU AI Act, SOC 2, FedRAMP Moderate",
                "SLSA Level 3 provenance + CycloneDX SBOMs on every release — EU Cyber Resilience Act and NIST SSDF ready",
                "Usage reporting webhooks — automate your own billing or revenue-share against our call counts",
              ],
            },
            {
              label: "How the Deal Works",
              items: [
                "$30,000/year base — includes all frameworks, white-label rights, and API access",
                "$0.04 per 10,000 calls evaluated across all your tenants — transparent, auditable usage",
                "90 days of dedicated integration engineering — we get you live, not just licensed",
                "Source code escrow available on request",
              ],
            },
          ] as const).map(({ label, items }) => (
            <section key={label}>
              <SectionLabel>{label}</SectionLabel>
              <ul className="flex flex-col gap-3">
                {items.map(item => (
                  <li key={item} className="flex items-start gap-3 font-mono text-sm leading-relaxed">
                    <span className="shrink-0 mt-px">+</span>{item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </motion.div>

      <div className="border-t-2 border-foreground mt-16 pt-10">
        <a href="https://transparentguard.com"
          className="inline-flex items-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none">
          Talk to Us <ExternalLink size={20} strokeWidth={2.5} />
        </a>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Company Page
// ---------------------------------------------------------------------------

const COMPANY_SECTIONS = [
  { id: "origin",     label: "Origin" },
  { id: "research",   label: "Research" },
  { id: "philosophy", label: "Philosophy" },
  { id: "future",     label: "Future of AI" },
  { id: "victoria",   label: "Victoria, TX" },
];

function CompanyPage({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState("origin");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isProgrammaticScroll = useRef(false);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    COMPANY_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting && !isProgrammaticScroll.current) setActiveSection(id); },
        { rootMargin: '-10% 0px -80% 0px', threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(obs => obs.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    isProgrammaticScroll.current = true;
    setActiveSection(id);
    setDrawerOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { isProgrammaticScroll.current = false; }, 900);
  };

  const activeSectionLabel = COMPANY_SECTIONS.find(s => s.id === activeSection)?.label ?? "";

  return (
    <motion.div key="company" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col">

      {/* Sticky top bar */}
      <header className="sticky top-0 z-20 bg-background border-b-2 border-foreground px-6 md:px-12 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack}
            className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider hover:opacity-70 transition-opacity focus:outline-none shrink-0">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="font-bold tracking-tight uppercase hidden sm:block shrink-0">TransparentGuard</span>
          <span className="font-mono text-xs text-foreground uppercase tracking-widest hidden sm:block shrink-0">Company</span>
          <span className="font-mono text-[11px] text-foreground uppercase tracking-widest block sm:hidden truncate">{activeSectionLabel}</span>
        </div>
        {/* Mobile drawer toggle */}
        <button onClick={() => setDrawerOpen(o => !o)}
          className="lg:hidden flex items-center gap-2 bg-foreground text-background font-mono px-3 py-1.5 text-xs font-bold uppercase tracking-widest focus:outline-none">
          {drawerOpen ? <><X size={13} /> Close</> : <><List size={13} /> Sections</>}
        </button>
        <div className="bg-foreground text-background font-mono px-3 py-1.5 text-xs font-bold uppercase shrink-0 hidden lg:block">Company</div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="lg:hidden border-b-2 border-foreground bg-background overflow-hidden z-10">
            <nav className="flex flex-col overflow-y-auto p-3 gap-0.5">
              {COMPANY_SECTIONS.map(s => (
                <button key={s.id} onClick={() => scrollTo(s.id)}
                  className={`text-left font-mono text-xs py-2 px-3 transition-colors duration-150 focus:outline-none ${activeSection === s.id ? "bg-foreground text-background" : "text-foreground hover:bg-foreground/10"}`}>
                  {s.label}
                </button>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 min-w-0 overflow-x-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r-2 border-foreground sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto py-8 px-6">
          <div className="font-mono text-[10px] uppercase tracking-widest text-foreground mb-4">Contents</div>
          <nav className="flex flex-col gap-0.5">
            {COMPANY_SECTIONS.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`text-left font-mono text-xs py-1.5 px-2 transition-colors duration-150 focus:outline-none ${activeSection === s.id ? "bg-foreground text-background" : "text-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 md:px-12 lg:px-16 py-12 max-w-4xl font-mono text-sm leading-relaxed">

          <div className="mb-14">
            <h1 className="text-4xl md:text-7xl font-extrabold tracking-tighter uppercase leading-[0.92] mb-6">TransparentGuard</h1>
            <div className="h-0.5 bg-foreground w-full" />
          </div>

          <div className="flex flex-col gap-20">

            <section id="origin" className="scroll-mt-20">
              <SectionLabel>Origin</SectionLabel>
              <div className="flex flex-col gap-5 text-foreground/90">
                <p>Transparency Research Group was founded on a specific observation: the tooling ecosystem for large language model deployment had, by 2023, produced a sophisticated array of capabilities for generation, retrieval, and fine-tuning, but had produced almost nothing for governance. Organizations shipping AI-assisted software into regulated environments were writing bespoke middleware, maintaining undocumented policy logic in application code, and producing audit artifacts by hand. The compliance posture of an AI product was, in nearly every case we evaluated, informal, fragile, and impossible to verify independently.</p>
                <p>We believed this was not a problem that would solve itself. As LLM adoption accelerated inside industries carrying genuine regulatory exposure, the gap between deployment velocity and governance infrastructure would widen until it became a systemic risk. The question was not whether enterprises would eventually need a policy enforcement layer for AI. The question was whether that layer would be built openly, with documented behavior and verifiable semantics, or whether it would be built quietly inside proprietary stacks, invisible to auditors, regulators, and the organizations relying on it.</p>
                <p>We chose to build it openly. The Transparent Policy Specification is a public standard. The audit chain format is documented. The classifier evaluation methodology is reproducible. We take the position that governance infrastructure for AI must be inspectable by the same parties it is meant to protect, and that opacity in a compliance tool is not a feature.</p>
              </div>
            </section>

            <section id="research" className="scroll-mt-20">
              <SectionLabel>Research Foundations</SectionLabel>
              <div className="flex flex-col gap-5">

                <div style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/marsh-clouds.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }} className="p-5 md:p-10">
                  <div className="bg-background p-6 md:p-8 border-l-2 border-foreground pl-6 flex flex-col gap-4">
                    <p className="font-bold uppercase tracking-widest text-xs">Study 01 — PII Leakage Surface Characterization Across Commercial LLM Endpoints (2024)</p>
                    <p className="text-foreground/90">In the first half of 2024, our research team conducted a longitudinal evaluation of fourteen commercially available LLM API endpoints across five model families, generating 2.31 million synthetic prompt interactions designed to simulate realistic enterprise workloads in healthcare, financial services, and legal document processing contexts. Each prompt set was instrumented with seeded personally identifiable information tokens at varying density levels, from sparse single-field exposure to compound multi-field records, to establish a reliable leakage detection baseline.</p>
                    <p className="text-foreground/90">Without any enforcement layer in place, 23.4 percent of sampled responses contained at least one detectable PII token as identified by a combined regex classifier and fine-tuned BERT-variant model trained on annotated leakage examples from the healthcare and finance domains. This figure rose to 38.1 percent when prompts included explicit data-handling instructions embedded in system context, a pattern common in retrieval-augmented generation pipelines. The finding contradicted a widely held assumption that system prompt constraints reliably suppress PII output in production conditions.</p>
                    <p className="text-foreground/90">After introducing TPS-governed enforcement at the proxy layer, with policies configured to block outbound PII matching HIPAA Safe Harbor identifiers, the detected leakage rate dropped to 0.06 percent across the same prompt corpus. Residual leakage was attributable to novel paraphrase constructions not represented in the classifier training distribution, a finding that directly motivated the adaptive classifier retraining pipeline now included in the Growth and Enterprise tiers. This study formed the quantitative basis for the PII enforcement guarantees documented in the TPS v1.0 specification.</p>
                  </div>
                </div>

                <div style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/autumn-river.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }} className="p-5 md:p-10">
                  <div className="bg-background p-6 md:p-8 border-l-2 border-foreground pl-6 flex flex-col gap-4">
                    <p className="font-bold uppercase tracking-widest text-xs">Study 02 — Policy Evaluation Latency Under Production Request Distributions (2024)</p>
                    <p className="text-foreground/90">A central concern raised during our early design reviews was whether synchronous policy evaluation at the proxy layer would introduce unacceptable latency for interactive applications. Prior approaches to LLM content filtering, including post-generation moderation APIs and client-side validation hooks, imposed either latency penalties averaging 180 to 420 milliseconds per request or required asynchronous architectures that complicated audit completeness guarantees. We needed to establish whether compile-time policy resolution, caching classification outputs against stable prompt structures, could change this arithmetic materially.</p>
                    <p className="text-foreground/90">We instrumented a reference TPS proxy deployment under a synthetic load profile derived from anonymized access traces from three enterprise beta participants, generating 50,000 requests across workload types including single-turn generation, multi-turn conversation, and batch document summarization. Policy evaluation added a median overhead of 4.2 milliseconds at the p50 percentile and 11.7 milliseconds at the p99 percentile when classifier outputs for previously evaluated prompt structures were served from the in-process evaluation cache. Cold-path evaluation, required for novel prompt structures not present in the cache, added a median of 31.4 milliseconds, representing the dominant latency contributor in highly variable prompt workloads.</p>
                    <p className="text-foreground/90">These results demonstrated that policy enforcement at the proxy layer was compatible with interactive latency budgets for the substantial majority of production traffic patterns. The cache warm-up behavior, which reached 94 percent hit rate within the first two hours of traffic in all three test environments, became a design requirement formalized in the TPS runtime specification. The 11.7 millisecond p99 figure is the published latency guarantee for steady-state production deployments.</p>
                  </div>
                </div>

                <div style={{ backgroundImage: `url(${import.meta.env.BASE_URL}paintings/red-trees-glow.jpeg)`, backgroundSize: "cover", backgroundPosition: "center" }} className="p-5 md:p-10">
                  <div className="bg-background p-6 md:p-8 border-l-2 border-foreground pl-6 flex flex-col gap-4">
                    <p className="font-bold uppercase tracking-widest text-xs">Study 03 — Merkle Audit Chain Integrity Under Adversarial Log Corruption Conditions (2025)</p>
                    <p className="text-foreground/90">The cryptographic audit chain at the core of TransparentGuard's evidence model is only meaningful if its integrity guarantees hold under realistic adversarial conditions, including scenarios where infrastructure operators, compromised pipeline stages, or malicious insiders selectively delete or modify log entries after the fact. We designed an evaluation to characterize detection coverage across a range of corruption strategies.</p>
                    <p className="text-foreground/90">We generated audit chains representing 90 days of simulated operation across three deployment configurations, totaling 4.7 million chained event records. Corruption scenarios were introduced across five attack classes: sequential deletion of contiguous event ranges, non-contiguous selective deletion targeting compliance-relevant event types, in-place field mutation without structural modification, chain reordering attacks, and hybrid strategies combining deletion with timestamp manipulation. Corruption injection rates ranged from 1 percent to 40 percent of total chain nodes.</p>
                    <p className="text-foreground/90">Chain verification detected 100 percent of injected corruption across all five attack classes and across the full range of injection rates tested. Detection latency averaged 0.3 seconds for sequential deletion and 1.1 seconds for hybrid strategies under incremental verification. The verification algorithm proved robust to the reordering class only when combined with the monotonic sequence counter introduced in chain format version 1.2, a finding that accelerated the deprecation timeline for older chain formats. These results support the integrity guarantees documented in the TPS audit specification and form the evidentiary basis for the audit chain claims presented to SOC 2 Type II assessors.</p>
                  </div>
                </div>

              </div>
            </section>

            <section id="philosophy" className="scroll-mt-20">
              <SectionLabel>Philosophy on Open Standards and Security</SectionLabel>
              <div className="flex flex-col gap-5 text-foreground/90">
                <p>Security infrastructure gains its reliability, in significant part, from public scrutiny. A policy enforcement system whose behavior cannot be audited by independent parties is, from a governance perspective, no different from no policy enforcement at all. The regulated industries that need AI governance most urgently, healthcare, financial services, critical infrastructure, are also the industries with the strongest institutional traditions of requiring verifiable, independently reproducible compliance evidence. A proprietary black-box policy layer is not a credible answer to a SOC 2 auditor, a HIPAA security officer, or an EU AI Act conformity assessment body.</p>
                <p>This is why the Transparent Policy Specification is published as an open standard with a public schema, documented evaluation semantics, and a reference implementation. It is why the audit chain format is openly specified rather than opaque. It is why we publish the classifier evaluation methodology used in our ML-based detection modules rather than asserting results without reproducible backing. We want regulators, auditors, security researchers, and the organizations deploying our software to be able to form independent judgments about how the system behaves. That capacity for independent judgment is what makes a compliance claim meaningful.</p>
                <p>We also hold a strong view that open standards create better software ecosystems than proprietary ones over any meaningful time horizon. A policy specification that is owned by one vendor will be optimized for that vendor's business interests. A specification that is owned by its community of implementers will be optimized for the actual problems the community needs to solve. We intend for TPS to be adopted by other runtimes, other proxies, and other compliance tooling vendors. We actively welcome that outcome. The goal is a durable standard for AI policy governance, not a captive specification designed to create switching costs.</p>
              </div>
            </section>

            <section id="future" className="scroll-mt-20">
              <SectionLabel>Outlook on the Future of AI</SectionLabel>
              <div className="flex flex-col gap-5 text-foreground/90">
                <p>The regulatory trajectory for AI systems is not ambiguous. The EU AI Act establishes binding conformity requirements for high-risk AI deployments with enforcement timelines now well underway. FedRAMP Moderate authorization for AI-enabled federal systems is an active procurement requirement, not a future consideration. State-level privacy legislation in the United States continues to expand the compliance surface for any system that processes personal data, and LLM pipelines almost universally do. The organizations that treat AI governance as a future problem to address after deployment will, within a short horizon, find themselves unable to close enterprise deals, maintain federal contracts, or satisfy their own legal counsel.</p>
                <p>We anticipate that the AI governance layer will become as standard a component of production AI infrastructure as the API gateway, the authentication middleware, and the logging pipeline. In the same way that no serious organization ships a web service without TLS and structured logging, no serious organization will ship an AI-assisted product without a documented, auditable policy enforcement layer. The question for the industry is what that layer looks like and who builds it.</p>
                <p>We also anticipate that the policy complexity of AI systems will grow significantly as multi-agent architectures become more prevalent. A single LLM call with a documented system prompt is a relatively tractable compliance target. An agentic workflow involving multiple model calls, tool use, and dynamic context assembly across extended sessions is a substantially harder one. The TPS specification is designed to be compositional for exactly this reason. We are actively developing the specification extensions that will allow policy to be declared and enforced across multi-step agentic workflows, with audit chains that preserve the full causal structure of a session rather than a flat sequence of individual events.</p>
                <p>We believe AI systems will become more capable, more autonomous, and more deeply integrated into consequential decisions over the next decade. We do not view this as alarming. We view it as a reason to build the governance infrastructure now, while the architectural patterns are still malleable and the regulatory frameworks are still being written, rather than retrofitting enforcement onto systems that were never designed to accommodate it.</p>
              </div>
            </section>

            <section id="victoria" className="scroll-mt-20">
              <SectionLabel>R&amp;D Headquarters: Victoria, Texas</SectionLabel>
              <div className="flex flex-col gap-5 text-foreground/90">
                <p>TransparentGuard's Research and Development operations are headquartered in Victoria, Texas. This was a considered choice, and one we are prepared to explain in some detail, because it runs counter to the reflexive assumption that serious technical work requires a coastal metropolitan address.</p>
                <p>Victoria sits at the intersection of several factors that, taken together, produce a research environment we find genuinely superior to the alternatives we evaluated. The city is home to Victoria College and the University of Houston Victoria, institutions with strong applied engineering and computer science programs that produce a steady pipeline of technically capable graduates who, absent compelling local opportunity, tend to relocate. We are that compelling local opportunity. The talent pool is real, the competition for that talent from other employers is limited, and the researchers and engineers we recruit here are not the second choice of a team that could not afford Austin. They are the first choice of a team that thought carefully about where good work actually gets done.</p>
                <p>The cost efficiency of operating in Victoria is significant and compounds over time. Commercial and laboratory space runs at roughly 60 to 65 percent of the cost of equivalent space in Austin, and at a fraction of the cost of space in San Francisco or New York. This is not a short-term arbitrage. It is a durable structural advantage that allows us to invest proportionally more in research infrastructure, tooling, and salaries than we could from a higher-cost base. We do not maintain a Victoria office because we cannot afford somewhere else. We maintain it because we ran the arithmetic and the arithmetic was not close.</p>
                <div className="flex justify-center my-4">
                  <img
                    src={`${import.meta.env.BASE_URL}paintings/victoria-aerial.png`}
                    alt="Aerial view of Victoria, Texas"
                    className="max-w-sm md:max-w-md h-auto object-cover"
                  />
                </div>
                <p>The community itself is a factor we did not anticipate weighting as heavily as we do. Victoria is a small city with a genuine civic identity and a high degree of social cohesion. Employee turnover in our Victoria team is materially lower than industry benchmarks, and the qualitative reasons our team members give for staying are consistent: they live in a place they recognize, they can own a home, they are not commuting, and they have time outside work to pursue the kind of sustained thinking that good research requires. The small-town character of Victoria is not a concession. It is part of the value proposition.</p>
                <p>The physical environment also merits mention. Victoria sits in the Texas Coastal Prairie, a landscape of wide rolling grasslands, live oak mottes, and river bottomlands along the Guadalupe. It is not a dramatic landscape in the way that mountains or coastlines are dramatic. It is quieter than that, and consistently beautiful in the way that places with real seasonal change and genuine open space tend to be. We have found, without quite being able to formalize the mechanism, that the environment in which researchers work affects the quality of the thinking they produce. Victoria is a good place to think.</p>
                <p>Finally, Victoria has a well-established engineering culture rooted in the petrochemical and energy industries that have operated in the region for generations. The local engineering community understands process safety, regulatory compliance, and the kind of disciplined systems thinking that those domains demand. That cultural inheritance is a closer intellectual match to what we are building than the move-fast-and-break-things ethos of software startup culture. We are building infrastructure that organizations will rely on for compliance in regulated industries. We want our team to take that seriously. In Victoria, that disposition is not something we have to instill. It is something we inherit.</p>
              </div>
            </section>

            <div className="border-t-2 border-foreground pt-10 pb-10">
              <a href="mailto:hello@transparentguard.com"
                className="inline-flex items-center gap-4 bg-foreground text-background px-10 py-5 text-lg font-bold uppercase tracking-widest font-mono hover:bg-foreground/90 transition-colors duration-200 focus:outline-none">
                Get in Touch <ExternalLink size={20} strokeWidth={2.5} />
              </a>
            </div>

          </div>
        </main>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Research Page
// ---------------------------------------------------------------------------

const RESEARCH_SECTIONS = [
  { id: "study-01", label: "Study 01 — PII Leakage" },
  { id: "study-02", label: "Study 02 — Latency" },
  { id: "study-03", label: "Study 03 — Audit Chain" },
];

const PII_DATA = [
  { name: "Unguarded", value: 23.4, displayVal: "23.4%", fill: "#ef4444" },
  { name: "System Prompt", value: 38.1, displayVal: "38.1%", fill: "#f97316" },
  { name: "TPS Enforced", value: 0.06, displayVal: "0.06%", fill: "#22c55e" },
];

const LATENCY_DATA = [
  { name: "Prior Art", value: 300, displayVal: "180–420ms", errLow: 120, errHigh: 120, fill: "#ef4444" },
  { name: "TPS p50", value: 4.2, displayVal: "4.2ms", errLow: 0, errHigh: 0, fill: "#3b82f6" },
  { name: "TPS p99", value: 11.7, displayVal: "11.7ms", errLow: 0, errHigh: 0, fill: "#6366f1" },
  { name: "TPS Cold Path", value: 31.4, displayVal: "31.4ms", errLow: 0, errHigh: 0, fill: "#8b5cf6" },
];

const ATTACK_DATA = [
  { name: "Sequential Deletion", latency: 0.30, fill: "#3b82f6" },
  { name: "Non-Contiguous", latency: 0.52, fill: "#6366f1" },
  { name: "Field Mutation", latency: 0.63, fill: "#8b5cf6" },
  { name: "Chain Reordering", latency: 0.85, fill: "#ec4899" },
  { name: "Hybrid Strategy", latency: 1.10, fill: "#f97316" },
];

const CORRUPTION_RATES = ["1%", "5%", "10%", "20%", "30%", "40%"];

function PiiTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border-2 border-foreground p-3 font-mono text-xs shadow-lg">
      <p className="font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-foreground">Leakage Rate: <span className="font-bold">{payload[0].payload.displayVal}</span></p>
    </div>
  );
}

function LatencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-background border-2 border-foreground p-3 font-mono text-xs shadow-lg">
      <p className="font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-foreground">Latency: <span className="font-bold">{d.displayVal}</span></p>
      {d.name === "Prior Art" && <p className="text-foreground/60 mt-1">Range: 180ms – 420ms</p>}
    </div>
  );
}

function AttackTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border-2 border-foreground p-3 font-mono text-xs shadow-lg">
      <p className="font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-foreground">Detection latency: <span className="font-bold">{payload[0].value}s</span></p>
      <p className="text-foreground mt-1">Detection rate: <span className="font-bold text-green-600">100%</span></p>
    </div>
  );
}

function ResearchPage({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState("study-01");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isProgrammaticScroll = useRef(false);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    RESEARCH_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting && !isProgrammaticScroll.current) setActiveSection(id); },
        { rootMargin: "-10% 0px -80% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(obs => obs.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    isProgrammaticScroll.current = true;
    setActiveSection(id);
    setDrawerOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => { isProgrammaticScroll.current = false; }, 900);
  };

  const activeSectionLabel = RESEARCH_SECTIONS.find(s => s.id === activeSection)?.label ?? "";

  return (
    <motion.div key="research" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex flex-col">

      {/* Sticky top bar */}
      <header className="sticky top-0 z-20 bg-background border-b-2 border-foreground px-6 md:px-12 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack} className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider hover:opacity-70 transition-opacity focus:outline-none shrink-0">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="font-bold tracking-tight uppercase hidden sm:block shrink-0">TransparentGuard</span>
          <span className="font-mono text-xs uppercase tracking-widest hidden sm:block shrink-0">Research</span>
          <span className="font-mono text-[11px] uppercase tracking-widest block sm:hidden truncate">{activeSectionLabel}</span>
        </div>
        <button onClick={() => setDrawerOpen(o => !o)}
          className="lg:hidden flex items-center gap-2 bg-foreground text-background font-mono px-3 py-1.5 text-xs font-bold uppercase tracking-widest focus:outline-none">
          {drawerOpen ? <><X size={13} /> Close</> : <><List size={13} /> Studies</>}
        </button>
        <div className="bg-foreground text-background font-mono px-3 py-1.5 text-xs font-bold uppercase shrink-0 hidden lg:block">Research</div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="lg:hidden border-b-2 border-foreground bg-background overflow-hidden z-10">
            <nav className="flex flex-col p-3 gap-0.5">
              {RESEARCH_SECTIONS.map(s => (
                <button key={s.id} onClick={() => scrollTo(s.id)}
                  className={`text-left font-mono text-xs py-2 px-3 transition-colors duration-150 focus:outline-none ${activeSection === s.id ? "bg-foreground text-background" : "hover:bg-foreground/10"}`}>
                  {s.label}
                </button>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 min-w-0 overflow-x-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r-2 border-foreground sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto py-8 px-6">
          <div className="font-mono text-[10px] uppercase tracking-widest mb-4">Studies</div>
          <nav className="flex flex-col gap-0.5">
            {RESEARCH_SECTIONS.map(s => (
              <button key={s.id} onClick={() => scrollTo(s.id)}
                className={`text-left font-mono text-xs py-1.5 px-2 transition-colors duration-150 focus:outline-none ${activeSection === s.id ? "bg-foreground text-background" : "hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 md:px-12 lg:px-16 py-12 max-w-4xl">

          <div className="mb-14">
            <h1 className="text-4xl md:text-7xl font-extrabold tracking-tighter uppercase leading-[0.92] mb-6">Research</h1>
            <div className="h-0.5 bg-foreground w-full mb-4" />
            <p className="font-mono text-sm text-foreground/70 leading-relaxed max-w-2xl">
              Three empirical studies conducted between 2024 and 2025 forming the quantitative foundation of the TransparentGuard enforcement model. All data is reproducible against the published TPS v1.0 methodology.
            </p>
          </div>

          <div className="flex flex-col gap-24">

            {/* ── Study 01 ── */}
            <section id="study-01" className="scroll-mt-20">
              <div className="flex items-baseline gap-4 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/50">Study 01</span>
                <SectionLabel>PII Leakage Surface Characterization</SectionLabel>
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-foreground/50 mb-8">14 endpoints · 2.31M prompts · 2024</p>

              {/* Chart */}
              <div className="border-2 border-foreground p-4 md:p-6 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-foreground/60 mb-6">PII detection rate by enforcement condition (%)</p>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={LATENCY_DATA} margin={{ top: 32, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: "monospace", fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 45]} tickFormatter={v => `${v}%`} />
                    <RechartsTip content={<PiiTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} data={PII_DATA} isAnimationActive={true} animationDuration={900}>
                      {PII_DATA.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      <LabelList dataKey="displayVal" position="top" style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, fill: "#111" }} />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                {/* Stat callout */}
                <div className="mt-4 border-t border-foreground/20 pt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "Unguarded", val: "23.4%", color: "#ef4444" },
                    { label: "System Prompt", val: "38.1%", color: "#f97316" },
                    { label: "TPS Enforced", val: "0.06%", color: "#22c55e" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="font-mono text-lg md:text-2xl font-extrabold" style={{ color: s.color }}>{s.val}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-foreground/60 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-foreground/50 mt-4 text-center tracking-wider uppercase">99.74% reduction from unguarded baseline to TPS enforcement</p>
              </div>

              {/* Study text */}
              <div className="font-mono text-sm leading-relaxed flex flex-col gap-4 text-foreground/90">
                <p>In the first half of 2024, our research team conducted a longitudinal evaluation of fourteen commercially available LLM API endpoints across five model families, generating 2.31 million synthetic prompt interactions designed to simulate realistic enterprise workloads in healthcare, financial services, and legal document processing contexts. Each prompt set was instrumented with seeded personally identifiable information tokens at varying density levels, from sparse single-field exposure to compound multi-field records, to establish a reliable leakage detection baseline.</p>
                <p>Without any enforcement layer in place, 23.4 percent of sampled responses contained at least one detectable PII token as identified by a combined regex classifier and fine-tuned BERT-variant model trained on annotated leakage examples from the healthcare and finance domains. This figure rose to 38.1 percent when prompts included explicit data-handling instructions embedded in system context, a pattern common in retrieval-augmented generation pipelines. The finding contradicted a widely held assumption that system prompt constraints reliably suppress PII output in production conditions.</p>
                <p>After introducing TPS-governed enforcement at the proxy layer, with policies configured to block outbound PII matching HIPAA Safe Harbor identifiers, the detected leakage rate dropped to 0.06 percent across the same prompt corpus. Residual leakage was attributable to novel paraphrase constructions not represented in the classifier training distribution, a finding that directly motivated the adaptive classifier retraining pipeline now included in the Growth and Enterprise tiers. This study formed the quantitative basis for the PII enforcement guarantees documented in the TPS v1.0 specification.</p>
              </div>
            </section>

            {/* ── Study 02 ── */}
            <section id="study-02" className="scroll-mt-20">
              <div className="flex items-baseline gap-4 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/50">Study 02</span>
                <SectionLabel>Policy Evaluation Latency</SectionLabel>
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-foreground/50 mb-8">50K requests · 3 enterprise environments · 2024</p>

              {/* Chart */}
              <div className="border-2 border-foreground p-4 md:p-6 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-foreground/60 mb-6">Enforcement latency overhead by approach (ms) — prior art shown as midpoint with range bar</p>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={LATENCY_DATA} margin={{ top: 32, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: "monospace", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}ms`} />
                    <RechartsTip content={<LatencyTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={true} animationDuration={900}>
                      {LATENCY_DATA.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      <ErrorBar dataKey="errLow" width={8} strokeWidth={2.5} stroke="#374151" direction="y" />
                      <LabelList dataKey="displayVal" position="top" style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, fill: "#111" }} />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-4 border-t border-foreground/20 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Prior Art Range", val: "180–420ms", color: "#ef4444" },
                    { label: "TPS p50 (cache)", val: "4.2ms", color: "#3b82f6" },
                    { label: "TPS p99 (cache)", val: "11.7ms", color: "#6366f1" },
                    { label: "TPS Cold Path", val: "31.4ms", color: "#8b5cf6" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="font-mono text-base md:text-xl font-extrabold" style={{ color: s.color }}>{s.val}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-foreground/60 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-foreground/50 mt-4 text-center tracking-wider uppercase">94% cache hit rate reached within 2 hours of traffic in all three environments</p>
              </div>

              {/* Study text */}
              <div className="font-mono text-sm leading-relaxed flex flex-col gap-4 text-foreground/90">
                <p>A central concern raised during our early design reviews was whether synchronous policy evaluation at the proxy layer would introduce unacceptable latency for interactive applications. Prior approaches to LLM content filtering, including post-generation moderation APIs and client-side validation hooks, imposed either latency penalties averaging 180 to 420 milliseconds per request or required asynchronous architectures that complicated audit completeness guarantees. We needed to establish whether compile-time policy resolution, caching classification outputs against stable prompt structures, could change this arithmetic materially.</p>
                <p>We instrumented a reference TPS proxy deployment under a synthetic load profile derived from anonymized access traces from three enterprise beta participants, generating 50,000 requests across workload types including single-turn generation, multi-turn conversation, and batch document summarization. Policy evaluation added a median overhead of 4.2 milliseconds at the p50 percentile and 11.7 milliseconds at the p99 percentile when classifier outputs for previously evaluated prompt structures were served from the in-process evaluation cache. Cold-path evaluation, required for novel prompt structures not present in the cache, added a median of 31.4 milliseconds, representing the dominant latency contributor in highly variable prompt workloads.</p>
                <p>These results demonstrated that policy enforcement at the proxy layer was compatible with interactive latency budgets for the substantial majority of production traffic patterns. The cache warm-up behavior, which reached 94 percent hit rate within the first two hours of traffic in all three test environments, became a design requirement formalized in the TPS runtime specification. The 11.7 millisecond p99 figure is the published latency guarantee for steady-state production deployments.</p>
              </div>
            </section>

            {/* ── Study 03 ── */}
            <section id="study-03" className="scroll-mt-20">
              <div className="flex items-baseline gap-4 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/50">Study 03</span>
                <SectionLabel>Merkle Audit Chain Integrity</SectionLabel>
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-foreground/50 mb-8">4.7M records · 5 attack classes · corruption 1–40% · 2025</p>

              {/* Chart A — detection latency per attack class */}
              <div className="border-2 border-foreground p-4 md:p-6 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-foreground/60 mb-1">Detection latency by attack class (seconds) — all classes: 100% detection rate</p>
                <p className="font-mono text-[10px] text-foreground/40 mb-6">Latency measured from corruption introduction to verification failure signal</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={ATTACK_DATA} layout="vertical" margin={{ top: 8, right: 80, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tick={{ fontFamily: "monospace", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}s`} domain={[0, 1.4]} />
                    <YAxis type="category" dataKey="name" tick={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} width={110} />
                    <RechartsTip content={<AttackTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="latency" radius={[0, 3, 3, 0]} isAnimationActive={true} animationDuration={900}>
                      {ATTACK_DATA.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      <LabelList dataKey="latency" position="right" style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, fill: "#111" }} formatter={(v: number) => `${v}s`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart B — corruption rate coverage grid */}
              <div className="border-2 border-foreground p-4 md:p-6 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-foreground/60 mb-6">Detection coverage at corruption injection rates — all results: 100%</p>
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-xs border-collapse min-w-[420px]">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-4 text-foreground/50 font-normal uppercase tracking-widest text-[10px]">Attack Class</th>
                        {CORRUPTION_RATES.map(r => (
                          <th key={r} className="py-2 px-2 text-center text-foreground/50 font-normal uppercase tracking-widest text-[10px]">{r}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ATTACK_DATA.map((row) => (
                        <tr key={row.name} className="border-t border-foreground/10">
                          <td className="py-2 pr-4 font-bold text-[10px] uppercase tracking-wide" style={{ color: row.fill }}>{row.name}</td>
                          {CORRUPTION_RATES.map(r => (
                            <td key={r} className="py-2 px-2 text-center">
                              <span className="inline-block bg-green-100 text-green-700 font-bold text-[10px] px-1.5 py-0.5 rounded-sm">100%</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Study text */}
              <div className="font-mono text-sm leading-relaxed flex flex-col gap-4 text-foreground/90">
                <p>The cryptographic audit chain at the core of TransparentGuard's evidence model is only meaningful if its integrity guarantees hold under realistic adversarial conditions, including scenarios where infrastructure operators, compromised pipeline stages, or malicious insiders selectively delete or modify log entries after the fact. We designed an evaluation to characterize detection coverage across a range of corruption strategies.</p>
                <p>We generated audit chains representing 90 days of simulated operation across three deployment configurations, totaling 4.7 million chained event records. Corruption scenarios were introduced across five attack classes: sequential deletion of contiguous event ranges, non-contiguous selective deletion targeting compliance-relevant event types, in-place field mutation without structural modification, chain reordering attacks, and hybrid strategies combining deletion with timestamp manipulation. Corruption injection rates ranged from 1 percent to 40 percent of total chain nodes.</p>
                <p>Chain verification detected 100 percent of injected corruption across all five attack classes and across the full range of injection rates tested. Detection latency averaged 0.3 seconds for sequential deletion and 1.1 seconds for hybrid strategies under incremental verification. The verification algorithm proved robust to the reordering class only when combined with the monotonic sequence counter introduced in chain format version 1.2, a finding that accelerated the deprecation timeline for older chain formats. These results support the integrity guarantees documented in the TPS audit specification and form the evidentiary basis for the audit chain claims presented to SOC 2 Type II assessors.</p>
              </div>
            </section>

          </div>
        </main>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  const [page, setPage] = useState<Page>("hero");
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [page]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-foreground selection:text-background">
      <AnimatePresence mode="wait">
        {page === "hero" && (
          <HeroPage key="hero" onStart={() => setPage("start")} onDocs={() => setPage("docs")} onStartup={() => setPage("startup")} onGrowth={() => setPage("growth")} onEnterprise={() => setPage("enterprise")} onOem={() => setPage("oem")} onCompany={() => setPage("company")} onResearch={() => setPage("research")} />
        )}
        {page === "start" && (
          <ContentPage key="content" onBack={() => setPage("hero")} />
        )}
        {page === "docs" && (
          <DocsPage key="docs" onBack={() => setPage("hero")} />
        )}
        {page === "startup" && (
          <StartupPage key="startup" onBack={() => setPage("hero")} />
        )}
        {page === "growth" && (
          <GrowthPage key="growth" onBack={() => setPage("hero")} />
        )}
        {page === "enterprise" && (
          <EnterprisePage key="enterprise" onBack={() => setPage("hero")} />
        )}
        {page === "oem" && (
          <OemPage key="oem" onBack={() => setPage("hero")} />
        )}
        {page === "company" && (
          <CompanyPage key="company" onBack={() => setPage("hero")} />
        )}
        {page === "research" && (
          <ResearchPage key="research" onBack={() => setPage("hero")} />
        )}
      </AnimatePresence>
    </div>
  );
}
