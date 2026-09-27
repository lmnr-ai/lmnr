(function (global) {
  "use strict";

  const descendingGEC = {
    id: "signal-lab-g4-e4-c4",
    type: "piano",
    name: "G4 · E4 · C4",
    parameters: {
      root: "392",
      sequence: ["392", "329.63", "261.63"],
      noteInterval: .12,
      velocity: .68,
      detune: 0,
      hardness: .52,
      hammer: .2,
      attack: .004,
      decay: 1.7,
      brightness: .18,
      spread: .38,
      width: .48,
      reverb: .34,
      volume: .24,
    },
  };

  function notes(settings) {
    const roots = Array.isArray(settings.sequence) && settings.sequence.length ? settings.sequence : [settings.root];
    const interval = Math.max(.04, Number(settings.noteInterval) || .12);
    return roots.map((root, index) => ({root: Number(root), offset: index * interval}));
  }

  global.PianoSequence = {descendingGEC, notes};
})(typeof window === "undefined" ? globalThis : window);
