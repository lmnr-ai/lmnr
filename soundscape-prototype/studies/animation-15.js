window.ANIMATION_SOUNDTRACK_STUDIES = window.ANIMATION_SOUNDTRACK_STUDIES || [];

(() => {
  const timing = window.SOUNDTRACK_TIMINGS.animation15;
  const clips = timing.clips;
  const cues = [
    ...timing.appearances.map(({time,duration,id})=>[time,duration,"appearance",`${id} warning appears`]),
    [Math.min(...timing.travelStarts.map(event=>event.time)),Math.max(...timing.travelStarts.map(event=>event.end))-Math.min(...timing.travelStarts.map(event=>event.time)),"travel","Direct warning flights remain in motion"],
    ...timing.travelStarts.map(({time,id})=>[time,.08,"packet",`${id} begins direct travel`]),
    ...timing.clusterEffects.map(({time,duration,cluster,effect})=>[time,duration,effect==="coverAppearance"?"bloom":effect==="triangleScaleIn"?"cluster-in":"merge",`${cluster} ${effect}`]),
    [Math.max(...timing.clusterEffects.map(event=>event.end)),.16,"confirm","All six clusters fully settled"],
    [clips.agentWindowEnter.time,clips.agentWindowEnter.duration,"down","Agent window begins entering"],[clips.agentWindowEnter.end,.12,"settle","Agent window docks"],
    ...timing.typing.prompt.map(({time,index})=>[time,.035,"type",`Prompt character ${index}`]),[clips.promptTyping.end,.14,"phrase","Prompt completes"],
    ...timing.typing.issue.map(({time,index})=>[time,.035,"type",`Issue character ${index}`]),[clips.issueTyping.end,.12,"phrase","Issue text completes"],
    [clips.issuePadding.time,clips.issuePadding.duration,"bloom","Issue badge padding expands"],[clips.issueBackground.time,clips.issueBackground.duration,"bloom","Issue badge background fills"],[clips.issueWarningIn.time,clips.issueWarningIn.duration,"confirm","Blue badge warning appears"],[Math.max(clips.issuePadding.end,clips.issueBackground.end,clips.issueWarningIn.end),.10,"settle","Issue badge fully settled"],
    [clips.messageSend.time,clips.messageSend.duration,"up","Send motion begins"],[clips.messageSend.end,.12,"confirm","Send completes and message enters transcript"],
    [timing.rows.command.time,timing.rows.command.duration,"row","CLI row begins opening"],...timing.typing.command.map(({time,index})=>[time,.03,"type",`CLI character ${index}`]),[timing.rows.command.end,.08,"settle","CLI row fully open"],[clips.cliCommandTyping.end,.12,"phrase","CLI command completes"],
    [timing.rows.query.time,timing.rows.query.duration,"row","SQL query row begins opening"],...timing.typing.query.map(({time,index})=>[time,.03,"type",`SQL query character ${index}`]),[timing.rows.query.end,.08,"settle","SQL query row fully open"],[clips.sqlQueryTyping.end,.12,"phrase","SQL query line completes"],
    [timing.rows.predicate.time,timing.rows.predicate.duration,"row","Predicate row begins opening"],...timing.typing.predicate.map(({time,index})=>[time,.03,"type",`Predicate character ${index}`]),[timing.rows.predicate.end,.08,"settle","Predicate row fully open"],
    [timing.queryWarning.time,timing.queryWarning.duration,"confirm","Inline warning appears"],[timing.queryWarning.end,.10,"settle","Inline warning settles"],[clips.sqlPredicateTyping.end,.30,"resolve","Predicate and query result complete"],
    [clips.agentWindowExit.time,clips.agentWindowExit.duration,"up","Agent window begins exiting"],[clips.agentWindowExit.end,.65,"resolve","Window clears to resolved grid"]
  ];
  const fit=(time,duration)=>Math.max(.02,Math.min(duration,timing.duration-time));
  const chordSets={
    d:[[38,45,50,54],[47,54,57,62],[43,50,55,59],[45,52,57,62],[47,54,57,62],[38,45,50,54]],
    a:[[45,52,57,64],[43,50,57,59],[45,52,57,61],[38,45,50,54,57],[43,50,57,59],[45,52,57,59,64]],
    e:[[40,47,52,56],[51,54,59,66],[45,52,56,59],[47,54,59,64],[37,44,49,52,56],[40,47,52,56,59]]
  };
  const firstTravel=Math.min(...timing.travelStarts.map(event=>event.time));
  const clustersSettled=Math.max(...timing.clusterEffects.map(event=>event.end));
  const spans=[[0,firstTravel],[firstTravel,clips.agentWindowEnter.time],[clips.agentWindowEnter.time,clips.messageSend.time],[clips.messageSend.time,clustersSettled],[clustersSettled,clips.sqlPredicateTyping.end],[clips.sqlPredicateTyping.end,timing.duration]];

  function eventFor(cue,index,style,tones) {
    const [time,rawDuration,gesture,label]=cue,duration=fit(time,rawDuration),note=tones[index%tones.length],next=tones[(index+1)%tones.length];
    if(gesture==="travel") return {time,duration,kind:"whoosh",from:380,to:1600,gain:.009,pan:0,label};
    if(gesture==="down"||gesture==="up") return {time,duration,kind:"whoosh",from:gesture==="down"?1450:500,to:gesture==="down"?420:2100,gain:.013,pan:0,label};
    if(gesture==="bloom"||gesture==="merge"||gesture==="cluster-in") return {time,duration,kind:gesture==="cluster-in"?"fill":"puff",tone:gesture==="merge"?900:1450,gain:gesture==="merge"?.010:.012,soft:true,note,toNote:next,velocity:.16,pan:(index%3-1)*.16,label};
    if(gesture==="appearance"||gesture==="packet") {
      if(style==="digital") return {time,duration,kind:"digital",note,toNote:next,velocity:gesture==="appearance"?.10:.13,wave:"sine",pan:(index%5-2)*.22,label};
      return {time,duration,kind:style==="piano"?"tick":"pluck",...(style==="piano"?{note,gain:gesture==="appearance"?.0045:.006}:{note,velocity:gesture==="appearance"?.10:.13,tone:.38}),pan:(index%5-2)*.22,label};
    }
    if(gesture==="row") return {time,duration,kind:"whoosh",from:500,to:1350,gain:.0055,pan:.08,label};
    if(gesture==="confirm"||gesture==="resolve"||gesture==="phrase") {
      if(style==="piano"&&gesture==="resolve") return {time,duration,kind:"piano",notes:[note-12,note,next],velocity:.24,brightness:.40,release:duration,label};
      return {time,duration,kind:gesture==="confirm"?"chime":"pluck",note,velocity:gesture==="confirm"?.14:.13,tone:.40,pan:.08,label};
    }
    return {time,duration,kind:"tick",note,gain:gesture==="type"?.006:.007,pan:index%2?.10:-.10,label};
  }

  function makeVersion({id,title,direction,description,key,tempo,style,tones,chords}) {
    const bed=spans.map(([time,end],index)=>({time,duration:end-time,kind:"pad",notes:chords[index],gain:.023,wave:style==="digital"?"triangle":"sine",attack:.32,release:.58,label:`Harmonic phase ${index+1}`}));
    const piano=style==="piano"?[0,firstTravel,clips.agentWindowEnter.time,clips.messageSend.time,clustersSettled,clips.agentWindowExit.end].map((time,index)=>({time,duration:fit(time,index===5?.28:1.1),kind:"piano",notes:chords[Math.min(index,5)],velocity:index===5?.38:.31,brightness:.39,release:fit(time,index===5?.28:1.1),label:`Piano narrative anchor ${index+1}`})):[];
    const events=cues.map((cue,index)=>eventFor(cue,index,style,tones));
    return {id,title,direction,description,key,tempo,layers:[
      {name:style==="piano"?"Felt harmony":"Harmonic lattice",color:"gold",role:"Stable consonance lets dozens of exact sync accents remain calm and readable.",events:[...bed,...piano]},
      {name:"Warning organization",color:"sky",role:"All 47 source-timed appearances and travel launches, every cluster transition, and the final settle are represented.",events:events.filter(event=>/warning appears|direct travel|flight|cluster/i.test(event.label))},
      {name:"Agent motion",color:"coral",role:"Window, badge, send, transcript-row, and exit movements use the exact authored DialKit clips.",events:events.filter(event=>/window|badge|Send|row/i.test(event.label))},
      {name:"Semantic work pulse",color:"mint",role:"Every literal typed character and each source-timed completion follows the agent-window sampler.",events:events.filter(event=>!/warning appears|direct travel|flight|cluster|window|badge|Send|row/i.test(event.label))}
    ]};
  }

  window.ANIMATION_SOUNDTRACK_STUDIES.push({
    id:"animation-15",animation:"Animation 15",title:"Warnings into Work",duration:timing.duration,
    visualSummary:"Forty-seven warnings appear and travel into six clusters before an agent window types a request, sends it, opens three transcript rows, resolves a query, and exits; each meaningful action is now tied to its rendered frame.",
    keyframes:[
      {time:1.8,image:"../poc/out/soundtrack-research/animation-15-early.png",label:"Warnings traveling toward clusters"},
      {time:3.5,image:"../poc/out/soundtrack-research/animation-15-middle.png",label:"Agent prompt and issue badge"},
      {time:4.6,image:"../poc/out/soundtrack-research/animation-15-late.png",label:"Completed query result"}
    ],
    versions:[
      makeVersion({id:"gathered-resolve",title:"Gathered Resolve",direction:"piano-led",description:"D-major felt harmony supports grouped warning grains, exact cluster arrivals, and every agent workflow movement and semantic typing landmark.",key:"D major",tempo:96,style:"piano",tones:[62,64,66,69,71,73,74],chords:chordSets.d}),
      makeVersion({id:"signal-lattice",title:"Signal Lattice",direction:"digital",description:"A-Mixolydian packets expose all appearance and launch frames, then shift to clean frame-locked interface telemetry.",key:"A Mixolydian",tempo:120,style:"digital",tones:[69,71,73,74,76,78,79],chords:chordSets.a}),
      makeVersion({id:"capable-hands",title:"Capable Hands",direction:"hybrid",description:"E-major warmth and clean plucks make organization, investigation, and resolution tactile without turning warnings into alarms.",key:"E major / C-sharp minor",tempo:108,style:"hybrid",tones:[64,66,68,71,73,75,76],chords:chordSets.e})
    ]
  });
})();
