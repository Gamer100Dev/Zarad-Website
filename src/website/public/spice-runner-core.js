(() => {
  "use strict";
  // Re-authored Zarad adaptation of Subway Surfers-style systems.
  // The three-lane runner, jump/roll timing, train/ramp rules, coin trails,
  // boosts and guard pressure follow the MIT-licensed Subway Surfers WebGL
  // reference by Rohan Chacko (2019); see SUBWAY-SURFERS-SOURCE-LICENSE.txt.
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function create(){
    const s={};
    function reset(){
      Object.assign(s,{lane:0,visualLane:0,elapsed:0,speed:13.5,score:0,coins:0,
        jumpTime:0,jumpHeight:0,slideTime:0,magnet:0,jetpack:0,sneakers:0,
        stumble:0,guard:0,gameOver:false,combo:0,comboTimer:0,
        trainTop:0,missionCoins:0,missionDistance:0,nearMisses:0});
      return snapshot();
    }
    function snapshot(){return {...s};}
    function move(d){if(!s.gameOver)s.lane=clamp(s.lane+Math.sign(d),-1,1);return s.lane;}
    function jump(){if(s.gameOver||s.jumpTime>0||s.slideTime>0)return false;s.jumpTime=.001;s.trainTop=0;return true;}
    function slide(){if(s.gameOver||s.slideTime>0||s.jumpTime>0)return false;s.slideTime=.72;return true;}
    function collectCoin(){s.coins++;s.missionCoins++;s.combo=Math.min(5,s.combo+1);s.comboTimer=2.3;s.score+=Math.round(10*s.combo);return s.combo;}
    function collectPowerup(kind){if(kind==="boost-magnet")s.magnet=10;else if(kind==="boost-jetpack")s.jetpack=6.5;else if(kind==="boost-sneakers")s.sneakers=9;else if(kind==="boost-shield")s.sneakers=7;return snapshot();}
    function hit(kind){
      if(s.sneakers>0){s.sneakers=0;return "shield";}
      if(s.stumble>0.2){s.gameOver=true;return "caught";}
      s.stumble=2.9;s.guard=clamp(s.guard+.42,0,1);return "stumble";
    }
    function update(dt){
      const d=clamp(dt||0,0,.05);s.elapsed+=d;
      s.speed=Math.min(34,13.5+s.elapsed*.23);
      s.visualLane+=(s.lane-s.visualLane)*Math.min(1,d*14);
      if(s.jumpTime>0){
        s.jumpTime+=d;const t=clamp(s.jumpTime/.82,0,1);
        s.jumpHeight=Math.sin(t*Math.PI)*(s.sneakers>0?2.45:1.85);
        if(t>=1){s.jumpTime=0;s.jumpHeight=0;}
      } else if(s.jetpack>0){
        s.jumpHeight=2.55+Math.sin(s.elapsed*7)*.12;
      } else { s.jumpHeight=0; }
      if(s.slideTime>0)s.slideTime=Math.max(0,s.slideTime-d);
      if(s.magnet>0)s.magnet=Math.max(0,s.magnet-d);
      if(s.jetpack>0)s.jetpack=Math.max(0,s.jetpack-d);
      if(s.sneakers>0)s.sneakers=Math.max(0,s.sneakers-d);
      if(s.stumble>0){s.stumble=Math.max(0,s.stumble-d);s.guard=clamp(s.guard+d*.12,0,1);}
      else s.guard=Math.max(.08,s.guard-d*.045);
      if(s.comboTimer>0)s.comboTimer=Math.max(0,s.comboTimer-d);else s.combo=0;
      if(s.guard>=.985)s.gameOver=true;
      return snapshot();
    }
    reset();
    return {reset,snapshot,move,jump,slide,update,collectCoin,collectPowerup,hit,
      canJumpBarrier:()=>s.jumpHeight>(s.sneakers>0?.5:.72),
      canClearTrain:()=>s.jumpHeight>2.05,
      canRoll:()=>s.slideTime>.12,
      magnetActive:()=>s.magnet>0,
      jetpackActive:()=>s.jetpack>0};
  }
  window.ZaradRunnerCore=Object.freeze({create});
})();