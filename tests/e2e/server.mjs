// Test-only callable HTTP adapter. Authentication and Firestore use demo emulators;
// App Check middleware is not exercised. Production handlers and validation run unchanged.
import http from 'node:http';
import { createRequire } from 'node:module';
process.env.GCLOUD_PROJECT = 'demo-expense-currency';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const realFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (String(url).startsWith('https://api.frankfurter.dev/')) {
    const parsed = new URL(url);const base=parsed.searchParams.get('base');const quote=parsed.searchParams.get('quotes');
    const rates = {'EUR/RSD':'117','ILS/RSD':'32','RSD/USD':'0.01','EUR/USD':'1.1','ILS/USD':'0.3'};
    return Promise.resolve(new Response(`date,base,quote,rate\n2026-10-01,${base},${quote},${rates[base+'/'+quote] ?? '1'}`));
  }
  return realFetch(url,options);
};
const require = createRequire(new URL('../../functions/index.js',import.meta.url));
const handlers = require('./index.js');
const admin = require('firebase-admin');
const allowed = new Set(['createBoard','saveTransaction','deleteTransaction','changeBoardCurrency','moveTransaction','duplicateTransaction']);
const server = http.createServer(async (request,response)=>{
  response.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5173');
  response.setHeader('Access-Control-Allow-Headers','content-type,authorization');
  if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
  if(request.url==='/health'){response.end('ok');return;}
  try {
    const token=request.headers.authorization?.replace(/^Bearer /,'');
    const auth=await admin.auth().verifyIdToken(token);
    const name=request.url.split('/').at(-1);if(!allowed.has(name))throw Error('Unsupported test operation');
    let body='';for await(const chunk of request){body+=chunk;if(body.length>100000)throw Error('Request too large');}
    const data=JSON.parse(body).data;
    const result=await handlers[name].run({data,auth:{uid:auth.uid,token:auth}});
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({result}));
  } catch(error) {
    response.writeHead(400,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:{status:(error.code||'invalid-argument').toUpperCase().replaceAll('-','_'),message:error.message}}));
  }
});
server.listen(5001,'127.0.0.1');
