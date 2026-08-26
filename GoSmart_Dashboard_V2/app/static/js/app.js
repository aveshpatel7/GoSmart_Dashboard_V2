let DATA={nodes:[],all_nodes:[],telemetry:{},logs:[],events:[],firmware:[],meta:{}};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function showPage(name){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  $("page-"+name)?.classList.add("active");
  document.querySelector(`.nav[data-page="${name}"]`)?.classList.add("active");
  const titles={overview:["Overview","Fleet health and live activity"],devices:["Devices","Search and inspect your fleet"],control:["Live Control","Relay and fan commands"],rf:["RF Management","Existing firmware RF mapping"],ota:["OTA Center","Firmware library and deployment"],diagnostics:["Diagnostics","Dashboard-side health checks"],analytics:["Analytics","Runtime and fleet statistics"],alerts:["Alerts","Warnings derived from device data"],logs:["Logs","Live MQTT and device activity"],settings:["Device Meta","Rooms, customers and warranty metadata"]};
  $("pageTitle").textContent=titles[name][0]; $("pageSub").textContent=titles[name][1];
  if(name==="control") renderControl(); if(name==="diagnostics") renderDiagnostics(); if(name==="analytics") renderAnalytics(); if(name==="alerts") renderAlerts(); if(name==="logs") renderLogs(); if(name==="ota") renderFirmware(); if(name==="settings") loadMetaForm();
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$("menuBtn")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));

