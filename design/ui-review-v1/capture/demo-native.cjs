// Full physical-device captures, plus observed accessibility targets for walkthroughs.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const out=path.resolve(__dirname,'../demo-native');fs.mkdirSync(out,{recursive:true});
const run=(args,options={})=>execFileSync(adb,['-s','emulator-5558',...args],{encoding:'utf8',...options});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function nodes(){run(['shell','uiautomator','dump','/sdcard/hb-demo.xml']);return [...run(['shell','cat','/sdcard/hb-demo.xml']).matchAll(/<node\s+([^>]+)>?/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
async function main(){
 const [command,arg]=process.argv.slice(2);
 if(command==='tap'){
  const matches=nodes().filter(n=>n.clickable==='true'&&(n['content-desc']===arg||n.text===arg||n['content-desc'].endsWith(', '+arg)||n['content-desc'].startsWith(arg+', ')));
  if(matches.length!==1)throw Error(`Expected one ${arg}; found ${matches.length}`);
  const [a,b,c,d]=matches[0].bounds.match(/\d+/g).map(Number);
  run(['shell','input','tap',String((a+c)>>1),String((b+d)>>1)]);await delay(900);
 }else if(command==='text') {run(['shell','input','text',arg]);await delay(600);}
 else if(command==='back') {run(['shell','input','keyevent','4']);await delay(700);}
 else if(command==='scroll') {
  const dimensions=run(['shell','wm','size']).match(/\d+x\d+/g).at(-1).split('x').map(Number);
  const x=String(Math.round(dimensions[0]/2)),a=String(Math.round(dimensions[1]*0.23)),b=String(Math.round(dimensions[1]*0.80));
  run(['shell','input','swipe',x,arg==='up'?a:b,x,arg==='up'?b:a,'650']);await delay(500);
 }
 else if(command==='capture'){
  await delay(500);run(['shell','screencap','-p','/sdcard/hb-demo.png']);run(['pull','/sdcard/hb-demo.png',path.join(out,arg+'.png')]);
  fs.writeFileSync(path.join(out,arg+'.json'),JSON.stringify(nodes().filter(n=>n.text||n['content-desc']),null,2));
  console.log(path.join(out,arg+'.png'));return;
 }
 const found=nodes();console.log(found.filter(n=>n.text).map(n=>n.text).join('\n'));
 if(command==='targets')console.log(JSON.stringify(found.filter(n=>n.clickable==='true').map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds})),null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
