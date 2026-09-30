// Run with `node scripts/test-demo.cjs`. Uses the project's existing TypeScript dependency.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  }}).outputText;
  const module = {exports: {}};
  const localRequire = name => {
    assert.ok(name.startsWith('./'), `Demo model must have no runtime network or native dependency: ${name}`);
    return load(path.resolve(path.dirname(file), name+'.ts'));
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, {filename: file})(localRequire,module,module.exports);
  cache.set(file,module.exports);
  return module.exports;
}
const catalog = load('app/demo/catalog.ts');
const model = load('app/demo/model.ts');
const now = Date.now();
const state = model.initialDemoState(true, now);
const listing = catalog.demoListings[0];
const items = [{listing,quantity:2}];
const seller = {sellerId:listing.seller_id,sellerType:listing.seller_type,businessName:listing.business_name};
let passed=0;
function test(name,body){body();passed++;console.log(`PASS ${name}`)}
test('Catalog has all three seller types and actual menu relationships',()=>{
  assert.equal(catalog.demoSellers.length,8);assert.equal(catalog.demoListings.length,18);
  assert.equal(new Set(catalog.demoSellers.map(s=>s.seller_type)).size,3);
  assert.ok(catalog.demoListings.every(l=>catalog.demoSellers.some(s=>s.id===l.seller_id)));
});
test('Search finds dishes, seller names and cuisine tags',()=>{
  assert.ok(catalog.searchDemo('chicken','all').items.length>3);
  assert.equal(catalog.searchDemo('Olive','all').sellers[0].id,'demo-olive');
  assert.ok(catalog.searchDemo('Lebanese','all').sellers.length);
});
test('Category and saved filters intersect without leaking other sellers',()=>{
  assert.ok(catalog.searchDemo('','butcher').sellers.every(s=>s.seller_type==='butcher'));
  assert.deepEqual(catalog.searchDemo('','all',['demo-olive']).sellers.map(s=>s.id),['demo-olive']);
  assert.equal(catalog.searchDemo('chicken','all',[]).items.length,0);
});
test('Unknown query returns a real empty result',()=>assert.equal(catalog.searchDemo('xyzunavailable','all').items.length,0));
test('Scheduled dates agree with the local pickup date across timezones',()=>{
  for (const time of [now, Date.parse('2026-10-01T05:30:00Z'), Date.parse('2026-11-01T07:30:00Z')]) {
    for(const window of catalog.makeDemoWindows(time)) {
      assert.equal(window.cook_date,catalog.localCookDate(new Date(window.pickup_ready_at)));
      assert.equal(new Date(window.pickup_ready_at).getHours(),17);
      assert.ok(Date.parse(window.order_cutoff)<Date.parse(window.pickup_ready_at));
      assert.ok(Date.parse(window.order_cutoff)>time);
    }
  }
});
test('Seed includes an active order and reorderable delivered orders',()=>{
  assert.equal(state.orders.filter(o=>o.status==='delivered').length,2);
  assert.equal(state.orders[0].status,'preparing');
});
let order=model.createDemoOrder(items,seller,'Sample address','Leave at door',state.windows,now);
test('Checkout snapshots quantity, totals, instructions and unique demo id',()=>{
  assert.equal(order.subtotal,37);assert.equal(order.tax,1.85);assert.equal(order.total,44.33);
  assert.equal(order.order_items[0].quantity,2);assert.equal(order.delivery_instructions,'Leave at door');
  assert.ok(catalog.isDemoId(order.id));assert.equal(order.payment_intent_id,null);assert.equal(order.payment_status,'pending');
  assert.notEqual(order.id,model.createDemoOrder(items,seller,'Sample address','',state.windows,now).id);
});
test('Cannot simulate checkout for a real seller',()=>assert.throws(()=>model.createDemoOrder(items,{...seller,sellerId:'real-seller'},'address','',state.windows)));
test('Cannot mix sellers',()=>assert.throws(()=>model.createDemoOrder([...items,{listing:catalog.demoListings[4],quantity:1}],seller,'address','',state.windows)));
test('Rejects tampered price',()=>assert.throws(()=>model.createDemoOrder([{listing:{...listing,price:0.01},quantity:1}],seller,'address','',state.windows)));
test('Rejects empty cart and blank address',()=>{
  assert.throws(()=>model.createDemoOrder([],seller,'address','',state.windows));
  assert.throws(()=>model.createDemoOrder(items,seller,'  ','',state.windows));
});
test('Rejects invalid quantities',()=>{
  for(const quantity of [0,-1,1.5,100,NaN])assert.throws(()=>model.createDemoOrder([{listing,quantity}],seller,'address','',state.windows));
});
test('Cannot order a sold-out item or closed seller',()=>{
  for(const item of [catalog.demoListings[6],catalog.demoListings[14]])assert.throws(()=>model.createDemoOrder([{listing:item,quantity:1}],{sellerId:item.seller_id},'address','',state.windows));
});
const bake=catalog.demoListings[15];const baker={sellerId:bake.seller_id,sellerType:'home_cook',businessName:bake.business_name};
test('Home-cook checkout requires an open window for that cook',()=>{
  assert.throws(()=>model.createDemoOrder([{listing:bake,quantity:1}],baker,'address','',state.windows));
  assert.throws(()=>model.createDemoOrder([{listing:bake,quantity:1}],{...baker,preOrderWindowId:state.windows[1].id},'address','',state.windows));
});
test('Preorder records its window and rejects expired windows',()=>{
  const info={...baker,preOrderWindowId:state.windows[0].id};
  assert.equal(model.createDemoOrder([{listing:bake,quantity:1}],info,'address','',state.windows).pre_order_window_id,info.preOrderWindowId);
  assert.throws(()=>model.createDemoOrder([{listing:bake,quantity:1}],info,'address','',state.windows,now+4*86400000));
});
test('Review is blocked before delivery',()=>assert.throws(()=>model.reviewDemoOrder(order,5,'Great')));
test('Tracking visits every status in order and stops at delivery',()=>{
  for(const status of model.DEMO_STEPS.slice(1)){order=model.advanceDemoOrder(order);assert.equal(order.status,status)}
  assert.ok(order.delivered_at);assert.equal(model.advanceDemoOrder(order),order);
});
test('Review validates stars and prevents duplicates',()=>{
  assert.throws(()=>model.reviewDemoOrder(order,6,''));
  order=model.reviewDemoOrder(order,5,'Lovely food');assert.equal(order.reviews[0].comment,'Lovely food');
  assert.throws(()=>model.reviewDemoOrder(order,4,''));
});
test('Demo state roundtrips with orders and favourites for device storage',()=>{
  const saved=JSON.parse(JSON.stringify({...state,orders:[order,...state.orders],favourites:['demo-olive']}));
  assert.equal(saved.orders[0].reviews[0].rating,5);assert.deepEqual(saved.favourites,['demo-olive']);
});
test('Reset supplies fresh future drops and clears favourites',()=>{
  const fresh=model.initialDemoState(true,now+10*86400000);assert.equal(fresh.orders.length,3);
  assert.equal(fresh.favourites.length,0);assert.ok(fresh.windows.every(w=>Date.parse(w.order_cutoff)>now+10*86400000));
});
console.log(`${passed} demo checks passed.`);
