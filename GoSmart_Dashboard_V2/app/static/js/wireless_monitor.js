/* Go Smart Wireless Monitor v1 — no USB required.
   Shows dashboard MQTT/status/telemetry/remote-log events already received by backend. */
(function(){
  let snap={nodes:[],all_nodes:[],logs:[]},timer=null,lastHtml='';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function inject(){
    const page=$('page-logs');if(!page||$('wirelessMonitorCard'))return;
    const card=document.createElement('div');card.id='wirelessMonitorCard';card.className='card';card.style.marginBottom='16px';
    card.innerHTML=`<div class="card-head"><div><h3>Wireless Device Monitor</h3><p class="muted">Live MQTT/device activity without USB. Remote firmware logs appear here when the ESP32 publishes them.</p></div><span class="pill good" id="wmState">LIVE</span></div><div class="toolbar"><select id="wmNode"></select><select id="wmKind"><option value="all">All activity</option><option value="status">State / button activity</option><option value="telemetry">Telemetry</option><option value="command">Dashboard commands</option><option value="log">Remote logs</option><option value="ota">OTA</option></select><button class="secondary" id="wmClear">Clear view</button></div><div id="wmConsole" class="console" style="min-height:260px;max-height:440px"></div><div class="muted" style="margin-top:10px">Note: this can show everything already sent over MQTT. Raw <code>Serial.print()</code> text cannot travel wirelessly unless firmware publishes it to the existing remote-log topic.</div>`;
    page.insertBefore(card,page.firstChild);
    $('wmNode').addEventListener('change',render);$('wmKind').addEventListener('change',render);$('wmClear').addEventListener('click',()=>{$('wmConsole').innerHTML='';lastHtml=''});
  }

  function fillNodes(){const el=$('wmNode');if(!el)return;const old=el.value;const nodes=snap.all_nodes||[];el.innerHTML='<option value="ALL">ALL DEVICES</option>'+nodes.map(n=>`<option value="${esc(n)}">${esc(n)} · ${(snap.nodes||[]).includes(n)?'ONLINE':'OFFLINE'}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old}
  function render(){
    const box=$('wmConsole');if(!box)return;const node=$('wmNode')?.value||'ALL',kind=$('wmKind')?.value||'all';
    const rows=(snap.logs||[]).filter(x=>(node==='ALL'||x.node_id===node)&&(kind==='all'||x.kind===kind)).slice(-120).reverse();
    const html=rows.map(x=>`<div><span class="muted">[${esc(x.time||'')}]</span> <b>${esc(x.node_id||'SYSTEM')}</b> <span>[${esc(x.kind||'event')}]</span> ${esc(x.message||'')}${x.extra&&Object.keys(x.extra).length?` <span class="muted">${esc(JSON.stringify(x.extra))}</span>`:''}</div>`).join('')||'<div class="muted">No matching wireless activity yet.</div>';
    if(html!==lastHtml){box.innerHTML=html;lastHtml=html}
  }
  async function poll(){try{const r=await fetch('/api/data',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);snap=await r.json();if($('wmState')){$('wmState').textContent=snap.mqtt_connected===false?'MQTT OFFLINE':'LIVE';$('wmState').className='pill '+(snap.mqtt_connected===false?'bad':'good')}fillNodes();render()}catch(e){if($('wmState')){$('wmState').textContent='ERROR';$('wmState').className='pill bad'}}}
  function boot(){inject();poll();clearInterval(timer);timer=setInterval(()=>{if($('page-logs')?.classList.contains('active'))poll()},2000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('click',e=>{if(e.target.closest('.nav[data-page="logs"]'))setTimeout(()=>{inject();poll()},50)},true);
})();