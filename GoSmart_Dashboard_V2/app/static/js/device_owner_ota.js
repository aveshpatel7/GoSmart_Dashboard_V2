/* Go Smart device owner + OTA selector enhancement.
   Uses existing FastAPI admin token; does not change MQTT/control/OTA backend logic. */
(function(){
  const directory=new Map();
  let syncTimer=null;

  function escText(v){return String(v??'').trim()}
  function token(){return sessionStorage.getItem('gosmart_admin_token')||''}
  function apiBase(){return (localStorage.getItem('gosmart_api_base')||'').replace(/\/$/,'')}
  function isOnline(node){return Array.isArray(window.DATA?.nodes)&&window.DATA.nodes.includes(node)}
  function localName(node){const d=window.DATA?.devices?.[node]||{},m=window.DATA?.meta?.[node]||{};return d.name||m.name||m.room||node}

  async function syncDirectory(){
    const t=token(),base=apiBase();
    if(!t||!base){decorateSelects();return}
    try{
      const r=await fetch(base+'/api/admin/devices?limit=500',{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      const rows=Array.isArray(j)?j:(Array.isArray(j?.data)?j.data:(Array.isArray(j?.records)?j.records:(Array.isArray(j?.devices)?j.devices:[])));
      directory.clear();
      rows.forEach(d=>{
        const node=escText(d.node_id||d.device_id||d.id);
        if(!node)return;
        const owner=escText(d.owner_username||d.username||d.owner_name||d.user_name||d.owner_email||d.email||'Unassigned');
        const device=escText(d.name||d.device_name||node);
        directory.set(node,{owner,device,backendOnline:d.is_online===true});
      });
      window.GoSmartDeviceDirectory=directory;
      decorateSelects();decorateTwins();
    }catch(e){console.warn('Device directory sync skipped:',e.message);decorateSelects()}
  }

  function optionLabel(node){
    const info=directory.get(node);const owner=info?.owner||'Owner unknown';const name=info?.device||localName(node);const status=isOnline(node)?'ONLINE':'OFFLINE';
    return `${name} · ${node} · ${owner} · ${status}`;
  }

  function replaceOptions(el,nodes,includeAll){
    if(!el)return;
    const old=el.value;
    const frag=document.createDocumentFragment();
    if(includeAll){const o=document.createElement('option');o.value='ALL_ONLINE';o.textContent=`ALL ONLINE · ${nodes.length} device${nodes.length===1?'':'s'}`;frag.appendChild(o)}
    nodes.forEach(node=>{const o=document.createElement('option');o.value=node;o.textContent=optionLabel(node);o.dataset.owner=directory.get(node)?.owner||'';o.dataset.online=isOnline(node)?'1':'0';frag.appendChild(o)});
    el.replaceChildren(frag);
    if([...el.options].some(o=>o.value===old))el.value=old;
    else if(includeAll)el.value='ALL_ONLINE';
    else if(nodes[0])el.value=nodes[0];
  }

  function decorateSelects(){
    const all=Array.isArray(window.DATA?.all_nodes)?window.DATA.all_nodes:[];
    const online=all.filter(isOnline);
    replaceOptions(document.getElementById('otaNode'),online,true);
    ['controlNode','diagNode','metaNode'].forEach(id=>replaceOptions(document.getElementById(id),all,false));
    const ota=document.getElementById('otaNode');
    if(ota){ota.title='OTA list shows online devices only. Each row includes owner and live status.'}
  }

  function decorateTwins(){
    document.querySelectorAll('#uTwins .u-twin[data-node]').forEach(card=>{
      const node=card.dataset.node,info=directory.get(node);if(!info)return;
      let badge=card.querySelector('.owner-badge');
      if(!badge){badge=document.createElement('div');badge.className='owner-badge';const top=card.querySelector('.u-twin-top');top?.insertAdjacentElement('afterend',badge)}
      badge.textContent=`Owner: ${info.owner} · Node: ${node}`;
    });
  }

  function wrapFillNodeSelects(){
    const original=window.fillNodeSelects;
    if(typeof original!=='function'||original.__ownerWrapped)return;
    function wrapped(){original();decorateSelects()}
    wrapped.__ownerWrapped=true;window.fillNodeSelects=wrapped;
  }

  function watch(){
    const root=document.getElementById('uTwins');
    if(root&&!root.dataset.ownerWatch){
      root.dataset.ownerWatch='1';
      const mo=new MutationObserver(()=>decorateTwins());
      mo.observe(root,{childList:true,subtree:false});
    }
  }

  function boot(){wrapFillNodeSelects();decorateSelects();watch();syncDirectory();clearInterval(syncTimer);syncTimer=setInterval(syncDirectory,30000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [500,1500,3000].forEach(ms=>setTimeout(()=>{wrapFillNodeSelects();decorateSelects();watch();if(token())syncDirectory()},ms));
  document.addEventListener('click',e=>{if(e.target.closest('#uApiLogin,#uRefreshBtn'))setTimeout(syncDirectory,900)},true);
  window.goSmartSyncDeviceDirectory=syncDirectory;
})();