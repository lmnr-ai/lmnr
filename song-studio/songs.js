(() => {
  const note = (pitch, beats = 1) => ({ pitch, beats });
  const rest = beats => ({ pitch: null, beats });
  const chord = (notes, beats = 4) => ({ notes, beats });
  const repeat = (items, times = 2) => Array.from({ length: times }, () => items.map(item => ({ ...item }))).flat();
  const eighths = (...pitches) => pitches.map(pitch => note(pitch, .5));
  const quarters = (...pitches) => pitches.map(pitch => pitch === null ? rest(1) : note(pitch));
  const timed = entries => entries.map(([pitch, beats]) => pitch === null ? rest(beats) : note(pitch, beats));
  const texture = (id, title, direction, description, palette) => ({ id, title, direction, description, palette });

  // Clementi, Sonatina Op. 36 No. 1, I — opening 15-bar exposition statement.
  const clementi = [
    note(72), note(76,.5), note(72,.5), note(67), note(67),
    note(72), note(76,.5), note(72,.5), note(67), note(79),
    ...eighths(77,76,74,72,71,72,71,72), ...eighths(74,72,71,69), note(67), rest(1),
    note(72), note(76,.5), note(72,.5), note(67), note(67),
    note(76), note(79,.5), note(76,.5), note(72), note(76,.5), note(72,.5),
    ...eighths(74,71,72,69,71,67,69,66), ...eighths(67,69,71,72,74,76,78,79),
    ...quarters(69,81,81,81), ...eighths(71,72,74,76,78,79,81,83),
    ...quarters(72,84,84,84), ...eighths(74,79,83,86,84,83,81,79),
    ...eighths(78,76,79,78,81,79,78,76), ...eighths(76,74,72,71,74,72,71,69),
    note(67,2), rest(2),
  ];

  const schumannOpening = [
    ...quarters(76,74,72,71), note(69,.5), note(72,.5), note(71,.5), note(74,.5), note(72), note(67),
    ...quarters(79,77,76,72), ...quarters(71,69,67,null),
  ];
  const schumannMelodie = [
    ...repeat(schumannOpening),
    ...quarters(74,72,71,null), ...quarters(77,76,74,null), ...quarters(81,79,77,76),
    note(74,.5), note(77,.5), note(76,.5), note(79,.5), note(77,1.5), note(74,.5),
    ...quarters(76,74,72,71), note(69,.5), note(72,.5), note(71,.5), note(74,.5), note(72), note(67),
    ...quarters(81,79,77,76), note(74,.5), note(77,.5), note(71,.5), note(74,.5), note(72), rest(1),
  ];

  // Schumann, Album for the Young Op. 68 No. 5 — opening and first return.
  const petitePiece = [
    rest(1), note(76), note(77),
    ...quarters(79,81,74,76), note(77,2), ...quarters(72,74), ...quarters(76,76,74,69), ...quarters(72,71,76,77),
    ...quarters(79,81,74,76), note(77,2), ...quarters(72,74), ...quarters(76,76,74,71), ...quarters(74,72,71,72),
    ...quarters(74,76,72,74), note(76,2), ...quarters(72,74), ...quarters(76,77,74,76), ...quarters(77,74,76,77),
    ...quarters(79,81,74,76), note(77,2), ...quarters(72,74), ...quarters(76,76,74,71), ...quarters(74,72,71,72),
  ];

  const faureAurore = timed([
    [72,.5],[72,.5],[74,.5],[76,.5],[77,1], [79,1],[81,.5],[84,.5],[86,.5],[82,.5],
    [81,1],[79,1],[77,1.5],[null,.5], [null,1.5],[81,.5],[74,.5],[76,.5],[77,.5],[81,.5],
    [74,.5],[77,.5],[81,.5],[84,.5],[83,.5],[81,.5],[79,1], [79,1.5],[null,2.5],
    [84,1.5],[86,.5],[82,1],[81,.5],[77,.5], [79,1.5],[81,.5],[82,.5],[87,.5],[86,.5],[81,.5],
    [84,2], [84,1],[89,1],[88,.5],[86,.5],[84,.5],[81,.5], [79,1],[81,.5],[72,.5],[72,1],[74,.5],[76,.5],
    [77,3], [77,1],[null,2],
  ]);

  const fieldNocturne = timed([
    [77,3],[76,1.5],[79,1.5], [77,2.5],[74,.5],[77,1.5],[null,1.5],
    [74,3],[75,1.5],[72,1.5], [70,2.5],[74,.25],[72,.25],[70,1.5],[null,1.5],
  ]);

  const tchaikovskyJanuary = timed([
    [66,.5],[68,.25],[69,.25],[68,.5],[71,.5],[64,.5],[69,.5],[71,.5],[73,.5],[76,1],[73,1.5],[74,.25],[76,.25],
    [78,.5],[73,.5],[74,1],[66,.5],[68,.25],[69,.25],[73,.5],[70,.5],[62,.5],[71,.5],
    [66,.5],[68,.25],[69,.25],[68,.5],[71,.5],[64,.5],[69,.5],[71,.5],[73,.5],[76,1],[73,1.5],[75,.25],[76,.25],
    [68,.5],[73,.5],[71,1],[73,.5],[75,.25],[76,.25],[68,.5],[73,.5],[71,1],
  ]);

  const morningPrayer = timed([
    [71,2.5],[69,.5],[72,1],[71,2],[69,1],[67,1],[69,1],[71,4],[64,1.5],[69,1.5],[62,1],[60,.5],[66,.5],[67,2],
    [76,.75],[69,1.25],[66,.5],[64,.5],[66,1],[71,2.5],[69,.5],[72,1],[71,2],[72,1],[74,1],[76,1],[78,3],
    [75,1],[76,1],[69,.5],[73,.5],[74,1],[71,1],[72,1],[71,.75],[69,1.25],[66,.5],[60,.5],[67,1],[null,1],[79,1],
  ]);

  const schubertMorningSong = timed([
    [79,1],[74,.5],[71,1],[67,.5],[72,.75],[74,.25],[76,.5],[73,1],[74,.5],[79,.25],[78,.25],[76,.25],[74,.25],[72,.25],[71,.25],
    [69,1],[72,.5],[76,.25],[74,.25],[73,.25],[74,.25],[72,.25],[69,.25],[74,1.5],[null,.5],[75,1],[76,1.375],[78,.125],
    [79,1],[73,.5],[74,3],[75,1.5],[74,1.5],[73,1.5],[null,.5],[74,1],[76,1.5],[74,1.5],[73,1.5],
    [81,.25],[79,.25],[78,.25],[76,.25],[74,.25],[72,.25],[71,1],[74,.5],[69,1],[74,.5],[71,1],[null,.5],
    [78,.25],[79,.25],[81,.25],[78,.25],[74,.25],[72,.25],[71,1],[74,.5],[69,1],[76,.25],[74,.25],[67,1],[null,.5],
  ]);

  // Additional recurring-DNA candidates transcribed from the cited Mutopia editions.
  // These are deliberately contrasting: lyrical, architectural, hymn-like, and kinetic.
  const mendelssohnOp85 = timed([
    [72,1],[74,.5],[77,.5], [72,1],[72,.25],[69,.25],[67,1/3],[65,1/6], [64,.75],[65,.25],[67,.5],[70,.5], [70,1],[69,.5],[null,.5],
    [69,1],[70,.5],[74,.5], [69,1],[70,.5],[74,.5], [69,.75],[69,.25],[72,.25],[70,.25],[69,.25],[67,.25], [67,.75],[66,.25],[67,.25],[69,.25],[70,1/3],[71,1/6],
    [72,1],[74,.5],[77,.5], [72,1],[72,.25],[69,.25],[67,1/3],[65,1/6], [64,.75],[65,.25],[67,.5],[70,.5], [70,1],[69,.5],[null,.5],
    [64,1],[65,.5],[69,.5], [64,1],[65,.5],[69,.5], [64,.75],[64,.25],[68,.5],[71,.5], [69,1.5],[69,.5],
  ]);
  const schubertImpromptu = timed([
    [63,1], [68,1],[68,1.5],[70,.5], [68,1],[67,1.5],[70,.5], [70,1],[68,1],[70,1], [72,2],[63,1],
    [72,1],[72,1.5],[73,.5], [72,1],[70,1.5],[72,.5], [70,1],[68,1],[75,.75],[73,.25], [72,2],[63,1],
    [68,1],[68,1.5],[70,.5], [68,1],[67,1.5],[70,.5], [70,1],[68,1],[70,1], [72,2],[63,1],
    [72,1],[72,1.5],[73,.5], [72,1],[70,1.5],[72,.5], [70,1],[68,1],[72,.75],[70,.25], [68,3],
  ]);
  const mendelssohnConsolation = timed([
    [67,2],[65,1.5],[63,.5], [70,1],[68,2],[67,1], [65,1],[63,1],[62,1.5],[63,.5], [67,2],[65,2],
    [65,2],[65,1.5],[67,.5], [68,3],[65,1], [60,1],[62,1],[67,1.5],[65,.5], [63,4],
  ]);
  const griegAlbumLeafPhrase = timed([
    [71,.5], [76,.75],[78,.25],[79,.5],[78,.5], [83,.5],[83,.5],[76,1], [78,.5],[78,.5],[71,1], [76,.5],[76,.5],[64,1],
    [71,.5], [76,.75],[78,.25],[81,.25],[80,.25],[79,.25],[78,.25], [83,.5],[83,.5],[76,1], [78,.5],[78,.5],[71,.5],[83,.5], [76,1],[76,.5],[null,.5],
  ]);
  const griegAlbumLeaf = [...griegAlbumLeafPhrase, ...griegAlbumLeafPhrase.map(item => ({...item}))];

  // Broader vernacular candidates, transcribed from the linked Mutopia sources.
  const bethena = timed([
    [69,.5],[67,1],[71,.5],[69,1], [69,.5],[67,1],[71,.5],[69,1], [69,.5],[72,1],[71,.5],[69,1], [67,3],
    [76,.5],[81,1],[76,.5],[79,1], [71,.5],[76,1],[71,.5],[74,1], [67,.5],[71,1],[67,.5],[71,1], [69,3],
    [69,.5],[67,1],[71,.5],[69,1], [69,.5],[67,1],[71,.5],[69,1], [69,.5],[72,1],[71,.5],[69,1], [67,3],
    [76,.5],[81,1],[76,.5],[79,1], [71,.5],[76,1],[71,.5],[74,1], [73,.5],[71,1],[72,.5],[69,1], [67,2],[71,1],
  ]);
  const solaceCell = timed([
    [71,.25],[70,.25],[69,.25],[67,.25],[67,.25],[68,.25],[69,.25],[70,.25],
    [71,.25],[77,.25],[79,.25],[77,.25],[77,.25],[79,.25],[77,.25],[71,.25],
    [72,.25],[71,.25],[69,.25],[67,.25],[67,.25],[68,.25],[69,.25],[71,.25],
    [72,.25],[76,.25],[81,.25],[79,.25],[79,.25],[81,.25],[79,.25],[73,.25],
  ]);
  const solace = [...solaceCell, ...solaceCell.map(item => ({...item}))];
  const aamullaVarhain = timed([
    [66,1],[66,.5],[66,.5],[66,1],[64,.5],[63,.5], [64,1],[64,.5],[64,.5],[64,1],[61,1],
    [66,1],[68,.5],[68,.5],[69,.5],[69,.5],[68,.5],[68,.5], [61,1],[65,1],[66,2],
    [69,.5],[69,.5],[69,.5],[69,.5],[69,.5],[69,.5],[68,.5],[66,.5], [68,.5],[68,1],[68,.5],[68,1],[61,1],
    [69,1],[68,.5],[68,.5],[68,1],[66,.5],[66,.5], [61,1],[65,.5],[65,.5],[66,2],
  ]);
  const waterOfTyne = timed([
    [69,.5], [69,.5],[66,.5],[66,.5],[69,.5],[66,.5],[64,.5], [62,.5],[62,.75],[62,.25],[62,1],[64,.25],[66,.25],
    [67,.5],[67,.5],[66,.5],[64,.5],[66,.5],[69,.5], [71,.5],[71,.75],[71,.25],[69,1],[66,.25],[64,.25],
    [62,.5],[74,.5],[74,.5],[74,.5],[76,.5],[78,.5], [74,.5],[69,.75],[71,.25],[71,1],[73,.25],[74,.25],
    [69,.5],[66,.5],[69,.5],[69,.75],[66,.25],[64,.5], [62,.5],[62,.75],[62,.25],[62,1],
  ]);
  const oEdoNihonbashi = timed([
    [72,.5],[71,.5],[72,.25],[71,.25],[59,.25],[71,.25], [72,.5],[71,.5],[72,.25],[71,.25],[59,.25],[71,.25],
    [72,.5],[71,.5],[72,.5],[71,.5], [72,.5],[71,.5],[72,.5],[76,.5], [72,.5],[71,.5],[64,.5],[71,.5],
    [76,.5],[72,.5],[71,1], [71,1],[71,.5],[71,.5], [66,.5],[69,.5],[71,1], [71,.5],[null,.5],[71,1],
    [71,.5],[69,.5],[71,.5],[71,.5], [76,.5],[72,.5],[71,.25],[71,.25],[72,.25],[72,.25], [67,.5],[67,.5],[66,1],
    [67,.5],[66,.5],[64,.5],[64,.5], [60,.5],[59,.5],[64,.5],[64,.5], [66,.5],[66,.5],[null,.5],[72,.5],
    [71,.5],[67,.5],[66,.5],[64,.5], [66,.5],[69,.5],[71,1], [72,.5],[72,.5],[71,1], [76,.5],[72,.5],[71,1], [71,1.5],[null,.5],
  ]);
  const swedishPolska = timed([
    [74,.5],[77,.25],[81,.25],[86,.5],[86,.5],[84,.5],[84,.5], [82,.5],[82,.5],[79,.25],[81,.25],[82,.25],[79,.25],[81,1],
    [79,.5],[79,.5],[77,.5],[77,.5],[76,.5],[74,.5], [74,.5],[73,.25],[74,.25],[76,.5],[73,.5],[69,1],
    [74,.5],[77,.25],[81,.25],[86,.5],[86,.5],[84,.5],[84,.5], [82,.5],[82,.5],[79,.25],[81,.25],[82,.25],[79,.25],[81,1],
    [79,.5],[79,.5],[77,.5],[77,.5],[76,.5],[74,.5], [77,.25],[76,.25],[74,.25],[73,.25],[74,1],[62,1],
  ]);
  const fukuJuSo = timed([
    [76,2],[64,2], [65,1],[64,1.5],[60,.5],[59,1], [62,1],[64,1],[65,1],[62,1], [64,2],[65,1],[69,1],
    [71,1.5],[69,.5],[65,2], [71,.75],[69,.25],[65,1],[64,1],[62,1], [64,1.5],[60,.5],[59,2], [60,1],[59,1],[62,1],[64,1],
  ]);

  window.SONG_STUDIO_SONGS = [
    {
      id: "joplin-bethena", title: "Bethena", composer: "Scott Joplin · concert waltz", year: "1905", genre: "Early jazz", key: "G major", meter: "3 / 4", tempo: 108,
      description: "Warm ragtime-era lyricism without the comic stride stereotype. Its rocking three-note turn feels human, crafted, and quietly forward-moving.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=463", sourceLabel: "Mutopia 463 · public-domain edition from original manuscript", status: "NEW · EARLY JAZZ", fit: "Strong identity at low density", risk: "Waltz pulse can become sentimental if over-orchestrated",
      melody: bethena,
      chords: [chord([43,47,50],3),chord([40,43,47],3),chord([50,54,57],3),chord([40,43,47],3),chord([48,52,55],3),chord([50,54,57],3),chord([45,49,52],3),chord([50,54,57],3),chord([43,47,50],3),chord([40,43,47],3),chord([50,54,57],3),chord([40,43,47],3),chord([48,52,55],3),chord([50,54,57],3),chord([45,49,52],3),chord([43,47,50],3)],
      cadence: [{pitch:69,beats:1},{pitch:71,beats:1},{pitch:66,beats:1},{pitch:67,beats:5}], phrases: [{at:0,label:"rocking call"},{at:12,label:"open lift"},{at:24,label:"return"},{at:42,label:"home"}],
      dna: [{id:"rocking-turn",label:"The rocking turn",description:"A short down-up gesture that stays recognizable without carrying the whole waltz.",occurrences:[{at:0,beats:6,label:"A"},{at:24,beats:6,label:"A return"}]}],
    },
    {
      id: "joplin-solace", title: "Solace", composer: "Scott Joplin · Mexican serenade", year: "1909", genre: "Early jazz", key: "C major / chromatic", meter: "2 / 4", tempo: 72,
      description: "A sophisticated, chromatic Joplin line—closer to a slow serenade than novelty ragtime. Precise motion with an adult emotional color.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=482", sourceLabel: "Mutopia 482 · public-domain edition from 1909 manuscript", status: "NEW · MOST DISTINCTIVE", fit: "Excellent as a sparse signal pattern", risk: "Chromatic tension can read wistful rather than hopeful",
      melody: solace,
      chords: repeat([chord([43,47,50],2),chord([47,50,53],2),chord([48,52,55],2),chord([45,48,52],2)],2),
      cadence: [{pitch:71,beats:1},{pitch:72,beats:1},{pitch:67,beats:1},{pitch:72,beats:5}], phrases: [{at:0,label:"chromatic seed"},{at:4,label:"answer"},{at:8,label:"return"},{at:12,label:"lift"}],
      dna: [{id:"chromatic-seed",label:"The chromatic seed",description:"Four close notes make a precise, unmistakable contour suited to interface-like transformation.",occurrences:[{at:0,beats:4,label:"A"},{at:8,beats:4,label:"A return"}]}],
    },
    {
      id: "aamulla-varhain", title: "Aamulla varhain", composer: "Traditional Finnish song", year: "traditional", genre: "Nordic folk", key: "F-sharp minor", meter: "4 / 4", tempo: 78,
      description: "A plainspoken Finnish vocal line with repeated tones and small turns. Intimate and modern when separated from literal folk instrumentation.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1020", sourceLabel: "Mutopia 1020 · public-domain transcription", status: "NEW · NORDIC FOLK", fit: "Very clear beneath narration", risk: "Minor mode begins with melancholy",
      melody: aamullaVarhain,
      chords: [chord([42,45,49],2),chord([38,42,45],2),chord([45,49,52],2),chord([49,52,56],2),chord([42,45,49],2),chord([47,50,54],2),chord([49,53,56],2),chord([42,45,49],2),chord([45,49,52],2),chord([38,42,45],2),chord([44,47,51],2),chord([49,53,56],2),chord([42,45,49],2),chord([47,50,54],2),chord([49,53,56],2),chord([42,45,49],2)],
      cadence: [{pitch:68,beats:1},{pitch:69,beats:1},{pitch:65,beats:1},{pitch:66,beats:5}], phrases: [{at:0,label:"plainspoken call"},{at:8,label:"lift"},{at:16,label:"return"},{at:24,label:"answer"}],
      dna: [{id:"repeated-light",label:"The repeated-light cell",description:"Repeated notes gently descend, creating identity without demanding melodic attention.",occurrences:[{at:0,beats:4,label:"A"},{at:16,beats:4,label:"A′"}]}],
    },
    {
      id: "water-of-tyne", title: "The Water of Tyne", composer: "Traditional Northumbrian song", year: "published 1893", genre: "English folk", key: "D major", meter: "6 / 8", tempo: 84,
      description: "An open, river-like folk contour: singable but not saccharine, with natural breathing space and a strong upward second-half transformation.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=889", sourceLabel: "Mutopia 889 · public-domain 1893 source arrangement", status: "NEW · OPEN & HUMAN", fit: "Excellent phrase spacing", risk: "Too much flute or acoustic guitar would become pastoral",
      melody: waterOfTyne,
      chords: [chord([50,54,57],3),chord([50,54,57],3),chord([43,47,50],3),chord([47,50,54],3),chord([50,54,57],3),chord([45,49,52],3),chord([45,49,52],3),chord([50,54,57],3)],
      cadence: [{pitch:69,beats:1},{pitch:71,beats:1},{pitch:73,beats:1},{pitch:74,beats:5}], phrases: [{at:0,label:"river phrase"},{at:6,label:"answer"},{at:12,label:"high crossing"},{at:18,label:"return"}],
      dna: [{id:"river-rise",label:"The river rise",description:"A repeated note opens upward, then falls—simple enough to become a product signature.",occurrences:[{at:0,beats:6,label:"A"},{at:12,beats:6,label:"A transformed"}]}],
    },
    {
      id: "o-edo-nihonbashi", title: "O-Edo Nihonbashi", composer: "Traditional Japanese song", year: "published 1895", genre: "Japanese historical song", key: "G major / pentatonic", meter: "2 / 4", tempo: 76,
      description: "A compact call built from alternating tones, large register jumps, and pentatonic answers. It produces a radically different digital identity.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1963", sourceLabel: "Mutopia 1963 · public-domain typeset of 1895 collection", status: "NEW · GLOBAL ARCHIVE", fit: "Excellent for isolated pings", risk: "Use abstract timbres; avoid generic ‘Japanese’ imitation",
      melody: oEdoNihonbashi,
      chords: repeat([chord([40,47,52],2),chord([43,47,50],2),chord([40,47,52],2),chord([47,50,54],2),chord([40,47,52],2)],4),
      cadence: [{pitch:69,beats:1},{pitch:71,beats:1},{pitch:76,beats:1},{pitch:71,beats:5}], phrases: [{at:0,label:"alternating call"},{at:8,label:"low answer"},{at:18,label:"second call"},{at:30,label:"return"}],
      dna: [{id:"bridge-call",label:"The bridge call",description:"Two neighboring tones and one octave displacement form a crisp, unusual signal.",occurrences:[{at:0,beats:2,label:"A"},{at:2,beats:2,label:"A repeat"},{at:18,beats:4,label:"A′"}]}],
    },
    {
      id: "swedish-polska", title: "Polska from Västergötland", composer: "Traditional Swedish dance", year: "published 1814", genre: "Nordic dance", key: "D minor", meter: "3 / 4", tempo: 100,
      description: "Asymmetric folk-dance energy with a bold opening leap. It tests whether Laminar should feel kinetic and crafted rather than serene.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=830", sourceLabel: "Mutopia 830 · CC BY 2.5 typeset from 1814 source", status: "NEW · KINETIC FOLK", fit: "Great for chapter transitions", risk: "Too active for continuous use under narration",
      melody: swedishPolska,
      chords: [chord([50,53,57],3),chord([43,46,50],3),chord([45,49,52],3),chord([45,49,52],3),chord([50,53,57],3),chord([43,46,50],3),chord([45,49,52],3),chord([50,53,57],3)],
      cadence: [{pitch:77,beats:1},{pitch:76,beats:1},{pitch:73,beats:1},{pitch:74,beats:5}], phrases: [{at:0,label:"bold leap"},{at:6,label:"fall"},{at:12,label:"return"},{at:18,label:"close"}],
      dna: [{id:"leaping-polska",label:"The leaping polska",description:"An upward arpeggio and high repeated tone create immediate momentum.",occurrences:[{at:0,beats:6,label:"A"},{at:12,beats:6,label:"A return"}]}],
    },
    {
      id: "fuku-ju-so", title: "Fuku-Ju-So", composer: "Traditional Japanese repertoire", year: "published 1895", genre: "Japanese historical song", key: "historical transcription", meter: "4 / 4", tempo: 74,
      description: "Long tones, octave space, and an unhurried descending shape offer a non-Western archival contrast without requiring a dense arrangement.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1987", sourceLabel: "Mutopia 1987 · public-domain typeset of 1895 collection", status: "NEW · SPACIOUS", fit: "Maximum room for narration", risk: "Historical Western transcription simplifies original tuning and ornament",
      melody: fukuJuSo,
      chords: [chord([40,47,52],4),chord([41,45,48],4),chord([43,47,50],4),chord([45,48,52],4),chord([47,50,53],4),chord([43,47,50],4),chord([40,47,52],4),chord([45,48,52],4)],
      cadence: [{pitch:65,beats:1},{pitch:64,beats:1},{pitch:59,beats:1},{pitch:64,beats:5}], phrases: [{at:0,label:"open space"},{at:8,label:"answer"},{at:16,label:"high turn"},{at:24,label:"descent"}],
      dna: [{id:"open-descent",label:"The open descent",description:"A wide opening interval settles by step, functioning more like a sonic emblem than a tune.",occurrences:[{at:0,beats:4,label:"A"},{at:16,beats:4,label:"A′"}]}],
    },
    {
      id: "faure-aurore", title: "Aurore", composer: "Gabriel Fauré · Op. 39 No. 1", year: "1884", key: "F major", meter: "changing", tempo: 76,
      description: "The dawn song’s final span: a long-breathed French-Romantic line that gathers light and closes gently in F major.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1829", sourceLabel: "Mutopia score 1829 · public-domain typeset",
      melody: faureAurore,
      chords: [chord([48,53,57],3),chord([48,55,60],3),chord([53,57,60]),chord([50,53,57]),chord([50,57,60]),chord([48,55,60]),chord([48,53,57]),chord([46,53,58]),chord([48,55,60],2),chord([48,53,57]),chord([48,55,60]),chord([53,57,60],3),chord([53,57,60],3)],
      cadence: [{pitch:79,beats:1},{pitch:81,beats:1},{pitch:76,beats:1},{pitch:77,beats:5}],
      phrases: [{at:0,label:"light enters"},{at:10,label:"lift"},{at:22,label:"opening sky"},{at:36,label:"arrival"}],
    },
    {
      id: "field-nocturne", title: "Nocturne in B♭", composer: "John Field · H. 37", year: "1817", key: "B♭ major", meter: "12 / 8", tempo: 78,
      description: "Four complete cantabile bars from Field: floating, adult, and spacious enough to sit beneath speech without sounding empty.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2137", sourceLabel: "Mutopia score 2137 · public domain",
      melody: fieldNocturne,
      chords: [chord([46,50,53],6),chord([46,50,53],6),chord([51,55,58],6),chord([46,50,53],6)],
      cadence: [{pitch:72,beats:1},{pitch:74,beats:1},{pitch:69,beats:1},{pitch:70,beats:5}],
      phrases: [{at:0,label:"cantabile"},{at:6,label:"answer"},{at:12,label:"warm turn"},{at:18,label:"tonic return"}],
    },
    {
      id: "tchaikovsky-january", title: "January · At the Fireside", composer: "Pyotr Ilyich Tchaikovsky · Op. 37a No. 1", year: "1876", key: "A major", meter: "3 / 4", tempo: 88,
      description: "A warm fireside phrase with inner motion and restrained Romantic color—intimate rather than recognizably theatrical.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1171", sourceLabel: "Mutopia score 1171 · public domain",
      melody: tchaikovskyJanuary,
      chords: [chord([45,49,52],3),chord([45,52,57],3),chord([50,54,57],3),chord([52,56,59],3),chord([45,49,52],3),chord([50,54,57],3),chord([52,56,59],3),chord([45,49,52],3)],
      cadence: [{pitch:74,beats:1},{pitch:76,beats:1},{pitch:68,beats:1},{pitch:69,beats:5}],
      phrases: [{at:0,label:"fireside"},{at:6,label:"upper turn"},{at:12,label:"return"},{at:18,label:"soft answer"}],
    },
    {
      id: "tchaikovsky-prayer", title: "Morning Prayer", composer: "Pyotr Ilyich Tchaikovsky · Op. 39 No. 1", year: "1878", key: "G major", meter: "3 / 4", tempo: 72,
      description: "A slow chorale-like span with mature voice-leading, useful when the video should feel sincere, settled, and quietly optimistic.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2032", sourceLabel: "Mutopia score 2032 · public domain",
      melody: morningPrayer,
      chords: [chord([43,47,50],3),chord([43,47,50],3),chord([48,52,55],3),chord([43,47,50],3),chord([40,47,52],3),chord([50,54,57],3),chord([43,47,50],3),chord([50,54,57],3),chord([43,47,50],3),chord([43,47,50],3),chord([48,52,55],3),chord([43,47,50],3),chord([50,54,57],3),chord([43,47,50],3),chord([48,52,55],3),chord([43,47,50],3)],
      cadence: [{pitch:69,beats:1},{pitch:71,beats:1},{pitch:66,beats:1},{pitch:67,beats:5}],
      phrases: [{at:0,label:"prayer"},{at:12,label:"inward turn"},{at:24,label:"return"},{at:36,label:"opening upward"}],
    },
    {
      id: "schubert-morning-song", title: "Sängers Morgenlied", composer: "Franz Schubert · D. 163", year: "1815", key: "G major", meter: "6 / 8", tempo: 92,
      description: "A bright but unfamiliar Schubert vocal line, shaped in full phrases rather than lesson-book gestures.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1051", sourceLabel: "Mutopia score 1051 · public domain", status: "CURRENT FAVORITE", fit: "Memorable, but needs aggressive thinning under speech", risk: "The complete tune can compete with narration",
      melody: schubertMorningSong,
      chords: [chord([43,47,50],3),chord([50,54,57],3),chord([43,47,50],3),chord([48,52,55],3),chord([45,48,52],3),chord([50,54,57],3),chord([43,47,50],3),chord([43,47,50],3),chord([48,52,55],3),chord([50,54,57],3),chord([43,47,50],3),chord([50,54,57],3),chord([43,47,50],3),chord([43,47,50],3)],
      cadence: [{pitch:69,beats:1},{pitch:71,beats:1},{pitch:66,beats:1},{pitch:67,beats:5}],
      phrases: [{at:0,label:"morning call"},{at:12,label:"flowing answer"},{at:24,label:"second verse"},{at:36,label:"homeward"}],
      dna: [{id:"morning-call",label:"The morning call",description:"A descending call answered by an upward turn—the identity that can recur without playing the whole song.",occurrences:[{at:0,beats:4.5,label:"A"},{at:12,beats:4.5,label:"A′"},{at:24,beats:4.5,label:"A return"}]}],
    },
    {
      id: "mendelssohn-op85-1", title: "Song without Words · Op. 85 No. 1", composer: "Felix Mendelssohn", year: "1833–34", key: "D minor / F major", meter: "2 / 4", tempo: 82,
      description: "A searching, adult lyric line. Less immediately cheerful, but its three-note reach and answering fall make unusually strong recurring DNA.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1744", sourceLabel: "Mutopia 1744 · public-domain edition", status: "NEW · STRONG CONTRAST", fit: "Voiceover-safe when reduced", risk: "Starts introspective; needs a bright final reharmonization",
      melody: mendelssohnOp85,
      chords: [chord([53,57,60],2),chord([58,62,65],2),chord([48,52,55],2),chord([53,57,60],2),chord([50,53,57],2),chord([50,53,57],2),chord([58,62,65],2),chord([48,52,55],2),chord([53,57,60],2),chord([58,62,65],2),chord([48,52,55],2),chord([53,57,60],2),chord([45,49,52],2),chord([50,53,57],2),chord([52,56,59],2),chord([45,49,52],2)],
      cadence: [{pitch:69,beats:1},{pitch:70,beats:1},{pitch:64,beats:1},{pitch:65,beats:5}], phrases: [{at:0,label:"reaching call"},{at:8,label:"answer"},{at:16,label:"return"},{at:24,label:"warm turn"}],
      dna: [{id:"reach",label:"The reaching call",description:"A compact rise that can become piano, strings, or a soft signal.",occurrences:[{at:0,beats:4,label:"A"},{at:8,beats:4,label:"A′"},{at:16,beats:4,label:"A return"}]}],
    },
    {
      id: "schubert-impromptu-935-2", title: "Impromptu · D. 935 No. 2", composer: "Franz Schubert", year: "1827", key: "A-flat major", meter: "3 / 4", tempo: 78,
      description: "Poised and architectural rather than song-like. Its repeated opening gesture feels premium and can disappear beneath speech without losing identity.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1195", sourceLabel: "Mutopia 1195 · public-domain edition", status: "NEW · BEST UNDER VO", fit: "Excellent sparse underscore", risk: "Classical restraint rather than obvious optimism",
      melody: schubertImpromptu,
      chords: [chord([44,48,51],1),...repeat([chord([44,48,51],3),chord([51,55,58],3),chord([48,51,56],3),chord([44,48,51],3)],4)],
      cadence: [{pitch:70,beats:1},{pitch:72,beats:1},{pitch:67,beats:1},{pitch:68,beats:5}], phrases: [{at:0,label:"pickup"},{at:13,label:"answer"},{at:25,label:"return"},{at:37,label:"home"}],
      dna: [{id:"poised-rise",label:"The poised rise",description:"One repeated tone opens into a small lift, then settles.",occurrences:[{at:1,beats:6,label:"A"},{at:25,beats:6,label:"A′"}]}],
    },
    {
      id: "mendelssohn-consolation", title: "Consolation", composer: "Felix Mendelssohn", year: "19th century", key: "E-flat major", meter: "4 / 4", tempo: 70,
      description: "Broad, hymn-like melodic DNA. Useful as a test of sincerity and calm, but potentially too devotional for the product.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1232", sourceLabel: "Mutopia 1232 · public-domain edition", status: "NEW · CALMEST", fit: "Leaves maximum room for speech", risk: "Can feel ceremonial or devotional",
      melody: mendelssohnConsolation,
      chords: [chord([51,55,58],4),chord([48,51,55],4),chord([46,50,53],4),chord([51,55,58],4),chord([46,50,53],4),chord([44,48,51],4),chord([46,50,53],4),chord([51,55,58],4)],
      cadence: [{pitch:65,beats:1},{pitch:67,beats:1},{pitch:62,beats:1},{pitch:63,beats:5}], phrases: [{at:0,label:"statement"},{at:8,label:"answer"},{at:16,label:"second statement"},{at:24,label:"home"}],
      dna: [{id:"falling-answer",label:"The falling answer",description:"A long tone releases through a gentle three-note descent.",occurrences:[{at:0,beats:4,label:"A"},{at:8,beats:4,label:"answer"},{at:16,beats:4,label:"A′"}]}],
    },
    {
      id: "grieg-album-leaf", title: "Album Leaf · Op. 12 No. 7", composer: "Edvard Grieg", year: "1867", key: "E minor", meter: "2 / 4", tempo: 112,
      description: "The energetic outlier: nimble repeated figures that could become interface pulse rather than continuous melody.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2194", sourceLabel: "Mutopia 2194 · CC BY-SA 4.0 edition", status: "NEW · RHYTHMIC OPTION", fit: "Strong for motion; weakest under dense speech", risk: "Minor-key urgency can feel busy",
      melody: griegAlbumLeaf,
      chords: [...repeat([chord([40,47,55],2),chord([40,47,55],2),chord([47,51,57],2),chord([40,47,55],2)],4),chord([40,47,55],2)],
      cadence: [{pitch:78,beats:1},{pitch:79,beats:1},{pitch:71,beats:1},{pitch:76,beats:5}], phrases: [{at:0,label:"pickup"},{at:8.5,label:"turn"},{at:16.5,label:"repeat"},{at:25,label:"return"}],
      dna: [{id:"quick-lift",label:"The quick lift",description:"A pickup and rising three-note cell built for motion and transformation.",occurrences:[{at:0,beats:4.5,label:"A"},{at:8.5,beats:4,label:"A′"},{at:16.5,beats:4.5,label:"A return"}]}],
    },
    {
      id: "clementi-spiritoso", title: "Spiritoso Study", composer: "Muzio Clementi · Op. 36 No. 1, I", year: "1797", key: "C major", meter: "2 / 2", tempo: 122,
      description: "The opening statement of a bright Clementi sonatina: recognizably classical, energetic, but not an instant pop-cultural tune.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=804", sourceLabel: "Mutopia score 804 · public domain",
      melody: clementi,
      chords: [
        chord([48,52,55]), chord([48,52,55]), chord([53,57,60]), chord([55,59,62]), chord([48,52,55]),
        chord([48,52,55]), chord([50,54,57]), chord([55,59,62]), chord([50,54,57]), chord([55,59,62]),
        chord([48,52,55]), chord([55,59,62]), chord([50,54,57]), chord([55,59,62]), chord([48,52,55]),
      ],
      cadence: [{ pitch: 74, beats: 1 }, { pitch: 76, beats: 1 }, { pitch: 71, beats: 1 }, { pitch: 72, beats: 5 }],
      phrases: [{ at: 0, label: "opening" }, { at: 16, label: "sequence" }, { at: 32, label: "expansion" }, { at: 52, label: "classical close" }],
    },
    {
      id: "schumann-melodie", title: "Melodie", composer: "Robert Schumann · Op. 68 No. 1", year: "1848", key: "C major", meter: "4 / 4", tempo: 104,
      description: "A calm, lyrical teaching piece with expressive rises and gentle returns—classical in character without announcing itself.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=647", sourceLabel: "Mutopia score 647 · CC BY-SA 2.5 edition",
      melody: schumannMelodie,
      chords: [
        chord([48,52,55]), chord([53,57,60]), chord([48,52,55]), chord([55,59,62]),
        chord([48,52,55]), chord([53,57,60]), chord([48,52,55]), chord([55,59,62]),
        chord([55,59,62]), chord([55,59,62]), chord([53,57,60]), chord([55,59,62]),
        chord([48,52,55]), chord([53,57,60]), chord([55,59,62]), chord([48,52,55]),
      ],
      cadence: [{ pitch: 74, beats: 1 }, { pitch: 71, beats: 1 }, { pitch: 69, beats: 1 }, { pitch: 67, beats: 1 }, { pitch: 72, beats: 4 }],
      phrases: [{ at: 0, label: "quiet statement" }, { at: 16, label: "statement returns" }, { at: 32, label: "expressive rise" }, { at: 48, label: "answer" }],
    },
    {
      id: "schumann-petite-piece", title: "Petite pièce", composer: "Robert Schumann · Op. 68 No. 5", year: "1848", key: "C major", meter: "4 / 4", tempo: 96,
      description: "A modest song-without-words excerpt: balanced phrases, small surprises, and enough space for chamber textures.",
      source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=653", sourceLabel: "Mutopia score 653 · CC BY-SA 2.5 edition",
      melody: petitePiece,
      chords: [
        chord([48,52,55],3), chord([48,52,55]), chord([53,57,60]), chord([50,54,57]), chord([55,59,62]),
        chord([48,52,55]), chord([53,57,60]), chord([55,59,62]), chord([48,52,55]),
        chord([55,59,62]), chord([48,52,55]), chord([53,57,60]), chord([50,54,57]),
        chord([48,52,55]), chord([53,57,60]), chord([55,59,62]), chord([48,52,55]),
      ],
      cadence: [{ pitch: 76, beats: 1 }, { pitch: 74, beats: 1 }, { pitch: 71, beats: 1 }, { pitch: 72, beats: 5 }],
      phrases: [{ at: 0, label: "pickup" }, { at: 19, label: "first answer" }, { at: 35, label: "middle thought" }, { at: 51, label: "return" }],
    },
  ];

  window.SONG_STUDIO_TEXTURES = [
    texture("felt-piano", "Felt Piano", "intimate · neutral", "Soft attacks and open voicings. The safest baseline beneath narration.", ["#d7b45b", "#b88f78", "#9abf9b"]),
    texture("digital-pings", "Digital Pings", "precise · product-like", "The motif becomes warm glass signals over a nearly invisible harmonic bed.", ["#8bc5ce", "#779fb5", "#d7b45b"]),
    texture("chamber-strings", "Chamber Strings", "human · cinematic", "A restrained bowed line and low strings make the same DNA feel emotional.", ["#d98569", "#b8879c", "#755f73"]),
    texture("hybrid-score", "Hybrid Score", "balanced · recommended", "Piano owns the motif, strings provide air, and pings appear only at structural points.", ["#d7b45b", "#9abf9b", "#8bc5ce"]),
    texture("signal-bloom", "Signal Bloom", "abstract · luminous", "Sine blooms, reversed-feeling swells, and long tails turn the melody into atmosphere.", ["#7ac7be", "#8094cc", "#c69ad6"]),
    texture("paper-pulse", "Paper Pulse", "tactile · rhythmic", "Dry plucks, filtered taps, and a faint low pulse test a more editorial sound world.", ["#c5a46d", "#cf795f", "#7f9184"]),
  ];
})();
