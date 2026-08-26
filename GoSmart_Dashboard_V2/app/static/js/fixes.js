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

    // Optimistic visual feedback immediately.
    try {
      if(window.optimisticState){
        if(!window.optimisticState[node]) window.optimisticState[node] = {relays:{},relayAt:{},speed:null,speedAt:0};
        window.optimisticState[node].speed = speed;
        window.optimisticState[node].speedAt = Date.now();
      }
    } catch(_){}
    if(typeof window.renderControl === 'function') window.renderControl();
    feedback(speed===0 ? 'Turning fan OFF…' : `Setting fan speed S${speed}…`, 'busy');

    try {
      // Exact ESP32 protocol: channel + status + speed.
      await postControl(node, 5, status, speed);
      feedback(speed===0 ? 'Fan OFF command sent' : `Fan S${speed} command sent`, 'success');
      // A second refresh is intentional: ESP32 fan relay switching includes a delay.
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
      // Do not depend on master channel 6/7. Individual relay commands are already
      // proven on this firmware, so the dashboard fans them out reliably.
      for(let ch=1; ch<=4; ch++){
        await postControl(node, ch, status, null);
        await sleep(90);
      }

      if(turnOn){
        // Restore a sensible fan speed. Prefer dashboard-known remembered/current speed.
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

  // Replace only channel 5/6/7 handling. Relay 1-4 keep the stable original path.
  const originalCommand = window.command;
  window.command = async function(channel, speed, status){
    channel = Number(channel);
    if(channel === 5) return robustFanCommand(speed);
    if(channel === 6) return masterCommand(true);
    if(channel === 7) return masterCommand(false);
    return originalCommand(channel, speed, status);
  };
  window.masterCommand = masterCommand;

  /* -------- USB FLASH: esptool-js 0.6.0 correct API -------- */
  let toolModule = null;
  let transport = null;
  let loader = null;
  let port = null;

  function usbLog(msg){ const el=$('usbStatus'); if(el) el.textContent=String(msg); }
  function terminal(){
    return {
      clean(){},
      writeLine(data){ if(String(data).trim()) usbLog(String(data).trim()); },
      write(data){ if(String(data).trim()) usbLog(String(data).trim()); }
    };
  }

  async function loadTool(){
    if(toolModule) return toolModule;
    if(!window.isSecureContext) throw new Error('USB Flash needs HTTPS.');
    if(!('serial' in navigator)) throw new Error('Use Chrome/Edge with Web Serial support.');
    // ESM entrypoint; v0.6.0 writeFlash expects Uint8Array data.
    toolModule = await import('https://unpkg.com/esptool-js@0.6.0/lib/index.js');
    return toolModule;
  }

  async function cleanDisconnect(){
    try { if(transport) await transport.disconnect(); } catch(_){}
    transport = null; loader = null; port = null;
    if($('usbFlashBtn')) $('usbFlashBtn').disabled = true;
  }

  window.usbConnect = async function(){
    const btn=$('usbConnectBtn');
    try {
      const mod = await loadTool();
      await cleanDisconnect();
      usbLog('Choose your ESP32 serial port…');
      port = await navigator.serial.requestPort();
      // Espressif example uses tracing=true here; importantly, Transport must own the port.
      transport = new mod.Transport(port, true);
      loader = new mod.ESPLoader({
        transport,
        baudrate: Number($('usbBaud')?.value || 115200),
        terminal: terminal(),
        debugLogging: false
      });
      usbLog('Connecting and detecting chip…');
      const chipName = await loader.main();
      if($('usbChip')) $('usbChip').textContent = `✓ ${chipName || loader.chip?.CHIP_NAME || 'ESP32'} connected`;
      if($('usbFlashBtn')) $('usbFlashBtn').disabled = false;
      if(btn) btn.textContent = 'Connected';
      usbLog('Connected. Select the correct .bin/address and press Flash USB.');
    } catch(e){
      await cleanDisconnect();
      if(btn) btn.textContent='Connect ESP32';
      if($('usbChip')) $('usbChip').textContent='Not connected';
      usbLog(`✕ ${e.message || e}`);
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
      await cleanDisconnect();
      if($('usbConnectBtn')) $('usbConnectBtn').textContent='Connect ESP32';
      if($('usbChip')) $('usbChip').textContent='Flash complete · disconnected';
      usbLog('✓ Flash successful. ESP32 rebooted.');
    } catch(e){
      usbLog(`✕ Flash failed: ${e.message || e}`);
      if(btn) btn.disabled=false;
    }
  };

  navigator.serial?.addEventListener?.('disconnect', async ()=>{
    await cleanDisconnect();
    if($('usbConnectBtn')) $('usbConnectBtn').textContent='Connect ESP32';
    if($('usbChip')) $('usbChip').textContent='Disconnected';
    usbLog('USB device disconnected.');
  });
})();
