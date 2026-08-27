/* Go Smart device owner + OTA selector enhancement v2.
   Keeps Node ID + owner + live status visible across Devices, Control, Diagnostics and OTA.
   Uses the existing FastAPI admin session; does not change MQTT/control/OTA backend logic. */
(function(){
  const directory=new Map();
  let syncTimer=null,paintTimer=null;

  function text(v){return String(v??'').trim()}
  function token(){return sessionStorage.getItem('gosmart_admin_token')||''}
  function apiBase(){return (localStorage.getItem('gosmart_api_base')||'').replace(/\/$/,'')}
  function isOnline(node){return Array.isArray(window.DATA?.nodes)&&window.DATA.nodes.includes(node)}
  function localName(node){const d=window.DATA?.devices?.[node]||{},m=window.DATA?.meta?.[node]||{};return d.name||m.name||m.room||node}
  function list(v,key){if(Array.isArray(v))return v;if(Array.isArray(v?.data))return v.data;if(Array.isArray(v?.records))return v.records;if(Array.isArray(v?.[key]))return v[key];return[]}

  function ownerFromDevice(d,userById){
    const direct=text(d.owner_username||d.owner_name||d.user_name||d.username||d.customer_name||d.owner_email||d.email||d.owner?.username||d.owner?.name||d.owner?.email||d.user?.username||d.user?.name||d.user?.email);
    if(direct)return direct;
    const uid=text(d.owner_id||d.user_id||d.customer_id||d.owner?.id||d.user?.id);
    const u=uid?userById.get(uid):null;
    return text(u?.username||u?.name||u?.full_name||u?.email)||'Unassigned';
  }

  async function syncDirectory(){
    const t=token(),base=apiBase();
    if(!t||!base){paint();return}
    try{
      const headers={Authorization:'Bearer '+t};
      const [dr,ur]=await Promise.all([
        fetch(base+'/api/admin/devices?limit=500',{headers,cache:'no-store'}),
        fetch(base+'/api/admin/users?limit=500',{headers,cache:'no-store'})
      ]);
      if(!dr.ok)throw new Error('Devices HTTP '+dr.status);
      const dj=await dr.json();
      const uj=ur.ok?await ur.json():[];
      const users=list(uj,'users');
      const userById=new Map();
      users.forEach(u=>{const id=text(u.id||u.user_id||u._id);if(id)userById.set(id,u)});
      const rows=list(dj,'devices');
      directory.clear();
      rows.forEach(d=>{
        const node=text(d.node_id||d.device_id||d.hardware_id||d.nodeId||d.id);
        if(!node)return;
        directory.set(node,{
          owner:ownerFromDevice(d,userById),
          device:text(d.name||d.device_name||d.board_name||node),
          backendOnline:d.is_online===true||d.online===true,
          userId:text(d.owner_id||d.user_id||d.customer_id)
        });
      });
      window.GoSmartDeviceDirectory=directory;
      paint();
    }catch(e){console.warn('Device owner directory sync skipped:',e.message);paint()}
  }

  function owner(node){return directory.get(node)?.owner||'Unassigned'}
  function optionLabel(node){
    const info=directory.get(node);const name=info?.device||localName(node);const status=isOnline(node)?'ONLINE':'OFFLINE';
    return `${name} · ${node} · ${owner(node)} · ${status}`;
  }

  function replaceOptions(el,nodes,includeAll){
    if(!el)return;
    const old=el.value;
    const wanted=includeAll?['ALL_ONLINE',...nodes]:nodes;
    const current=[...el.options].map(o=>o.value);
    const labelsOk=current.length===wanted.length&&wanted.every((v,i)=>current[i]===v&&(v==='ALL_ONLINE'||el.options[i].textContent===optionLabel(v)));
    if(labelsOk)return;
    const frag=document.createDocumentFragment();
    if(includeAll){const o=document.createElement('option');o.value='ALL_ONLINE';o.textContent=`ALL ONLINE · ${nodes.length} ONLINE`;frag.appendChild(o)}
    nodes.forEach(node=>{const o=document.createElement('option');o.value=node;o.textContent=optionLabel(node);o.dataset.owner=owner(node);o.dataset.online=isOnline(node)?'1':'0';frag.appendChild(o)});
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
    const ota=document.getElementById('otaNode');if(ota)ota.title='Only online devices are listed for OTA. Label = device · Node ID · owner · status.';
  }

  function decorateDeviceTable(){
    const table=document.getElementById('deviceTable');if(!table)return;
    [...table.querySelectorAll('tr')].forEach(row=>{
      const first=row.cells?.[0];if(!first)return;
      const raw=first.textContent||'';
      const node=(window.DATA?.all_nodes||[]).find(n=>raw.includes(n));if(!node)return;
      let meta=first.querySelector('.muted');
      if(!meta){meta=document.createElement('span');meta.className='muted';first.append(document.createElement('br'),meta)}
      const room=window.DATA?.meta?.[node]?.room||'Unassigned room';
      meta.textContent=`${node} · Owner: ${owner(node)} · ${room}`;
      first.title=`${node} · ${owner(node)} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
    });
  }

  function decorateTwins(){
    document.querySelectorAll('#uTwins .u-twin[data-node]').forEach(card=>{
      const node=card.dataset.node;if(!node)return;
      let badge=card.querySelector('.owner-badge');
      if(!badge){badge=document.createElement('div');badge.className='owner-badge';card.querySelector('.u-twin-top')?.insertAdjacentElement('afterend',badge)}
      badge.textContent=`Owner: ${owner(node)} · Node: ${node} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
    });
  }

  function paint(){decorateSelects();decorateDeviceTable();decorateTwins()}

  function boot(){
    syncDirectory();
    clearInterval(syncTimer);clearInterval(paintTimer);
    syncTimer=setInterval(syncDirectory,30000);
    /* renderAll()/refresh() rewrites selects every 5s, so repaint labels shortly after it without observing DOM. */
    paintTimer=setInterval(paint,1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  document.addEventListener('click',e=>{if(e.target.closest('#uApiLogin,#uRefreshBtn,.nav[data-page="devices"],.nav[data-page="control"],.nav[data-page="ota"]'))setTimeout(()=>{syncDirectory();paint()},500)},true);
  window.goSmartSyncDeviceDirectory=syncDirectory;
})();