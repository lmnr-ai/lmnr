const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const sandbox = {globalThis: {}};
vm.runInNewContext(fs.readFileSync(require.resolve("../piano-sequence.js"), "utf8"), sandbox);
const {descendingGEC, notes} = sandbox.globalThis.PianoSequence;

test("descending piano sound retains the supplied Signal Lab voice", () => {
  assert.equal(descendingGEC.type, "piano");
  assert.deepEqual(
    JSON.parse(JSON.stringify(descendingGEC.parameters)),
    {
      root: "392", sequence: ["392", "329.63", "261.63"], noteInterval: .12,
      velocity: .68, detune: 0, hardness: .52, hammer: .2, attack: .004,
      decay: 1.7, brightness: .18, spread: .38, width: .48, reverb: .34, volume: .24,
    },
  );
});

test("plays G4, E4, C4 at quick 120ms intervals", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(notes(descendingGEC.parameters))), [
    {root: 392, offset: 0},
    {root: 329.63, offset: .12},
    {root: 261.63, offset: .24},
  ]);
});

test("ordinary piano sounds remain single notes", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(notes({root: "783.99"}))), [{root: 783.99, offset: 0}]);
});
