import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('Sources/MacDownGitLab/Web');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/' ? '/index.html' : pathname));
    if(!path.startsWith(root+sep)) {res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream'});res.end(bytes);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(8765,'127.0.0.1',()=>console.log('Editor preview: http://127.0.0.1:8765'));
