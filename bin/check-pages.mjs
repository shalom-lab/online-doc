import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=resolve('dist');
for(const page of ['index.html','editor.html']){
 const html=readFileSync(join(root,page),'utf8');
 for(const [,value] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  if(/^(?:https?:|data:|#)/.test(value))continue;
  const url=new URL(value,'https://example.test/online-doc/'+page);
  assert(url.pathname.startsWith('/online-doc/'),`Wrong base: ${value}`);
  assert(existsSync(join(root,decodeURIComponent(url.pathname.slice(12)))),`Missing ${value}`);
 }
 if(page==='editor.html')for(const [,attrs,script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\bsrc\s*=/.test(attrs)||!script.trim())continue;
  assert(html.includes('sha256-'+createHash('sha256').update(script).digest('base64')),'Stale editor CSP');
 }
}
assert.equal(readFileSync(join(root,'sdkjs/common/wasm/x2t/x2t.wasm.br')).subarray(0,4).toString('hex'),'0061736d');
function size(dir){return readdirSync(dir).reduce((n,f)=>{const p=join(dir,f);return n+(statSync(p).isDirectory()?size(p):statSync(p).size);},0);}
assert(size(root)<1024**3,'Pages artifact exceeds 1 GiB');
console.log('PASS: Pages entry resources, /online-doc/ base, CSP hashes, WASM magic and size');
