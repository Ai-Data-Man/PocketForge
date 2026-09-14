const fs=require('fs');
const csv = fs.readFileSync('tmp/tslsm.csv','utf8').replace(/^\uFEFF/,'');
const rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map(l=>{
  const m = l.match(/^"?([^,"]*)"?,"?([^,"]*)"?,"?([^,"]*)"?,"?([^,"]*)"?,"?([^,"]*)"?$/);
  return m ? {T:m[1], ID:m[2], User:m[3], IP:m[4], SID:m[5]} : null;
}).filter(Boolean).filter(r=>r.IP && /^\d+\.\d+\.\d+\.\d+$/.test(r.IP) && !r.IP.startsWith('127.'));
const DOW=['日','一','二','三','四','五','六'];

const ips=['27.17.34.18','27.27.163.229','171.83.112.40','171.83.112.11','171.83.67.233','171.83.79.95','171.83.70.229','171.83.68.169','171.83.79.81','175.0.205.165'];
for(const ip of ips){
  const r=rows.filter(x=>x.IP===ip);
  if(!r.length){ console.log(ip+' (none)'); continue; }
  const H=new Array(24).fill(0), W=new Array(7).fill(0);
  const days=new Set();
  let morning=0,evening=0,night=0;
  for(const x of r){
    const h=+x.T.slice(11,13), dw=new Date(x.T.slice(0,10)+'T12:00:00Z').getUTCDay();
    H[h]++; W[dw]++; days.add(x.T.slice(0,10));
    if(h>=7&&h<12) morning++; if(h>=18&&h<23) evening++; if(h>=23||h<6) night++;
  }
  const hn=H.map((v,h)=>v?h+':'+v:null).filter(Boolean).join(' ');
  console.log(`\n== ${ip} | 会话${r.length} 天${days.size} 首${r[r.length-1].T.slice(0,16)} 末${r[0].T.slice(0,16)}`);
  console.log(`   时段: 上午(7-12)=${morning} 晚(18-23)=${evening} 深夜(23-6)=${night}`);
  console.log(`   小时: ${hn}`);
  console.log(`   星期: ` + DOW.map((d,i)=>d+':'+W[i]).join(' '));
  // 连续日段（稳定期）
  const ds=[...days].sort(); const runs=[]; let s=ds[0],p=ds[0];
  for(let i=1;i<ds.length;i++){ const gap=(new Date(ds[i])-new Date(p))/86400000; if(gap>2){runs.push(s+'~'+p);s=ds[i];} p=ds[i]; }
  runs.push(s+'~'+p);
  console.log(`   连续段: ${runs.join(' , ')}`);
}
