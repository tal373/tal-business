import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Lightweight ICS reader: only what Tal's calendar needs (single events, DAILY/WEEKLY/MONTHLY rules,
// EXDATE, moved/cancelled instances). Times are Asia/Jerusalem unless given in UTC.
const FROM = new Date("2026-09-01T00:00:00+03:00");
const TZ = "Asia/Jerusalem";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function offsetAt(ms: number) {
  const p: any = {}; for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
function localToUtc(y: number, mo: number, d: number, h: number, mi: number) {
  const g = Date.UTC(y, mo, d, h, mi);
  let t = g - offsetAt(g); t = g - offsetAt(t); return t;
}
type Prop = { params: Record<string, string>; value: string };
function parseDT(p?: Prop): { ms: number; allDay: boolean } | null {
  if (!p) return null;
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) return null;
  if (!m[4]) return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true };
  if (m[7] === "Z") return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
  return { ms: localToUtc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), allDay: false };
}
function blocks(ics: string) {
  const lines = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: Record<string, Prop[]>[] = []; let cur: Record<string, Prop[]> | null = null;
  for (const l of lines) {
    if (l === "BEGIN:VEVENT") { cur = {}; continue; }
    if (l === "END:VEVENT") { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = l.indexOf(":"); if (i < 0) continue;
    const [name, ...ps] = l.slice(0, i).split(";");
    const params: Record<string, string> = {}; for (const x of ps) { const [k, v] = x.split("="); params[k] = v; }
    (cur[name] ||= []).push({ params, value: l.slice(i + 1) });
  }
  return out;
}
const unesc = (s = "") => s.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").replace(/\\\\/g, "\\").trim();
const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

type Ev = { event_id: string; start_at: string; end_at: string; title: string };
function expand(ics: string, from: number, to: number): Ev[] {
  const masters = new Map<string, any>(); const overrides = new Map<string, any>(); const out: Ev[] = [];
  for (const b of blocks(ics)) {
    const uid = b.UID?.[0]?.value; if (!uid) continue;
    const st = parseDT(b.DTSTART?.[0]); if (!st || st.allDay) continue;
    const en = parseDT(b.DTEND?.[0]); const dur = en ? en.ms - st.ms : 3600e3;
    const ev = { uid, st: st.ms, dur, title: unesc(b.SUMMARY?.[0]?.value), status: b.STATUS?.[0]?.value, rrule: b.RRULE?.[0]?.value, ex: new Set<number>() };
    for (const e of b.EXDATE || []) for (const v of e.value.split(",")) { const d = parseDT({ params: e.params, value: v }); if (d) ev.ex.add(d.ms); }
    const rid = parseDT(b["RECURRENCE-ID"]?.[0]);
    if (rid) overrides.set(uid + "|" + rid.ms, ev); else masters.set(uid, ev);
  }
  const emit = (uid: string, orig: number, ev: any) => {
    if (ev.status === "CANCELLED") return;
    if (ev.st < from || ev.st >= to) return;
    out.push({ event_id: uid + "_" + new Date(orig).toISOString(), start_at: new Date(ev.st).toISOString(), end_at: new Date(ev.st + ev.dur).toISOString(), title: ev.title });
  };
  const used = new Set<string>();
  for (const [uid, ev] of masters) {
    if (!ev.rrule) { emit(uid, ev.st, ev); continue; }
    const r: Record<string, string> = {}; for (const kv of ev.rrule.split(";")) { const [k, v] = kv.split("="); r[k] = v; }
    const until = r.UNTIL ? parseDT({ params: {}, value: r.UNTIL })!.ms + (r.UNTIL.length === 8 ? 864e5 - 1 : 0) : Infinity;
    if (until < from) continue;
    const count = r.COUNT ? +r.COUNT : Infinity; const interval = +(r.INTERVAL || 1);
    // local wall-clock of the first occurrence
    const p: any = {}; for (const x of fmt.formatToParts(new Date(ev.st))) p[x.type] = x.value;
    const Y = +p.year, M = +p.month - 1, D = +p.day, h = +p.hour, mi = +p.minute;
    const dayMs = (y: number, m: number, d: number) => Date.UTC(y, m, d);
    const base0 = dayMs(Y, M, D);
    const occ = (dms: number) => { const d = new Date(dms); return localToUtc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, mi); };
    let n = 0;
    const take = (dms: number): boolean => { // returns false to stop
      const t = occ(dms); if (t < ev.st) return true;
      if (t > until || n >= count || t >= to) return false;
      n++;
      if (ev.ex.has(t)) return true;
      const key = uid + "|" + t; const ov = overrides.get(key);
      if (ov) { used.add(key); emit(uid, t, ov); } else emit(uid, t, { ...ev, st: t });
      return true;
    };
    if (r.FREQ === "WEEKLY") {
      const by = (r.BYDAY ? r.BYDAY.split(",") : [Object.keys(DAYS)[new Date(base0).getUTCDay()]]).map((x) => DAYS[x.slice(-2)]).sort();
      const weekStart = base0 - new Date(base0).getUTCDay() * 864e5;
      outer: for (let w = 0; w < 600; w += interval) for (const wd of by) if (!take(weekStart + (w * 7 + wd) * 864e5)) break outer;
    } else if (r.FREQ === "DAILY") {
      for (let i = 0; i < 3000; i += interval) if (!take(base0 + i * 864e5)) break;
    } else if (r.FREQ === "MONTHLY") {
      for (let i = 0; i < 200; i += interval) if (!take(dayMs(Y, M + i, D))) break;
    }
  }
  for (const [key, ov] of overrides) if (!used.has(key)) emit(key.split("|")[0], +key.split("|")[1], ov);
  return out;
}

