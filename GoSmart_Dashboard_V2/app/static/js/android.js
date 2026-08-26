/* Go Smart Android UX layer. Activates only on Android user agents. */
(function(){
  const ua=navigator.userAgent||'';
  if(!/Android/i.test(ua)) return;
  document.body.classList.add('is-android');
  const $=id=>document.getElementById(id);

  function openPage(name){
    if(typeof window.showPage==='function') window.showPage(name);
    document.querySelectorAll('.android-bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
    const sidebar=$('sidebar'); if(sidebar?.classList.contains('open')) sidebar.classList.remove('open');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function injectDock(){
    if($('.android-bottom-nav'))return;
    const nav=document.createElement('nav');nav.className='android-bottom-nav android-only';nav.setAttribute('aria-label','Android quick navigation');
    const items=[['overview','⌂','Home'],['devices','▦','Devices'],['control','◉','Control'],['ota','⇧','OTA'],['alerts','!','Alerts']];
    nav.innerHTML=items.map(([p,i,l])=>`<button type="button" data-page="${p}" class="${p==='overview'?'active':''}"><b>${i}</b><span>${l}</span></button>`).join('');
    nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>openPage(b.dataset.page)));
    document.body.appendChild(nav);
  }

  function toast(text,type='ok'){
    let stack=document.querySelector('.android-toast-stack');
    if(!stack){stack=document.createElement('div');stack.className='android-toast-stack android-only';document.body.appendChild(stack)}
    const t=document.createElement('div');t.className='android-toast '+type;t.textContent=text;stack.appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(8px)';setTimeout(()=>t.remove(),180)},2200);
  }
  window.androidToast=toast;

  const oldFeedback=window.setControlFeedback;
  if(typeof oldFeedback==='function'){
    window.setControlFeedback=function(text,type='info'){
      const r=oldFeedback(text,type);
      if(type==='success') toast(text,'ok');
      if(type==='error') toast(text,'err');
      return r;
    };
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    b.classList.add('android-pressed');setTimeout(()=>b.classList.remove('android-pressed'),120);
  },{passive:true});

  function enhanceUsbCopy(){
    const status=$('usbStatus');if(!status||$('androidUsbHint'))return;
    const hint=document.createElement('div');hint.id='androidUsbHint';hint.className='alert android-only';
    hint.innerHTML='<b>Android USB:</b> Open this site directly in Chrome, connect ESP32 through USB OTG, then press Connect ESP32. Keep Serial Monitor disconnected while flashing.';
    status.parentNode.insertBefore(hint,status);
  }

  function keepDockInSync(){
    const active=document.querySelector('.page.active')?.id?.replace('page-','');
    if(!active)return;
    document.querySelectorAll('.android-bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===active));
  }

  injectDock();enhanceUsbCopy();
  setInterval(()=>{injectDock();enhanceUsbCopy();keepDockInSync()},1200);
})();
