/* design/stage-2-plan.md §3.9: a DOM-free recorder with thinned samples,
   typed events and a throttled sessionStorage snapshot that never throws. */
"use strict";

const T = () => RSX.rocket.telemetry;
const row = (t, extra) => Object.assign({ t, alt: t * 10, speed: t * 3, vx: 0, vy: t * 3, accelG: 1.2, q: 5, mach: 0.1, throttle: 1, mass: 5000 - t, prop: 4000 - t, stage: 1, twr: 1.5, pitchDeg: 90, SM: 0.8 }, extra || {});

test("samples are thinned to >= 0.1 s apart, keep every field, and stop at the cap (counting what was dropped)", function () {
  const rec = T().create({ design: "Cadet I" });
  assert(rec.sample(row(0)) === true, "first sample kept");
  assert(rec.sample(row(0.05)) === false, "0.05 s later: thinned");
  assert(rec.sample(row(0.1)) === true, "0.1 s: kept");
  assert(rec.sample(row(0.15)) === false && rec.sample(row(0.2)) === true, "thinning continues");
  assert(rec.samples.length === 3, "3 kept, got " + rec.samples.length);
  T().SAMPLE_FIELDS.forEach((k) => assert(k in rec.samples[0], "field " + k));
  assert(rec.samples[2].alt === 2 && rec.samples[2].mass === 5000 - 0.2, "values carried");
  const cap = T().MAX_SAMPLES;
  T().MAX_SAMPLES = 4;
  try {
    assert(rec.sample(row(1)) === true && rec.sample(row(2)) === false && rec.dropped === 1, "cap honoured and counted");
  } finally { T().MAX_SAMPLES = cap; }
  assert(cap === 20000 && T().MIN_DT === 0.1, "spec constants");
  rec.reset();
  assert(rec.samples.length === 0 && rec.dropped === 0 && rec.sample(row(5)) === true, "reset");
});

test("events: every spec type is accepted, unknown types throw, labels default to the type", function () {
  const rec = T().create();
  ["ignition", "liftoff", "maxq", "separation", "burnout", "apogee", "impact", "landed"].forEach((type, i) => rec.event(i, type, i % 2 ? "" : type.toUpperCase()));
  assert(rec.events.length === 8 && rec.events[0].label === "IGNITION" && rec.events[1].label === "liftoff", JSON.stringify(rec.events));
  assert(rec.hasEvent("maxq") && !rec.hasEvent("nope"), "hasEvent");
  let threw = false;
  try { rec.event(1, "explode"); } catch (e) { threw = true; }
  assert(threw, "unknown event type must throw");
});

test("snapshotToSession/loadLast never throw without sessionStorage (jsc) and report nothing saved", function () {
  assert(typeof sessionStorage === "undefined", "expects jsc");
  const rec = T().create();
  rec.sample(row(0));
  assert(rec.snapshotToSession(1000) === false, "no storage -> false");
  assert(T().loadLast() === null, "nothing to load");
});

test("with a sessionStorage present: writes are throttled to one per second, forced at the end, and loadLast reads them back", function () {
  const store = {};
  globalThis.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  try {
    const rec = T().create({ design: "Cadet II" });
    rec.sample(row(0)); rec.event(0, "ignition");
    assert(rec.snapshotToSession(10000) === true, "first write");
    rec.sample(row(0.5));
    assert(rec.snapshotToSession(10500) === false, "0.5 s later: throttled");
    assert(rec.snapshotToSession(11000) === true, "1 s later: written");
    rec.sample(row(1));
    assert(rec.snapshotToSession(11100, true) === true, "forced write ignores the throttle");
    const back = T().loadLast();
    assert(back && back.version === 1 && back.meta.design === "Cadet II", JSON.stringify(back && back.meta));
    assert(back.samples.length === 3 && back.events.length === 1 && back.events[0].type === "ignition", "samples/events round-trip");
    assert(typeof back.savedAt === "number", "savedAt");
    store[T().SESSION_KEY] = "{not json";
    assert(T().loadLast() === null, "corrupt data -> null, no throw");
    // A storage that throws (private mode / quota) degrades to false, never an exception.
    globalThis.sessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
    assert(rec.snapshotToSession(20000) === false && T().loadLast() === null, "throwing storage handled");
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("summarize picks the peak altitude / speed / q samples", function () {
  const s = T().summarize([row(0), row(1, { alt: 50, q: 9 }), row(2, { alt: 20, speed: 99 })]);
  assert(s.maxAlt.t === 1 && s.maxSpeed.t === 2 && s.maxQ.t === 1 && s.count === 3, JSON.stringify(s));
});
