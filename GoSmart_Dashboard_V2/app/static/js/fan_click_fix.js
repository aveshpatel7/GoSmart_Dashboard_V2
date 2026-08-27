/* Go Smart stable fan click fix.
   No MutationObserver, no command override, no render loop.
   It only owns fan UI clicks and posts the exact MQTT-compatible payload. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let busy=false;
  let rememberedSpeed=1;

  function selectedNode(){
    return $('controlNode')?.value || '';
  }

  function getData(){
    try { return typeof DATA !== 'undefined' ? DATA : {}; }
    catch(_) { return {}; }
  }

  function currentSpeed(){
    const node=selectedNode();
    const d=getData();
    const r=d.telemetry?.[node] || d.devices?.[node]?.telemetry || {};
    const c=r.channels?.['5'] || r.channels?.[5] || {};
    let s=Number(r.speed ?? r.fan_speed ?? c.speed ?? 0);
    if(!Number.isFinite(s)) s=0;
    const state=String(c.state ?? c.status ?? '').toUpperCase();
    if(state==='OFF' || r.fan_power===false) s=0;
    s=Math.max(0,Math.min(4,s));
    if(s>0) rememberedSpeed=s;
    return s;
  }

  function feedback(text,type='info'){
    const el=$('controlFeedback');
    if(el){
      const cls=type==='error'?'error':type==='success'?'success':type==='busy'?'busy':'';
      el.innerHTML=`<span class="feedback-dot ${cls}"></span>${String(text)}`;
    }
    if(typeof window.androidToast==='function' && (type==='success'||type==='error')){
      window.androidToast(text,type==='success'?'ok':'err');
    }
  }

  function ensurePowerButton(){
    const state=$('fanState');
    if(!state || $('fanPowerSafe')) return;
    const b=document.createElement('button');
    b.type='button';
    b.id='fanPowerSafe';
    b.className='secondary';
    b.style.margin='10px auto 2px';
    b.style.minWidth='150px';
    b.textContent='Fan Power';
    state.insertAdjacentElement('afterend',b);
    b.addEventListener('click',()=>sendFan(currentSpeed()>0?0:rememberedSpeed));
  }

  function paint(target=null){
    const speed=target===null?currentSpeed():target;
    document.querySelectorAll('#speedRow button').forEach((b,i)=>{
      b.classList.toggle('primary',i===speed);
      b.classList.toggle('secondary',i!==speed);
      b.disabled=busy;
    });
    const st=$('fanState');
    if(st) st.textContent=speed===0?'OFF':`SPEED ${speed}`;
    const orb=$('fanOrb');
    if(orb) orb.classList.toggle('spinning',speed>0);
    const p=$('fanPowerSafe');
    if(p){
      p.textContent=speed>0?'Turn Fan OFF':`Turn Fan ON · S${rememberedSpeed}`;
      p.className=speed>0?'primary':'secondary';
      p.disabled=busy;
    }
  }

  async function postFan(node,speed){
    const status=speed===0?'OFF':'ON';
    const r=await fetch('/api/device/control',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      cache:'no-store',
      body:JSON.stringify({node_id:node,channel:5,status,speed,value:speed})
    });
    let j={};
    try{ j=await r.json(); }catch(_){}
    if(!r.ok || j.status!=='success') throw new Error(j.message||`Fan command failed (${r.status})`);
    return j;
  }

  async function sendFan(rawSpeed){
    if(busy) return;
    const node=selectedNode();
    if(!node){ feedback('Select a device first','error'); return; }
    const speed=Math.max(0,Math.min(4,Number(rawSpeed)||0));
    if(speed>0) rememberedSpeed=speed;
    busy=true;
    ensurePowerButton();
    paint(speed);
    feedback(speed===0?'Turning fan OFF…':`Setting fan to S${speed}…`,'busy');
    try{
      await postFan(node,speed);
      feedback(speed===0?'Fan OFF command sent ✓':`Fan S${speed} command sent ✓`,'success');
      setTimeout(()=>{ try{ if(typeof window.refresh==='function') window.refresh(); }catch(_){} },300);
      setTimeout(()=>{ busy=false; paint(); },650);
    }catch(e){
      busy=false;
      paint();
      feedback(e.message||'Fan command failed','error');
    }
  }

  /* Capture the dynamically re-rendered S0/S1/S2/S3/S4 buttons before inline handlers. */
  document.addEventListener('click',function(e){
    const b=e.target.closest?.('#speedRow button');
    if(!b) return;
    const buttons=Array.from(document.querySelectorAll('#speedRow button'));
    const speed=buttons.indexOf(b);
    if(speed<0 || speed>4) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    sendFan(speed);
  },true);

  document.addEventListener('DOMContentLoaded',()=>{ ensurePowerButton(); paint(); });
  setTimeout(()=>{ ensurePowerButton(); paint(); },300);
  window.goSmartFanClickFix={send:sendFan,paint};
})();
