/* Go Smart Ultimate Ops hardening patch. Loaded after ultimate.js. */
(function(){
  const PROD_API='https://edabtynvpy.ap-south-1.awsapprunner.com';
  if(!localStorage.getItem('gosmart_api_base')) localStorage.setItem('gosmart_api_base',PROD_API);
  function js(id,src){if(document.getElementById(id))return;const s=document.createElement('script');s.id=id;s.src=src;s.defer=true;document.body.appendChild(s)}
  function css(id,href){if(document.getElementById(id))return;const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
  function loadAll(){
    css('goSmartProCss','/static/css/pro.css?v=20260827p1');if(!window.goSmartProLoaded){js('goSmartProJs','/static/js/pro.js?v=20260827p1');window.goSmartProLoaded=true}
    css('goSmartThemeSettingsCss','/static/css/theme_settings.css?v=20260827t2');js('goSmartThemeSettingsJs','/static/js/theme_settings.js?v=20260827t2');
    css('goSmartUltimateSizingCss','/static/css/ultimate.css?v=20260827u3');
    css('goSmartDash26Css','/static/css/dashboard_2026.css?v=20260827d1');js('goSmartDash26Js','/static/js/dashboard_2026.js?v=20260827d1');
    js('goSmartDeviceOwnerOtaJs','/static/js/device_owner_ota.js?v=20260827do5');
    js('goSmartWirelessMonitorJs','/static/js/wireless_monitor.js?v=20260827wm2');
    setTimeout(()=>{css('goSmartOrganizedCss','/static/css/organized_shell.css?v=20260827o4');js('goSmartOrganizedJs','/static/js/organized_shell.js?v=20260827o2');js('goSmartSidebarEnhanceJs','/static/js/sidebar_enhance.js?v=20260827s1')},60);
  }
  function activateUltimate(){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));document.getElementById('page-ultimate')?.classList.add('active');document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));document.querySelector('.nav[data-page="ultimate"]')?.classList.add('active');const t=document.getElementById('pageTitle'),s=document.getElementById('pageSub');if(t)t.textContent='Ultimate Operations';if(s)s.textContent='Fleet, FastAPI and service command center';const api=document.getElementById('uApiBase');if(api&&!api.value)api.value=localStorage.getItem('gosmart_api_base')||PROD_API;window.scrollTo(0,0)}
  function wire(){const nav=document.querySelector('.nav[data-page="ultimate"]');if(nav&&!nav.dataset.uPatch){nav.dataset.uPatch='1';nav.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();activateUltimate()},{capture:true})}const api=document.getElementById('uApiBase');if(api&&!api.value)api.value=localStorage.getItem('gosmart_api_base')||PROD_API;const bridge=document.getElementById('uApiMsg');if(bridge&&!bridge.dataset.uPatch){bridge.dataset.uPatch='1';bridge.textContent='4Layers production API is prefilled. Enter admin credentials once to unlock backend fleet/users/OTA analytics.'}}
  loadAll();document.addEventListener('DOMContentLoaded',()=>{wire();loadAll()});setTimeout(wire,0);
})();