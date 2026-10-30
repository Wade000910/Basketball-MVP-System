const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('training/sw.js','utf8'),scope='https://example.test/Basketball-MVP-System/training/';
function worker(fail=false){
    const events={},deleted=[],cached=[];let claimed=false;
    const version=source.match(/const CACHE=PREFIX\+'([^']+)'/)[1],key='basketball-training-shell:'+scope+':'+version,oldKey='basketball-training-shell:'+scope+':old';
    const cache={async addAll(requests){if(fail)throw new Error('offline');cached.push(...requests.map(r=>r.url));},async match(url){return cached.includes(url)?new Response('cached'):undefined;}};
    const context={URL,Request,Response,Set,caches:{async open(){return cache;},async keys(){return ['other-app',key,oldKey];},async delete(name){deleted.push(name);}},fetch:()=>{throw new Error('Network not available');},self:{registration:{scope},location:{href:scope+'sw.js'},clients:{async claim(){claimed=true;}},addEventListener:(name,fn)=>events[name]=fn}};
    vm.runInNewContext(source,context);return {events,deleted,cached,key,oldKey,claimed:()=>claimed};
}
test('offline shell installs all local assets and cleans only its own older versions',async()=>{
    const w=worker();let pending;w.events.install({waitUntil:p=>pending=p});await pending;
    for(const file of ['','index.html','app.js','core.js','analysis-store.js','styles.css','offline.js','manifest.webmanifest','icon.svg'])assert.ok(w.cached.includes(scope+file),file);
    w.events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(w.deleted,[w.oldKey]);assert.equal(w.claimed(),true);
    assert.doesNotMatch(source,/self\.skipWaiting\s*\(/);
});
test('failed install removes the incomplete cache',async()=>{const w=worker(true);let pending;w.events.install({waitUntil:p=>pending=p});await assert.rejects(pending,/offline/);assert.deepEqual(w.deleted,[w.key]);});
test('offline fetch serves known shell assets with query strings and leaves other routes untouched',async()=>{
    const w=worker();let pending;w.events.install({waitUntil:p=>pending=p});await pending;
    w.events.fetch({request:new Request(scope+'app.js?v=123'),respondWith:p=>pending=p});assert.equal(await (await pending).text(),'cached');
    for(const request of [new Request('https://other.test/app.js'),new Request(scope+'unknown.json'),new Request(scope+'../專題程式/'),new Request(scope+'app.js',{method:'POST'})])w.events.fetch({request,respondWith:()=>assert.fail('Out-of-scope request intercepted')});
});
test('manifest and installation entry resolve within the training directory',()=>{
    const manifest=JSON.parse(fs.readFileSync('training/manifest.webmanifest','utf8'));assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');
    for(const icon of manifest.icons)assert.ok(fs.existsSync('training/'+icon.src));
    assert.match(fs.readFileSync('training/index.html','utf8'),/href="\.\/manifest.webmanifest"/);
});
test('offline cache version matches every shipped shell asset',()=>{
    const hash=require('node:crypto').createHash('sha256'),files=JSON.parse(source.match(/const FILES=(\[[^\]]+\]);/)[1]);
    for(const file of files)hash.update(file).update('\0').update(fs.readFileSync('training/'+(file==='./'?'index.html':file),'utf8').replace(/\r\n/g,'\n')).update('\0');
    assert.equal(source.match(/const CACHE=PREFIX\+'([^']+)'/)[1],hash.digest('hex').slice(0,16),'Run node tools/update-offline-shell.cjs after changing offline assets.');
});
