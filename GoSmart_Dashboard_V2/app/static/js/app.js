let DATA={nodes:[],all_nodes:[],telemetry:{},logs:[],events:[],firmware:[],meta:{},devices:{}};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const pendingCommands=new Set();
const optimisticState={};
let usbTransport=null, usbLoader=null, usbPort=null, espToolModule=null;

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
    const r=await fetch("/api/data",{cache:"no-store"}); if(!r.ok) throw new Error("Session expired");
    DATA=await r.json();
    $("lastSync").textContent="Synced "+new Date().toLocaleTimeString();
    const mqttOk=DATA.mqtt_connected!==false;
    $("mqttDot").style.background=mqttOk?"#b9ff35":"#ff6b72";
    $("mqttText").textContent=mqttOk?"connected":"offline";
    renderAll();
  }catch(e){$("mqttDot").style.background="#ff6b72";$("mqttText").textContent="error";console.error(e)}
}
function renderAll(){renderOverview();renderDevices();fillNodeSelects();renderAnalytics();renderAlerts();renderLogs();renderFirmware();if($("page-control")?.classList.contains("active"))renderControl()}
function isOnline(node){return DATA.nodes.includes(node)}
function rec(node){return DATA.telemetry[node]||DATA.devices?.[node]?.telemetry||{}}
function rssi(node){return Number(rec(node).rssi??0)}
function health(node){let score=100,r=rssi(node),c=Number(rec(node).crash_count||0);if(r&&r<-70)score-=15;if(r&&r<-82)score-=15;score-=Math.min(30,c*5);return Math.max(0,score)}
function renderOverview(){
  $("statTotal").textContent=DATA.all_nodes.length;$("statOnline").textContent=DATA.nodes.length;$("statOffline").textContent=Math.max(0,DATA.all_nodes.length-DATA.nodes.length);
  const alerts=buildAlerts();$("statAlerts").textContent=alerts.length;
  $("healthList").innerHTML=DATA.all_nodes.slice(0,10).map(n=>`<div class="bar-row"><div class="bar-label"><span>${esc(deviceName(n))}</span><b>${health(n)}%</b></div><div class="bar"><i style="width:${health(n)}%"></i></div></div>`).join("")||'<span class="muted">No devices yet. Waiting for MQTT telemetry.</span>';
  $("recentActivity").innerHTML=DATA.logs.slice(-8).reverse().map(e=>`<div class="log-item"><b>${esc(e.node_id||"SYSTEM")}</b> · ${esc(e.message)}<br><span class="muted">${esc(e.time)}</span></div>`).join("")||'<span class="muted">No activity.</span>';
}
function deviceName(node){const d=DATA.devices?.[node],m=DATA.meta?.[node]||{};return d?.name||m.name||m.room||node}
function renderDevices(){
  const q=($("deviceSearch")?.value||"").toLowerCase(),f=$("deviceFilter")?.value||"all";
  const rows=DATA.all_nodes.filter(n=>{const m=DATA.meta[n]||{},text=(n+" "+deviceName(n)+" "+(m.customer||"")).toLowerCase();if(q&&!text.includes(q))return false;if(f==="online"&&!isOnline(n))return false;if(f==="offline"&&isOnline(n))return false;if(f==="warning"&&health(n)>=80)return false;return true;});
  $("deviceTable").innerHTML=rows.map(n=>{let d=rec(n);return `<tr><td><b>${esc(deviceName(n))}</b><br><span class="muted">${esc(n)} · ${esc(DATA.meta[n]?.room||"Unassigned")}</span></td><td><span class="pill ${isOnline(n)?"good":"bad"}">${isOnline(n)?"ONLINE":"OFFLINE"}</span></td><td>${esc(d.fw_version||"Unknown")}</td><td>${d.rssi??"—"} dBm</td><td>${formatUptime(d.uptime)}</td><td>${d.boot_count??0}</td><td>${d.crash_count??0}</td><td><button class="secondary" onclick="openDevice('${esc(n)}')">Control</button></td></tr>`}).join("")||'<tr><td colspan="8" class="muted">No matching devices.</td></tr>';
}
function fillNodeSelects(){["controlNode","otaNode","diagNode","metaNode"].forEach(id=>{const el=$(id);if(!el)return;const current=el.value;el.innerHTML=(id==="otaNode"?'<option value="ALL_ONLINE">ALL ONLINE</option>':"")+DATA.all_nodes.map(n=>`<option value="${esc(n)}">${esc(deviceName(n))} · ${esc(n)}</option>`).join("");if([...el.options].some(o=>o.value===current))el.value=current;});}
function openDevice(n){fillNodeSelects();$("controlNode").value=n;showPage("control");renderControl()}
function setControlFeedback(text,type="info"){$("controlFeedback").innerHTML=`<span class="feedback-dot ${type}"></span>${esc(text)}`}
function getOptimistic(node){if(!optimisticState[node])optimisticState[node]={relays:{},speed:null};return optimisticState[node]}
async function command(channel,speed,status){
  const node=$("controlNode").value;if(!node){setControlFeedback("Select a device first","error");return}
  const key=`${node}:${channel}`;if(pendingCommands.has(key))return;
  pendingCommands.add(key);setControlFeedback(`Sending command to ${deviceName(node)}…`,"busy");
  const state=getOptimistic(node);const previous={relays:{...state.relays},speed:state.speed};
  if([1,2,3,4].includes(channel))state.relays[channel]=status;
  if(channel===5)state.speed=Number(speed);
  if(channel===6)for(let i=1;i<=4;i++)state.relays[i]="ON";
  if(channel===7)for(let i=1;i<=4;i++)state.relays[i]="OFF";
  renderControl();
  try{
    const body={node_id:node,channel};if(speed!==null)body.speed=speed;if(status)body.status=status;
    const r=await fetch("/api/device/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();
    if(j.status!=="success")throw new Error(j.message||"Command failed");
    setControlFeedback(`${status||(`Fan S${speed}`)} sent · waiting for device telemetry…`,"success");
    setTimeout(()=>refresh(),350);
  }catch(e){optimisticState[node]=previous;renderControl();setControlFeedback(e.message||"Command failed","error");}
  finally{pendingCommands.delete(key);}
}
function renderControl(){
  const node=$("controlNode").value||DATA.all_nodes[0];if(!node)return;$("controlNode").value=node;
  const d=rec(node),channels=d.channels||{},opt=getOptimistic(node);
  $("relayGrid").innerHTML=[1,2,3,4].map(i=>{const actual=channels[i]?.state||channels[String(i)]?.state;const current=opt.relays[i]||actual||"OFF";const pending=pendingCommands.has(`${node}:${i}`);return `<div class="relay ${current==="ON"?"active":""}"><div><b>Relay ${i}</b><br><span class="muted">Channel ${i}</span></div><button aria-label="Toggle Relay ${i}" class="switch ${current==="ON"?"on":""} ${pending?"pending":""}" ${pending?"disabled":""} onclick="toggleRelay(${i},this)"><span>${pending?"…":""}</span></button></div>`}).join("");
  const actualSpeed=Number(d.speed||0),speed=opt.speed===null?actualSpeed:(opt.speed??actualSpeed);$("speedRow").innerHTML=[0,1,2,3,4].map(s=>{const pending=pendingCommands.has(`${node}:5`);return `<button class="${speed===s?"primary":"secondary"} ${pending?"loading":""}" ${pending?"disabled":""} onclick="command(5,${s},null)">${s===0?"OFF":"S"+s}</button>`}).join("");
  $("fanState").textContent=speed===0?"OFF":"SPEED "+speed;$("fanOrb").classList.toggle("spinning",speed>0);
}
async function toggleRelay(i,btn){const node=$("controlNode").value;const opt=getOptimistic(node);const d=rec(node);const actual=d.channels?.[i]?.state||d.channels?.[String(i)]?.state||"OFF";const current=opt.relays[i]||actual;await command(i,null,current==="ON"?"OFF":"ON")}
$("controlNode")?.addEventListener("change",()=>{const n=$("controlNode").value;if(n&&!optimisticState[n])optimisticState[n]={relays:{},speed:null};renderControl();setControlFeedback(`${deviceName(n)} selected`)});
function formatUptime(v){if(v==null)return"—";let n=Number(v);if(!Number.isFinite(n))return esc(v);let d=Math.floor(n/86400);n%=86400;let h=Math.floor(n/3600);return d?`${d}d ${h}h`:`${h}h ${Math.floor((n%3600)/60)}m`}
function renderAnalytics(){let toggles=0,hours=0,rssis=[],crashes=0,channels=[0,0,0,0,0];Object.values(DATA.telemetry).forEach(d=>{crashes+=Number(d.crash_count||0);if(d.rssi)rssis.push(Number(d.rssi));Object.entries(d.channels||{}).forEach(([k,v])=>{let i=Number(k)-1;if(i>=0&&i<5){toggles+=Number(v.toggles||0);hours+=Number(v.on_hours||0);channels[i]+=Number(v.on_hours||0)}})});$("totalToggles").textContent=toggles.toLocaleString();$("totalHours").textContent=hours.toFixed(1)+"h";$("totalCrashes").textContent=crashes;$("avgRssi").textContent=rssis.length?(rssis.reduce((a,b)=>a+b,0)/rssis.length).toFixed(0)+" dBm":"—";const max=Math.max(...channels,1);$("runtimeBars").innerHTML=channels.map((v,i)=>`<div class="bar-row"><div class="bar-label"><span>${i===4?"Fan":"Channel "+(i+1)}</span><b>${v.toFixed(1)}h</b></div><div class="bar"><i style="width:${v/max*100}%"></i></div></div>`).join("");const counts=[0,0,0];DATA.all_nodes.forEach(n=>{let h=health(n);h>=90?counts[0]++:h>=70?counts[1]++:counts[2]++});$("healthBars").innerHTML=[["Healthy",counts[0]],["Warning",counts[1]],["Critical",counts[2]]].map(x=>`<div class="bar-row"><div class="bar-label"><span>${x[0]}</span><b>${x[1]}</b></div><div class="bar"><i style="width:${DATA.all_nodes.length?x[1]/DATA.all_nodes.length*100:0}%"></i></div></div>`).join("")}
function buildAlerts(){const out=[];DATA.all_nodes.forEach(n=>{let d=rec(n),r=Number(d.rssi||0),c=Number(d.crash_count||0);if(!isOnline(n))out.push({type:"danger",node:n,msg:"Device offline"});else if(r&&r<-82)out.push({type:"warn",node:n,msg:`Weak Wi-Fi RSSI ${r} dBm`});if(c>0)out.push({type:"warn",node:n,msg:`Crash count ${c}`});});return out}
function renderAlerts(){let a=buildAlerts();$("alertsList").innerHTML=a.map(x=>`<div class="alert ${x.type}"><b>${esc(x.node)}</b> — ${esc(x.msg)}</div>`).join("")||'<div class="alert">No active alerts.</div>'}
function renderLogs(){let q=($("logFilter")?.value||"").toLowerCase();$("allLogs").innerHTML=DATA.logs.filter(x=>(x.message+" "+x.node_id).toLowerCase().includes(q)).reverse().map(x=>`<div>[${esc(x.time)}] [${esc(x.kind)}] <b>${esc(x.node_id)}</b> ${esc(x.message)}</div>`).join("")}
function renderFirmware(){let list=$("firmwareList");if(list)list.innerHTML=DATA.firmware.map(f=>`<div class="log-item"><b>${esc(f)}</b></div>`).join("")||'<span class="muted">No firmware uploaded.</span>';let sel=$("otaFile");if(sel)sel.innerHTML=DATA.firmware.map(f=>`<option>${esc(f)}</option>`).join("")}
$("uploadForm")?.addEventListener("submit",async e=>{e.preventDefault();const file=e.target.file.files[0];if(!file)return;const btn=$("uploadBtn"),status=$("uploadStatus");btn.disabled=true;status.textContent=`Uploading ${file.name}…`;try{const r=await fetch("/api/upload",{method:"POST",body:new FormData(e.target)});const j=await r.json();if(j.status!=="success")throw new Error(j.message||"Upload failed");status.textContent=`✓ ${file.name} uploaded`;e.target.reset();await refresh()}catch(err){status.textContent=`✕ ${err.message}`}finally{btn.disabled=false}});
async function sendOta(){const node=$("otaNode").value,file=$("otaFile").value;if(!file)return alert("Upload firmware first");const btn=$("otaBtn"),box=$("otaStatus");btn.disabled=true;box.className="progress-box busy-box";box.textContent=node==="ALL_ONLINE"?"Sending OTA to all online devices…":`Sending OTA to ${deviceName(node)}…`;try{const r=await fetch("/api/ota",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({node_id:node,filename:file})});const j=await r.json();if(j.status!=="success")throw new Error(j.message||"OTA failed");box.className="progress-box success-box";box.textContent=`✓ ${j.message}`;refresh()}catch(e){box.className="progress-box error-box";box.textContent=`✕ ${e.message}`}finally{btn.disabled=false}}

