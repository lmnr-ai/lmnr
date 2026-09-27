window.ANIMATION_SOUNDTRACK_STUDIES = window.ANIMATION_SOUNDTRACK_STUDIES || [];

(() => {
  const timing = window.SOUNDTRACK_TIMINGS.animation10;
  const fit = (time, duration) => Math.max(.03, Math.min(duration, timing.duration - time));
  const chordPanels = (chords, kind = "pad") => chords.map((notes, index) => ({
    time: index * 3, duration: 3, kind, notes, ...(kind === "pad" ? {gain:.032,wave:"sine",attack:.32,release:.55} : {velocity:.42,brightness:.46,release:2.6}),
    label: `Harmony panel ${index + 1}`
  }));

  function syncLayers(style, scale, tones) {
    const processEvents = timing.entrances.map(({time,name}, index) => {
      const note = tones[index % tones.length];
      const common = {time,duration:fit(time,.16),label:`${name} enters at agent`};
      if (style === "digital") return {...common,kind:"digital",note,toNote:tones[(index + 1) % tones.length],velocity:.16,wave:"sine",pan:.38};
      return {...common,kind:"pluck",note,velocity:style === "piano" ? .18 : .15,tone:.42,pan:.38};
    });
    const exitEvents = timing.exits.map(({time,name}, index) => {
      const note=tones[(index + 2) % tones.length];
      return {time,duration:fit(time,.07),kind:"tick",note,gain:.0055,pan:-.62,label:`${name} exits left edge`};
    });
    const puffEvents = timing.puffs.map(({time}, index) => {
      return {time,duration:fit(time,.52),kind:"puff",tone:scale + (index%4)*110,gain:.025,soft:true,pan:.26-index*.035,label:`Cloud reaches maximum; puff ${index + 1} emits`};
    });
    const spinnerEvents = timing.spinner.map(({time,turn},index) => {
      return {time,duration:fit(time,.08),kind:"tick",note:tones[(index+4)%tones.length],gain:.0065,pan:.62,label:`Spinner completes turn ${turn}`};
    });
    return [
      {name:"Agent-edge entrances",color:"coral",role:"Every semantic ribbon block is punctuated on its first visible frame.",events:processEvents},
      {name:"Left-edge releases",color:"mint",role:"Near-subliminal grains acknowledge every semantic block leaving frame.",events:exitEvents},
      {name:"Cloud emissions",color:"sky",role:"Air breaths lock to all seventeen first-visible puff emissions.",events:puffEvents},
      {name:"Spinner landmarks",color:"violet",role:"A quiet glint every fifth full rotation keeps the independent spinner legible.",events:spinnerEvents}
    ];
  }

  function version({id,title,direction,description,key,tempo,chords,tones,style,scale,piano=false}) {
    const harmony = chordPanels(chords, piano ? "piano" : "pad");
    if (piano) harmony.push(...chordPanels(chords,"pad").map(event => ({...event,gain:.018,label:event.label.replace("Harmony","Quiet machine harmony")})));
    return {id,title,direction,description,key,tempo,layers:[
      {name:piano?"Sunlit piano harmony":"Continuous tonal bed",color:"gold",role:"A consonant four-panel progression keeps dense synchronization musical.",events:harmony},
      ...syncLayers(style,scale,tones)
    ]};
  }

  window.ANIMATION_SOUNDTRACK_STUDIES.push({
    id:"animation-10",animation:"Animation 10",title:"Cheerful Agent Relay",duration:timing.duration,
    visualSummary:"A colorful repeating Write/Read/Thinking/Bash ribbon and grid travel past a cloud-topped agent while its spinner turns and every dithered puff drifts left.",
    keyframes:[
      {time:1.5,image:"../poc/out/soundtrack-research/animation-10-early.png",label:"Tool ribbon and cloud relay"},
      {time:6,image:"../poc/out/soundtrack-research/animation-10-middle.png",label:"Continuous grid and process stream"},
      {time:10.5,image:"../poc/out/soundtrack-research/animation-10-late.png",label:"Agent spinner and drifting puffs"}
    ],
    versions:[
      version({id:"bright-workbench",title:"Bright Workbench",direction:"piano-led",description:"Warm G-major piano sits beneath frame-locked semantic entrances, left-edge releases, spinner landmarks, and every cloud emission.",key:"G major",tempo:100,piano:true,style:"piano",scale:1220,tones:[67,69,71,74,76,79],chords:[[55,59,62,67],[48,55,59,64],[52,55,59,62],[50,54,57,62]]}),
      version({id:"pixel-conveyor",title:"Pixel Conveyor",direction:"digital",description:"Clean D-major packets make every tool boundary explicit while quiet rails track exits, puffs, and independent spinner motion.",key:"D major",tempo:105,style:"digital",scale:1500,tones:[62,64,66,69,71,74],chords:[[50,57,62,66],[47,54,59,62],[43,50,55,59],[45,52,57,61]]}),
      version({id:"cloud-garden-relay",title:"Cloud Garden Relay",direction:"hybrid",description:"Airy A-major harmony combines rounded process plucks with complete cloud and ribbon synchronization.",key:"A major",tempo:96,style:"hybrid",scale:1330,tones:[69,71,73,76,78,81],chords:[[45,52,57,61],[40,47,52,56],[42,49,54,57],[38,45,49,52]]})
    ]
  });
})();
