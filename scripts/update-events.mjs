// Fetches IT events from Apify (parseforge/eventbrite-scraper), merges manual-events.json, writes events.json
import fs from "node:fs";
const TOKEN = process.env.APIFY_TOKEN;
const ACTOR = process.env.APIFY_ACTOR || "parseforge~eventbrite-scraper";
const TZ = "Australia/Sydney";
let CITY = (process.env.LOCATION || "australia--sydney").trim();
if (!CITY.includes("--")) CITY = "australia--" + CITY.toLowerCase().replace(/\s+/g, "-");
const CATEGORIES = (process.env.CATEGORIES || "science-and-tech").split(",").map(s => s.trim());
const MAX = +(process.env.MAX_ITEMS || 30);
const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; } };
const str = v => v == null ? "" : typeof v === "object" ? String(v.name || v.text || v.display || v.city || "") : String(v);
const pick = (o, ...k) => { for (const x of k) { const v = str(o[x]); if (v) return v; } return ""; };

function time12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return "See event page";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "pm" : "am"}`;
}

function suburbOf(v) {
  const parts = str(v.fullAddress).split(",").map(s => s.trim());
  const i = parts.findIndex(p => /^(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i.test(p));
  if (i > 0) return parts[i - 1];
  return str(v.city) || "Sydney";
}

function clean(r) {
  const v = r.venue && typeof r.venue === "object" ? r.venue : {};
  const online = r.isOnline === true;
  const raw = pick(r, "startDate", "start_date", "date");
  const d = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
  const priceTxt = pick(r, "price", "priceRange", "ticketPrice", "minPrice", "priceText", "displayPrice", "lowestPrice", "minimumPrice");
  const free = r.isFree === true || r.free === true || /^\s*free\s*$/i.test(priceTxt) || priceTxt === "0";
  const num = free ? 0 : parseFloat(priceTxt.replace(/[^0-9.]/g, ""));
  return {
    n: pick(r, "title", "name"),
    d,
    t: time12(str(r.startTime)),
    s: online ? "Online" : suburbOf(v),
    v: online ? "Online event" : (str(v.name) || "See event page"),
    c: "Tech",
    p: Number.isFinite(num) ? num : 0,
    m: pick(r, "summary", "description", "shortDescription").replace(/\s+/g, " ").slice(0, 280) || "Open the event page for full details.",
    u: pick(r, "url", "eventUrl", "link"),
  };
}

async function scrape() {
  if (!TOKEN) { console.log("No APIFY_TOKEN set: using manual events only."); return []; }
  const out = [];
  for (const category of CATEGORIES) {
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: CITY, category, maxItems: MAX, online: false, retrieveOrganizerData: false }),
    });
    if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const rows = await res.json();
    console.log(`${category}: ${rows.length} rows`);
    if (rows[0]) {
      console.log("Fields:", Object.keys(rows[0]).join(", "));
      const p = rows.map(r => Object.entries(r).filter(([k]) => /price|cost|free|ticket/i.test(k)).map(([k, x]) => `${k}=${JSON.stringify(x)}`).join(" ")).filter(Boolean).slice(0, 5);
      console.log("Price fields:", p.join(" | ") || "none found");
    }
    out.push(...rows);
  }
  return out.map(clean);
}

const scraped = await scrape();
const manual = read("manual-events.json");
const seen = new Set();
const all = [...manual, ...scraped].filter(e => e.n && e.u && e.d >= today && !seen.has(e.u) && seen.add(e.u));
if (!all.length && read("events.json").length) { console.log("No events found; keeping existing events.json"); process.exit(0); }
all.sort((a, b) => a.d.localeCompare(b.d));
fs.writeFileSync("events.json", JSON.stringify(all, null, 1));
console.log(`Wrote ${all.length} events (${manual.length} manual).`);
