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
const str = v => v == null ? "" : typeof v === "object" ? String(v.name || v.text || v.city || v.address || "") : String(v);
const pick = (o, ...k) => { for (const x of k) { const v = str(o[x]); if (v) return v; } return ""; };

function clean(r) {
  const raw = pick(r, "startDate", "start_date", "date", "startsAt", "start");
  let d = "", t = "See event page";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = raw;
  else if (raw) {
    const dt = new Date(raw);
    if (!isNaN(dt)) {
      d = dt.toLocaleDateString("en-CA", { timeZone: TZ });
      if (/T\d{2}:\d{2}|\d{1,2}:\d{2}/.test(raw)) t = dt.toLocaleTimeString("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    }
  }
  const priceTxt = pick(r, "price", "priceRange", "ticketPrice", "minPrice");
  const free = r.isFree === true || /^\s*free\s*$/i.test(priceTxt) || priceTxt === "0";
  const num = free ? 0 : parseFloat(priceTxt.replace(/[^0-9.]/g, ""));
  const v = r.venue && typeof r.venue === "object" ? r.venue : {};
  return {
    n: pick(r, "title", "name"),
    d, t,
    s: pick(r, "venueCity", "city", "suburb", "neighborhood") || str(v.city) || str(v.neighborhood) || "Sydney",
    v: pick(r, "venueName", "venue", "venue_name") || str(v.name) || "See event page",
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
    if (rows[0] && !out.length) console.log("Sample raw record:", JSON.stringify(rows[0]).slice(0, 1200));
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
