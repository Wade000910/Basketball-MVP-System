const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../training'),worker=path.join(root,'sw.js');
let source=fs.readFileSync(worker,'utf8');
const files=JSON.parse(source.match(/const FILES=(\[[^\]]+\]);/)[1]),hash=crypto.createHash('sha256');
for(const file of files){const target=path.resolve(root,file==='./'?'index.html':file);if(!target.startsWith(root+path.sep))throw new Error('Offline asset outside training directory.');hash.update(file).update('\0').update(fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')).update('\0');}
const version=hash.digest('hex').slice(0,16);
source=source.replace(/const CACHE=PREFIX\+'[^']+';/,"const CACHE=PREFIX+'"+version+"';");
fs.writeFileSync(worker,source);console.log('Offline shell version: '+version);
