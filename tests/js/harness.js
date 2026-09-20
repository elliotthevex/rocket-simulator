/* =====================================================================
   Minimal test harness for the browser physics, runnable headlessly with
   macOS's bundled JavaScriptCore shell (no Node needed):

     tests/js/run.sh            # runs every tests/js/test-*.js file
     tests/js/run.sh orbit      # only files whose name contains "orbit"

   Each test file is loaded AFTER web/js/physics-core.js and
   web/js/flight-loop.js, so the RSX namespace is fully populated.
   Files register tests with test(name, fn); assertions throw on failure.
   The runner prints one line per test and a summary; run.sh turns a
   "FAILED" summary into a non-zero exit code.
   ===================================================================== */
"use strict";
var __tests = [];
function test(name, fn) { __tests.push({ name: name, fn: fn }); }
function fail(msg) { throw new Error(msg); }
function assert(cond, msg) { if (!cond) fail(msg || "assertion failed"); }
function assertApprox(actual, expected, tol, msg) {
  var t = tol == null ? 1e-9 : tol;
  var ok = Math.abs(actual - expected) <= t * Math.max(1, Math.abs(expected));
  if (!ok) fail((msg || "approx") + ": expected " + expected + " +-" + (t * 100) + "% but got " + actual);
}
function assertBetween(x, lo, hi, msg) {
  if (!(x >= lo && x <= hi)) fail((msg || "range") + ": " + x + " not in [" + lo + ", " + hi + "]");
}
function runAllTests(label) {
  var passed = 0, failed = 0;
  for (var i = 0; i < __tests.length; i++) {
    var t = __tests[i];
    try { t.fn(); passed++; print("  ok   " + t.name); }
    catch (e) { failed++; print("  FAIL " + t.name + "\n       " + (e && e.message ? e.message : e)); }
  }
  print((failed ? "FAILED" : "PASSED") + " " + label + ": " + passed + " passed, " + failed + " failed");
  return failed;
}
