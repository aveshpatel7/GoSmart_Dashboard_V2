/* Desktop sidebar readability helpers. No device-control logic is changed. */
(function(){
  function data(){try{return typeof DATA!=='undefined'?DATA:{};}catch(e){return{};}}
  function alertCount(){
    var d=data(), all=d.all_nodes||[], online=d.nodes||[], count=0;
    all.forEach(function(n){
      var r=(d.telemetry&&d.telemetry[n])||{};
      if(online.indexOf(n)<0) count++;
      var sig=Number(r.rssi||0), crashes=Number(r.crash_count||0);
      if(sig && sig<-82) count++;
      if(crashes>0) count++;
    });
    return count;
  }
  function badge(page,value,isAlert){
    var b=document.querySelector('.nav[data-page="'+page+'"]');
    if(!b)return;
    var x=b.querySelector('.nav-badge');
    if(!x){x=document.createElement('em');x.className='nav-badge';b.appendChild(x);}
    x.className='nav-badge'+(isAlert?' alert':'');x.textContent=String(value);
  }
  function paint(){
    if(document.body.classList.contains('is-android'))return;
    var d=data(), all=d.all_nodes||[], online=d.nodes||[], alerts=alertCount();
    badge('devices',all.length,false);badge('alerts',alerts,alerts>0);
    var bottom=document.querySelector('.sidebar-bottom');if(!bottom)return;
    var mini=document.getElementById('sidebarFleetMini');
    if(!mini){mini=document.createElement('div');mini.id='sidebarFleetMini';mini.className='sidebar-fleet-mini';bottom.insertBefore(mini,bottom.firstChild);}
    mini.innerHTML='<div><b>'+all.length+'</b><span>Total</span></div><div class="ok"><b>'+online.length+'</b><span>Online</span></div><div class="'+(alerts?'warn':'')+'"><b>'+alerts+'</b><span>Alerts</span></div>';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint);else paint();
  setTimeout(paint,500);setTimeout(paint,1800);setInterval(paint,5000);
})();