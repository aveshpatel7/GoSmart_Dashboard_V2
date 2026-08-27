/* Go Smart Ultimate Ops v3 — resilient FastAPI mapping + clear admin visibility. */
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const state={
    apiBase:localStorage.getItem('gosmart_api_base')||'https://edabtynvpy.ap-south-1.awsapprunner.com',
    token:sessionStorage.getItem('gosmart_admin_token')||'',
    adminUser:sessionStorage.getItem('gosmart_admin_user')||'',
    stats:null,devices:[],users:[],ota:{},usage:null,cost:null,lastApiError:'',endpointState:{}
  };

  function injectNav(){
    const nav=document.querySelector('.sidebar nav'); if(!nav||nav.querySelector('[data-page="ultimate"]'))return;
    const b=document.createElement('button');b.className='nav';b.dataset.page='ultimate';b.innerHTML='✦ <span>Ultimate Ops</span>';nav.insertBefore(b,nav.firstChild);b.onclick=showUltimate;
  }
  function injectPage(){
    if($('page-ultimate'))return;const main=document.querySelector('.main');if(!main)return;
    const s=document.createElement('section');s.className='page';s.id='page-ultimate';s.innerHTML=`
      <div class="u-head"><div><span class="eyebrow">GO SMART / 4LAYERS</span><h1>Ultimate Operations</h1><p>One place for fleet health, users, devices, OTA, backend status and live service data.</p></div><div class="u-head-actions"><button class="secondary" id="uPaletteBtn">⌘ Command</button><button class="primary" id="uRefreshBtn">↻ Sync All</button></div></div>
      <div class="u-kpis">
        <div class="u-kpi"><span>Registered Boards</span><b id="uFleet">0</b><small id="uFleetSub">backend + dashboard</small></div>
        <div class="u-kpi"><span>Online Boards</span><b id="uOnline">0</b><small id="uOnlineSub">heartbeat / MQTT</small></div>
        <div class="u-kpi"><span>Users</span><b id="uUsers">0</b><small id="uUsersSub">registered accounts</small></div>
        <div class="u-kpi"><span>Switch Records</span><b id="uSwitches">0</b><small>backend devices</small></div>
        <div class="u-kpi"><span>Backend API</span><b id="uApiState">OFF</b><small id="uApiSub">not connected</small></div>
        <div class="u-kpi"><span>OTA Jobs</span><b id="uOtaJobs">0</b><small>active / recent</small></div>
      </div>
      <div class="u-grid u-grid-2">
        <article class="card u-card"><div class="card-head"><div><h3>Backend Session</h3><p class="muted">Your authenticated 4Layers administrator session.</p></div><span id="uApiBadge" class="u-badge bad">DISCONNECTED</span></div>
          <div id="uAdminIdentity" class="u-note">Not signed in to FastAPI.</div>
          <div class="u-form"><input id="uApiBase" placeholder="FastAPI URL"><input id="uAdminUser" placeholder="Admin username"><input id="uAdminPass" type="password" placeholder="Admin password"><button class="primary" id="uApiLogin">Connect</button><button class="secondary" id="uApiLogout">Disconnect</button></div>
          <div id="uApiMsg" class="u-note">Backend data will appear here after a successful admin login.</div>
        </article>
        <article class="card u-card"><div class="card-head"><div><h3>Backend Health</h3><p class="muted">Shows which admin endpoints are actually returning data.</p></div></div><div id="uEndpointHealth"></div></article>
      </div>
      <div class="u-grid u-grid-2">
        <article class="card u-card"><div class="card-head"><div><h3>Device Digital Twins</h3><p class="muted">Board, owner, firmware, IP, RSSI, online state and last seen.</p></div><input id="uDeviceSearch" class="u-search" placeholder="Search node / owner / firmware"></div><div id="uTwins" class="u-twins"></div></article>
        <article class="card u-card"><div class="card-head"><div><h3>Registered Users</h3><p class="muted">Username, email, phone, hardware and account state.</p></div></div><div id="uUserList"></div></article>
      </div>
      <div class="u-grid u-grid-2">
        <article class="card u-card"><div class="card-head"><div><h3>Device Doctor</h3><p class="muted">Fast health summary for every known ESP32 board.</p></div></div><div id="uDoctor"></div></article>
        <article class="card u-card"><div class="card-head"><div><h3>OTA Mission Control</h3><p class="muted">Live OTA progress from the FastAPI backend.</p></div></div><div id="uOta"></div></article>
      </div>
      <div class="u-grid u-grid-2"><article class="card u-card"><h3>Fleet Analytics</h3><div id="uAnalytics"></div></article><article class="card u-card"><h3>Operations Timeline</h3><div id="uTimeline" class="u-timeline"></div></article></div>
      <div class="u-grid u-grid-3"><article class="card u-card"><h3>Quick Control</h3><div class="u-actions"><button data-go="control">◉ Live Control</button><button data-go="ota">⇧ OTA Center</button><button data-go="diagnostics">♡ Doctor</button><button data-go="logs">≡ Logs</button><button data-go="devices">▦ Devices</button><button data-go="alerts">! Alerts</button></div></article><article class="card u-card"><h3>Current Backend</h3><div id="uBackendSummary"></div></article><article class="card u-card"><h3>Available Capabilities</h3><div class="u-cap"><span>✓ Admin users</span><span>✓ Device fleet</span><span>✓ OTA status</span><span>✓ MQTT status</span><span>✓ Usage analytics</span><span>✓ Cost analytics</span><span>✓ Firmware</span><span>✓ Remote logs</span></div></article></div>`;
    main.appendChild(s);bind();
  }
  function showUltimate(){
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$('page-ultimate')?.classList.add('active');
    document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));document.querySelector('.nav[data-page="ultimate"]')?.classList.add('active');
    if($('pageTitle'))$('pageTitle').textContent='Ultimate Operations';if($('pageSub'))$('pageSub').textContent='4Layers fleet, users, backend and service command center';renderAll();
  }
  function bind(){
    $('uRefreshBtn').onclick=async()=>{if(typeof window.refresh==='function')await window.refresh();await syncApi();renderAll()};
    $('uApiLogin').onclick=apiLogin;$('uApiLogout').onclick=apiLogout;$('uDeviceSearch').oninput=renderTwins;
    $('uPaletteBtn').onclick=()=>{const q=prompt('Go to: control, devices, ota, diagnostics, analytics, alerts, logs, rf, settings');if(q&&typeof window.showPage==='function')window.showPage(q.trim().toLowerCase())};
    document.querySelectorAll('#page-ultimate [data-go]').forEach(b=>b.onclick=()=>window.showPage&&window.showPage(b.dataset.go));
  }

  async function api(path,opt={}){
    if(!state.apiBase)throw new Error('FastAPI URL not configured');const headers={...(opt.headers||{})};if(state.token)headers.Authorization='Bearer '+state.token;if(opt.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const r=await fetch(state.apiBase.replace(/\/$/,'')+path,{...opt,headers,cache:'no-store'});let j;try{j=await r.json()}catch(_){j=await r.text()}if(!r.ok)throw new Error(j?.detail||j?.message||`HTTP ${r.status}`);return j;
  }
  async function apiLogin(){
    state.apiBase=$('uApiBase').value.trim().replace(/\/$/,'');const username=$('uAdminUser').value.trim(),password=$('uAdminPass').value;
    if(!state.apiBase||!username||!password){$('uApiMsg').textContent='Backend URL, admin username and password are required.';return}
    localStorage.setItem('gosmart_api_base',state.apiBase);$('uApiMsg').textContent='Signing in…';
    try{const j=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username,password})});state.token=j.token||j.access_token||'';state.adminUser=j.username||username;sessionStorage.setItem('gosmart_admin_token',state.token);sessionStorage.setItem('gosmart_admin_user',state.adminUser);$('uAdminPass').value='';await syncApi();$('uApiMsg').textContent='Connected. Live backend data loaded.';renderAll()}catch(e){state.token='';state.adminUser='';sessionStorage.removeItem('gosmart_admin_token');sessionStorage.removeItem('gosmart_admin_user');$('uApiMsg').textContent='Login/API error: '+e.message;renderAll()}
  }
  function apiLogout(){state.token='';state.adminUser='';state.stats=null;state.devices=[];state.users=[];state.ota={};state.usage=null;state.cost=null;state.endpointState={};sessionStorage.removeItem('gosmart_admin_token');sessionStorage.removeItem('gosmart_admin_user');renderAll()}
  function normalizeList(v){if(Array.isArray(v))return v;if(Array.isArray(v?.data))return v.data;if(Array.isArray(v?.records))return v.records;if(Array.isArray(v?.devices))return v.devices;if(Array.isArray(v?.users))return v.users;return[]}
  async function syncApi(){
    if(!state.apiBase||!state.token)return;const specs=[['stats','/api/admin/stats'],['devices','/api/admin/devices?limit=500'],['users','/api/admin/users?limit=500'],['ota','/api/admin/ota/status'],['usage','/api/admin/analytics/usage?page=1&page_size=15'],['cost','/api/admin/analytics/cost?page=1&page_size=15']];
    const settled=await Promise.allSettled(specs.map(x=>api(x[1])));state.endpointState={};settled.forEach((r,i)=>{const k=specs[i][0];state.endpointState[k]={ok:r.status==='fulfilled',error:r.status==='rejected'?r.reason.message:''};if(r.status==='fulfilled')state[k]=r.value});state.devices=normalizeList(state.devices);state.users=normalizeList(state.users);state.lastApiError=Object.values(state.endpointState).find(x=>!x.ok)?.error||'';
  }

  function localNodes(){return window.DATA?.all_nodes||[]}function localRec(n){return window.DATA?.telemetry?.[n]||window.DATA?.devices?.[n]?.telemetry||{}}function localOnline(n){return(window.DATA?.nodes||[]).includes(n)}
  function fmtAge(ts){if(!ts)return'—';let t=typeof ts==='string'?Date.parse(ts)/1000:Number(ts);if(!Number.isFinite(t)||!t)return'—';const s=Math.max(0,Math.round(Date.now()/1000-t));return s<60?s+'s ago':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':Math.floor(s/86400)+'d ago'}
  function scoreDevice(d){let s=100;if(d.is_online===false)s-=55;const r=Number(d.rssi);if(Number.isFinite(r)&&r<-70)s-=10;if(Number.isFinite(r)&&r<-82)s-=15;return Math.max(0,s)}

  function renderAll(){renderApiState();renderKpis();renderEndpoints();renderTwins();renderUsers();renderDoctor();renderOta();renderAnalytics();renderTimeline();renderBackendSummary()}
  function renderApiState(){
    if($('uApiBase'))$('uApiBase').value=state.apiBase;const connected=!!state.token;
    if($('uApiBadge')){$('uApiBadge').textContent=connected?'AUTHENTICATED':'DISCONNECTED';$('uApiBadge').className='u-badge '+(connected?'good':'bad')}
    $('uApiState').textContent=connected?'LIVE':'OFF';$('uApiSub').textContent=connected?(state.lastApiError?'partial data':'all requested endpoints synced'):'not connected';
    $('uAdminIdentity').innerHTML=connected?`<b>Signed in as ${esc(state.adminUser||'admin')}</b><br><span class="muted">${esc(state.apiBase)}</span>`:'Not signed in to FastAPI.';
  }
  function renderKpis(){
    const st=state.stats||{};$('uFleet').textContent=st.total_devices??localNodes().length;$('uOnline').textContent=st.online_devices??(window.DATA?.nodes||[]).length;$('uUsers').textContent=st.total_users??state.users.length;$('uSwitches').textContent=st.total_switches??'—';$('uOtaJobs').textContent=state.ota&&typeof state.ota==='object'?Object.keys(state.ota).length:0;$('uUsersSub').textContent=`${st.active_users??state.users.filter(x=>x.is_active!==false).length} active`;
  }
  function renderEndpoints(){const labels={stats:'Stats',devices:'Devices',users:'Users',ota:'OTA',usage:'Usage',cost:'Cost'};$('uEndpointHealth').innerHTML=Object.keys(labels).map(k=>{const x=state.endpointState[k];return `<div class="u-doctor-row"><div><b>${labels[k]}</b><small>${x?.ok?'Data received':esc(x?.error||'Not synced')}</small></div><span class="u-score ${x?.ok?'good':'bad'}">${x?.ok?'OK':'ERR'}</span></div>`}).join('')}
  function renderTwins(){
    const q=($('uDeviceSearch')?.value||'').toLowerCase();const backend=state.devices.map(d=>({node:d.node_id||d.device_id||d.id,name:d.name||d.node_id,owner:d.owner_username||d.owner_email||'Unassigned',email:d.owner_email||'',online:d.is_online===true,fw:d.firmware_version||'—',ip:d.ip_address||'—',rssi:d.rssi,last:d.last_seen,mac:d.mac_address||'—',switches:d.switch_count||0}));
    const seen=new Set(backend.map(x=>x.node));const local=localNodes().filter(n=>!seen.has(n)).map(n=>{const d=localRec(n);return{node:n,name:window.DATA?.devices?.[n]?.name||n,owner:'Dashboard discovery',online:localOnline(n),fw:d.fw_version||d.version||'—',ip:d.local_ip||'—',rssi:d.rssi,last:d.last_seen,mac:'—',switches:Object.keys(d.channels||{}).length}});
    const rows=[...backend,...local].filter(d=>(`${d.node} ${d.name} ${d.owner} ${d.email} ${d.fw}`).toLowerCase().includes(q));$('uTwins').innerHTML=rows.map(d=>`<button class="u-twin" data-node="${esc(d.node)}"><div class="u-twin-top"><span class="u-dot ${d.online?'on':''}"></span><b>${esc(d.name)}</b><span>${d.online?'ONLINE':'OFFLINE'}</span></div><small>${esc(d.node)} · ${esc(d.owner)}</small><div class="u-twin-grid"><span>Firmware <b>${esc(d.fw)}</b></span><span>RSSI <b>${esc(d.rssi??'—')}</b></span><span>IP <b>${esc(d.ip)}</b></span><span>Seen <b>${fmtAge(d.last)}</b></span><span>MAC <b>${esc(d.mac)}</b></span><span>Switches <b>${esc(d.switches)}</b></span></div></button>`).join('')||'<div class="u-empty">No device records returned.</div>';document.querySelectorAll('#uTwins .u-twin').forEach(b=>b.onclick=()=>{if(window.showPage)window.showPage('control');setTimeout(()=>{const e=$('controlNode');if(e&&[...e.options].some(o=>o.value===b.dataset.node)){e.value=b.dataset.node;window.renderControl&&window.renderControl()}},50)})
  }
  function renderUsers(){$('uUserList').innerHTML=state.users.slice(0,25).map(u=>`<div class="u-user"><div><b>${esc(u.username||u.full_name||'Unnamed')}</b><small>${esc(u.email||'No email')} · ${esc(u.phone_number||'No phone')}</small></div><div style="text-align:right"><span class="u-badge ${u.is_active===false?'bad':'good'}">${u.is_active===false?'BLOCKED':'ACTIVE'}</span><small>${u.device_count??0} devices · ${u.room_count??0} rooms</small></div></div>`).join('')||'<div class="u-empty">No users returned by backend.</div>'}
  function renderDoctor(){const rows=state.devices.length?state.devices:localNodes().map(n=>({node_id:n,is_online:localOnline(n),rssi:localRec(n).rssi,last_seen:localRec(n).last_seen,firmware_version:localRec(n).fw_version}));$('uDoctor').innerHTML=rows.slice(0,20).map(d=>{const h=scoreDevice(d),why=[];if(d.is_online===false)why.push('offline');if(Number(d.rssi)<-82)why.push('weak Wi‑Fi');if(!d.firmware_version)why.push('firmware unknown');return`<div class="u-doctor-row"><div><b>${esc(d.node_id||d.device_id||d.name||'Device')}</b><small>${esc(why.join(' · ')||'healthy')}</small></div><span class="u-score ${h<60?'bad':h<85?'warn':'good'}">${h}%</span></div>`}).join('')||'<div class="u-empty">No device health data.</div>'}
  function renderOta(){const jobs=state.ota&&typeof state.ota==='object'?Object.entries(state.ota):[];$('uOta').innerHTML=jobs.map(([n,j])=>`<div class="u-ota-row"><div><b>${esc(n)}</b><small>${esc(j.status||'pending')}</small></div><div class="u-progress"><i style="width:${Math.max(0,Math.min(100,Number(j.progress||0)))}%"></i></div><span>${Number(j.progress||0)}%</span></div>`).join('')||'<div class="u-empty">No active OTA job right now. Successful jobs disappear quickly from backend cache.</div>'}
  function renderAnalytics(){const st=state.stats||{},sum=state.cost?.summary||state.usage?.summary||{};$('uAnalytics').innerHTML=`<div class="u-metric"><span>Total users</span><b>${st.total_users??'—'}</b></div><div class="u-metric"><span>Active users</span><b>${st.active_users??'—'}</b></div><div class="u-metric"><span>Registered boards</span><b>${st.total_devices??'—'}</b></div><div class="u-metric"><span>Online boards</span><b>${st.online_devices??'—'}</b></div><div class="u-metric"><span>Total switch records</span><b>${st.total_switches??'—'}</b></div><div class="u-metric"><span>System</span><b>${esc(st.system_status||'—')}</b></div><div class="u-metric"><span>MQTT Broker</span><b>${esc(st.mqtt_broker_status||'—')}</b></div><div class="u-metric"><span>Estimated cost</span><b>${esc(sum.total_estimated_cost??sum.estimated_cost??'—')}</b></div>`}
  function renderTimeline(){const logs=(window.DATA?.logs||[]).slice(-16).reverse();$('uTimeline').innerHTML=logs.map(e=>`<div class="u-time"><span>${esc(e.time||'')}</span><b>${esc(e.node_id||'SYSTEM')}</b><p>${esc(e.message||e.kind||'')}</p></div>`).join('')||'<div class="u-empty">No live dashboard activity yet.</div>'}
  function renderBackendSummary(){const st=state.stats||{};$('uBackendSummary').innerHTML=`<div class="u-metric"><span>Admin</span><b>${esc(state.adminUser||'—')}</b></div><div class="u-metric"><span>API</span><b>${state.token?'Authenticated':'Disconnected'}</b></div><div class="u-metric"><span>System</span><b>${esc(st.system_status||'—')}</b></div><div class="u-metric"><span>MQTT</span><b>${esc(st.mqtt_broker_status||'—')}</b></div><div class="u-metric"><span>Server time</span><b>${esc(st.server_time||'—')}</b></div>`}

  function boot(){injectNav();injectPage();if(state.token)syncApi().then(renderAll).catch(()=>renderAll());else renderAll()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.showUltimate=showUltimate;
})();
