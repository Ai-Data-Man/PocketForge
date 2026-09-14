const fs=require('fs');
const GEOMAP = {
  '27.17.34.18':'Wuhan', '27.27.163.229':'Wuhan', '27.27.164.143':'Wuhan',
  '171.83.68.169':'Wuhan','171.83.70.229':'Wuhan','171.83.79.95':'Wuhan',
  '116.198.20.209':'Beijing-IDC','27.27.164.129':'Wuhan','171.83.67.233':'Wuhan',
  '171.83.112.11':'Wuhan','171.83.68.174':'Wuhan','171.83.79.81':'Wuhan',
  '175.0.176.23':'Changsha','175.0.205.165':'Changsha','171.83.69.67':'Wuhan',
  '171.83.77.100':'Wuhan','27.27.162.170':'Wuhan','171.83.70.227':'Wuhan',
  '171.83.66.80':'Wuhan','171.83.69.68':'Wuhan','27.27.166.6':'Wuhan',
  '171.83.66.82':'Wuhan','171.83.72.152':'Wuhan','171.83.76.143':'Wuhan',
  '171.83.74.101':'Wuhan','171.83.112.40':'Wuhan'
};
const csv = fs.readFileSync('tmp/tslsm.csv','utf8').replace(/^\uFEFF/,'');
const rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map(l=>{
  const m = l.match(/^"?([^,"]*)"?,"?([^,"]*)"?,"?([^,"]*)"?,"?([^,"]*)"?,"?([^,"]*)"?$/);
  return m ? {T:m[1], ID:m[2], User:m[3], IP:m[4], SID:m[5]} : null;
}).filter(Boolean);

console.log('total rows:', rows.length);
console.log('first:', rows[0].T, 'last:', rows[rows.length-1].T);

// 只看有 IP 的（21/24/25 = 会话登录；22 = shell start）
const withIp = rows.filter(r=>r.IP && /^\d+\.\d+\.\d+\.\d+$/.test(r.IP) && !r.IP.startsWith('127.'));
console.log('\nrows with public IP:', withIp.length);

// 按 IP 分组：首次、末次、次数、涉及事件ID、覆盖的天数、小时分布
const g={};
for(const r of withIp){
  if(!g[r.IP]) g[r.IP]={n:0,first:r.T,last:r.T,ids:new Set(),days:new Set(),hours:{}};
  const a=g[r.IP]; a.n++; a.last=r.T; a.ids.add(r.ID); a.days.add(r.T.slice(0,10));
  const h=r.T.slice(11,13); a.hours[h]=(a.hours[h]||0)+1;
}
const order = Object.entries(g).sort((a,b)=>b[1].n-a[1].n);
console.log('\nIP | n | first | last | days | geo | ids');
for(const [ip,a] of order){
  const hrs = Object.entries(a.hours).sort((x,y)=>y[1]-x[1]).slice(0,5).map(([h,c])=>h+'h:'+c).join(' ');
  console.log(`${ip.padEnd(17)}|${String(a.n).padStart(4)} |${a.first.slice(5,16)} |${a.last.slice(5,16)} | d=${String(a.days.size).padStart(2)} | ${(GEOMAP[ip]||'?').padEnd(11)} | ${[...a.ids].join(',')} | ${hrs}`);
}

// 按天看：最近 30 天每天用了哪个 IP（判断"经常用"）
console.log('\n=== 按日 IP 使用（最近 40 天，含小时跨度）===');
const byDay={};
for(const r of withIp){
  const d=r.T.slice(0,10);
  if(!byDay[d]) byDay[d]={};
  byDay[d][r.IP]=(byDay[d][r.IP]||0)+1;
}
const days = Object.keys(byDay).sort().slice(-40);
for(const d of days){
  const parts = Object.entries(byDay[d]).sort((a,b)=>b[1]-a[1]).map(([ip,c])=>ip+'('+c+')');
  console.log(d+' '+parts.join(' '));
}
