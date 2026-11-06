// 画面ファイルを端末に保存して、電波がなくても開けるようにする
const CACHE='andz-crm-v12';
const MUST=['./','index.html'];                       // これがないと開けない
const EXTRA=['manifest.webmanifest','apple-touch-icon.png','icon-192.png','icon-512.png']; // なくても開ける
const WAIT=2500; // 電波が弱いとき、この時間（ミリ秒）待っても届かなければ保存した版で開く

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(async c=>{
    await c.addAll(MUST.map(f=>new Request(f,{cache:'reload'})));
    await Promise.all(EXTRA.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})));
  }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// 取りに行き、ちゃんと届いたものだけ保存する（エラー画面や転送された画面は保存しない）
function fetchAndSave(e){
  let put=Promise.resolve();
  const net=fetch(e.request).then(r=>{
    if(r.ok&&r.type==='basic'&&!r.redirected){const cp=r.clone();put=caches.open(CACHE).then(c=>c.put(e.request,cp))}
    return r});
  e.waitUntil(net.then(()=>put,()=>{}));
  return net;
}
async function fromCache(req,page){
  const c=await caches.open(CACHE);
  return (await c.match(req,{ignoreSearch:true}))||(page?((await c.match('index.html'))||(await c.match('./'))):undefined);
}
const offlinePage=()=>new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#111113;color:#f3f3f5;font-family:sans-serif;padding:40px 20px;text-align:center"><h2>電波がありません</h2><p>このアプリは、一度電波のある場所で開くと、そのあとは電波がなくても使えるようになります。</p></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  const page=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('.html');
  if(page){
    // 画面：新しい版を優先。ただし電波が弱くて遅いときは待たずに保存した版で開く
    const net=fetchAndSave(e);
    const late=new Promise(r=>setTimeout(r,WAIT)).then(()=>fromCache(req,true));
    e.respondWith(Promise.race([net.catch(()=>fromCache(req,true)),late]).then(r=>r||net).catch(()=>offlinePage()));
  }else{
    // アイコンなど：保存した版をすぐ使い、裏で新しい版に入れ替える
    const net=fetchAndSave(e);
    e.respondWith(fromCache(req,false).then(r=>r||net));
  }
});
