/* Go Smart Ultimate Ops hardening patch. Loaded after ultimate.js. */
(function(){
  const PROD_API='https://edabtynvpy.ap-south-1.awsapprunner.com';
  if(!localStorage.getItem('gosmart_api_base')) localStorage.setItem('gosmart_api_base',PROD_API);

  function activateUltimate(){
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    document.getElementById('page-ultimate')?.classList.add('active');
    document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));
    document.querySelector('.nav[data-page="ultimate"]')?.classList.add('active');
    const title=document.getElementById('pageTitle'), sub=document.getElementById('pageSub');
    if(title) title.textContent='Ultimate Operations';
    if(sub) sub.textContent='Fleet, FastAPI and service command center';
    const api=document.getElementById('uApiBase'); if(api&&!api.value) api.value=localStorage.getItem('gosmart_api_base')||PROD_API;
    window.scrollTo(0,0);
  }

  function loadFanV2(){
    if(document.getElementById('goSmartFanV2Script')||window.goSmartFanV2)return;
    const s=document.createElement('script');
    s.id='goSmartFanV2Script';
    s.src='/static/js/fan_control_v2.js?v=20260827f2';
    s.defer=true;
    document.body.appendChild(s);
  }

  function wire(){
    const nav=document.querySelector('.nav[data-page="ultimate"]');
    if(nav&&!nav.dataset.uPatch){
      nav.dataset.uPatch='1';
      nav.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();activateUltimate();},{capture:true});
    }
    const api=document.getElementById('uApiBase');
    if(api&&!api.value) api.value=localStorage.getItem('gosmart_api_base')||PROD_API;
    const bridge=document.getElementById('uApiMsg');
    if(bridge&&!bridge.dataset.uPatch){bridge.dataset.uPatch='1';bridge.textContent='4Layers production API is prefilled. Enter admin credentials once to unlock backend fleet/users/OTA analytics.';}
    loadFanV2();
  }

  const obs=new MutationObserver(wire);
  obs.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',wire);
  setTimeout(wire,0);
})();