const norm = (t: string) => t.toLowerCase().replace(/[׳']/g, "'").replace(/\s+/g, " ").trim();
const base = (t: string) => norm(t).replace(/\s*\d+$/, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("CAL_ICS_URL"); if (!url) throw new Error("CAL_ICS_URL missing");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ics = await (await fetch(url)).text();
    const to = Date.now() + 35 * 864e5;
    const events = expand(ics, FROM.getTime(), to);

    const { data: clients, error: ce } = await sb.from("clients").select("id,price,pair_price,calendar_aliases,pair_aliases,group_alias"); if (ce) throw ce;
    const solo = new Map<string, any>(), pair = new Map<string, any[]>(), group = new Map<string, any>();
    for (const c of clients!) {
      if (c.group_alias) group.set(norm(c.group_alias), c);
      for (const a of c.calendar_aliases || []) solo.set(base(a), c);
      for (const a of c.pair_aliases || []) { const k = base(a); pair.set(k, [...(pair.get(k) || []), c]); }
    }
    const existing: any[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from("sessions").select("id,event_id,client_id,start_at,title,deleted_from_calendar").gte("start_at", FROM.toISOString()).not("event_id", "like", "manual_%").order("id").range(i, i + 999);
      if (error) throw error; existing.push(...data!); if (data!.length < 1000) break;
    }
    const have = new Map((existing || []).map((s) => [s.event_id + "|" + s.client_id, s]));
    const evHas = new Set((existing || []).map((s) => s.event_id)); // event already assigned (maybe moved by hand) -> never re-create
    const { data: ignoredRows } = await sb.from("calendar_events").select("event_id").eq("ignored", true);
    const ignored = new Set((ignoredRows || []).map((r) => r.event_id));

    const evRows: any[] = [], newSessions: any[] = [], changed: any[] = [];
    const now = Date.now();
    for (const e of events) {
      const k = base(e.title);
      const matches: { c: any; price: number }[] = [];
      if (pair.has(k)) for (const c of pair.get(k)!) matches.push({ c, price: c.pair_price ?? c.price ?? 0 });
      else if (solo.has(k)) { const c = solo.get(k); matches.push({ c, price: c.price ?? 0 }); }
      else { // kids group: title made only of kids' first names, e.g. "שחר אברי רוני"
        const toks = norm(e.title).split(" ").filter(Boolean);
        if (toks.length >= 2 && toks.every((t) => group.has(t))) for (const t of new Set(toks)) matches.push({ c: group.get(t), price: toks.length === 2 ? 150 : 110 });
      }
      evRows.push({ ...e, matched: matches.length > 0, ignored: ignored.has(e.event_id), synced_at: new Date().toISOString() });
      for (const m of matches) {
        const old = have.get(e.event_id + "|" + m.c.id);
        if (!old && evHas.has(e.event_id)) continue;
        if (!old) newSessions.push({ event_id: e.event_id, client_id: m.c.id, start_at: e.start_at, title: e.title, price: m.price, status: Date.parse(e.start_at) < now ? "done" : "scheduled" });
        else if (Date.parse(old.start_at) !== Date.parse(e.start_at) || old.title !== e.title || old.deleted_from_calendar) changed.push({ id: old.id, start_at: e.start_at, title: e.title });
      }
    }
    const chunk = async (rows: any[], fn: (r: any[]) => any) => { for (let i = 0; i < rows.length; i += 500) { const { error } = await fn(rows.slice(i, i + 500)); if (error) throw error; } };
    await chunk(evRows, (r) => sb.from("calendar_events").upsert(r, { onConflict: "event_id" }));
    await chunk(newSessions, (r) => sb.from("sessions").insert(r));
    for (const c of changed) await sb.from("sessions").update({ start_at: c.start_at, title: c.title, deleted_from_calendar: false }).eq("id", c.id);

    const ids = new Set(events.map((e) => e.event_id));
    const toIso = new Date(to).toISOString();
    const gone = (existing || []).filter((s) => s.start_at < toIso && !ids.has(s.event_id) && !s.deleted_from_calendar).map((s) => s.id);
    for (let i = 0; i < gone.length; i += 200) await sb.from("sessions").update({ deleted_from_calendar: true }).in("id", gone.slice(i, i + 200));
    const evWin: any[] = [];
    for (let i = 0; ; i += 1000) {
      const { data } = await sb.from("calendar_events").select("event_id").gte("start_at", FROM.toISOString()).lt("start_at", toIso).order("event_id").range(i, i + 999);
      evWin.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    const evGone = (evWin || []).filter((r) => !ids.has(r.event_id)).map((r) => r.event_id);
    for (let i = 0; i < evGone.length; i += 200) await sb.from("calendar_events").delete().in("event_id", evGone.slice(i, i + 200));

    return new Response(JSON.stringify({ ok: true, events: events.length, newSessions: newSessions.length, changed: changed.length, deleted: gone.length, unmatched: evRows.filter((r) => !r.matched).length }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