async function refresh(){
  try{
    const r=await fetch("/api/data"); if(!r.ok) throw new Error("Session expired");
    DATA=await r.json(); $("lastSync").textContent="Synced "+new Date().toLocaleTimeString();
    $("mqttDot").style.background="#b9ff35"; $("mqttText").textContent="connected";
    renderAll();
  }catch(e){$("mqttDot").style.background="#ff6b72";$("mqttText").textContent="error";console.error(e)}
}
function renderAll(){renderOverview();renderDevices();fillNodeSelects();renderAnalytics();renderAlerts();renderLogs();renderFirmware()}
function isOnline(node){return DATA.nodes.includes(node)}
function rec(node){return DATA.telemetry[node]||{}}
function rssi(node){return Number(rec(node).rssi??0)}
function health(node){
  let score=100, r=rssi(node), c=Number(rec(node).crash_count||0);
  if(r && r<-70)score-=15; if(r && r<-82)score-=15; score-=Math.min(30,c*5);
  return Math.max(0,score);
}
function renderOverview(){
  $("statTotal").textContent=DATA.all_nodes.length;
  $("statOnline").textContent=DATA.nodes.length;
  $("statOffline").textContent=Math.max(0,DATA.all_nodes.length-DATA.nodes.length);
  const alerts=buildAlerts(); $("statAlerts").textContent=alerts.length;
  $("healthList").innerHTML=DATA.all_nodes.slice(0,10).map(n=>`<div class="bar-row"><div class="bar-label"><span>${esc(n)}</span><b>${health(n)}%</b></div><div class="bar"><i style="width:${health(n)}%"></i></div></div>`).join("")||'<span class="muted">No devices yet. Waiting for MQTT telemetry.</span>';
  $("recentActivity").innerHTML=DATA.logs.slice(-8).reverse().map(e=>`<div class="log-item"><b>${esc(e.node_id||"SYSTEM")}</b> · ${esc(e.message)}<br><span class="muted">${esc(e.time)}</span></div>`).join("")||'<span class="muted">No activity.</span>';
}
function renderDevices(){
  const q=($("deviceSearch")?.value||"").toLowerCase(), f=$("deviceFilter")?.value||"all";
  const rows=DATA.all_nodes.filter(n=>{
    const m=DATA.meta[n]||{}, text=(n+" "+(m.room||"")+" "+(m.customer||"")).toLowerCase();
    if(q&&!text.includes(q))return false;
    if(f==="online"&&!isOnline(n))return false;if(f==="offline"&&isOnline(n))return false;
    if(f==="warning"&&health(n)>=80)return false;return true;
  });
  $("deviceTable").innerHTML=rows.map(n=>{let d=rec(n);return `<tr><td><b>${esc(n)}</b><br><span class="muted">${esc(DATA.meta[n]?.room||"Unassigned")}</span></td><td><span class="pill ${isOnline(n)?"good":"bad"}">${isOnline(n)?"ONLINE":"OFFLINE"}</span></td><td>${esc(d.fw_version||"Unknown")}</td><td>${d.rssi??"—"} dBm</td><td>${formatUptime(d.uptime)}</td><td>${d.boot_count??0}</td><td>${d.crash_count??0}</td><td><button class="secondary" onclick="openDevice('${esc(n)}')">Control</button></td></tr>`}).join("")||'<tr><td colspan="8" class="muted">No matching devices.</td></tr>';
}
function fillNodeSelects(){
  ["controlNode","otaNode","diagNode","metaNode"].forEach(id=>{
    const el=$(id); if(!el)return; const current=el.value;
    el.innerHTML=(id==="otaNode"?'<option value="ALL_ONLINE">ALL ONLINE</option>':"")+DATA.all_nodes.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if([...el.options].some(o=>o.value===current))el.value=current;
  });
}
function openDevice(n){$("controlNode").value=n;showPage("control")}
async function command(channel,speed,status){
  const node=$("controlNode").value;if(!node)return alert("Select a device");
  const body={node_id:node,channel}; if(speed!==null)body.speed=speed;if(status)body.status=status;
  const r=await fetch("/api/device/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();if(j.status!=="success")alert(j.message||"Command failed");else refresh();
}
function renderControl(){
  const node=$("controlNode").value||DATA.all_nodes[0];if(!node)return;
  $("controlNode").value=node;
  const d=rec(node), channels=d.channels||{};
  $("relayGrid").innerHTML=[1,2,3,4].map(i=>`<div class="relay"><div><b>Relay ${i}</b><br><span class="muted">Channel ${i}</span></div><button class="switch ${channels[i]?.state==="ON"?"on":""}" onclick="toggleRelay(${i},this)"></button></div>`).join("");
  $("speedRow").innerHTML=[0,1,2,3,4].map(s=>`<button class="${Number(d.speed||0)===s?"primary":"secondary"}" onclick="command(5,${s},null)">${s===0?"OFF":"S"+s}</button>`).join("");
  $("fanState").textContent=Number(d.speed||0)===0?"OFF":"SPEED "+d.speed;
}
async function toggleRelay(i,btn){const on=btn.classList.contains("on");await command(i,null,on?"OFF":"ON")}
$("controlNode")?.addEventListener("change",renderControl);
function formatUptime(v){if(v==null)return"—";let n=Number(v);if(!Number.isFinite(n))return esc(v);let d=Math.floor(n/86400);n%=86400;let h=Math.floor(n/3600);return d?`${d}d ${h}h`:`${h}h ${Math.floor((n%3600)/60)}m`}
function renderAnalytics(){
 let toggles=0,hours=0,rssis=[],crashes=0,channels=[0,0,0,0,0];
 Object.values(DATA.telemetry).forEach(d=>{crashes+=Number(d.crash_count||0);if(d.rssi)rssis.push(Number(d.rssi));Object.entries(d.channels||{}).forEach(([k,v])=>{let i=Number(k)-1;if(i>=0&&i<5){toggles+=Number(v.toggles||0);hours+=Number(v.on_hours||0);channels[i]+=Number(v.on_hours||0)}})});
 $("totalToggles").textContent=toggles.toLocaleString();$("totalHours").textContent=hours.toFixed(1)+"h";$("totalCrashes").textContent=crashes;$("avgRssi").textContent=rssis.length?(rssis.reduce((a,b)=>a+b,0)/rssis.length).toFixed(0)+" dBm":"—";
 const max=Math.max(...channels,1);$("runtimeBars").innerHTML=channels.map((v,i)=>`<div class="bar-row"><div class="bar-label"><span>${i===4?"Fan":"Channel "+(i+1)}</span><b>${v.toFixed(1)}h</b></div><div class="bar"><i style="width:${v/max*100}%"></i></div></div>`).join("");
 const counts=[0,0,0];DATA.all_nodes.forEach(n=>{let h=health(n);h>=90?counts[0]++:h>=70?counts[1]++:counts[2]++});$("healthBars").innerHTML=[["Healthy",counts[0]],["Warning",counts[1]],["Critical",counts[2]]].map((x,i)=>`<div class="bar-row"><div class="bar-label"><span>${x[0]}</span><b>${x[1]}</b></div><div class="bar"><i style="width:${DATA.all_nodes.length?x[1]/DATA.all_nodes.length*100:0}%"></i></div></div>`).join("");
}
function buildAlerts(){
 const out=[];const now=Date.now()/1000;
 DATA.all_nodes.forEach(n=>{let d=rec(n),r=Number(d.rssi||0),c=Number(d.crash_count||0);if(!isOnline(n))out.push({type:"danger",node:n,msg:"Device offline"});else if(r&&r<-82)out.push({type:"warn",node:n,msg:`Weak Wi-Fi RSSI ${r} dBm`});if(c>0)out.push({type:"warn",node:n,msg:`Crash count ${c}`});});
 return out;
}
function renderAlerts(){let a=buildAlerts();$("alertsList").innerHTML=a.map(x=>`<div class="alert ${x.type}"><b>${esc(x.node)}</b> — ${esc(x.msg)}</div>`).join("")||'<div class="alert">No active alerts.</div>'}
function renderLogs(){let q=($("logFilter")?.value||"").toLowerCase();$("allLogs").innerHTML=DATA.logs.filter(x=>(x.message+" "+x.node_id).toLowerCase().includes(q)).reverse().map(x=>`<div>[${esc(x.time)}] [${esc(x.kind)}] <b>${esc(x.node_id)}</b> ${esc(x.message)}</div>`).join("")}
function renderFirmware(){let list=$("firmwareList");if(list)list.innerHTML=DATA.firmware.map(f=>`<div class="log-item"><b>${esc(f)}</b><span class="muted"> · ${formatBytes(0)}</span></div>`).join("")||'<span class="muted">No firmware uploaded.</span>';let sel=$("otaFile");if(sel)sel.innerHTML=DATA.firmware.map(f=>`<option>${esc(f)}</option>`).join("")}
function formatBytes(n){return n?`${(n/1048576).toFixed(2)} MB`:""}
$("uploadForm")?.addEventListener("submit",async e=>{e.preventDefault();let r=await fetch("/api/upload",{method:"POST",body:new FormData(e.target)});let j=await r.json();alert(j.message||j.status);if(j.status==="success")refresh()});
async function sendOta(){let node=$("otaNode").value,file=$("otaFile").value;if(!file)return alert("Upload firmware first");let r=await fetch("/api/ota",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({node_id:node,filename:file})});let j=await r.json();$("otaStatus").textContent=j.message||j.status}
function renderDiagnostics(){let n=$("diagNode").value||DATA.all_nodes[0];if(!n){$("diagnosticPanel").innerHTML='<p class="muted">No device data.</p>';return}let d=rec(n),h=health(n);$("diagnosticPanel").innerHTML=`<div class="stats"><div class="stat"><span>Health</span><b>${h}%</b></div><div class="stat"><span>Status</span><b>${isOnline(n)?"ONLINE":"OFFLINE"}</b></div><div class="stat"><span>RSSI</span><b>${d.rssi??"—"}</b></div><div class="stat"><span>Firmware</span><b>${esc(d.fw_version||"Unknown")}</b></div></div><div class="alert">${isOnline(n)?"Network status is live from MQTT.":"No recent telemetry; device is considered offline."}</div><p>Boots: ${d.boot_count??0} · Crashes: ${d.crash_count??0} · Uptime: ${formatUptime(d.uptime)} · IP: ${esc(d.local_ip||"—")}</p>`}
function loadMetaForm(){let n=$("metaNode").value||DATA.all_nodes[0],m=DATA.meta[n]||{};$("metaRoom").value=m.room||"";$("metaCustomer").value=m.customer||"";$("metaWarranty").value=m.warranty||"";$("metaNotes").value=m.notes||""}
async function saveMeta(){let n=$("metaNode").value;let body={node_id:n,room:$("metaRoom").value,customer:$("metaCustomer").value,warranty:$("metaWarranty").value,notes:$("metaNotes").value};let r=await fetch("/api/meta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});let j=await r.json();if(j.status==="success"){DATA.meta[n]=j.meta;renderDevices();alert("Saved")}}
async function localStatePrompt(){let ip=prompt("ESP32 local IP address:");if(!ip)return;let r=await fetch("/api/local/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ip})});let j=await r.json();alert(j.status==="success"?JSON.stringify(j.data,null,2):j.message)}
refresh();setInterval(refresh,5000);