async function loadEspTool(){if(espToolModule)return espToolModule;if(!window.isSecureContext||!("serial" in navigator))throw new Error("USB flashing requires HTTPS and Chrome/Edge Web Serial support.");espToolModule=await import("https://unpkg.com/esptool-js@0.6.0/bundle.js");return espToolModule}
function usbLog(msg){const el=$("usbStatus");el.textContent=msg}
function usbTerminal(){return{clean(){},writeLine(data){usbLog(String(data).trim())},write(data){if(String(data).trim())usbLog(String(data).trim())}}}
async function usbDisconnect(){try{if(usbTransport)await usbTransport.disconnect()}catch(_){}usbTransport=null;usbLoader=null;usbPort=null;$("usbFlashBtn").disabled=true}
async function usbConnect(){const btn=$("usbConnectBtn");try{const mod=await loadEspTool();await usbDisconnect();usbPort=await navigator.serial.requestPort();usbTransport=new mod.Transport(usbPort,false);usbLoader=new mod.ESPLoader({transport:usbTransport,baudrate:Number($("usbBaud").value),terminal:usbTerminal()});usbLog("Connecting to ESP32…");await usbLoader.main("default_reset");let chip=usbLoader.chip?.CHIP_NAME||"ESP32";let flash="unknown";try{const kb=await usbLoader.getFlashSize();flash=kb>=1024?`${(kb/1024).toFixed(0)} MB`:`${kb} KB`}catch(_){}$("usbChip").textContent=`✓ ${chip} · Flash ${flash}`;$("usbFlashBtn").disabled=false;btn.textContent="Connected";usbLog("ESP32 detected. Choose firmware and click Flash USB.")}catch(e){await usbDisconnect();btn.textContent="Connect ESP32";$("usbChip").textContent="Not connected";usbLog(`✕ ${e.message||e}`)}}
async function usbFlash(){if(!usbLoader){usbLog("Connect ESP32 first");return}const file=$("usbFirmwareFile").files[0];if(!file){usbLog("Choose a .bin firmware file first");return}const btn=$("usbFlashBtn");btn.disabled=true;$("usbProgressBar").style.width="0%";try{const bytes=new Uint8Array(await file.arrayBuffer());const binData=Array.from(bytes,b=>String.fromCharCode(b)).join("");const addr=parseInt($("usbAddress").value,16);usbLog(`Flashing ${file.name} (${bytes.length.toLocaleString()} bytes)…`);await usbLoader.writeFlash({fileArray:[{data:binData,address:addr}],flashSize:"keep",flashMode:"keep",flashFreq:"keep",eraseAll:$("usbErase").checked,compress:true,reportProgress(_idx,written,total){const pct=total?written/total*100:0;$("usbProgressBar").style.width=`${pct}%`;usbLog(`Flashing… ${Math.round(pct)}%`)}});$("usbProgressBar").style.width="100%";usbLog("✓ Flash complete. Rebooting ESP32…");try{await usbLoader.hardReset()}catch(_){}await usbDisconnect();$("usbConnectBtn").textContent="Connect ESP32";$("usbChip").textContent="Flash complete · disconnected"}catch(e){usbLog(`✕ Flash failed: ${e.message||e}`)}finally{btn.disabled=!usbLoader}}
function renderDiagnostics(){let n=$("diagNode").value||DATA.all_nodes[0];if(!n){$("diagnosticPanel").innerHTML='<p class="muted">No device data.</p>';return}let d=rec(n),h=health(n);$("diagnosticPanel").innerHTML=`<div class="stats"><div class="stat"><span>Health</span><b>${h}%</b></div><div class="stat"><span>Status</span><b>${isOnline(n)?"ONLINE":"OFFLINE"}</b></div><div class="stat"><span>RSSI</span><b>${d.rssi??"—"}</b></div><div class="stat"><span>Firmware</span><b>${esc(d.fw_version||"Unknown")}</b></div></div><div class="alert">${isOnline(n)?"Network status is live from MQTT.":"No recent telemetry; device is considered offline."}</div><p>Boots: ${d.boot_count??0} · Crashes: ${d.crash_count??0} · Uptime: ${formatUptime(d.uptime)} · IP: ${esc(d.local_ip||"—")}</p>`}
function loadMetaForm(){let n=$("metaNode").value||DATA.all_nodes[0],m=DATA.meta[n]||{};$("metaRoom").value=m.room||"";$("metaCustomer").value=m.customer||"";$("metaWarranty").value=m.warranty||"";$("metaNotes").value=m.notes||""}
async function saveMeta(){let n=$("metaNode").value;let body={node_id:n,room:$("metaRoom").value,customer:$("metaCustomer").value,warranty:$("metaWarranty").value,notes:$("metaNotes").value};let r=await fetch("/api/meta",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});let j=await r.json();if(j.status==="success"){DATA.meta[n]=j.meta;renderDevices();alert("Saved")}}
async function localStatePrompt(){let ip=prompt("ESP32 local IP address:");if(!ip)return;let r=await fetch("/api/local/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ip})});let j=await r.json();alert(j.status==="success"?JSON.stringify(j.data,null,2):j.message)}
refresh();setInterval(refresh,5000);
