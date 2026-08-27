/* Go Smart Fan Control v2 — authoritative dashboard fan control + ACK UI.
   Additive frontend layer. Does not change ESP32 firmware or relay logic. */
(function(){
  const $=id=>document.getElementById(id);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let busy=false;
  let lastNode='';
  let lastObserved={node:'',speed:null,ts:0};
  const history=[];

  function data(){ try{return DATA||{}}catch(_){return{}} }
  function selectedNode(){return $('controlNode')?.value||data().nodes?.[0]||data().all_nodes?.[0]||''}
  function record(node){const d=data();return d.telemetry?.[node]||d.devices?.[node]?.telemetry||{}}
  function channel5(node){const c=record(node).channels||{};return c['5']||c[5]||{}}
  function currentSpeed(node){
    const r=record(node),c=channel5(node);
    let s=Number(r.speed??r.fan_speed??c.speed??0);
    if(!Number.isFinite(s))s=0;
    const st=String(c.state??c.status??(r.fan_power===false?'OFF':'')).toUpperCase();
    if(st==='OFF'||r.fan_power===false)s=0;
    return Math.max(0,Math.min(4,s));
  }
  function feedback(text,type='info'){
    if(typeof window.setControlFeedback==='function')window.setControlFeedback(text,type);
    else if($('controlFeedback'))$('controlFeedback').textContent=text;
  }
  function addHistory(node,speed,source='Dashboard'){
    history.unshift({node,speed,source,time:new Date().toLocaleTimeString()});
    if(history.length>12)history.length=12;
    renderHistory();
  }
  function ensureUi(){
    const card=$('fanState')?.closest('.fan-card'); if(!card)return;
    if(!$('fanPowerV2')){
      const power=document.createElement('button');
      power.id='fanPowerV2'; power.type='button'; power.className='fan-power-v2';
      power.innerHTML='<span class="fan-power-icon">⏻</span><span id="fanPowerLabel">Power</span>';
      $('fanState').insertAdjacentElement('afterend',power);
      power.addEventListener('click',()=>{const n=selectedNode();const s=currentSpeed(n);sendFan(s>0?0:lastRemembered(n));});
    }
    if(!$('fanAckV2')){
      const ack=document.createElement('div');ack.id='fanAckV2';ack.className='fan-ack-v2';ack.textContent='Live telemetry ready';
      $('speedRow')?.insertAdjacentElement('afterend',ack);
    }
    if(!$('fanHistoryV2')){
      const h=document.createElement('div');h.id='fanHistoryV2';h.className='fan-history-v2';
      h.innerHTML='<div class="fan-history-head"><b>Fan activity</b><span>live</span></div><div id="fanHistoryRows"></div>';
      card.appendChild(h);
    }
    if(!$('fanV2Styles')){
      const st=document.createElement('style');st.id='fanV2Styles';st.textContent=`
        .fan-power-v2{margin:12px auto 4px;min-width:150px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #24424b;background:#10242b;color:#eaf6f4;border-radius:14px;padding:11px 18px;font-weight:800}.fan-power-v2.on{background:#173c33;border-color:#4acba5;color:#85f4d2;box-shadow:0 0 0 3px rgba(74,203,165,.08)}.fan-power-v2:disabled{opacity:.55}.fan-power-icon{font-size:20px}.fan-ack-v2{margin-top:10px;min-height:34px;padding:8px 10px;border-radius:10px;border:1px solid #1c3540;background:#09171e;color:#78939c;font-size:11px;display:flex;align-items:center;justify-content:center}.fan-ack-v2.busy{color:#ffd166;border-color:#5a4c27}.fan-ack-v2.ok{color:#8cf1c9;border-color:#2a705d}.fan-ack-v2.err{color:#ff9ea6;border-color:#71383e}.fan-history-v2{margin-top:14px;text-align:left;border-top:1px solid #18313b;padding-top:12px}.fan-history-head{display:flex;justify-content:space-between;color:#8aa0aa;font-size:11px}.fan-history-head b{color:#dfecee}.fan-history-row{display:grid;grid-template-columns:74px 1fr auto;gap:8px;padding:7px 0;border-bottom:1px solid #132932;font-size:11px}.fan-history-row span{color:#78939c}.fan-history-row b{color:#dcebed}.speed-row button.fan-selected-v2{box-shadow:0 0 0 2px rgba(99,230,197,.22)}
        body.is-android .fan-power-v2{width:100%;min-height:48px;margin-top:10px}body.is-android .fan-ack-v2{font-size:12px}body.is-android .fan-history-v2{margin-top:10px}.fan-command-lock .speed-row button{pointer-events:none;opacity:.62}
      `;document.head.appendChild(st);
    }
  }
  function lastRemembered(node){
    const r=record(node);let s=Number(r.fan_speed_memory||0);if(!Number.isFinite(s)||s<1||s>4)s=3;return s;
  }
  function setAck(text,kind=''){
    const e=$('fanAckV2');if(!e)return;e.className='fan-ack-v2'+(kind?' '+kind:'');e.textContent=text;
  }
  function renderHistory(){
    const rows=$('fanHistoryRows');if(!rows)return;const node=selectedNode();
    rows.innerHTML=history.filter(x=>x.node===node).slice(0,5).map(x=>`<div class="fan-history-row"><span>${x.time}</span><b>${x.speed===0?'OFF':'Speed '+x.speed}</b><span>${x.source}</span></div>`).join('')||'<div class="fan-history-row"><span>—</span><b>No changes yet</b><span></span></div>';
  }
  function paint(){
    ensureUi();const node=selectedNode();if(!node)return;const speed=currentSpeed(node);const power=$('fanPowerV2');
    if(power){power.classList.toggle('on',speed>0);power.disabled=busy;const l=$('fanPowerLabel');if(l)l.textContent=speed>0?'Fan ON':'Fan OFF'}
    document.querySelectorAll('#speedRow button').forEach((b,i)=>b.classList.toggle('fan-selected-v2',i===speed));
    if(!busy)setAck(speed===0?'Confirmed OFF':`Confirmed · Speed ${speed}`,'ok');
    if(lastObserved.node===node&&lastObserved.speed!==null&&lastObserved.speed!==speed&&!busy)addHistory(node,speed,'Device / RF / App');
    lastObserved={node,speed,ts:Date.now()};
    if(lastNode!==node){lastNode=node;renderHistory()}
  }
  async function post(node,speed){
    const status=speed===0?'OFF':'ON';
    const r=await fetch('/api/device/control',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({node_id:node,channel:5,status,speed})});
    let j={};try{j=await r.json()}catch(_){}
    if(!r.ok||j.status!=='success')throw new Error(j.message||`Fan command failed (${r.status})`);
  }
  async function waitConfirm(node,target,timeout=4200){
    const started=Date.now();
    while(Date.now()-started<timeout){
      await sleep(450);
      try{if(typeof window.refresh==='function')await window.refresh()}catch(_){}
      if(currentSpeed(node)===target)return true;
    }
    return false;
  }
  async function sendFan(speed){
    if(busy)return;const node=selectedNode();if(!node){feedback('Select a device first','error');return}
    speed=Math.max(0,Math.min(4,Number(speed)||0));busy=true;ensureUi();$('fanState')?.closest('.fan-card')?.classList.add('fan-command-lock');paint();
    const label=speed===0?'OFF':`Speed ${speed}`;feedback(`Fan ${label} → sending…`,'busy');setAck(`Sending ${label}…`,'busy');
    try{
      await post(node,speed);
      let ok=await waitConfirm(node,speed,3600);
      if(!ok){setAck('No confirmation yet · retrying once…','busy');await post(node,speed);ok=await waitConfirm(node,speed,3000)}
      if(ok){feedback(`Fan ${label} confirmed ✓`,'success');setAck(`Device confirmed · ${label} ✓`,'ok');addHistory(node,speed,'Dashboard')}
      else{feedback(`Fan command sent but device did not confirm ${label}`,'error');setAck(`Not confirmed · device still reports ${currentSpeed(node)===0?'OFF':'Speed '+currentSpeed(node)}`,'err')}
    }catch(e){feedback(e.message||'Fan command failed','error');setAck(e.message||'Fan command failed','err')}
    finally{busy=false;$('fanState')?.closest('.fan-card')?.classList.remove('fan-command-lock');paint()}
  }

  /* Capture fan speed taps before legacy inline handlers to prevent double sends. */
  document.addEventListener('click',e=>{
    const b=e.target.closest('#speedRow button');if(!b)return;
    const buttons=[...document.querySelectorAll('#speedRow button')];const speed=buttons.indexOf(b);
    if(speed<0||speed>4)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();sendFan(speed);
  },true);

  const observer=new MutationObserver(()=>paint());
  document.addEventListener('DOMContentLoaded',()=>{ensureUi();paint();const c=$('page-control');if(c)observer.observe(c,{childList:true,subtree:true});});
  setTimeout(()=>{ensureUi();paint();const c=$('page-control');if(c)observer.observe(c,{childList:true,subtree:true})},100);
  window.goSmartFanV2={send:sendFan,paint};
})();