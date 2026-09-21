/* =====================================================================
   TELEMETRY RECORDER — samples and events from a flight, kept in memory
   and snapshotted to sessionStorage so the TELEMETRY tab can show the
   previous flight after "back to builder" reloads the page
   (design/stage-2-plan.md §3.9). DOM-free; sessionStorage is guarded
   (missing under jsc, may throw in private mode) so recording never
   breaks the flight loop.

   Samples are thinned to >= MIN_DT seconds of SIM time apart (a 60 Hz
   loop would otherwise log 3.6k rows a minute) and capped at
   MAX_SAMPLES; events are never thinned.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};
RSX.rocket.telemetry = {};
const TELEMETRY = RSX.rocket.telemetry;

TELEMETRY.SESSION_KEY = "rsx.telemetry.last";
TELEMETRY.MIN_DT = 0.1;          // s of sim time between samples
TELEMETRY.MAX_SAMPLES = 20000;
TELEMETRY.SNAPSHOT_MIN_MS = 1000; // <= 1 sessionStorage write per second
TELEMETRY.EVENT_TYPES = ["ignition", "liftoff", "maxq", "separation", "burnout", "apogee", "impact", "landed"];
TELEMETRY.SAMPLE_FIELDS = ["t", "alt", "speed", "vx", "vy", "accelG", "q", "mach", "throttle", "mass", "prop", "stage", "twr", "pitchDeg", "SM"];

/** create(meta?) -> recorder. `meta` (design name, planet id, ...) is
 *  stored alongside the data so a loaded snapshot says what it was. */
TELEMETRY.create = function (meta) {
  const rec = {
    meta: meta || {},
    samples: [],
    events: [],
    lastSampleT: null,
    lastSnapshotMs: null,
    dropped: 0, // samples refused by the cap, so a truncated record is never mistaken for a complete one

    /** sample(row): keeps `row` if it is >= MIN_DT after the previous kept
     *  sample (the first is always kept). Returns true when stored. */
    sample(row) {
      if (typeof row.t !== "number") return false;
      if (rec.lastSampleT != null && row.t - rec.lastSampleT < TELEMETRY.MIN_DT - 1e-9) return false;
      if (rec.samples.length >= TELEMETRY.MAX_SAMPLES) { rec.dropped++; return false; }
      const s = {};
      TELEMETRY.SAMPLE_FIELDS.forEach((k) => { s[k] = row[k] == null ? null : row[k]; });
      rec.samples.push(s);
      rec.lastSampleT = row.t;
      return true;
    },

    /** event(t, type, label): records a flight event; unknown types throw
     *  (a typo here would otherwise silently vanish from every chart). */
    event(t, type, label) {
      if (TELEMETRY.EVENT_TYPES.indexOf(type) === -1) throw new Error("telemetry: unknown event type " + type);
      const ev = { t, type, label: label || type };
      rec.events.push(ev);
      return ev;
    },

    hasEvent: (type) => rec.events.some((e) => e.type === type),

    reset() {
      rec.samples = []; rec.events = []; rec.lastSampleT = null; rec.lastSnapshotMs = null; rec.dropped = 0;
    },

    toJSON() {
      return { version: 1, meta: rec.meta, samples: rec.samples, events: rec.events, dropped: rec.dropped, savedAt: Date.now() };
    },

    /** snapshotToSession(nowMs?, force?) -> true when written. Throttled
     *  to one write per SNAPSHOT_MIN_MS unless `force` (end of flight). */
    snapshotToSession(nowMs, force) {
      const now = nowMs == null ? Date.now() : nowMs;
      if (!force && rec.lastSnapshotMs != null && now - rec.lastSnapshotMs < TELEMETRY.SNAPSHOT_MIN_MS) return false;
      rec.lastSnapshotMs = now;
      return TELEMETRY.writeSession(rec.toJSON());
    },
  };
  return rec;
};

/** writeSession(obj) -> true on success; false (never throws) without sessionStorage. */
TELEMETRY.writeSession = function (obj) {
  try {
    if (typeof sessionStorage === "undefined") return false;
    sessionStorage.setItem(TELEMETRY.SESSION_KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
};

/** loadLast() -> the last snapshot {version, meta, samples, events, ...} or null. */
TELEMETRY.loadLast = function () {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(TELEMETRY.SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.samples) || !Array.isArray(parsed.events)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
};

/** Convenience for headless flights and charts: max altitude / speed / q with their times. */
TELEMETRY.summarize = function (samples) {
  const best = (key) => samples.reduce((b, s) => (s[key] != null && (b == null || s[key] > b[key]) ? s : b), null);
  return { maxAlt: best("alt"), maxSpeed: best("speed"), maxQ: best("q"), count: samples.length };
};

if (typeof module !== "undefined") module.exports = RSX;
