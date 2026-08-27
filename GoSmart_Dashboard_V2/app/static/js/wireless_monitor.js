/* Go Smart Wireless Serial Monitor v2 — no USB required.
   Shows all MQTT/device activity available to the dashboard for a selected Node ID. */
(function(){
  let snap={nodes:[],all_nodes:[],logs:[],events:[]},timer=null,paused=false,autoScroll=true,lastKey='';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function inject(){
    const page=$('page-logs');if(!page||$('wirelessMonitorCard'))return;
    const card=document.createElement('div');card.id='wirelessMonitorCard';card.className='card';card.style.marginBottom='16px';
    card.innerHTML=`
      <div class="card-head"><div><h3>Wireless Serial Monitor</h3><p class="muted">Select a Node ID and watch its MQTT/status/telemetry/remote-log stream without USB.</p></div><span class="pill good" id="wmState">LIVE</span></div>
      <div class="toolbar" style="flex-wrap:wrap">
        <select id="wmNode" style="min-width:330px"></select>
        <select id="wmKind"><option value="all">ALL LOGS</option><option value="status">STATUS / SWITCH / RF</option><option value="telemetry">TELEMETRY</option><option value="command">DASHBOARD COMMANDS</option><option value="log">REMOTE FIRMWARE LOGS</option><option value="ota">OTA</option><option value="info">DEVICE INFO</option><option value="error">ERRORS</option></select>
        <button class="secondary" id="wmPause">Pause</button>
        <button class="secondary" id="wmAuto">Auto-scroll ON</button>
        <button class="secondary" id="wmClear">Clear view</button>
        <button class="secondary" id="wmCopy">Copy</button>
      </div>
      <div id="wmSummary" class="muted" style="margin:8px 0 12px"></div>
      <div id="wmConsole" class="console" style="min-height:420px;max-height:620px;white-space:pre-wrap;line-height:1.55"></div>
      <div class="muted" style="margin-top:10px">This is the wireless equivalent of a Serial Monitor for data that reaches MQTT. Exact raw <code>Serial.print()</code> text appears only if the ESP32 publishes it to <code>smartnest/devices/&lt;node&gt;/logs</code>.</div>`;
    page.insertBefore(card,page.firstChild);
    $('wmNode').addEventListener('change',()=>{lastKey='';render(true)});
    $('wmKind').addEventListener('change',()=>{lastKey='';render(true)});
    $('wmPause').addEventListener('click',()=>{paused=!paused;$('wmPause').textContent=paused?'Resume':'Pause';$('wmState').textContent=paused?'PAUSED':'LIVE';$('wmState').className='pill '+(paused?'warn':'good')});
    $('wmAuto').addEventListener('click',()=>{autoScroll=!autoScroll;$('wmAuto').textContent='Auto-scroll '+(autoScroll?'ON':'OFF')});
    $('wmClear').addEventListener('click',()=>{$('wmConsole').textContent='';lastKey=''});
    $('wmCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('wmConsole').innerText||'');$('wmCopy').textContent='Copied';setTimeout(()=>$('wmCopy').textContent='Copy',1000)}catch(_){}});
  }

  function directoryInfo(node){const d=window.GoSmartDeviceDirectory;if(d&&typeof d.get==='function')return d.get(node)||{};return{}}
  function online(node){return Array.isArray(snap.nodes)&&snap.nodes.includes(node)}
  function fillNodes(){
    const el=$('wmNode');if(!el)return;const old=el.value;const nodes=snap.all_nodes||[];
    el.innerHTML='<option value="ALL">ALL DEVICES</option>'+nodes.map(n=>{const info=directoryInfo(n);return `<option value="${esc(n)}">${esc(n)} · ${esc(info.owner||'Owner unknown')} · ${online(n)?'ONLINE':'OFFLINE'}</option>`}).join('');
    if([...el.options].some(o=>o.value===old))el.value=old;else if(nodes.length)el.value=nodes.find(online)||nodes[0];
  }

  function mergedRows(){
    const map=new Map();
    [...(snap.events||[]),...(snap.logs||[])].forEach(x=>{const key=`${x.ts||x.time}|${x.kind}|${x.node_id}|${x.message}|${JSON.stringify(x.extra||{})}`;map.set(key,x)});
    return [...map.values()].sort((a,b)=>Number(a.ts||0)-Number(b.ts||0));
  }
  function rowText(x){
    const ts=x.time||new Date((Number(x.ts)||0)*1000).toLocaleTimeString();
    const payload=x.extra&&Object.keys(x.extra).length?` ${JSON.stringify(x.extra)}`:'';
    return `[${ts}] [${String(x.kind||'event').toUpperCase()}] ${x.node_id||'SYSTEM'}  ${x.message||''}${payload}`;
  }
  function render(force=false){
    if(paused&&!force)return;const box=$('wmConsole');if(!box)return;
    const node=$('wmNode')?.value||'ALL',kind=$('wmKind')?.value||'all';
    const rows=mergedRows().filter(x=>(node==='ALL'||x.node_id===node)&&(kind==='all'||x.kind===kind)).slice(-500);
    const key=rows.map(x=>`${x.ts}|${x.kind}|${x.node_id}|${x.message}`).join('\n');if(!force&&key===lastKey)return;lastKey=key;
    box.innerHTML=rows.length?rows.map(x=>`<div class="wm-line wm-${esc(x.kind||'event')}">${esc(rowText(x))}</div>`).join(''):'<div class="muted">No wireless logs for this Node ID yet.</div>';
    const n=node==='ALL'?'All devices':node;$('wmSummary').textContent=`${n} · ${online(node)?'ONLINE · ':''}${rows.length} log line${rows.length===1?'':'s'} shown`;
    if(autoScroll)box.scrollTop=box.scrollHeight;
  }

  async function poll(){
    if(paused)return;
    try{
      const r=await fetch('/api/data',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);snap=await r.json();
      if($('wmState')){$('wmState').textContent=snap.mqtt_connected===false?'MQTT OFFLINE':'LIVE';$('wmState').className='pill '+(snap.mqtt_connected===false?'bad':'good')}
      fillNodes();render();
    }catch(e){if($('wmState')){$('wmState').textContent='ERROR';$('wmState').className='pill bad'}if($('wmSummary'))$('wmSummary').textContent='Monitor error: '+e.message}
  }
  function boot(){inject();poll();clearInterval(timer);timer=setInterval(()=>{if($('page-logs')?.classList.contains('active'))poll()},1500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('click',e=>{if(e.target.closest('.nav[data-page="logs"]'))setTimeout(()=>{inject();poll()},50)},true);
})();