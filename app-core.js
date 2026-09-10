'use strict';

// dLive Show Editor — experimental safe-name editor.
// Built from observations of a real dLive show archive and public A&H CSV/name behaviour.
// It intentionally does NOT write opaque DSP/routing bytes.

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

const state = {
  fileName: '',
  outerEntries: null,
  scenes: [],
  current: null,
  dirtyScenes: new Set(),
  initialHash: null,
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

function toast(msg, error=false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function asciiBytes(s) { return Uint8Array.from([...s].map(c => c.charCodeAt(0))); }
function asciiAt(bytes, start, len) {
  let end = start;
  while (end < start + len && bytes[end] !== 0) end++;
  return String.fromCharCode(...bytes.slice(start, end));
}
function indexOfBytes(hay, needle, from=0) {
  outer: for (let i=from; i<=hay.length-needle.length; i++) {
    for (let j=0; j<needle.length; j++) if (hay[i+j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
function validName(s) { return /^[\x20-\x7E]{0,8}$/.test(s); }
function isDefaultName(name, idx) { return name === String(idx+1) || name === ''; }
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}

async function gzipTransform(bytes, mode) {
  const Ctor = mode === 'decompress' ? globalThis.DecompressionStream : globalThis.CompressionStream;
  if (!Ctor) throw new Error(`${mode === 'decompress' ? 'DecompressionStream' : 'CompressionStream'} is not supported by this browser.`);
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const gunzip = bytes => gzipTransform(bytes, 'decompress');
const gzip = bytes => gzipTransform(bytes, 'compress');

function parseOctal(bytes, start, len) {
  const s = asciiAt(bytes, start, len).trim();
  if (s && !/^[0-7]+$/.test(s)) throw new Error('Unsupported or invalid TAR numeric field.');
  const value = s ? parseInt(s, 8) : 0;
  if (!Number.isSafeInteger(value)) throw new Error('TAR numeric field exceeds safe range.');
  return value;
}
function parseTar(bytes) {
  const entries = [], names = new Set();
  let off = 0;
  while (off + 512 <= bytes.length) {
    const header = bytes.slice(off, off+512);
    if (header.every(b => b === 0)) {
      if (bytes.slice(off).some(b => b !== 0)) throw new Error('Unexpected data after TAR terminator.');
      return entries;
    }
    const stored = parseOctal(header,148,8);
    let sum=0; for(let i=0;i<512;i++) sum += i>=148 && i<156 ? 32 : header[i];
    if (sum !== stored) throw new Error(`TAR checksum mismatch at ${off}.`);
    const name=asciiAt(header,0,100), prefix=asciiAt(header,345,155);
    const fullName=prefix ? `${prefix}/${name}` : name;
    if (!fullName || names.has(fullName)) throw new Error('Empty or duplicate TAR path.');
    names.add(fullName);
    const mode=parseOctal(header,100,8), size=parseOctal(header,124,12), mtime=parseOctal(header,136,12);
    const type=header[156] ? String.fromCharCode(header[156]) : '0';
    // Extended headers can override paths/sizes. Reject until explicitly supported.
    if (!['0','5','1','2'].includes(type)) throw new Error(`Unsupported TAR entry type ${type}: ${fullName}`);
    const start=off+512, end=start+size, next=start+Math.ceil(size/512)*512;
    if (next>bytes.length) throw new Error(`Truncated TAR entry: ${fullName}`);
    entries.push({name:fullName,mode,size,mtime,type,header,content:bytes.slice(start,end),padding:bytes.slice(end,next)});
    off=next;
  }
  throw new Error('Missing TAR terminator or truncated header.');
}

function writeAscii(buf, off, len, text) {
  const b = asciiBytes(text);
  buf.set(b.slice(0,len), off);
}
function writeOctal(buf, off, len, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value.toString(8).length > len-1) throw new Error('TAR number out of range.');
  const s = value.toString(8).padStart(len-1, '0') + '\0';
  writeAscii(buf, off, len, s);
}
function tarHeader(entry) {
  if (entry.header) {
    const h=entry.header.slice();
    if (parseOctal(h,124,12) === entry.content.length) return h;
    writeOctal(h,124,12,entry.content.length);
    h.fill(32,148,156);
    const sum=h.reduce((a,b)=>a+b,0);
    writeAscii(h,148,8,sum.toString(8).padStart(6,'0')+'\0 ');
    return h;
  }
  const h = new Uint8Array(512);
  let name = entry.name;
  let prefix = '';
  if (name.length > 100) {
    const cut = name.lastIndexOf('/', 155);
    if (cut < 1 || name.length-cut-1 > 100) throw new Error(`TAR path too long: ${name}`);
    prefix = name.slice(0,cut); name = name.slice(cut+1);
  }
  writeAscii(h,0,100,name);
  writeOctal(h,100,8,entry.mode || (entry.type==='5' ? 0o755 : 0o644));
  writeOctal(h,108,8,0); writeOctal(h,116,8,0);
  writeOctal(h,124,12,entry.type==='5' ? 0 : entry.content.length);
  writeOctal(h,136,12,entry.mtime || Math.floor(Date.now()/1000));
  for (let i=148;i<156;i++) h[i]=0x20;
  h[156] = (entry.type || '0').charCodeAt(0);
  writeAscii(h,257,6,'ustar\0');
  writeAscii(h,263,2,'00');
  writeAscii(h,265,32,'root'); writeAscii(h,297,32,'root');
  if (prefix) writeAscii(h,345,155,prefix);
  let sum=0; for (const x of h) sum += x;
  const chk = sum.toString(8).padStart(6,'0').slice(-6) + '\0 ';
  writeAscii(h,148,8,chk);
  return h;
}
function writeTar(entries) {
  let total = 1024;
  for (const e of entries) total += 512 + Math.ceil((e.content.length)/512)*512;
  const out = new Uint8Array(total);
  let off=0;
  for (const e of entries) {
    out.set(tarHeader(e), off); off += 512;
    if (e.content.length) out.set(e.content,off);
    const padLength=(512-e.content.length%512)%512;
    if (e.padding?.length===padLength) out.set(e.padding,off+e.content.length);
    off += Math.ceil(e.content.length/512)*512;
  }
  return out;
}

function parseManagers(dat) {
  const result = [];
  for (const spec of MANAGERS) {
    const sig = asciiBytes(spec.signature);
    const positions=[];
    for(let at=indexOfBytes(dat,sig);at>=0;at=indexOfBytes(dat,sig,at+1)) {
      const embedded=MANAGERS.some(other=>other.signature.length>spec.signature.length && other.signature.endsWith(spec.signature) &&
        at>=other.signature.length-spec.signature.length && indexOfBytes(dat,asciiBytes(other.signature),at-(other.signature.length-spec.signature.length))===at-(other.signature.length-spec.signature.length));
      if(!embedded)positions.push(at);
    }
    if(positions.length!==1)continue; // Ambiguous tables are never writable.
    const pos=positions[0];
    const dataStart = pos + sig.length + 2;
    if (dat[pos+sig.length] !== 0 || dat[pos+sig.length+1] !== 1) continue;
    const colourStart = dataStart + spec.count*9;
    if (colourStart + spec.count > dat.length) continue;
    const items = [];
    for (let i=0;i<spec.count;i++) {
      items.push({
        index:i+1,
        name:asciiAt(dat,dataStart+i*9,9),
        colour:dat[colourStart+i],
        nameOffset:dataStart+i*9,
        colourOffset:colourStart+i,
      });
    }
    if (items.some(it=>!validName(it.name) || !dat.slice(it.nameOffset,it.nameOffset+9).includes(0) || it.colour>7)) continue;
    result.push({ ...spec, pos, dataStart, colourStart, items });
  }
  return result.filter(m=>!result.some(n=>n!==m && m.dataStart<n.colourStart+n.count && n.dataStart<m.colourStart+m.count));
}

function extractPrintableStrings(bytes, min=5) {
  const out=[]; let s='';
  for (const b of bytes) {
    if (b>=32 && b<=126) s += String.fromCharCode(b);
    else { if (s.length>=min) out.push(s); s=''; }
  }
  if (s.length>=min) out.push(s);
  return out;
}
function extractShowName(dat) {
  if (dat.length < 3) return 'dLive Show';
  let i=2, s='';
  while (i<dat.length && dat[i] >= 32 && dat[i] <= 126 && s.length < 40) s += String.fromCharCode(dat[i++]);
  return s || 'dLive Show';
}

async function analyseShow(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const tar = await gunzip(bytes);
  const entries = parseTar(tar);
  if (!entries.some(e => e.name === 'Show/Version.dat')) throw new Error('This does not look like a dLive Show archive (Show/Version.dat not found).');
  const sceneRe = /^Show\/Scenes\/StageBoxScene(\d+)\.tar\.gz$/;
  const scenes=[];
  for (const e of entries) {
    const m=e.name.match(sceneRe); if (!m) continue;
    scenes.push({ number:Number(m[1]), stagePath:e.name, dirty:false });
  }
  scenes.sort((a,b) => (a.number===65535?1:b.number===65535?-1:a.number-b.number));
  if (!scenes.length) throw new Error('No StageBox scene archives were found.');
  return { entries, scenes };
}

async function loadScene(sceneNumber) {
  await commitCurrentScene();
  const scene = state.scenes.find(s=>s.number===sceneNumber);
  if (!scene) return;
  const outer = state.outerEntries.find(e=>e.name===scene.stagePath);
  const nestedTar = await gunzip(outer.content);
  const nestedEntries = parseTar(nestedTar);
  const datEntry = findSceneDat(nestedEntries,sceneNumber);
  if (!datEntry) throw new Error(`No StageBox scene .dat found inside scene ${sceneNumber}`);
  const datBytes = datEntry.content.slice();
  const managers = parseManagers(datBytes);
  state.current = { scene, outer, nestedEntries, datEntry, datBytes, managers, dirty:false, undo:[], redo:[] };
  renderScene();
}

async function commitCurrentScene() {
  const c = state.current;
  if (!c || !c.dirty) return;
  assertAllowedChanges(c.datEntry.content,c.datBytes);
  c.datEntry.content = c.datBytes.slice();
  c.datEntry.size = c.datBytes.length;
  const nestedTar = writeTar(c.nestedEntries);
  c.outer.content = await gzip(nestedTar);
  c.outer.size = c.outer.content.length;
  c.scene.dirty = true;
  state.dirtyScenes.add(c.scene.number);
  c.dirty = false;
}

function changeItem(managerKey,index,field,value) {
  const c=state.current, m=c?.managers.find(x=>x.key===managerKey);
  if (!m || !Number.isInteger(index) || index<1 || index>m.count) return false;
  const item=m.items[index-1];
  if (field==='name' ? !validName(value) : !Number.isInteger(value)||value<0||value>7) return false;
  if (item[field]===value) return true;
  c.undo.push({managerKey,index,field,before:item[field],after:value}); c.redo=[];
  writeItem(c,item,field,value); markDirty(); return true;
}
function writeItem(c,item,field,value) {
  if(field==='name') { c.datBytes.fill(0,item.nameOffset,item.nameOffset+9); c.datBytes.set(asciiBytes(value),item.nameOffset); }
  else c.datBytes[item.colourOffset]=value;
  item[field]=value;
}
function setName(managerKey,index,name) {
  if(!validName(name)) { toast('Names must be 8 ASCII characters or fewer.',true); return false; }
  return changeItem(managerKey,index,'name',name);
}
function setColour(managerKey,index,colour) { return changeItem(managerKey,index,'colour',Number(colour)); }
function historyStep(redo=false) {
  const c=state.current, from=redo?c.redo:c.undo, to=redo?c.undo:c.redo, edit=from.pop();
  if(!edit) return;
  if(edit.dsp)writeObservedEqGain(c.datBytes,redo?edit.after:edit.before);
  else {const item=c.managers.find(m=>m.key===edit.managerKey).items[edit.index-1];writeItem(c,item,edit.field,redo?edit.after:edit.before);}
  to.push(edit); markDirty(); renderManagers(); renderFx(); renderDsp();
}
function findSceneDat(entries,number) {
  const matches=entries.filter(e=>e.type==='0' && /^StageBoxScene\d+\.dat$/.test(e.name.split('/').pop()) && Number(e.name.match(/StageBoxScene(\d+)\.dat$/)[1])===number);
  if(matches.length!==1) throw new Error(`Expected one StageBoxScene${number}.dat; found ${matches.length}.`);
  return matches[0];
}
function assertAllowedChanges(before,after) {
  if(before.length!==after.length) throw new Error('Scene length changed.');
  const allowed=new Uint8Array(before.length);
  for(const m of parseManagers(before)) for(const it of m.items) {
    allowed.fill(1,it.nameOffset,it.nameOffset+9); allowed[it.colourOffset]=1;
  }
  allowObservedDspChanges(before,after,allowed);
  for(let i=0;i<before.length;i++) if(before[i]!==after[i]&&!allowed[i]) throw new Error(`Unexpected write at offset ${i}.`);
  const original=parseManagers(before), edited=parseManagers(after);
  if(original.length!==edited.length || original.some(m=>!edited.some(n=>n.key===m.key&&n.pos===m.pos))) throw new Error('Edited manager validation failed.');
}
