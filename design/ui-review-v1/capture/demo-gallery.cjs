const fs=require('node:fs');const path=require('node:path');
const out=path.resolve(__dirname,'../demo-native');
const names={
  "current-home": [
    "Home",
    "Home"
  ],
  "current-search": [
    "Search",
    "Browse"
  ],
  "current-restaurants": [
    "Restaurants",
    "Browse"
  ],
  "current-butchers": [
    "Butchers & Farms",
    "Browse"
  ],
  "current-home-cooks": [
    "Home cooks",
    "Browse"
  ],
  "current-seller": [
    "Restaurant",
    "Browse"
  ],
  "current-menu": [
    "Restaurant · full menu",
    "Browse"
  ],
  "current-dish": [
    "Dish details",
    "Browse"
  ],
  "current-drop": [
    "Scheduled meal drop",
    "Browse"
  ],
  "current-basket": [
    "Your basket",
    "Order"
  ],
  "current-checkout": [
    "Checkout",
    "Order"
  ],
  "current-confirmation": [
    "Order confirmation",
    "Order"
  ],
  "current-tracking": [
    "Order tracking",
    "Tracking"
  ],
  "current-tracking-details": [
    "Tracking · order details",
    "Tracking"
  ],
  "current-review": [
    "Leave a review",
    "Tracking"
  ],
  "current-orders": [
    "Your orders",
    "Order"
  ],
  "current-address": [
    "Delivery address",
    "Account"
  ],
  "current-profile": [
    "Profile",
    "Account"
  ],
  "current-profile-bottom": [
    "Profile · account options",
    "Account"
  ],
  "current-edit-profile": [
    "Edit profile",
    "Account"
  ],
  "profile-small": [
    "Profile · small phone",
    "Small phone"
  ],
  "profile-edit-small-keyboard": [
    "Edit profile · small phone keyboard",
    "Small phone"
  ]
};
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const records=Object.entries(names).map(([file,[title,group]])=>{
 const png=fs.readFileSync(path.join(out,file+'.png'));
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(!((width===1344&&height===2992)||(width===960&&height===1704)))throw Error('Unexpected/cropped image: '+file);
 const nodes=JSON.parse(fs.readFileSync(path.join(out,file+'.json'),'utf8'));
 const text=nodes.map(n=>n.text).join(' ');
 if(!text)throw Error('Missing UI evidence: '+file);
 return {file,title,group,width,height};
});
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HalalBasket — screen gallery</title>
<style>@font-face{font-family:Manrope;src:url('../../../assets/fonts/Manrope-Regular.ttf')}*{box-sizing:border-box}body{margin:0;background:#fbf8f1;color:#19382a;font-family:Manrope,system-ui,sans-serif}header,main{max-width:1500px;margin:auto;padding:32px}header{padding-top:48px}.brand{font-size:13px;font-weight:800;letter-spacing:2px;color:#205a3c}h1{font-size:clamp(30px,5vw,58px);line-height:1.1;letter-spacing:-2px;max-width:880px;margin:18px 0}p{line-height:1.65;max-width:850px;color:#607365}.pills{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.pill{padding:10px 14px;background:#e8eee3;border-radius:99px;font-size:13px}nav{position:sticky;top:0;background:#fbf8f1f5;z-index:2;padding:14px 32px;display:flex;gap:8px;flex-wrap:wrap;border-block:1px solid #e4e6da}button{font:inherit;font-size:13px;padding:12px 17px;border-radius:99px;border:1px solid #ccd7cd;background:transparent;color:#205a3c;cursor:pointer}button.active{background:#205a3c;color:white}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 24px}.screen{margin:0;min-width:0;align-self:start}.screen[hidden]{display:none}.screen a{display:block;border:1px solid #dce3d6;border-radius:20px;overflow:hidden;background:white;box-shadow:0 8px 26px #19382a0c}.screen img{display:block;width:100%;height:auto}.screen h2{font-size:15px;margin:14px 0 5px;line-height:1.5}.screen small{color:#667166;line-height:1.5}footer{padding:32px;max-width:1500px;margin:auto;border-top:1px solid #e4e6da}a{color:#205a3c}details{padding:20px;background:#eef1e8;border-radius:16px;margin-top:20px}pre{white-space:pre-wrap;line-height:1.6;font-family:inherit;font-size:13px}.assets{display:flex;gap:14px;flex-wrap:wrap}.assets a{max-width:240px}.assets img{width:100%;height:auto;border-radius:16px}@media(max-width:1000px){main{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:720px){main{grid-template-columns:repeat(2,minmax(0,1fr));padding:20px;gap:24px 14px}header,footer{padding:24px}nav{padding:12px 20px}}@media(max-width:430px){main{grid-template-columns:1fr}}</style></head><body>
<header><div class="brand">HALALBASKET / SCREEN GALLERY</div><h1>Good food. A whole journey to explore.</h1><p>Browse fictional local sellers, save favourites, search for dishes, build a basket and place a simulated order. Follow delivery step by step, leave a review, or reorder a favourite.</p><div class="pills"><span class="pill">8 sample sellers</span><span class="pill">18 menu items</span><span class="pill">Restaurants · Butchers · Home cooks</span><span class="pill">No real charges or deliveries</span></div><p><strong>${records.length} full Android screenshots.</strong> These come from the running emulator. Each image retains the complete display, including the system bars. Long screens have separate top and scrolled views. Tap any image to open the original at full resolution.</p><p>In the app: <strong>Profile → Explore options → Start fresh</strong> starts fresh. On a tracked order, <strong>Next</strong> advances the simulated delivery. Orders, reviews and favourites stay on this device between app launches.</p></header>
<nav aria-label="Screen groups">${['All',...new Set(records.map(r=>r.group))].map((g,i)=>`<button class="${i?'':'active'}" aria-pressed="${!i}" data-filter="${esc(g)}">${esc(g)}</button>`).join('')}</nav>
<main>${records.map(r=>`<figure class="screen" data-group="${esc(r.group)}"><a href="${r.file}.png" target="_blank" rel="noopener"><img loading="lazy" src="${r.file}.png" alt="${esc(r.title)} — complete Android screen" width="${r.width}" height="${r.height}"></a><figcaption><h2>${esc(r.title)}</h2><small>${r.width} × ${r.height} · Full display</small></figcaption></figure>`).join('')}</main>
<footer><h2>Bundled food photography</h2><p>New burger, curry and baklava images generated with the built-in image generation tool for the food catalog. Existing grill, shawarma and butcher assets are also bundled with the app.</p><div class="assets">${['burger','curry','baklava'].map(n=>`<a href="../../../assets/discovery/${n}.png" target="_blank"><img src="../../../assets/discovery/${n}.png" alt="${n} photo"><span>assets/discovery/${n}.png</span></a>`).join('')}</div><p>Checked on Android at 448 × 997 dp and 320 × 568 dp. TypeScript and 20 marketplace checks passed; the native walkthrough covered discovery, search, saved sellers, quantities, seller switching, checkout, delivery, reviews, reorder, scheduled drops and restart persistence.</p></footer>
<script>document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});document.querySelectorAll('[data-group]').forEach(x=>x.hidden=b.dataset.filter!=='All'&&x.dataset.group!==b.dataset.filter)})</script></body></html>`;
fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'screens.json'),JSON.stringify(records,null,2));
console.log(`Verified full dimensions for ${records.length} native screenshots; gallery saved.`);
