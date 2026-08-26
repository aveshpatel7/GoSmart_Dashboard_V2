/* Go Smart hotfix layer — keeps the stable dashboard intact and only fixes
   fan/master controls + browser USB flashing. Loaded AFTER app.js. */
(function(){
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function postControl(node, channel, status, speed){
    const body = {node_id: node, channel: Number(channel)};
    if(status !== undefined && status !== null) body.status = String(status).toUpperCase();
    if(speed !== undefined && speed !== null) body.speed = Number(speed);
    const r = await fetch('/api/device/control', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if(!r.ok || j.status !== 'success') throw new Error(j.message || `Command failed (${r.status})`);
    return j;
  }

  function feedback(text, type='info'){
    if(typeof window.setControlFeedback === 'function') return window.setControlFeedback(text, type);
    const el = $('controlFeedback');
    if(el) el.textContent = text;
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
    } catch(e){
      feedback(e.message || 'Fan command failed','error');
      return false;
    }
  }

  async function masterCommand(turnOn){
    const node = $('controlNode')?.value;
    if(!node){ feedback('Select a device first','error'); return false; }
    const status = turnOn ? 'ON' : 'OFF';
    const onBtn = $('allOnBtn'), offBtn = $('allOffBtn');
    if(onBtn) onBtn.disabled = true;
    if(offBtn) offBtn.disabled = true;
    feedback(turnOn ? 'Turning everything ON…' : 'Turning everything OFF…','busy');

    try {
      for(let ch=1; ch<=4; ch++){
        await postControl(node, ch, status, null);
        await sleep(90);
      }
      if(turnOn){
        let d = (window.DATA?.telemetry?.[node] || window.DATA?.devices?.[node]?.telemetry || {});
        let fanSpeed = Number(d.speed || d.fan_speed_memory || 1);
        if(!Number.isFinite(fanSpeed) || fanSpeed < 1 || fanSpeed > 4) fanSpeed = 1;
        await postControl(node, 5, 'ON', fanSpeed);
      } else {
        await postControl(node, 5, 'OFF', 0);
      }
      feedback(turnOn ? 'ALL ON commands sent' : 'ALL OFF commands sent','success');
      setTimeout(()=>{ if(typeof window.refresh==='function') window.refresh(); }, 1000);
      return true;
    } catch(e){
      feedback(e.message || 'Master command failed','error');
      return false;
    } finally {
      if(onBtn) onBtn.disabled = false;
      if(offBtn) offBtn.disabled = false;
    }
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

  /* -------- USB FLASH: native Web Serial + Android WebUSB polyfill -------- */
  let toolModule = null;
  let serialApi = null;
  let transport = null;
  let loader = null;
  let port = null;
  let connecting = false;

  function usbLog(msg){
    const el=$('usbStatus');
    if(el) el.textContent=String(msg);
    console.log('[GoSmart USB]', msg);
  }

  function terminal(){
    return {
      clean(){},
      writeLine(data){ if(String(data).trim()) usbLog(String(data).trim()); },
      write(data){ if(String(data).trim()) usbLog(String(data).trim()); }
    };
  }

  async function getSerialApi(){
    if(serialApi) return serialApi;
    if(!window.isSecureContext) throw new Error('USB Flash needs HTTPS. Open the deployed https:// dashboard.');

    // Desktop Chrome/Edge: use the native Web Serial API.
    if(navigator.serial && typeof navigator.serial.requestPort === 'function'){
      serialApi = navigator.serial;
      return serialApi;
    }

    // Android Chrome does not expose native Web Serial. Espressif documents
    // web-serial-polyfill as the compatibility layer on top of WebUSB.
    if(navigator.usb && typeof navigator.usb.requestDevice === 'function'){
      usbLog('Android/WebUSB detected. Loading USB-to-Serial compatibility layer…');
      const poly = await import('https://unpkg.com/web-serial-polyfill@1.0.15/dist/serial.js');
      serialApi = poly.serial || poly.default?.serial || poly.default;
      if(!serialApi || typeof serialApi.requestPort !== 'function'){
        throw new Error('Web Serial compatibility layer could not start. Use Chrome and allow USB access.');
      }
      return serialApi;
    }

    throw new Error('This browser cannot access USB serial. Open this dashboard directly in Chrome/Edge, not an in-app browser.');
  }

  async function loadTool(){
    if(toolModule) return toolModule;
    await getSerialApi();
    toolModule = await import('https://unpkg.com/esptool-js@0.6.0/lib/index.js');
    if(!toolModule?.ESPLoader || !toolModule?.Transport) throw new Error('Espressif flashing library failed to load.');
    return toolModule;
  }

  async function cleanDisconnect(){
    try { if(transport) await Promise.race([transport.disconnect(), sleep(1200)]); } catch(_){}
    transport = null;
    loader = null;
    port = null;
    connecting = false;
    if($('usbFlashBtn')) $('usbFlashBtn').disabled = true;
  }

  window.usbConnect = async function(){
    const btn=$('usbConnectBtn');
    if(connecting) return;
    connecting = true;
    if(btn){ btn.disabled=true; btn.textContent='Opening USB…'; }
    if($('usbChip')) $('usbChip').textContent='Waiting for device';
    usbLog('Starting USB connection…');

    try {
      const mod = await loadTool();
      // Do not call disconnect before the chooser; some Android polyfill versions can hang there.
      transport = null; loader = null; port = null;

      usbLog('Choose your ESP32 / USB Serial device in the browser popup…');
      port = await serialApi.requestPort({});
      if(!port) throw new Error('No serial device selected.');

      usbLog('Device selected. Connecting to ESP32 bootloader…');
      transport = new mod.Transport(port, true);
      loader = new mod.ESPLoader({
        transport,
        baudrate: Number($('usbBaud')?.value || 115200),
        terminal: terminal(),
        debugLogging: false
      });

      const chipName = await loader.main();
      const detected = chipName || loader.chip?.CHIP_NAME || 'ESP32';
      if($('usbChip')) $('usbChip').textContent = `✓ ${detected} connected`;
      if($('usbFlashBtn')) $('usbFlashBtn').disabled = false;
      if(btn){ btn.textContent='Connected'; btn.disabled=false; }
      usbLog(`✓ ${detected} connected. Choose a .bin and press Flash USB.`);
    } catch(e){
      const message = e?.message || String(e);
      try { if(transport) await Promise.race([transport.disconnect(), sleep(600)]); } catch(_){}
      transport=null; loader=null; port=null;
      if(btn){ btn.textContent='Connect ESP32'; btn.disabled=false; }
      if($('usbChip')) $('usbChip').textContent='Not connected';
      if($('usbFlashBtn')) $('usbFlashBtn').disabled=true;
      usbLog(`✕ ${message}`);
    } finally {
      connecting=false;
    }
  };

  window.usbFlash = async function(){
    if(!loader){ usbLog('Connect ESP32 first.'); return; }
    const file=$('usbFirmwareFile')?.files?.[0];
    if(!file){ usbLog('Choose a .bin firmware file first.'); return; }
    if(!file.name.toLowerCase().endsWith('.bin')){ usbLog('Only .bin firmware files are supported.'); return; }

    const btn=$('usbFlashBtn');
    if(btn) btn.disabled=true;
    if($('usbProgressBar')) $('usbProgressBar').style.width='0%';

    try {
      const firmwareData = new Uint8Array(await file.arrayBuffer());
      const address = parseInt($('usbAddress')?.value || '0x10000',16);
      const flashSize = $('usbFlashSize')?.value || '4MB';
      usbLog(`Flashing ${file.name} at 0x${address.toString(16).toUpperCase()}…`);

      await loader.writeFlash({
        fileArray:[{data: firmwareData, address}],
        flashMode:'dio',
        flashFreq:'40m',
        flashSize,
        eraseAll:Boolean($('usbErase')?.checked),
        compress:true,
        reportProgress(_fileIndex,written,total){
          const pct=total ? (written/total)*100 : 0;
          if($('usbProgressBar')) $('usbProgressBar').style.width=`${pct}%`;
          usbLog(`Flashing… ${Math.round(pct)}%`);
        }
      });

      if($('usbProgressBar')) $('usbProgressBar').style.width='100%';
      usbLog('✓ Flash complete. Resetting ESP32…');
      try { await loader.after('hard_reset'); } catch(_){}
      try { if(transport) await Promise.race([transport.disconnect(), sleep(1000)]); } catch(_){}
      transport=null; loader=null; port=null;
      if($('usbConnectBtn')) { $('usbConnectBtn').textContent='Connect ESP32'; $('usbConnectBtn').disabled=false; }
      if($('usbFlashBtn')) $('usbFlashBtn').disabled=true;
      if($('usbChip')) $('usbChip').textContent='Flash complete · disconnected';
      usbLog('✓ Flash successful. ESP32 rebooted.');
    } catch(e){
      usbLog(`✕ Flash failed: ${e?.message || e}`);
      if(btn) btn.disabled=false;
    }
  };

  // Show browser capability immediately, so the Connect button never feels dead.
  setTimeout(()=>{
    const btn=$('usbConnectBtn');
    if(!btn) return;
    btn.disabled=false;
    if(!window.isSecureContext){
      usbLog('USB Flash unavailable here: HTTPS is required.');
    } else if(navigator.serial){
      usbLog('USB ready. Plug in ESP32 and press Connect ESP32.');
    } else if(navigator.usb){
      usbLog('Android USB mode ready. Plug ESP32 through USB OTG and press Connect ESP32.');
    } else {
      usbLog('USB access is not available in this browser. Open the dashboard in Chrome/Edge.');
    }
  }, 250);

  if(navigator.serial?.addEventListener){
    navigator.serial.addEventListener('disconnect', async ()=>{
      transport=null;loader=null;port=null;
      if($('usbConnectBtn')) { $('usbConnectBtn').textContent='Connect ESP32'; $('usbConnectBtn').disabled=false; }
      if($('usbFlashBtn')) $('usbFlashBtn').disabled=true;
      if($('usbChip')) $('usbChip').textContent='Disconnected';
      usbLog('USB device disconnected.');
    });
  }
})();
