// Serve the local review and bundled imagery only. No app API or credentials.
const path=require('path');const fs=require('fs');const http=require('http');
const root=path.resolve(__dirname,'../../..');
const allowed=[path.join(root,'design','ui-review-v1')+path.sep,path.join(root,'assets')+path.sep];
http.createServer((req,res)=>{
 let requested;try{requested=decodeURIComponent(req.url.split('?')[0])}catch{res.writeHead(400);return res.end()}
 const target=requested==='/'?path.join(__dirname,'current.html'):path.resolve(root,'.'+requested);
 if(!allowed.some(prefix=>target.startsWith(prefix))||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end()}
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.ttf':'font/ttf'};
 res.setHeader('Content-Type',types[path.extname(target)]||'text/plain');fs.createReadStream(target).pipe(res);
}).listen(8087,'127.0.0.1',()=>console.log('HalalBasket UI review: http://127.0.0.1:8087/design/ui-review-v1/index.html'));
