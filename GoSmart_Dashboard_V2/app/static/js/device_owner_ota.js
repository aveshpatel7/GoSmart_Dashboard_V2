/* Go Smart device owner + OTA selector enhancement v3.
   Keeps owner/status labels persistent even when app.js refresh rebuilds selects. */
(function(){
  const directory=new Map();
  let syncTimer=null,decorateTimer=null,mutating=false;
  const SELECT_IDS=['controlNode','diagNode','metaNode','otaNode'];

  function txt(v){return String(v??'').trim()}
  function token(){return sessionStorage.getItem('gosmart_admin_token')||''}
  function apiBase(){return (localStorage.getItem('gosmart_api_base')||'').replace(/\/$/,'')}
  function allNodes(){return Array.isArray(window.DATA?.all_nodes)?window.DATA.all_nodes:[]}
  function isOnline(node){return Array.isArray(window.DATA?.nodes)&&window.DATA.nodes.includes(node)}
  function localName(node){const d=window.DATA?.devices?.[node]||{},m=window.DATA?.meta?.[node]||{};return d.name||m.name||m.room||node}

  function loadCache(){
    try{
      const rows=JSON.parse(localStorage.getItem('gosmart_device_directory_cache')||'[]');
      if(Array.isArray(rows))rows.forEach(x=>{if(x?.node)directory.set(x.node,{owner:x.owner||'Owner unknown',device:x.device||x.node,backendOnline:x.backendOnline===true})});
      window.GoSmartDeviceDirectory=directory;
    }catch(_){ }
  }
  function saveCache(){
    try{localStorage.setItem('gosmart_device_directory_cache',JSON.stringify([...directory.entries()].map(([node,v])=>({node,...v}))))}catch(_){ }
  }

  async function syncDirectory(){
    const t=token(),base=apiBase();
    if(!t||!base){scheduleDecorate();return}
    try{
      const r=await fetch(base+'/api/admin/devices?limit=500',{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      const rows=Array.isArray(j)?j:(Array.isArray(j?.data)?j.data:(Array.isArray(j?.records)?j.records:(Array.isArray(j?.devices)?j.devices:[])));
      if(rows.length){
        directory.clear();
        rows.forEach(d=>{
          const node=txt(d.node_id||d.device_id||d.id);if(!node)return;
          const ownerObj=d.owner||d.user||{};
          const owner=txt(d.owner_username||d.username||d.owner_name||d.user_name||ownerObj.username||ownerObj.name||d.owner_email||d.email||ownerObj.email||'Owner unknown');
          const device=txt(d.name||d.device_name||d.hardware_name||node);
          directory.set(node,{owner,device,backendOnline:d.is_online===true});
        });
        saveCache();window.GoSmartDeviceDirectory=directory;
      }
      scheduleDecorate();decorateTwins();decorateDeviceTable();
    }catch(e){console.warn('Device directory sync skipped:',e.message);scheduleDecorate()}
  }

  function optionLabel(node){
    const info=directory.get(node),owner=info?.owner||'Owner unknown',name=info?.device||localName(node),status=isOnline(node)?'ONLINE':'OFFLINE';
    return `${name} · ${node} · ${owner} · ${status}`;
  }
  function desiredNodes(id){const all=allNodes();return id==='otaNode'?all.filter(isOnline):all}
  function desiredSignature(id){const nodes=desiredNodes(id);return (id==='otaNode'?'ALL_ONLINE|':'')+nodes.map(n=>`${n}:${optionLabel(n)}`).join('|')}

  function decorateOne(el){
    if(!el||mutating)return;
    const nodes=desiredNodes(el.id);
    /* Never erase a populated select while dashboard DATA is still booting. */
    if(!nodes.length&&allNodes().length===0)return;
    const sig=desiredSignature(el.id);
    if(el.dataset.ownerSignature===sig)return;
    const old=el.value;
    mutating=true;
    try{
      const frag=document.createDocumentFragment();
      if(el.id==='otaNode'){
        const o=document.createElement('option');o.value='ALL_ONLINE';o.textContent=`ALL ONLINE · ${nodes.length} ONLINE device${nodes.length===1?'':'s'}`;frag.appendChild(o);
      }
      nodes.forEach(node=>{
        const o=document.createElement('option');o.value=node;o.textContent=optionLabel(node);o.dataset.owner=directory.get(node)?.owner||'';o.dataset.online=isOnline(node)?'1':'0';frag.appendChild(o);
      });
      el.replaceChildren(frag);el.dataset.ownerSignature=sig;
      if([...el.options].some(o=>o.value===old))el.value=old;
      else if(el.id==='otaNode')el.value='ALL_ONLINE';
      else if(nodes[0])el.value=nodes[0];
      if(el.id==='otaNode')el.title='Only online devices are listed for OTA. Device, Node ID, owner and online status are shown together.';
    }finally{mutating=false}
  }
  function decorateSelects(){SELECT_IDS.forEach(id=>decorateOne(document.getElementById(id)))}
  function scheduleDecorate(){clearTimeout(decorateTimer);decorateTimer=setTimeout(decorateSelects,0)}

  function decorateTwins(){
    document.querySelectorAll('#uTwins .u-twin[data-node]').forEach(card=>{
      const node=card.dataset.node,info=directory.get(node);if(!info)return;
      let badge=card.querySelector('.owner-badge');if(!badge){badge=document.createElement('div');badge.className='owner-badge';card.querySelector('.u-twin-top')?.insertAdjacentElement('afterend',badge)}
      badge.textContent=`Owner: ${info.owner} · Node: ${node} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
    });
  }
  function decorateDeviceTable(){
    document.querySelectorAll('#deviceTable tr').forEach(tr=>{
      const first=tr.querySelector('td');if(!first)return;
      const text=first.textContent||'';const node=allNodes().find(n=>text.includes(n));if(!node)return;
      const info=directory.get(node);if(!info)return;
      let line=first.querySelector('.device-owner-line');
      if(!line){line=document.createElement('div');line.className='device-owner-line muted';first.appendChild(line)}
      line.textContent=`Owner: ${info.owner} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
    });
  }

  function watchSelects(){
    SELECT_IDS.forEach(id=>{
      const el=document.getElementById(id);if(!el||el.dataset.ownerWatch==='1')return;
      el.dataset.ownerWatch='1';
      new MutationObserver(()=>{if(!mutating){el.dataset.ownerSignature='';scheduleDecorate()}}).observe(el,{childList:true,subtree:true,characterData:true});
    });
  }
  function watchDynamic(){
    const root=document.querySelector('.main');if(!root||root.dataset.ownerGlobalWatch==='1')return;
    root.dataset.ownerGlobalWatch='1';
    new MutationObserver(()=>{watchSelects();scheduleDecorate();decorateTwins();decorateDeviceTable()}).observe(root,{childList:true,subtree:true});
  }

  function wrapRefresh(){
    const original=window.refresh;if(typeof original!=='function'||original.__ownerWrapped)return;
    const wrapped=async function(...args){const out=await original.apply(this,args);watchSelects();scheduleDecorate();decorateDeviceTable();return out};
    wrapped.__ownerWrapped=true;window.refresh=wrapped;
  }
  function wrapFillNodeSelects(){
    const original=window.fillNodeSelects;if(typeof original!=='function'||original.__ownerWrapped)return;
    const wrapped=function(...args){const out=original.apply(this,args);SELECT_IDS.forEach(id=>{const el=document.getElementById(id);if(el)el.dataset.ownerSignature=''});scheduleDecorate();return out};
    wrapped.__ownerWrapped=true;window.fillNodeSelects=wrapped;
  }

  function boot(){loadCache();wrapRefresh();wrapFillNodeSelects();watchSelects();watchDynamic();scheduleDecorate();syncDirectory();clearInterval(syncTimer);syncTimer=setInterval(()=>{wrapRefresh();wrapFillNodeSelects();watchSelects();scheduleDecorate();if(token())syncDirectory()},5000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  document.addEventListener('click',e=>{if(e.target.closest('#uApiLogin,#uRefreshBtn,.nav'))setTimeout(()=>{wrapRefresh();wrapFillNodeSelects();watchSelects();scheduleDecorate();if(token())syncDirectory()},250)},true);
  window.goSmartSyncDeviceDirectory=syncDirectory;window.goSmartDecorateDeviceSelectors=decorateSelects;
})();