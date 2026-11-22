(() => {
  "use strict";
  const overlay=document.querySelector("#spice-game"),trigger=document.querySelector("#spice-game-trigger");
  if(!overlay||!trigger)return;
  const dialog=overlay.querySelector(".spice-game-dialog"),close=document.querySelector("#spice-game-close");
  const intro=document.querySelector("#spice-game-intro"),play=document.querySelector("#spice-game-play");
  const result=document.querySelector("#spice-game-result"),start=document.querySelector("#spice-game-start");
  const restart=document.querySelector("#spice-game-restart"),canvas=document.querySelector("#spice-runner-canvas");
  const $=id=>document.getElementById(id);
  const renderer=canvas&&window.ZaradSpiceWebGL&&window.ZaradSpiceWebGL.create(canvas);
  const core=window.ZaradRunnerCore&&window.ZaradRunnerCore.create();
  if(!dialog||!close||!intro||!play||!result||!start||!restart||!canvas)return;
  if(!renderer||!core){$("spice-runner-feedback").textContent="WebGL/game systems unavailable. Enable WebGL and refresh.";start.disabled=restart.disabled=true;return;}
  const say=(ro,en)=>document.documentElement.lang==="en"?en:ro;
  const coins=["gold","gold","gold","gold","gold"];
  const missions=[
    {ro:"Adună 30 de monede",en:"Collect 30 coins",goal:30,kind:"coins"},
    {ro:"Aleargă 500 m",en:"Run 500 m",goal:500,kind:"distance"},
    {ro:"Activează 2 power-up-uri",en:"Use 2 power-ups",goal:2,kind:"boosts"}
  ];
  let raf=0,last=0,spawnClock=0,roadScroll=0,running=false,paused=false,previousFocus=null,pointer=null;
  let objects=[],metres=0,boostsUsed=0,nearMisses=0,best=0,missionIndex=0,missionProgress=0;
  let lane=0,visualLane=0,jumpTime=0,slideTime=0,runScore=0;
  try{best=Math.max(0,Number(localStorage.getItem("zarad-subway-best")||0)||0);}catch{}
  function hud(){
    const s=core.snapshot();
    $("spice-runner-distance").textContent=Math.floor(metres)+" m";
    $("spice-runner-coins").textContent=String(s.coins);
    $("spice-runner-score").textContent=Math.floor(runScore+s.score).toLocaleString();
    $("spice-runner-best").textContent=Math.floor(best).toLocaleString();
    $("spice-runner-speed").textContent=Math.round(s.speed)+" km/h";
    $("spice-runner-mission").textContent=missions[missionIndex]?say(missions[missionIndex].ro,missions[missionIndex].en):say("Misiune completă","Mission complete");
    $("spice-runner-mission-progress").textContent=missionProgress+"/"+(missions[missionIndex]?.goal||"✓");
    $("spice-runner-mission-fill").style.width=Math.min(100,missionProgress/(missions[missionIndex]?.goal||1)*100)+"%";
    const active=s.jetpack>0?say("JETPACK","JETPACK"):s.magnet>0?say("MAGNET","MAGNET"):s.sneakers>0?say("SUPER SNEAKERS","SUPER SNEAKERS"):"";
    $("spice-runner-powerup").textContent=active;
    $("spice-runner-powerup").hidden=!active;
  }
  function feedback(ro,en){$("spice-runner-feedback").textContent=say(ro,en);}
  function draw(now){const s=core.snapshot();renderer.render({lane:s.visualLane,jumpTime:s.jumpTime,jumpHeight:s.jumpHeight,slideTime:s.slideTime,now,objects,roadScroll,chaser:s.guard,boosts:s,coins:s.coins,score:runScore+s.score});}
  function addCoinTrail(laneChoice,depth,shape){
    const n=shape==="long"?9:shape==="arc"?7:5;
    for(let i=0;i<n;i++){
      const laneOffset=shape==="arc"&&i>2&&i<5?(i===3?1:0):0;
      objects.push({kind:"coin",lane:Math.max(-1,Math.min(1,laneChoice+laneOffset)),depth:depth+i*.062,resolved:false});
    }
  }
  function spawn(){
    const laneChoice=Math.floor(Math.random()*3)-1,r=Math.random(),base=.015;
    if(r<.43){addCoinTrail(laneChoice,base,Math.random()<.25?"arc":Math.random()<.45?"long":"line");return;}
    if(r<.54){const kinds=["boost-magnet","boost-jetpack","boost-sneakers"];objects.push({kind:kinds[Math.floor(Math.random()*kinds.length)],lane:laneChoice,depth:base,resolved:false});return;}
    const pattern=Math.random();
    if(pattern<.26){ // train plus a safe adjacent lane and a coin route
      const trainLane=laneChoice;
      objects.push({kind:"train",lane:trainLane,depth:base,resolved:false,trainId:Math.random()});
      addCoinTrail(trainLane===0?1:0,base+.10,"long");
    }else if(pattern<.48){
      objects.push({kind:"barrier",lane:laneChoice,depth:base,resolved:false});
      addCoinTrail(laneChoice,base+.12,"line");
    }else if(pattern<.68)objects.push({kind:"awning",lane:laneChoice,depth:base,resolved:false});
    else if(pattern<.83)objects.push({kind:"crate",lane:laneChoice,depth:base,resolved:false});
    else{
      const other=laneChoice===0?1:0;
      objects.push({kind:"train",lane:laneChoice,depth:base,resolved:false});
      objects.push({kind:"crate",lane:other,depth:base+.06,resolved:false});
    }
  }
  function move(d){if(running&&!paused)core.move(d);}
  function jump(){if(running&&!paused)core.jump();}
  function slide(){if(running&&!paused)core.slide();}
  function pause(){
    if(!running)return;paused=!paused;
    $("spice-runner-pause").textContent=paused?say("CONTINUĂ","RESUME"):say("PAUZĂ","PAUSE");
    $("spice-runner-pause-layer").hidden=!paused;
    if(!paused)last=0;
  }
  function updateMission(s){
    if(!missions[missionIndex])return;
    const m=missions[missionIndex];
    missionProgress=m.kind==="coins"?s.coins:m.kind==="distance"?Math.floor(metres):boostsUsed;
    if(missionProgress>=m.goal){runScore+=250;missionIndex++;missionProgress=0;feedback("Misiune îndeplinită! +250 puncte","Mission complete! +250 points");}
  }
  function finish(){
    if(!running)return;running=false;stopLoop();
    overlay.classList.remove("spice-runner-gameplay");dialog.classList.remove("spice-runner-live");
    const s=core.snapshot(),score=Math.floor(runScore+s.score+metres*2),record=score>best;
    if(record){best=score;try{localStorage.setItem("zarad-subway-best",String(best));}catch{}}
    $("spice-runner-final-score").textContent=score.toLocaleString();
    $("spice-runner-final-coins").textContent=s.coins.toLocaleString();
    $("spice-runner-final-distance").textContent=Math.floor(metres)+" m";
    $("spice-runner-final-best").textContent=best.toLocaleString();
    $("spice-runner-new-best").hidden=!record;
    $("spice-runner-result-title").textContent=record?say("RECORD NOU!","NEW HIGH SCORE!"):say("AI FOST PRINS!","BUSTED!");
    $("spice-runner-result-copy").textContent=say("Ai alergat prin souk și ai strâns "+s.coins+" monede. Mai încearcă!","You raced through the souk and collected "+s.coins+" coins. Run it back!");
    play.hidden=true;result.hidden=false;hud();restart.focus();
  }
  function update(dt){
    const s=core.update(dt);lane=s.lane;visualLane=s.visualLane;jumpTime=s.jumpTime;slideTime=s.slideTime;
    const travel=s.speed*dt;metres+=travel;roadScroll=(roadScroll+travel/24)%1;spawnClock+=dt;
    if(spawnClock>Math.max(.43,.92-s.elapsed*.004)){spawnClock=0;spawn();}
    for(let i=objects.length-1;i>=0;i--){
      const o=objects[i];o.depth+=travel/43;
      const close=o.depth>=.78&&o.depth<=.86;
      const magnet=o.kind==="coin"&&core.magnetActive()&&Math.abs(o.lane-lane)<=1&&o.depth>.55&&o.depth<.9;
      if(!o.resolved&&(close||magnet)){
        o.resolved=true;
        if(o.kind==="coin"&&(o.lane===lane||magnet)){
          const combo=core.collectCoin();feedback(combo>1?"Lanț de monede x"+combo:"Monedă Zarad +10","Coin streak x"+combo+" · +10");
        }else if(o.kind.startsWith("boost-")&&o.lane===lane){
          core.collectPowerup(o.kind);boostsUsed++;
          feedback(o.kind==="boost-jetpack"?"JETPACK activat! Zboară deasupra trenurilor.":o.kind==="boost-magnet"?"Magnet activ! Monedele din benzile apropiate vin spre tine.":"Super sneakers activați! Salturi mai înalte.","Power-up activated!");
        }else if(["train","crate","barrier","awning"].includes(o.kind)&&o.lane===lane){
          let safe=false;
          if(o.kind==="crate"||o.kind==="barrier")safe=core.canJumpBarrier();
          else if(o.kind==="awning")safe=core.canRoll();
          else safe=core.canClearTrain()||core.snapshot().jetpack>0;
          if(!safe){
            if(o.kind==="train"&&core.snapshot().jumpHeight>1.15){const result=core.hit("train");if(result==="caught"){finish();return;}}
            else{const hit=core.hit(o.kind);if(hit==="caught"){finish();return;}feedback(hit==="shield"?"Power-up te-a salvat! Paznicul s-a apropiat.":"Ai lovit un obstacol! Paznicul se apropie.","Obstacle hit! The guard is catching up.");}
          }else if(o.kind==="train"&&core.snapshot().jumpHeight>1.6)feedback("Ai sărit peste tren!","Train cleared!");
        }else if(["train","crate","barrier","awning"].includes(o.kind)&&o.lane!==lane&&o.depth>.78&&o.depth<.84){nearMisses++;runScore+=5;}
      }
      if(o.depth>1.12)objects.splice(i,1);
    }
    if(s.gameOver||core.snapshot().gameOver){finish();return;}
    updateMission(core.snapshot());hud();
  }
  function frame(now){if(!running)return;if(!last)last=now;const dt=Math.min(.045,Math.max(0,(now-last)/1000));last=now;if(!paused)update(dt);draw(now);if(running)raf=requestAnimationFrame(frame);}
  function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;}
  function startGame(){
    stopLoop();overlay.classList.add("spice-runner-gameplay");dialog.classList.add("spice-runner-live");
    core.reset();objects=[];metres=0;boostsUsed=0;nearMisses=0;runScore=0;spawnClock=0;roadScroll=0;missionIndex=0;missionProgress=0;
    running=true;paused=false;intro.hidden=true;result.hidden=true;play.hidden=false;
    $("spice-runner-pause-layer").hidden=true;$("spice-runner-pause").textContent=say("PAUZĂ","PAUSE");
    feedback("Evită trenurile, sari, rostogolește-te și colectează monede!","Dodge trains, jump, roll and collect coins!");
    hud();raf=requestAnimationFrame(frame);canvas.focus();
  }
  function openGame(){previousFocus=document.activeElement;stopLoop();running=false;overlay.classList.remove("spice-runner-gameplay");dialog.classList.remove("spice-runner-live");intro.hidden=false;play.hidden=true;result.hidden=true;overlay.hidden=false;document.body.classList.add("spice-game-open");draw(0);close.focus();}
  function closeGame(){stopLoop();running=false;overlay.classList.remove("spice-runner-gameplay");dialog.classList.remove("spice-runner-live");overlay.hidden=true;document.body.classList.remove("spice-game-open");if(previousFocus?.focus)previousFocus.focus();}
  trigger.addEventListener("click",openGame);close.addEventListener("click",closeGame);start.addEventListener("click",startGame);restart.addEventListener("click",startGame);
  $("spice-runner-pause").addEventListener("click",pause);
  document.querySelectorAll("[data-runner-action]").forEach(b=>b.addEventListener("click",()=>{const a=b.dataset.runnerAction;if(a==="left")move(-1);else if(a==="right")move(1);else if(a==="jump")jump();else if(a==="slide")slide();}));
  document.addEventListener("keydown",e=>{if(overlay.hidden)return;if(e.key==="Escape"){e.preventDefault();if(running)pause();else closeGame();return;}if(!running||paused)return;const k=e.key.toLowerCase();if(k==="arrowleft"||k==="a"){e.preventDefault();move(-1);}else if(k==="arrowright"||k==="d"){e.preventDefault();move(1);}else if(k==="arrowup"||k==="w"||k===" "){e.preventDefault();jump();}else if(k==="arrowdown"||k==="s"){e.preventDefault();slide();}else if(k==="p"){e.preventDefault();pause();}});
  canvas.addEventListener("pointerdown",e=>{pointer={x:e.clientX,y:e.clientY};});
  canvas.addEventListener("pointerup",e=>{if(!pointer||!running||paused)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.max(Math.abs(dx),Math.abs(dy))<22)return;if(Math.abs(dx)>Math.abs(dy))move(dx<0?-1:1);else if(dy<0)jump();else slide();});
  canvas.addEventListener("pointercancel",()=>pointer=null);
  overlay.addEventListener("click",e=>{if(e.target===overlay)closeGame();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&running&&!paused)pause();last=0;});
  draw(0);hud();
})();