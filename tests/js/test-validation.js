/* Wraps the physics core's own validation suite (RSX.runValidation, drawn
   from design/flight-physics.md §11) so it runs with the rest of the tests.
   Each check becomes one test so a regression names the exact case. */
"use strict";
(function () {
  var results = RSX.runValidation();
  assert(results.length >= 24, "expected at least the 24 original checks, got " + results.length);
  results.forEach(function (r) {
    test("validation: " + r.name, function () {
      assert(r.pass, "detail=" + JSON.stringify(r.detail));
    });
  });
})();
