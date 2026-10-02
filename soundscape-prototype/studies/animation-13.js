window.ANIMATION_SOUNDTRACK_STUDIES = window.ANIMATION_SOUNDTRACK_STUDIES || [];

(() => {
  const timing = window.SOUNDTRACK_TIMINGS.animation13;
  const c = timing.clips;
  const track = (key,gesture,label) => [c[key].time,c[key].duration,gesture,label];
  const settle = (key,label) => [c[key].end,.10,"settle",label];
  const cues = [
    [0,.20,"settle","Flow-1 field already established"],
    ...timing.dots.map(({time,count,tick}) => [time,.07,"spark",`Dot sparkle tick ${tick} · ${count} dots change`,count]),
    track("cloudReveal","air","Clouds begin revealing Flow-1"),settle("cloudReveal","Cloud reveal settles"),
    track("dotsExit","down","Dots begin contracting away"),settle("dotsExit","Dots fully disappear"),
    track("cameraZoom","down","Camera zoom-out begins"),track("cameraToBenchmark","down","Camera travels to benchmark"),track("cloudExit","air","Clouds begin exiting downward"),
    settle("cameraZoom","Zoom settles"),track("benchmarkHeading","appear","Benchmark heading enters"),settle("cameraToBenchmark","Benchmark camera settles"),
    track("percentageReveal","appear","Six percentages enter together"),track("modelRows","appear","Six model rows enter together"),settle("benchmarkHeading","Benchmark heading locks"),
    track("percentageCountUp","rise","Flow-1 percentage counts upward"),settle("modelRows","Six model rows lock"),[c.percentageCountUp.end,.14,"confirm","Flow-1 reaches 81.9 percent"],
    track("cameraToAnalysis","up","Camera lifts into analysis"),track("numberSwap","down","All percentages swap to counts"),track("analysisHeading","appear","Analysis heading enters"),
    track("analysisCountUp","rise","All six counts begin together"),track("barsGrow","rise","All six bars begin growing together"),settle("cameraToAnalysis","Analysis camera settles"),settle("analysisHeading","Analysis heading locks"),[c.barsGrow.end,.15,"confirm","All six bars settle"],[c.analysisCountUp.end,.18,"confirm","All six counts reach targets"],
    track("cameraToEngine","up","Camera travels to engine"),track("moduleActivation","rise","Engine module powers blue"),settle("cameraToEngine","Engine camera docks"),
    [c.engineSpinner.time,.10,"settle","Engine spinner begins"],[c.engineLines.time,timing.duration-c.engineLines.time,"flow","Engine lines begin continuous upward travel"],settle("moduleActivation","Engine activation locks"),
    track("coverDescent","down","Cover descends over engine"),track("coverTint","bloom","Cover tint and loader crossfade begin"),[c.coverSpinner.time,.10,"settle","Cover spinner begins"],
    settle("coverDescent","Cover geometry locks"),[c.coverTint.end,.16,"confirm","Cover reaches full blue"],
    ...timing.coverSpinnerWraps.map(({time,turn}) => [time,.06,"clock",`Cover spinner wrap ${turn}`]),
    ...timing.engineSpinnerWraps.map(({time,turn}) => [time,.06,"clock",`Engine spinner wrap ${turn}`]),
    ...timing.engineLineWraps.map(({time,turn}) => [time,.07,"clock",`Engine line wrap ${turn}`])
  ];
  const fit = (time,duration) => Math.max(.03,Math.min(duration,timing.duration-time));
  const harmony = {
    d:[ [50,57,61,64],[55,59,62,66],[45,52,57,61],[47,54,57,62],[45,52,57,62],[50,57,59,64,66] ],
    c:[ [48,55,59,62,66],[48,50,57,62,66],[48,52,55,59],[48,55,59,64],[48,50,57,62],[48,55,57,62,64] ],
    a:[ [45,52,59,61,64],[45,50,57,61,64],[40,47,49,56],[42,49,52,57],[40,47,57,59],[45,52,54,59,61] ]
  };
  const panels = [0,c.cloudReveal.time,c.cameraToBenchmark.time,c.percentageCountUp.end,c.cameraToAnalysis.time,c.cameraToEngine.time,c.coverTint.time];

  function makeEvent(cue,index,style,tones) {
    const [time,rawDuration,gesture,label,count]=cue,duration=fit(time,rawDuration),note=tones[index%tones.length],next=tones[(index+1)%tones.length];
    if (gesture==="spark") return {time,duration,kind:"pop",note,count,gain:style==="digital"?.011:.009,label};
    if (gesture==="air") return {time,duration,kind:"puff",tone:1050,gain:.019,soft:true,pan:.06,label};
    if (gesture==="bloom") return {time,duration,kind:"fill",note,toNote:next,velocity:.28,tone:1850,gain:.021,label};
    if (gesture==="down"||gesture==="up") {
      if (/Cover descends/.test(label)) return {time,duration,kind:"doors",from:1550,to:290,gain:.026,label};
      return {time,duration,kind:"whoosh",from:gesture==="down"?1700:320,to:gesture==="down"?290:2400,gain:gesture==="down"?.031:.027,pan:/analysis/i.test(label)?.18:0,label};
    }
    if (gesture==="flow") return style==="digital"?{time,duration,kind:"digital",note,toNote:next,velocity:.16,wave:"sine",pan:.22,label}:{time,duration,kind:"pad",notes:[tones[0]-24,tones[2]-12,tones[4]-12],gain:.014,wave:"sine",attack:.15,release:.35,pan:.18,label};
    if (gesture==="rise" && /count/i.test(label)) return {time,duration,kind:"ratchet",note,steps:/six counts/i.test(label)?24:12,rise:12,gain:style==="digital"?.014:.012,pan:0,label};
    if (gesture==="rise" && /bars/i.test(label)) return {time,duration,kind:"fill",note,toNote:next,velocity:.24,tone:1450,gain:.018,pan:.12,label};
    if (gesture==="rise" && /powers blue/i.test(label)) return {time,duration,kind:"fill",note,toNote:note+12,velocity:.38,tone:2200,gain:.03,pan:0,label};
    if (gesture==="appear" && /heading enters/i.test(label)) return {time,duration,kind:"whoosh",from:1400,to:430,gain:.023,pan:/Benchmark/.test(label)?-.28:.28,label};
    if (gesture==="rise"||gesture==="appear") {
      if(style==="digital") return {time,duration,kind:"digital",note,toNote:gesture==="rise"?next:note,velocity:gesture==="rise"?.24:.19,wave:"sine",pan:index%2?.12:-.12,label};
      return {time,duration,kind:"pluck",note,velocity:gesture==="rise"?.23:.19,tone:.43,pan:index%2?.12:-.12,label};
    }
    if (/Cover geometry locks|camera docks|camera settles/i.test(label)) return {time,duration,kind:"latch",note:tones[0]-12,gain:.024,label};
    if (gesture==="confirm") return {time,duration,kind:style==="piano"?"piano":"pluck",...(style==="piano"?{notes:[note],velocity:.22,brightness:.42,release:duration}:{note,velocity:.21,tone:.45}),label};
    return {time,duration,kind:"tick",note,gain:gesture==="clock"?.009:.012,pan:.18,label};
  }

  function makeVersion({id,title,direction,description,key,tempo,style,tones,chords}) {
    const spans=[[0,c.cameraToBenchmark.time],[c.cameraToBenchmark.time,c.percentageCountUp.end],[c.percentageCountUp.end,c.cameraToAnalysis.time],[c.cameraToAnalysis.time,c.cameraToEngine.time],[c.cameraToEngine.time,c.coverTint.time],[c.coverTint.time,timing.duration]];
    const bed=spans.map(([time,end],index)=>({time,duration:end-time,kind:"pad",notes:chords[index],gain:.024,wave:"sine",attack:.32,release:.55,label:`Harmonic section ${index+1}`}));
    const anchors=style==="piano"?panels.slice(1).map((time,index)=>({time,duration:fit(time,index===5?2.8:1.25),kind:"piano",notes:chords[Math.min(index,5)],velocity:index===5?.44:.33,brightness:.42,release:fit(time,index===5?2.8:1.25),label:`Piano anchor · ${["cloud reveal","benchmark travel","benchmark hold","analysis","engine travel","covered engine"][index]}`})):[];
    const events=cues.map((cue,index)=>makeEvent(cue,index,style,tones));
    return {id,title,direction,description,key,tempo,layers:[
      {name:style==="piano"?"Harmonic air and piano":"Harmonic system bed",color:"gold",role:"Consonant continuity supports the dense frame-locked action track.",events:[...bed,...anchors]},
      {name:"Frame-locked entrances",color:"sky",role:"Every meaningful reveal, count, activation, and movement start is tied to its first changing render frame.",events:events.filter(event=>/begin|enter|reveal|travel|contract|swap|power|descend|crossfade/i.test(event.label))},
      {name:"Frame-locked settles",color:"mint",role:"Camera, text, data, module, and cover completions receive restrained latches.",events:events.filter(event=>/settle|lock|reach|disappear|dock|wrap/i.test(event.label))},
      {name:"Continuous mechanisms",color:"violet",role:"Dot sparkle, engine lines, spinners, and continuing loops remain quiet but visibly synchronized.",events:events.filter(event=>!/begin|enter|reveal|travel|contract|swap|power|descend|crossfade|settle|lock|reach|disappear|dock|wrap/i.test(event.label))}
    ]};
  }

  window.ANIMATION_SOUNDTRACK_STUDIES.push({
    id:"animation-13",animation:"Animation 13",title:"From Flow to Engine",duration:timing.duration,
    visualSummary:"A cloud-framed Flow-1 title travels through benchmark and analysis views into an activated engine; every authored DialKit transition, simultaneous data change, mechanism onset, and settle is scored.",
    keyframes:[
      {time:1.5,image:"../poc/out/soundtrack-research/animation-13-early.png",label:"Flow-1 cloud field"},
      {time:6.7,image:"../poc/out/soundtrack-research/animation-13-middle.png",label:"Analysis counts and bars"},
      {time:10.7,image:"../poc/out/soundtrack-research/animation-13-late.png",label:"Active covered engine"}
    ],
    versions:[
      makeVersion({id:"clear-horizon",title:"Clear Horizon",direction:"piano-led",description:"D-major piano preserves the broad narrative while precise soft accents lock to every camera, row, count, engine, and cover action.",key:"D major",tempo:92,style:"piano",tones:[62,64,66,69,71,73,74],chords:harmony.d}),
      makeVersion({id:"signal-garden",title:"Signal Garden",direction:"digital",description:"C-Lydian packets distinguish simultaneous data motions from continuous engine mechanisms without inventing row staggers.",key:"C Lydian",tempo:120,style:"digital",tones:[60,62,64,66,67,69,71],chords:harmony.c}),
      makeVersion({id:"built-to-flow",title:"Built to Flow",direction:"hybrid",description:"A-major harmony combines tactile plucks, quiet transport air, exact visual latches, and a continuous active-engine thread.",key:"A major",tempo:104,style:"hybrid",tones:[69,71,73,74,76,78,81],chords:harmony.a})
    ]
  });
})();
