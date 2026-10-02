// Fetches IT events, merges manual-events.json, writes events.json
import fs from "node:fs";
const TOKEN = process.env.APIFY_TOKEN;
const ACTOR = process.env.APIFY_ACTOR || "xtracto~eventbrite-events";
const LOCATION = process.env.LOCATION || "Sydney";
const KEYWORDS = (process.env.KEYWORDS || "technology,cybersecurity,cloud computing,software developer,AI,data analytics").split(",");
const MAX = +(process.env.MAX_ITEMS || 40);
const today = new Date().toISOString().slice(0, 10);
const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; } };
const pick = (o, ...k) => { for (const x of k) if (o[x] != null && o[x] !== "") return o[x]; };

function clean(r) {
  const price = pick(r, "price", "min_price", "ticket_price");
  const free = r.is_free === true || /free/i.test(String(price ?? ""));
  const num = free ? 0 : parseFloat(String(price ?? "").replace(/[^0-9.]/g, ""));
  const venue = r.venue || {};
  return {
    n: pick(r, "name", "title"),
    d: String(pick(r, "start_date", "startDate") || "").slice(0, 10),
    t: pick(r, "start_time", "startTime", "time") || "See event page",
    s: pick(r, "venue_city", "city", "suburb") || venue.city || venue.neighbourhood || "Online / TBA",
    v: pick(r, "venue_name", "venue") && typeof r.venue === "string" ? r.venue : (venue.name || pick(r, "venue_name") || "See event page"),
    c: r.category || "Tech",
    p: Number.isFinite(num) ? num : 0,
    m: String(pick(r, "summary", "description", "short_description") || "Open the event page for full details.").slice(0, 280),
    u: pick(r, "url", "event_url"),
  };
}

async function scrape() {
  if (!TOKEN) { console.log("No APIFY_TOKEN set: using manual events only."); return []; }
  const out = [];
  for (const kw of KEYWORDS) {
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: LOCATION, keywords: kw, maxItems: MAX }),
    });
    if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const rows = await res.json();
    if (rows[0] && !out.length) console.log("Sample raw record:", JSON.stringify(rows[0]).slice(0, 800));
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
