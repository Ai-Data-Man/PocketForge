const https=require('https');
const ips = process.argv.slice(2);
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';

function get(url, headers){
  return new Promise(res=>{
    const u=new URL(url);
    const req=https.request({host:u.hostname,port:443,path:u.pathname+u.search,method:'GET',timeout:9000,
      headers:Object.assign({'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36','Accept':'application/json,*/*'},headers||{})},
      r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res({code:r.statusCode,body:b}))});
    req.on('error',e=>res({code:0,body:'ERR:'+e.code}));
    req.on('timeout',()=>{req.destroy();res({code:0,body:'TIMEOUT'})});
    req.end();
  });
}
const SRC = [
  ['vore',    ip=>`https://api.vore.top/api/IPdata?ip=${ip}`,        j=>{const d=j.ipdata; return d?`${d.info1||''}${d.info2||''}${d.info3||''} / ${(j.ipdata.isp||'')}`:null}],
  ['speedtest',ip=>`https://forge.speedtest.cn/api/location/info?ip=${ip}`, j=>{const d=j.data; return d?`${d.province||''}${d.city||''} / ${d.isp||''}`:null}],
  ['mir6',    ip=>`https://api.mir6.com/api/ip?ip=${ip}&type=json`,   j=>{const d=j.data; return d?(typeof d==='string'?d:`${d.country||''}${d.province||''}${d.city||''} / ${d.isp||''} ${d.area||''}`):(j.msg||null)}],
  ['uagent',  ip=>`https://ip.useragentinfo.com/json?ip=${ip}`,      j=>j.province?`${j.country||''}${j.province}${j.city} / ${j.isp||''}`:null],
  ['zxinc',   ip=>`https://ip.zxinc.org/api.php?type=json&ip=${ip}`, j=>j.data?`${j.data.location||''} / ${j.data.isp||''}`:null],
  ['ipapicdn',ip=>`https://ipapicdn.com/api/ip/${ip}?lang=zh-CN`,    j=>j.city?`${j.country||''}${j.region||''}${j.city} / ${j.isp||j.org||''}`:null],
  ['ipapiis', ip=>`https://api.ipapi.is/?q=${ip}`,                   j=>j.location?`${j.location.country||''}${j.location.state||''}${j.location.city||''} / ${(j.asn&&j.asn.org)||''}`:null],
];
(async()=>{
  for(const ip of ips){
    const out=[];
    for(const [name,urlf,pick] of SRC){
      let r=null;
      try{ r=null; const resp=await get(urlf(ip)); if(resp.code===200){ let j=null; try{j=JSON.parse(resp.body)}catch(e){} if(j){ try{ r=pick(j) }catch(e){} } else { r='(html)'+resp.body.slice(0,40) } } else r='http'+resp.code+' '+resp.body.slice(0,40); }catch(e){ r='EX:'+e.message }
      out.push(name+'='+(r===null?'-':String(r).slice(0,60)));
    }
    console.log(ip+' || '+out.join(' | '));
  }
})();
