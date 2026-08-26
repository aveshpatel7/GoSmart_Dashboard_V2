/* Go Smart hotfix layer — keeps the stable dashboard intact and only fixes
   fan/master controls + browser USB flashing + Arduino-style Serial Monitor.
   Loaded AFTER app.js. */
(function(){
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------- STABLE FAN / MASTER CONTROL ---------------- */
  async function postControl(node, channel, status, speed){
    const body = {node_id: node, channel: Number(channel)};
    if(status !== undefined && status !== null) body.status = String(status).toUpperCase();
    if(speed !== undefined && speed !== null) body.speed = Number(speed);
    const r = await fetch('/api/device/control', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body), cache: 'no-store'
    });
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if(!r.ok || j.status !== 'success') throw new Error(j.message || `Command failed (${r.status})`);
    return j;
  }

  function feedback(text, type='info'){
    if(typeof window.setControlFeedback === 'function') return window.setControlFeedback(text, type);
    const el = $('controlFeedback'); if(el) el.textContent = text;
  }

  async function robustFanCommand(speed){
    const node = $('controlNode')?.value;
    if(!node){ feedback('Select a device first','error'); return false; }
    speed = Math.max(0, Math.min(4, Number(speed)||0));
    const status = speed === 0 ? 'OFF' : 'ON';
    feedback(speed===0 ? 'Turning fan OFF…' : `Setting fan speed S${speed}…`, 'busy');
    try {
      await postControl(node, 5, status, speed);
      feedback(speed===0 ? 'Fan OFF command sent' : `Fan S${speed} command sent`, 'success');
      setTimeout(()=>{ if(typeof window.refresh==='function') window.refresh(); }, 850);
      return true;
    } catch(e){ feedback(e.message || 'Fan command failed','error'); return false; }
  }

  async function masterCommand(turnOn){
    const node = $('controlNode')?.value;
    if(!node){ feedback('Select a device first','error'); return false; }
    const status = turnOn ? 'ON' : 'OFF';
    const onBtn = $('allOnBtn'), offBtn = $('allOffBtn');
    if(onBtn) onBtn.disabled = true; if(offBtn) offBtn.disabled = true;
    feedback(turnOn ? 'Turning everything ON…' : 'Turning everything OFF…','busy');
    try {
      for(let ch=1; ch<=4; ch++){ await postControl(node, ch, status, null); await sleep(90); }
      if(turnOn){
        let d = (window.DATA?.telemetry?.[node] || window.DATA?.devices?.[node]?.telemetry || {});
        let fanSpeed = Number(d.speed || d.fan_speed_memory || 1);
        if(!Number.isFinite(fanSpeed) || fanSpeed < 1 || fanSpeed > 4) fanSpeed = 1;
        await postControl(node, 5, 'ON', fanSpeed);
      } else await postControl(node, 5, 'OFF', 0);
      feedback(turnOn ? 'ALL ON commands sent' : 'ALL OFF commands sent','success');
      setTimeout(()=>{ if(typeof window.refresh==='function') window.refresh(); }, 1000);
      return true;
    } catch(e){ feedback(e.message || 'Master command failed','error'); return false; }
    finally { if(onBtn) onBtn.disabled = false; if(offBtn) offBtn.disabled = false; }
  }

  const originalCommand = window.command;
  window.command = async function(channel, speed, status){
    channel = Number(channel);
    if(channel === 5) return robustFanCommand(speed);
    if(channel === 6) return masterCommand(true);
    if(channel === 7) return masterCommand(false);
    return originalCommand(channel, speed, status);
  };
  window.masterCommand = masterCommand;

  /* ---------------- USB / SERIAL COMMON LAYER ---------------- */
  let toolModule = null;
  let serialApi = null;
  let transport = null;
  let loader = null;
  let flashPort = null;
  let connecting = false;

  let monitorPort = null;
  let monitorReader = null;
  let monitorWriter = null;
  let monitorReading = false;
  let monitorStop = false;
  let monitorBuffer = '';

  function usbLog(msg){
    const el=$('usbStatus'); if(el) el.textContent=String(msg);
    console.log('[GoSmart USB]', msg);
  }

  function appendMonitor(text, cls=''){
    const el=$('serialOutput'); if(!el) return;
    const span=document.createElement('span');
    if(cls) span.className=cls;
    span.textContent=String(text);
    el.appendChild(span);
    if($('serialAutoscroll')?.checked !== false) el.scrollTop=el.scrollHeight;
    const maxChars=120000;
    if(el.textContent.length>maxChars){
      const keep=el.textContent.slice(-80000);
      el.textContent='[older output trimmed]\n'+keep;
    }
  }

  function monitorStatus(msg, type=''){
    const el=$('serialStatus'); if(el){ el.textContent=msg; el.dataset.type=type; }
  }

  function terminal(){
    return {
      clean(){},
      writeLine(data){ const s=String(data); if(s.trim()){ usbLog(s.trim()); appendMonitor(s+'\n','tool'); } },
      write(data){ const s=String(data); if(s.trim()){ usbLog(s.trim()); appendMonitor(s,'tool'); } }
    };
  }

  async function importFirst(urls, label){
    let last;
    for(const url of urls){
      try { return await import(url); } catch(e){ last=e; console.warn(`[GoSmart USB] ${label} import failed`,url,e); }
    }
    throw new Error(`${label} could not load. Check internet/CDN access. ${last?.message||''}`.trim());
  }

  async function getSerialApi(){
    if(serialApi) return serialApi;
    if(!window.isSecureContext) throw new Error('USB needs HTTPS. Open the deployed https:// dashboard directly in Chrome/Edge.');

    if(navigator.serial && typeof navigator.serial.requestPort === 'function'){
      serialApi = navigator.serial;
      return serialApi;
    }

    if(navigator.usb && typeof navigator.usb.requestDevice === 'function'){
      usbLog('Android/WebUSB detected. Loading USB serial compatibility…');
      const poly = await importFirst([
        'https://cdn.jsdelivr.net/npm/web-serial-polyfill@1.0.15/dist/serial.js',
        'https://unpkg.com/web-serial-polyfill@1.0.15/dist/serial.js'
      ], 'Android USB serial support');
      serialApi = poly.serial || poly.default?.serial || poly.default;
      if(!serialApi || typeof serialApi.requestPort !== 'function') throw new Error('Android USB serial layer could not start. Use Chrome and allow USB access.');
      return serialApi;
    }

    throw new Error('USB serial is not supported in this browser. Use Chrome/Edge; on Android open the site directly in Chrome, not inside an app/WebView.');
  }

  async function loadTool(){
    if(toolModule) return toolModule;
    await getSerialApi();
    toolModule = await importFirst([
      'https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/lib/index.js',
      'https://unpkg.com/esptool-js@0.6.0/lib/index.js'
    ], 'Espressif esptool-js');
    if(!toolModule?.ESPLoader || !toolModule?.Transport) throw new Error('Espressif flashing library loaded but required API was missing.');
    return toolModule;
  }

  async function cleanFlashDisconnect(){
    try { if(transport) await Promise.race([transport.disconnect(), sleep(1200)]); } catch(_){}
    transport=null; loader=null; flashPort=null; connecting=false;
    if($('usbFlashBtn')) $('usbFlashBtn').disabled=true;
  }

  /* ---------------- USB FLASH ---------------- */
  window.usbConnect = async function(){
    const btn=$('usbConnectBtn');
    if(connecting) return;
    if(monitorReading){ usbLog('Disconnect Serial Monitor first, then connect the flasher.'); return; }
    connecting=true;
    if(btn){btn.disabled=true;btn.textContent='Opening USB…';}
    if($('usbChip')) $('usbChip').textContent='Waiting for device';
    usbLog('Starting USB connection…');
    try {
      const mod=await loadTool();
      await cleanFlashDisconnect();
      connecting=true;
      usbLog('Browser device chooser should open now. Select your ESP32 USB/Serial port…');
      const api=await getSerialApi();
      flashPort=await api.requestPort({});
      if(!flashPort) throw new Error('No USB serial device selected.');
      usbLog('Device selected. Detecting ESP32 bootloader…');
      transport=new mod.Transport(flashPort,true);
      loader=new mod.ESPLoader({
        transport,
        baudrate:Number($('usbBaud')?.value||115200),
        terminal:terminal(),
        debugLogging:false
      });
      const chipName=await loader.main();
      const detected=chipName||loader.chip?.CHIP_NAME||'ESP32';
      if($('usbChip')) $('usbChip').textContent=`✓ ${detected} connected`;
      if($('usbFlashBtn')) $('usbFlashBtn').disabled=false;
      if(btn){btn.textContent='Connected';btn.disabled=false;}
      usbLog(`✓ ${detected} connected. Select a .bin and press Flash USB.`);
    } catch(e){
      try{if(transport)await Promise.race([transport.disconnect(),sleep(700)]);}catch(_){}
      transport=null;loader=null;flashPort=null;
      if(btn){btn.textContent='Connect ESP32';btn.disabled=false;}
      if($('usbChip')) $('usbChip').textContent='Not connected';
      if($('usbFlashBtn')) $('usbFlashBtn').disabled=true;
      usbLog(`✕ ${e?.message||e}`);
    } finally { connecting=false; }
  };

  window.usbFlash = async function(){
    if(!loader){usbLog('Connect ESP32 first.');return;}
    const file=$('usbFirmwareFile')?.files?.[0];
    if(!file){usbLog('Choose a .bin firmware file first.');return;}
    if(!file.name.toLowerCase().endsWith('.bin')){usbLog('Only .bin firmware files are supported.');return;}
    const btn=$('usbFlashBtn'); if(btn)btn.disabled=true;
    if($('usbProgressBar'))$('usbProgressBar').style.width='0%';
    try{
      const firmwareData=new Uint8Array(await file.arrayBuffer());
      const address=parseInt($('usbAddress')?.value||'0x10000',16);
      const flashSize=$('usbFlashSize')?.value||'4MB';
      usbLog(`Flashing ${file.name} at 0x${address.toString(16).toUpperCase()}…`);
      await loader.writeFlash({
        fileArray:[{data:firmwareData,address}],
        flashMode:'dio',flashFreq:'40m',flashSize,
        eraseAll:Boolean($('usbErase')?.checked),compress:true,
        reportProgress(_i,written,total){
          const pct=total?(written/total)*100:0;
          if($('usbProgressBar'))$('usbProgressBar').style.width=`${pct}%`;
          usbLog(`Flashing… ${Math.round(pct)}%`);
        }
      });
      if($('usbProgressBar'))$('usbProgressBar').style.width='100%';
      usbLog('✓ Flash complete. Resetting ESP32…');
      try{await loader.after('hard_reset');}catch(_){}
      try{if(transport)await Promise.race([transport.disconnect(),sleep(1000)]);}catch(_){}
      transport=null;loader=null;flashPort=null;
      if($('usbConnectBtn')){$('usbConnectBtn').textContent='Connect ESP32';$('usbConnectBtn').disabled=false;}
      if($('usbFlashBtn'))$('usbFlashBtn').disabled=true;
      if($('usbChip'))$('usbChip').textContent='Flash complete · disconnected';
      usbLog('✓ Flash successful. ESP32 rebooted. You can now open Serial Monitor.');
    }catch(e){usbLog(`✕ Flash failed: ${e?.message||e}`);if(btn)btn.disabled=false;}
  };

  /* ---------------- ARDUINO-STYLE SERIAL MONITOR ---------------- */
  function injectSerialMonitor(){
    if($('serialMonitorCard')) return;
    const ota=$('page-ota'); if(!ota) return;
    const wrap=document.createElement('div');
    wrap.className='serial-monitor-wrap';
    wrap.innerHTML=`
      <article class="card serial-monitor-card" id="serialMonitorCard">
        <div class="card-head serial-head">
          <div><h3>Serial Monitor</h3><p class="muted">Arduino-style live ESP32 serial output over USB.</p></div>
          <span class="usb-badge">SERIAL</span>
        </div>
        <div class="serial-toolbar">
          <select id="serialBaud" aria-label="Serial baud rate">
            <option value="115200" selected>115200 baud</option>
            <option value="9600">9600 baud</option><option value="57600">57600 baud</option>
            <option value="230400">230400 baud</option><option value="460800">460800 baud</option>
            <option value="921600">921600 baud</option>
          </select>
          <button id="serialConnectBtn" class="primary" type="button">Connect Serial</button>
          <button id="serialClearBtn" class="secondary" type="button">Clear</button>
          <label class="check-row"><input id="serialAutoscroll" type="checkbox" checked> Auto scroll</label>
        </div>
        <div id="serialStatus" class="serial-status">Serial disconnected</div>
        <pre id="serialOutput" class="serial-output" aria-live="polite"></pre>
        <div class="serial-send-row">
          <input id="serialSendInput" placeholder="Send text to ESP32…" autocomplete="off">
          <select id="serialLineEnding" aria-label="Line ending"><option value="nl">New Line</option><option value="crlf">Both NL & CR</option><option value="cr">Carriage Return</option><option value="none">No line ending</option></select>
          <button id="serialSendBtn" class="secondary" type="button" disabled>Send</button>
        </div>
      </article>`;
    ota.appendChild(wrap);

    if(!$('goSmartSerialStyles')){
      const style=document.createElement('style');style.id='goSmartSerialStyles';style.textContent=`
        .serial-monitor-wrap{margin-top:16px}.serial-monitor-card{padding:20px}.serial-head{margin-bottom:12px}
        .serial-toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.serial-toolbar select{min-width:150px}.serial-toolbar .check-row{margin-left:auto}
        .serial-status{font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:#91a4b0;margin:8px 0}.serial-status[data-type="ok"]{color:#b9ff35}.serial-status[data-type="err"]{color:#ff8e96}.serial-status[data-type="busy"]{color:#ffd166}
        .serial-output{margin:0;background:#02070b;border:1px solid #1a2c37;border-radius:10px;min-height:320px;max-height:520px;overflow:auto;padding:14px;color:#d9f7dc;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}.serial-output .tool{color:#7fa8bd}
        .serial-send-row{display:grid;grid-template-columns:1fr 170px 90px;gap:8px;margin-top:10px}.serial-send-row input{width:100%}
        @media(max-width:700px){.serial-toolbar{align-items:stretch}.serial-toolbar>*{flex:1}.serial-toolbar .check-row{margin-left:0;flex-basis:100%}.serial-send-row{grid-template-columns:1fr}.serial-output{min-height:250px;max-height:430px}}
      `;document.head.appendChild(style);
    }

    $('serialConnectBtn')?.addEventListener('click',()=>window.toggleSerialMonitor());
    $('serialClearBtn')?.addEventListener('click',()=>{const el=$('serialOutput');if(el)el.textContent='';});
    $('serialSendBtn')?.addEventListener('click',()=>window.serialSend());
    $('serialSendInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();window.serialSend();}});
  }

  async function closeMonitor(){
    monitorStop=true;
    try{if(monitorReader){await monitorReader.cancel();}}catch(_){}
    try{monitorReader?.releaseLock();}catch(_){}
    monitorReader=null;
    try{monitorWriter?.releaseLock();}catch(_){}
    monitorWriter=null;
    try{if(monitorPort?.readable||monitorPort?.writable)await monitorPort.close();}catch(_){}
    monitorPort=null;monitorReading=false;monitorBuffer='';
    const b=$('serialConnectBtn');if(b){b.textContent='Connect Serial';b.disabled=false;}
    if($('serialSendBtn'))$('serialSendBtn').disabled=true;
    monitorStatus('Serial disconnected');
  }

  async function serialReadLoop(){
    const decoder=new TextDecoder();
    monitorReading=true; monitorStop=false;
    try{
      while(!monitorStop && monitorPort?.readable){
        monitorReader=monitorPort.readable.getReader();
        try{
          while(!monitorStop){
            const {value,done}=await monitorReader.read();
            if(done)break;
            if(value){
              const text=decoder.decode(value,{stream:true});
              appendMonitor(text);
            }
          }
        }finally{try{monitorReader.releaseLock();}catch(_){}monitorReader=null;}
      }
    }catch(e){if(!monitorStop){appendMonitor(`\n[SERIAL ERROR] ${e?.message||e}\n`,'tool');monitorStatus(`Serial error: ${e?.message||e}`,'err');}}
    finally{if(!monitorStop)await closeMonitor();}
  }

  window.toggleSerialMonitor=async function(){
    if(monitorReading||monitorPort){await closeMonitor();return;}
    if(loader||transport){monitorStatus('Disconnect/finish USB Flash first.','err');return;}
    const btn=$('serialConnectBtn');if(btn){btn.disabled=true;btn.textContent='Opening…';}
    monitorStatus('Choose ESP32 serial port in browser popup…','busy');
    try{
      const api=await getSerialApi();
      monitorPort=await api.requestPort({});
      if(!monitorPort)throw new Error('No serial device selected.');
      const baudRate=Number($('serialBaud')?.value||115200);
      await monitorPort.open({baudRate,baudrate:baudRate,dataBits:8,stopBits:1,parity:'none',flowControl:'none',bufferSize:8192});
      if(btn){btn.disabled=false;btn.textContent='Disconnect';}
      if($('serialSendBtn'))$('serialSendBtn').disabled=false;
      monitorStatus(`Connected @ ${baudRate} baud`,'ok');
      appendMonitor(`\n--- Go Smart Serial Monitor connected @ ${baudRate} baud ---\n`,'tool');
      serialReadLoop();
    }catch(e){
      monitorPort=null;monitorReading=false;
      if(btn){btn.disabled=false;btn.textContent='Connect Serial';}
      monitorStatus(`Connect failed: ${e?.message||e}`,'err');
      appendMonitor(`[CONNECT ERROR] ${e?.message||e}\n`,'tool');
    }
  };

  window.serialSend=async function(){
    const input=$('serialSendInput');
    if(!monitorPort?.writable||!input)return;
    let text=input.value;
    const ending=$('serialLineEnding')?.value||'nl';
    if(ending==='nl')text+='\n';else if(ending==='crlf')text+='\r\n';else if(ending==='cr')text+='\r';
    try{
      monitorWriter=monitorPort.writable.getWriter();
      await monitorWriter.write(new TextEncoder().encode(text));
      monitorWriter.releaseLock();monitorWriter=null;
      input.value='';input.focus();
    }catch(e){try{monitorWriter?.releaseLock();}catch(_){}monitorWriter=null;monitorStatus(`Send failed: ${e?.message||e}`,'err');}
  };

  /* ---------------- INITIALIZATION ---------------- */
  injectSerialMonitor();
  document.addEventListener('DOMContentLoaded',injectSerialMonitor,{once:true});

  // Explicit click binding as a fallback for browsers/WebViews that mishandle inline globals.
  setTimeout(()=>{
    const btn=$('usbConnectBtn');
    if(btn){
      btn.disabled=false;
      btn.onclick=null;
      btn.addEventListener('click',e=>{e.preventDefault();window.usbConnect();});
    }
    const flash=$('usbFlashBtn');
    if(flash){flash.onclick=null;flash.addEventListener('click',e=>{e.preventDefault();window.usbFlash();});}

    if(!window.isSecureContext) usbLog('USB unavailable here: HTTPS is required.');
    else if(navigator.serial) usbLog('USB ready. Plug in ESP32 and press Connect ESP32.');
    else if(navigator.usb) usbLog('Android USB mode ready. Plug ESP32 through USB OTG and press Connect ESP32.');
    else usbLog('USB access unavailable. Open this dashboard directly in Chrome/Edge.');
  },300);

  if(navigator.serial?.addEventListener){
    navigator.serial.addEventListener('disconnect',async event=>{
      if(monitorPort && (event.target===monitorPort||event.port===monitorPort)) await closeMonitor();
      if(flashPort && (event.target===flashPort||event.port===flashPort)){
        transport=null;loader=null;flashPort=null;
        if($('usbConnectBtn')){$('usbConnectBtn').textContent='Connect ESP32';$('usbConnectBtn').disabled=false;}
        if($('usbFlashBtn'))$('usbFlashBtn').disabled=true;
        if($('usbChip'))$('usbChip').textContent='Disconnected';usbLog('USB device disconnected.');
      }
    });
  }
})();
