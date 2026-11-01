import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=process.cwd();
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const path=resolve(root,`.${route}`);if(!path.startsWith(root+sep)||!/^\/(app|playtest|wiki|docs)\//.test(route)){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[extname(path)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(path));}catch{res.writeHead(404).end();}}).listen(3017,'127.0.0.1',()=>console.log('http://127.0.0.1:3017/playtest/tactics-compact.html'));
