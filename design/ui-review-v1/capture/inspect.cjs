const fs = require('fs');
async function main(){
 const pages=await fetch('http://localhost:8081/json/list').then(r=>r.json());
 const page=pages.at(-1); const ws=new WebSocket(page.webSocketDebuggerUrl);
 const expr=process.argv[2] || `JSON.stringify(Array.from(__r.getModules()).map(([id,m])=>({id,name:m.verboseName})).filter(m=>/navigationRef|Screen|SessionContext|CartContext|App.tsx/.test(m.name)))`;
 ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}})));
 ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id===1){console.log(JSON.stringify(d.result));ws.close();}});
 setTimeout(()=>{ws.close();},8000).unref();
}
main().catch(console.error);
