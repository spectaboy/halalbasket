const {execFileSync}=require('node:child_process');
const path=require('node:path');
for(const step of process.argv.slice(2)){
  const colon=step.indexOf(':');
  const args=colon<0?[step]:[step.slice(0,colon),step.slice(colon+1)];
  execFileSync(process.execPath,[path.join(__dirname,'demo-native.cjs'),...args],{stdio:'inherit'});
}
