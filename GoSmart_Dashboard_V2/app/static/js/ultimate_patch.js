/* Go Smart Ultimate Ops hardening patch. Loaded after ultimate.js. */
(function(){
  const PROD_API='https://edabtynvpy.ap-south-1.awsapprunner.com';
  if(!localStorage.getItem('gosmart_api_base')) localStorage.setItem('gosmart_api_base',PROD_API);

  function loadProLayer(){
    if(!document.getElementById('goSmartProCss')){
      const l=document.createElement('link');l.id='goSmartProCss';l.rel='stylesheet';l.href='/static/css/pro.css?v=20260827p1';document.head.appendChild(l);
    }
    if(!document.getElementById('goSmartProJs')&&!window.goSmartProLoaded){
      const s=document.createElement('script');s.id='goSmartProJs';s.src='/static/js/pro.js?v=20260827p1';s.defer=true;document.body.appendChild(s);
      window.goSmartProLoaded=true;
    }
  }

  function loadThemeSettings(){
    if(!document.getElementById('goSmartThemeSettingsCss')){
      const l=document.createElement('link');l.id='goSmartThemeSettingsCss';l.rel='stylesheet';l.href='/static/css/theme_settings.css?v=20260827t2';document.head.appendChild(l);
    }
    if(!document.getElementById('goSmartThemeSettingsJs')){
      const s=document.createElement('script');s.id='goSmartThemeSettingsJs';s.src='/static/js/theme_settings.js?v=20260827t2';s.defer=true;document.body.appendChild(s);
    }
  }

  function loadOrganizedShell(){
    if(!document.getElementById('goSmartOrganizedCss')){
      const l=document.createElement('link');l.id='goSmartOrganizedCss';l.rel='stylesheet';l.href='/static/css/organized_shell.css?v=20260827o4';document.head.appendChild(l);
    }
    if(!document.getElementById('goSmartOrganizedJs')){
      const s=document.createElement('script');s.id='goSmartOrganizedJs';s.src='/static/js/organized_shell.js?v=20260827o2';s.defer=true;document.body.appendChild(s);
    }
    if(!document.getElementById('goSmartSidebarEnhanceJs')){
      const s=document.createElement('script');s.id='goSmartSidebarEnhanceJs';s.src='/static/js/sidebar_enhance.js?v=20260827s1';s.defer=true;document.body.appendChild(s);
    }
  }

  function loadUltimateSizing(){
    if(!document.getElementById('goSmartUltimateSizingCss')){
      const l=document.createElement('link');l.id='goSmartUltimateSizingCss';l.rel='stylesheet';l.href='/static/css/ultimate.css?v=20260827u3';document.head.appendChild(l);
    }
  }

  function loadDeviceOwnerOta(){
    if(!document.getElementById('goSmartDeviceOwnerOtaJs')){
      const s=document.createElement('script');s.id='goSmartDeviceOwnerOtaJs';s.src='/static/js/device_owner_ota.js?v=20260827do2';s.defer=true;document.body.appendChild(s);
    }
  }

  function loadDashboard2026(){
    if(!document.getElementById('goSmartDash26Css')){
      const l=document.createElement('link');l.id='goSmartDash26Css';l.rel='stylesheet';l.href='/static/css/dashboard_2026.css?v=20260827d1';document.head.appendChild(l);
    }
    if(!document.getElementById('goSmartDash26Js')){
      const s=document.createElement('script');s.id='goSmartDash26Js';s.src='/static/js/dashboard_2026.js?v=20260827d1';s.defer=true;document.body.appendChild(s);
    }
  }

  function activateUltimate(){
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    document.getElementById('page-ultimate')?.classList.add('active');
    document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));
    document.querySelector('.nav[data-page="ultimate"]')?.classList.add('active');
    const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSub');
    if(title)title.textContent='Ultimate Operations';
    if(sub)sub.textContent='Fleet, FastAPI and service command center';
    const api=document.getElementById('uApiBase');
    if(api&&!api.value)api.value=localStorage.getItem('gosmart_api_base')||PROD_API;
    window.scrollTo(0,0);
  }

  function wire(){
    const nav=document.querySelector('.nav[data-page="ultimate"]');
    if(nav&&!nav.dataset.uPatch){
      nav.dataset.uPatch='1';
      nav.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();activateUltimate()},{capture:true});
    }
    const api=document.getElementById('uApiBase');
    if(api&&!api.value)api.value=localStorage.getItem('gosmart_api_base')||PROD_API;
    const bridge=document.getElementById('uApiMsg');
    if(bridge&&!bridge.dataset.uPatch){
      bridge.dataset.uPatch='1';
      bridge.textContent='4Layers production API is prefilled. Enter admin credentials once to unlock backend fleet/users/OTA analytics.';
    }
  }

  loadProLayer();loadThemeSettings();loadUltimateSizing();loadDashboard2026();loadDeviceOwnerOta();setTimeout(loadOrganizedShell,60);
  document.addEventListener('DOMContentLoaded',()=>{wire();loadProLayer();loadThemeSettings();loadUltimateSizing();loadDashboard2026();loadDeviceOwnerOta();setTimeout(loadOrganizedShell,60)});
  setTimeout(wire,0);
})();