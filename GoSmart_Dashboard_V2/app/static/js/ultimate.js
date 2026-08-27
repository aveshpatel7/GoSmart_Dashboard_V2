/* Go Smart Ultimate Ops layer — frontend only, keeps existing control/OTA flows intact. */
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const state={apiBase:localStorage.getItem('gosmart_api_base')||'',token:sessionStorage.getItem('gosmart_admin_token')||'',stats:null,devices:[],users:[],ota:{},usage:null,cost:null,lastApiError:''};

  function injectNav(){
    const nav=document.querySelector('.sidebar nav'); if(!nav||nav.querySelector('[data-page="ultimate"]')) return;
    const b=document.createElement('button'); b.className='nav'; b.dataset.page='ultimate'; b.innerHTML='✦ <span>Ultimate Ops</span>'; nav.insertBefore(b,nav.firstChild);
    b.onclick=()=>showUltimate();
  }
  function injectPage(){
    if($('page-ultimate')) return;
    const main=document.querySelector('.main'); if(!main) return;
    const s=document.createElement('section'); s.className='page'; s.id='page-ultimate';
    s.innerHTML=`
      <div class="u-head">
        <div><span class="eyebrow">GO SMART / 4LAYERS</span><h1>Ultimate Operations</h1><p>Fleet control, diagnostics, FastAPI admin data, OTA visibility and device digital twins in one place.</p></div>
        <div class="u-head-actions"><button class="secondary" id="uPaletteBtn">⌘ Command</button><button class="primary" id="uRefreshBtn">↻ Sync All</button></div>
      </div>
      <div class="u-kpis">
        <div class="u-kpi"><span>Fleet</span><b id="uFleet">0</b><small id="uFleetSub">local dashboard</small></div>
        <div class="u-kpi"><span>Online</span><b id="uOnline">0</b><small id="uOnlineSub">—</small></div>
        <div class="u-kpi"><span>Health</span><b id="uHealth">—</b><small>average score</small></div>
        <div class="u-kpi"><span>Backend API</span><b id="uApiState">OFF</b><small id="uApiSub">not connected</small></div>
        <div class="u-kpi"><span>OTA Jobs</span><b id="uOtaJobs">0</b><small>active / recent</small></div>
        <div class="u-kpi"><span>Users</span><b id="uUsers">—</b><small>FastAPI admin</small></div>
      </div>

      <div class="u-grid u-grid-2">
        <article class="card u-card"><div class="card-head"><div><h3>FastAPI Bridge</h3><p class="muted">Connect this dashboard to your existing 4Layers backend admin API.</p></div><span id="uApiBadge" class="u-badge bad">DISCONNECTED</span></div>
          <div class="u-form"><input id="uApiBase" placeholder="https://your-fastapi-backend.example.com"><input id="uAdminUser" placeholder="Admin username"><input id="uAdminPass" type="password" placeholder="Admin password"><button class="primary" id="uApiLogin">Connect</button><button class="secondary" id="uApiLogout">Disconnect</button></div>
          <div id="uApiMsg" class="u-note">Your token is kept only in this browser session.</div>
        </article>
        <article class="card u-card"><div class="card-head"><div><h3>Command Center</h3><p class="muted">Fast access to the working control flows.</p></div></div>
          <div class="u-actions"><button data-go="control">◉ Live Control</button><button data-go="ota">⇧ OTA Center</button><button data-go="diagnostics">♡ Device Doctor</button><button data-go="logs">≡ Live Logs</button><button data-go="devices">▦ Devices</button><button data-go="alerts">! Alerts</button></div>
        </article>
      </div>

      <div class="u-grid u-grid-2">
        <article class="card u-card"><div class="card-head"><div><h3>Device Digital Twins</h3><p class="muted">Live state from the current dashboard plus admin data when available.</p></div><input id="uDeviceSearch" class="u-search" placeholder="Search node / room / firmware"></div><div id="uTwins" class="u-twins"></div></article>
        <article class="card u-card"><div class="card-head"><div><h3>Device Doctor</h3><p class="muted">Health score and actionable reasons.</p></div></div><div id="uDoctor"></div></article>
      </div>

      <div class="u-grid u-grid-2">
        <article class="card u-card"><div class="card-head"><div><h3>OTA Mission Control</h3><p class="muted">Backend OTA state + current firmware library.</p></div></div><div id="uOta"></div></article>
        <article class="card u-card"><div class="card-head"><div><h3>Operations Timeline</h3><p class="muted">Recent commands, MQTT events, OTA and device activity.</p></div></div><div id="uTimeline" class="u-timeline"></div></article>
      </div>

      <div class="u-grid u-grid-3">
        <article class="card u-card"><h3>Fleet Analytics</h3><div id="uAnalytics"></div></article>
        <article class="card u-card"><h3>Backend Users</h3><div id="uUserList"></div></article>
        <article class="card u-card"><h3>API Capability Map</h3><div class="u-cap"><span>✓ Devices</span><span>✓ Bulk control</span><span>✓ Homes / Rooms</span><span>✓ Schedules</span><span>✓ Sharing</span><span>✓ Alerts</span><span>✓ History</span><span>✓ OTA status</span><span>✓ MQTT publish</span><span>✓ Cost / Usage</span></div></article>
      </div>
    `;
    main.appendChild(s);
    bind();
  }

  function showUltimate(){
    if(typeof window.showPage==='function') window.showPage('ultimate');
    else {document.querySelectorAll('.page').forEach(x=>x.classList.remove('active')); $('page-ultimate')?.classList.add('active');}
    document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active')); document.querySelector('.nav[data-page="ultimate"]')?.classList.add('active');
    if($('pageTitle')) $('pageTitle').textContent='Ultimate Operations'; if($('pageSub')) $('pageSub').textContent='Fleet, FastAPI and service command center';
    renderAll();
  }

  function bind(){
    $('uRefreshBtn').onclick=async()=>{if(typeof window.refresh==='function') await window.refresh(); await syncApi(); renderAll();};
    $('uApiLogin').onclick=apiLogin; $('uApiLogout').onclick=apiLogout;
    $('uPaletteBtn').onclick=()=>{const q=prompt('Go to: ultimate, control, devices, ota, diagnostics, analytics, alerts, logs, rf, settings'); if(q)go(q.trim().toLowerCase())};
    $('uDeviceSearch').oninput=renderTwins;
    document.querySelectorAll('#page-ultimate [data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  }
  function go(name){if(name==='ultimate')return showUltimate(); if(typeof window.showPage==='function')window.showPage(name)}

  async function api(path,opt={}){
    if(!state.apiBase) throw new Error('FastAPI URL not configured');
    const headers={...(opt.headers||{})}; if(state.token) headers.Authorization='Bearer '+state.token; if(opt.body&&!headers['Content-Type']) headers['Content-Type']='application/json';
    const r=await fetch(state.apiBase.replace(/\/$/,'')+path,{...opt,headers,cache:'no-store'}); let j=null; try{j=await r.json()}catch(_){j=await r.text()}
    if(!r.ok) throw new Error(j?.detail||j?.message||`API ${r.status}`); return j;
  }
  async function apiLogin(){
    const base=$('uApiBase').value.trim(),username=$('uAdminUser').value.trim(),password=$('uAdminPass').value;
    if(!base||!username||!password){$('uApiMsg').textContent='Enter backend URL, admin username and password.';return}
    state.apiBase=base.replace(/\/$/,''); localStorage.setItem('gosmart_api_base',state.apiBase); $('uApiMsg').textContent='Connecting…';
    try{const j=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username,password})});state.token=j.token||j.access_token||'';sessionStorage.setItem('gosmart_admin_token',state.token);$('uAdminPass').value='';await syncApi();$('uApiMsg').textContent='Connected to 4Layers FastAPI admin API.';renderAll()}catch(e){state.token='';sessionStorage.removeItem('gosmart_admin_token');$('uApiMsg').textContent=e.message;renderApiState()}
  }
  function apiLogout(){state.token='';sessionStorage.removeItem('gosmart_admin_token');state.stats=null;state.devices=[];state.users=[];state.ota={};renderAll();$('uApiMsg').textContent='Disconnected.'}
  async function syncApi(){
    if(!state.apiBase||!state.token)return;
    const jobs=[api('/api/admin/stats'),api('/api/admin/devices'),api('/api/admin/users'),api('/api/admin/ota/status'),api('/api/admin/analytics/usage'),api('/api/admin/analytics/cost')];
    const r=await Promise.allSettled(jobs); [state.stats,state.devices,state.users,state.ota,state.usage,state.cost]=r.map(x=>x.status==='fulfilled'?x.value:null); state.lastApiError=r.find(x=>x.status==='rejected')?.reason?.message||'';
  }

  function localNodes(){return window.DATA?.all_nodes||[]}
  function rec(n){return window.DATA?.telemetry?.[n]||window.DATA?.devices?.[n]?.telemetry||{}}
  function online(n){return (window.DATA?.nodes||[]).includes(n)}
  function score(n){let s=100,d=rec(n),r=Number(d.rssi||0),c=Number(d.crash_count||0);if(!online(n))s-=55;if(r&&r<-70)s-=10;if(r&&r<-82)s-=15;s-=Math.min(25,c*5);const last=Number(d.last_seen||0);if(last&&Date.now()/1000-last>180)s-=15;return Math.max(0,s)}
  function name(n){return window.DATA?.devices?.[n]?.name||window.DATA?.meta?.[n]?.name||window.DATA?.meta?.[n]?.room||n}
  function fmtAge(ts){ts=Number(ts||0);if(!ts)return'—';const s=Math.max(0,Math.round(Date.now()/1000-ts));if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';return Math.floor(s/3600)+'h ago'}

  function renderAll(){renderApiState();renderKpis();renderTwins();renderDoctor();renderOta();renderTimeline();renderAnalytics();renderUsers()}
  function renderApiState(){
    const ok=!!(state.token&&state.stats); if($('uApiBase'))$('uApiBase').value=state.apiBase;
    if($('uApiBadge')){$('uApiBadge').textContent=ok?'CONNECTED':'DISCONNECTED';$('uApiBadge').className='u-badge '+(ok?'good':'bad')}
    if($('uApiState'))$('uApiState').textContent=ok?'LIVE':'OFF'; if($('uApiSub'))$('uApiSub').textContent=ok?'FastAPI connected':state.lastApiError||'not connected';
  }
  function renderKpis(){
    const ns=localNodes(),avg=ns.length?Math.round(ns.reduce((a,n)=>a+score(n),0)/ns.length):0;
    $('uFleet').textContent=state.stats?.total_nodes??ns.length; $('uOnline').textContent=state.stats?.online_nodes??(window.DATA?.nodes||[]).length; $('uHealth').textContent=ns.length?avg+'%':'—';
    $('uOtaJobs').textContent=state.ota?Object.keys(state.ota).length:0; $('uUsers').textContent=Array.isArray(state.users)?state.users.length:(state.stats?.total_users??'—');
    $('uFleetSub').textContent=state.stats?'FastAPI + fleet':'local dashboard'; $('uOnlineSub').textContent=state.stats?.mqtt_connected===false?'MQTT offline':'MQTT / heartbeat';
  }
  function renderTwins(){
    const q=($('uDeviceSearch')?.value||'').toLowerCase(); const apiMap={}; (Array.isArray(state.devices)?state.devices:state.devices?.devices||[]).forEach(d=>apiMap[d.node_id||d.id]=d);
    const ns=[...new Set([...localNodes(),...Object.keys(apiMap)])].filter(n=>{const d=rec(n),a=apiMap[n]||{};return (n+' '+name(n)+' '+(d.fw_version||'')+' '+(a.name||'')).toLowerCase().includes(q)});
    $('uTwins').innerHTML=ns.map(n=>{const d=rec(n),a=apiMap[n]||{},h=score(n),on=online(n)||a.is_online===true;return `<button class="u-twin" onclick="window.showPage&&window.showPage('control');setTimeout(()=>{const e=document.getElementById('controlNode');if(e&&[...e.options].some(o=>o.value==='${esc(n)}')){e.value='${esc(n)}';window.renderControl&&window.renderControl()}},20)"><div class="u-twin-top"><span class="u-dot ${on?'on':''}"></span><b>${esc(name(n))}</b><span>${h}%</span></div><small>${esc(n)}</small><div class="u-twin-grid"><span>RSSI <b>${d.rssi??a.rssi??'—'}</b></span><span>FW <b>${esc(d.fw_version||a.firmware_version||'—')}</b></span><span>Uptime <b>${esc(d.uptime??'—')}</b></span><span>Seen <b>${fmtAge(d.last_seen||a.last_seen)}</b></span></div></button>`}).join('')||'<div class="u-empty">No devices found.</div>';
  }
  function renderDoctor(){
    const rows=localNodes().map(n=>{const d=rec(n),h=score(n),reasons=[];if(!online(n))reasons.push('offline');if(Number(d.rssi||0)<-82)reasons.push('weak Wi‑Fi');if(Number(d.crash_count||0)>0)reasons.push(`${d.crash_count} crash(es)`);if(Number(d.last_seen||0)&&Date.now()/1000-d.last_seen>180)reasons.push('stale telemetry');return {n,h,reasons}}).sort((a,b)=>a.h-b.h).slice(0,8);
    $('uDoctor').innerHTML=rows.map(x=>`<div class="u-doctor-row"><div><b>${esc(name(x.n))}</b><small>${esc(x.reasons.join(' · ')||'healthy')}</small></div><span class="u-score ${x.h<60?'bad':x.h<85?'warn':'good'}">${x.h}%</span></div>`).join('')||'<div class="u-empty">No telemetry yet.</div>';
  }
  function renderOta(){
    const jobs=state.ota&&typeof state.ota==='object'?Object.entries(state.ota):[]; const files=window.DATA?.firmware||[];
    $('uOta').innerHTML=`<div class="u-mini"><b>Firmware library</b><span>${files.length} file(s)</span></div>${jobs.map(([n,j])=>`<div class="u-ota-row"><div><b>${esc(n)}</b><small>${esc(j.status||'pending')}</small></div><div class="u-progress"><i style="width:${Math.max(0,Math.min(100,Number(j.progress||0)))}%"></i></div><span>${Number(j.progress||0)}%</span></div>`).join('')||'<div class="u-empty">No active FastAPI OTA jobs. Existing OTA Center remains available.</div>'}`;
  }
  function renderTimeline(){const logs=(window.DATA?.logs||[]).slice(-14).reverse();$('uTimeline').innerHTML=logs.map(e=>`<div class="u-time"><span>${esc(e.time||'')}</span><b>${esc(e.node_id||'SYSTEM')}</b><p>${esc(e.message||e.kind||'event')}</p></div>`).join('')||'<div class="u-empty">No recent activity.</div>'}
  function renderAnalytics(){
    const ns=localNodes(),rssis=ns.map(n=>Number(rec(n).rssi)).filter(Number.isFinite),crashes=ns.reduce((a,n)=>a+Number(rec(n).crash_count||0),0); const avg=rssis.length?Math.round(rssis.reduce((a,b)=>a+b,0)/rssis.length):'—';
    $('uAnalytics').innerHTML=`<div class="u-metric"><span>Avg RSSI</span><b>${avg}${avg==='—'?'':' dBm'}</b></div><div class="u-metric"><span>Total crashes</span><b>${crashes}</b></div><div class="u-metric"><span>Usage API</span><b>${state.usage?'LIVE':'—'}</b></div><div class="u-metric"><span>Cost API</span><b>${state.cost?'LIVE':'—'}</b></div>`;
  }
  function renderUsers(){const arr=Array.isArray(state.users)?state.users:(state.users?.users||[]);$('uUserList').innerHTML=(arr||[]).slice(0,8).map(u=>`<div class="u-user"><div><b>${esc(u.name||u.username||u.email||'User')}</b><small>${esc(u.email||'')}</small></div><span class="u-badge ${u.is_active===false?'bad':'good'}">${u.is_active===false?'BLOCKED':'ACTIVE'}</span></div>`).join('')||'<div class="u-empty">Connect FastAPI to load users.</div>'}

  injectNav();injectPage();
  const baseRender=window.renderAll; if(typeof baseRender==='function') window.renderAll=function(){const r=baseRender.apply(this,arguments); if($('page-ultimate')?.classList.contains('active'))renderAll(); return r};
  if(state.apiBase&&state.token)syncApi().then(renderAll);
})();
