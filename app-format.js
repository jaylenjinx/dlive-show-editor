'use strict';

// dLive Show Editor v2 — reverse-engineering build.
// Safe writes are restricted to independently validated fixed-layout records.

const MANAGERS = [
  { key:'inputs', label:'Inputs', signature:'Input Channel Name Colour Manager', count:128, csv:'Input' },
  { key:'groups', label:'Mono Groups', signature:'Mono Group Channel Name Colour Manager', count:64, csv:'Group' },
  { key:'stGroups', label:'Stereo Groups', signature:'Stereo Group Channel Name Colour Manager', count:32, csv:'St Group' },
  { key:'auxes', label:'Mono Auxes', signature:'Mono Aux Channel Name Colour Manager', count:64, csv:'Aux' },
  { key:'stAuxes', label:'Stereo Auxes', signature:'Stereo Aux Channel Name Colour Manager', count:32, csv:'St Aux' },
  { key:'fxSends', label:'RackExtra Mono FX Sends', signature:'Mono FX Send Channel Name Colour Manager', count:16, csv:'FX' },
  { key:'stFxSends', label:'RackExtra Stereo FX Sends', signature:'Stereo FX Send Channel Name Colour Manager', count:16 },
  { key:'ultraFxSends', label:'RackUltra FX Sends', signature:'Stereo AHFX Send Channel Name Colour Manager', count:8 },
  { key:'mains', label:'Mains', signature:'Main Channel Name Colour Manager', count:6, csv:'Main' },
  { key:'matrices', label:'Mono Matrices', signature:'Mono Matrix Channel Name Colour Manager', count:64, csv:'Matrix' },
  { key:'stMatrices', label:'Stereo Matrices', signature:'Stereo Matrix Channel Name Colour Manager', count:32, csv:'St Matrix' },
  { key:'fxReturns', label:'RackExtra FX Returns', signature:'FX Return Channel Name Colour Manager', count:16 },
  { key:'ultraFxReturns', label:'RackUltra FX Returns', signature:'AHFX Return Channel Name Colour Manager', count:8 },
  { key:'dcas', label:'DCAs', signature:'DCA Channel Name Colour Manager', count:24 },
];

const COLOURS = [
  { id:0, name:'Off', hex:'#5f6875' },
  { id:1, name:'Red', hex:'#e14b4b' },
  { id:2, name:'Green', hex:'#57c66a' },
  { id:3, name:'Yellow', hex:'#e6bf48' },
  { id:4, name:'Blue', hex:'#4f88e5' },
  { id:5, name:'Magenta', hex:'#cf62d6' },
  { id:6, name:'Cyan', hex:'#4fc9d8' },
  { id:7, name:'White', hex:'#e7ebef' },
];
const COLOUR_BY_NAME = Object.fromEntries(COLOURS.map(c => [c.name.toLowerCase(), c.id]));

// Surface strip-type values proven by comparing dLive's factory Strip Assign scenes
// against known channel classes. 18 is a likely UFX Send but is intentionally not writable.
const STRIP_TYPES = [
  { code:0, label:'Blank', max:1 },
  { code:1, label:'Input', max:128, manager:'inputs' },
  { code:2, label:'Mono Group', max:64, manager:'groups' },
  { code:3, label:'Stereo Group', max:32, manager:'stGroups' },
  { code:4, label:'Mono Aux', max:64, manager:'auxes' },
  { code:5, label:'Stereo Aux', max:32, manager:'stAuxes' },
  { code:6, label:'RackExtra FX Send', max:16, manager:'fxSends' },
  { code:8, label:'Main', max:6, manager:'mains' },
  { code:10, label:'Mono Matrix', max:64, manager:'matrices' },
  { code:11, label:'Stereo Matrix', max:32, manager:'stMatrices' },
  { code:12, label:'RackExtra FX Return', max:16, manager:'fxReturns' },
  { code:13, label:'DCA', max:24, manager:'dcas' },
  { code:19, label:'RackUltra FX Return', max:8, manager:'ultraFxReturns' },
];
const STRIP_TYPE_BY_CODE = Object.fromEntries(STRIP_TYPES.map(x => [x.code, x]));

const BANK_SIGNATURES = [
  {key:'left', label:'Left', signature:'Channel Left Bank Switcher'},
  {key:'middle', label:'Middle', signature:'Channel Middle Bank Switcher'},
  {key:'right', label:'Right', signature:'Channel Right Bank Switcher'},
];

const AHFX_ENGINE_IDS = {
  '1c03':'Spaces Reverb family (480 Large observed)',
  '1c04':'Spaces Reverb family (480 Medium observed)',
  '1d00':'Plate Reverb Designer',
  '2b00':'Saturator',
  '2d00':'Rhythm Delay',
  '2a00':'Amp/Cab',
  '2400':'Shifter',
  '2300':'Dual Harmony',
  '1e00':'Tuner',
  '2800':'Gridder',
};

const MIDI_PROTOCOL = [
  ['Name','SysEx','set 0x03 / get 0x01'],
  ['Colour','SysEx','set 0x06 / get 0x04'],
  ['Socket pad','SysEx','set 0x09'],
  ['Socket +48V','SysEx','set 0x0C'],
  ['Fader','NRPN','parameter 0x17'],
  ['HPF frequency','NRPN','parameter 0x30'],
  ['HPF on/off','NRPN','parameter 0x31'],
  ['DCA assignment','NRPN','parameter 0x40'],
  ['Main mix assignment','NRPN','parameter 0x18'],
  ['Mute','CC','dLive control-change mapping'],
];

