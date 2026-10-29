const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json'};
http.createServer((req,res)=>{
    try {
        if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
        let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(name.endsWith('/'))name+='index.html';
        const file=path.resolve(root,'.'+name),relative=path.relative(root,file);
        if(relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part=>part.startsWith('.'))){res.writeHead(403).end();return;}
        const stream=fs.createReadStream(file);
        stream.on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end();});
        stream.on('open',()=>{res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');if(req.method==='HEAD'){stream.destroy();res.end();}else stream.pipe(res);});
    }catch{res.writeHead(400).end();}
}).listen(8080,'127.0.0.1',()=>console.log('Player demo: http://127.0.0.1:8080/training/ (Ctrl+C to stop)'));