const state = {
  fileName:'',
  outerEntries:null,
  scenes:[],
  current:null,
  dirtyScenes:new Set(),
  baselineStageCache:new Map(),
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

function asciiBytes(s) { return Uint8Array.from([...s].map(c => c.charCodeAt(0))); }
function asciiAt(bytes,start,len) {
  let end=start;
  while(end<start+len && bytes[end]!==0) end++;
  return String.fromCharCode(...bytes.slice(start,end));
}
function cString(bytes,start,maxLen) {
  let s='';
  for(let i=start;i<Math.min(bytes.length,start+maxLen);i++){
    const b=bytes[i]; if(b===0) break;
    if(b<32||b>126) break;
    s+=String.fromCharCode(b);
  }
  return s;
}
function indexOfBytes(hay,needle,from=0) {
  outer: for(let i=from;i<=hay.length-needle.length;i++){
    for(let j=0;j<needle.length;j++) if(hay[i+j]!==needle[j]) continue outer;
    return i;
  }
  return -1;
}
function hexByte(n){ return Number(n).toString(16).padStart(2,'0'); }
function hexRange(bytes,start=0,end=bytes.length) {
  const parts=[];
  for(let i=start;i<Math.min(end,bytes.length);i++) parts.push(hexByte(bytes[i]));
  return parts.join(' ');
}
function validName(s){ return /^[\x20-\x7E]{0,8}$/.test(s); }
function isDefaultName(name,idx){ return name===String(idx+1)||name===''; }
function formatBytes(n){
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function gzipTransform(bytes,mode){
  const Ctor=mode==='decompress'?window.DecompressionStream:window.CompressionStream;
  if(!Ctor) throw new Error(`${mode==='decompress'?'DecompressionStream':'CompressionStream'} is not supported by this browser.`);
  const stream=new Blob([bytes]).stream().pipeThrough(new Ctor('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const gunzip=bytes=>gzipTransform(bytes,'decompress');
const gzip=bytes=>gzipTransform(bytes,'compress');

function parseOctal(bytes,start,len){
  const s=asciiAt(bytes,start,len).replace(/\0/g,'').trim();
  return s?parseInt(s,8):0;
}
function parseTar(bytes){
  const entries=[]; let off=0;
  while(off+512<=bytes.length){
    let allZero=true;
    for(let i=off;i<off+512;i++) if(bytes[i]!==0){allZero=false;break;}
    if(allZero)break;
    const name=asciiAt(bytes,off,100);
    const prefix=asciiAt(bytes,off+345,155);
    const fullName=prefix?`${prefix}/${name}`:name;
    const mode=parseOctal(bytes,off+100,8)||0o644;
    const size=parseOctal(bytes,off+124,12);
    const mtime=parseOctal(bytes,off+136,12);
    const type=bytes[off+156]?String.fromCharCode(bytes[off+156]):'0';
    const start=off+512,end=start+size;
    if(end>bytes.length) throw new Error(`Invalid TAR entry size for ${fullName}`);
    entries.push({name:fullName,mode,size,mtime,type,content:bytes.slice(start,end)});
    off=start+Math.ceil(size/512)*512;
  }
  return entries;
}
function writeAscii(buf,off,len,text){ buf.set(asciiBytes(text).slice(0,len),off); }
function writeOctal(buf,off,len,value){
  const s=Math.max(0,value|0).toString(8).padStart(len-1,'0').slice(-(len-1))+'\0';
  writeAscii(buf,off,len,s);
}
function tarHeader(entry){
  const h=new Uint8Array(512); let name=entry.name,prefix='';
  if(name.length>100){
    const cut=name.lastIndexOf('/',155);
    if(cut<1||name.length-cut-1>100) throw new Error(`TAR path too long: ${name}`);
    prefix=name.slice(0,cut);name=name.slice(cut+1);
  }
  writeAscii(h,0,100,name);
  writeOctal(h,100,8,entry.mode||(entry.type==='5'?0o755:0o644));
  writeOctal(h,108,8,0);writeOctal(h,116,8,0);
  writeOctal(h,124,12,entry.type==='5'?0:entry.content.length);
  writeOctal(h,136,12,entry.mtime||Math.floor(Date.now()/1000));
  for(let i=148;i<156;i++)h[i]=0x20;
  h[156]=(entry.type||'0').charCodeAt(0);
  writeAscii(h,257,6,'ustar\0');writeAscii(h,263,2,'00');
  writeAscii(h,265,32,'root');writeAscii(h,297,32,'root');
  if(prefix)writeAscii(h,345,155,prefix);
  let sum=0;for(const x of h)sum+=x;
  writeAscii(h,148,8,sum.toString(8).padStart(6,'0').slice(-6)+'\0 ');
  return h;
}
function writeTar(entries){
  let total=1024;
  for(const e of entries)total+=512+Math.ceil((e.type==='5'?0:e.content.length)/512)*512;
  const out=new Uint8Array(total);let off=0;
  for(const e of entries){
    out.set(tarHeader(e),off);off+=512;
    if(e.type!=='5'&&e.content.length){
      out.set(e.content,off);off+=Math.ceil(e.content.length/512)*512;
    }
  }
  return out;
}
