'use strict';

// Read-only positional evidence. No guessed parameter offsets are writable.
function stringRecords(bytes,min=5) {
  const out=[];
  for(let i=0;i<bytes.length;) {
    if(bytes[i]<32||bytes[i]>126) { i++; continue; }
    const offset=i;
    while(i<bytes.length&&bytes[i]>=32&&bytes[i]<=126)i++;
    if(i-offset>=min) out.push({offset,text:asciiAt(bytes,offset,i-offset)});
  }
  return out;
}
function diffSceneBytes(before,after) {
  const managers=parseManagers(before), labels=stringRecords(before);
  const ranges=[]; let changedBytes=0, knownBytes=0;
  const fields=new Map();
  for(const m of managers) for(const it of m.items) {
    for(let j=0;j<9;j++)fields.set(it.nameOffset+j,`${m.label} ${it.index} name`);
    fields.set(it.colourOffset,`${m.label} ${it.index} colour`);
  }
  const calibrated=observedEqField(before);
  if(calibrated){fields.set(calibrated.offset,calibrated.label);fields.set(calibrated.offset+1,calibrated.label);}
  const fieldAt=offset=>fields.get(offset)||null;
  let labelIndex=-1;
  const limit=Math.max(before.length,after.length);
  for(let i=0;i<limit;) {
    if(before[i]===after[i]) {i++;continue;}
    const start=i, field=fieldAt(i);
    do {changedBytes++; if(field)knownBytes++; i++;}
    while(i<limit&&before[i]!==after[i]&&fieldAt(i)===field);
    while(labelIndex+1<labels.length&&labels[labelIndex+1].offset<=start)labelIndex++;
    const nearestLabel=labels[labelIndex]||null;
    ranges.push({offset:start,length:i-start,field,nearestLabel,
      before:Array.from(before.slice(start,Math.min(i,start+32))),after:Array.from(after.slice(start,Math.min(i,start+32))),
      interpretations:interpretAt(before,after,start)});
  }
  return {comparison:'positional; inserted bytes may shift later offsets',beforeLength:before.length,afterLength:after.length,
    changedBytes,knownBytes,unknownBytes:changedBytes-knownBytes,ranges};
}
function interpretAt(before,after,offset) {
  const read=bytes=>{
    const out={u8:bytes[offset]??null};
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(offset+2<=bytes.length) {out.u16le=view.getUint16(offset,true);out.u16be=view.getUint16(offset,false);}
    if(offset+4<=bytes.length) {
      out.u32le=view.getUint32(offset,true);out.u32be=view.getUint32(offset,false);
      for(const [key,little] of [['f32le',true],['f32be',false]]) {
        const v=view.getFloat32(offset,little);out[key]=Number.isFinite(v)?v:String(v);
      }
    }
    return out;
  };
  return {before:read(before),after:read(after)};
}
function hex(bytes) {return bytes.map(b=>b.toString(16).padStart(2,'0')).join(' ');}
async function sha256(bytes) {return hex(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))).replaceAll(' ','');}

let comparisonShow=null, researchReport=null;
function renderResearch() {
  const c=state.current;if(!c)return;
  $('#researchSummary').textContent=`${formatBytes(c.datBytes.length)} scene data · ${c.managers.length} writable tables. The DSP tab provides the separately calibrated EQ gain control.`;
  $('#researchTables').innerHTML=c.managers.map(m=>`<tr><td>${m.label}</td><td>0x${m.pos.toString(16)}</td><td>0x${m.dataStart.toString(16)}</td><td>0x${m.colourStart.toString(16)}</td><td>${m.count}</td></tr>`).join('');
  const q=$('#stringSearch').value.toLowerCase();
  const records=stringRecords(c.datBytes).filter(r=>r.text.toLowerCase().includes(q));
  $('#researchStrings').textContent=records.slice(0,500).map(r=>`0x${r.offset.toString(16).padStart(8,'0')}  ${r.text}`).join('\n')||'No matching strings.';
  $('#stringCount').textContent=`${records.length} strings${records.length>500?' (first 500 shown)':''}`;
  const select=$('#compareScene');select.innerHTML='';
  for(const scene of comparisonShow?.scenes||state.scenes) {
    const option=document.createElement('option');option.value=scene.number;option.textContent=scene.number===65535?'Current':`Scene ${scene.number}`;select.appendChild(option);
  }
  researchReport=null;$('#downloadReport').disabled=true;$('#diffResult').textContent='Choose a scene and compare to inspect changed byte ranges.';
}
async function runComparison() {
  await commitCurrentScene();
  const source=comparisonShow||{entries:state.outerEntries,scenes:state.scenes};
  const number=Number($('#compareScene').value), scene=source.scenes.find(s=>s.number===number);
  const nested=parseTar(await gunzip(source.entries.find(e=>e.name===scene.stagePath).content));
  const after=findSceneDat(nested,number).content, before=state.current.datBytes;
  researchReport={schemaVersion:1,source:{file:state.fileName,scene:state.current.scene.number,sha256:await sha256(before)},
    target:{file:comparisonShow?.fileName||state.fileName,scene:number,sha256:await sha256(after)},...diffSceneBytes(before,after),dspBlocks:compareDspBlocks(before,after)};
  const r=researchReport;
  $('#diffResult').textContent=`${r.dspBlocks.length} DSP records differ (matched by label). See JSON for relative offsets.\n${r.changedBytes} changed bytes · ${r.knownBytes} in recognised fields · ${r.unknownBytes} unknown\n`+
    (r.beforeLength!==r.afterLength?'Lengths differ: positional offsets may be shifted.\n':'')+
    r.ranges.slice(0,300).map(d=>`\n0x${d.offset.toString(16)} · ${d.length} bytes · ${d.field||'UNKNOWN'}\nNear: ${d.nearestLabel?.text||'(no preceding string)'}\nA: ${hex(d.before)}\nB: ${hex(d.after)}\nCandidates only: ${JSON.stringify(d.interpretations)}`).join('')+
    (r.ranges.length>300?'\nFirst 300 ranges shown; download JSON for all ranges.':'');
  $('#downloadReport').disabled=false;
}
function downloadData(name,bytes,type) {
  const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
$('#compareFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {comparisonShow={...await analyseShow(file),fileName:file.name};$('#comparisonLabel').textContent=file.name;renderResearch();}
  catch(err){toast(err.message,true);}finally{e.target.value='';}
};
$('#clearComparison').onclick=()=>{comparisonShow=null;$('#comparisonLabel').textContent='Current show';renderResearch();};
$('#compareBtn').onclick=()=>runComparison().catch(e=>toast(e.message,true));
$('#downloadReport').onclick=()=>downloadData('dlive-comparison.json',JSON.stringify(researchReport,null,2),'application/json');
$('#stringSearch').oninput=()=>{const q=$('#stringSearch').value.toLowerCase(),records=stringRecords(state.current.datBytes).filter(r=>r.text.toLowerCase().includes(q));$('#researchStrings').textContent=records.slice(0,500).map(r=>`0x${r.offset.toString(16)}  ${r.text}`).join('\n');$('#stringCount').textContent=`${records.length} strings (up to 500 shown)`;};
$('#undoBtn').onclick=()=>historyStep();$('#redoBtn').onclick=()=>historyStep(true);

function parseDspBlocks(bytes) {
  const text=new TextDecoder('latin1').decode(bytes),out=[];
  const re=/(?:Parametric EQ(?: Send)?, |Graphic EQ, |Compressor, |Gate, |Highpass Filter |Lowpass Filter )[^\x00]{1,80}\x00/g;
  for(const match of text.matchAll(re)) {
    const pos=match.index;if(pos<2)continue;
    const length=bytes[pos-2]*256+bytes[pos-1],end=pos+length;
    const label=match[0].slice(0,-1),versionOffset=pos+label.length+1;
    // Limit to small labelled records. A substring inside 'SCF Gate' is not a record.
    if(length>1024||end>bytes.length||versionOffset>=end||!/^[- ,A-Za-z0-9]+$/.test(label))continue;
    out.push({label,offset:pos-2,length,version:bytes[versionOffset],payloadOffset:versionOffset+1,payload:bytes.slice(versionOffset+1,end)});
  }
  return out.filter(b=>out.filter(x=>x.label===b.label).length===1);
}
function compareDspBlocks(before,after) {
  const a=parseDspBlocks(before),b=parseDspBlocks(after),other=new Map(b.map(x=>[x.label,x])),out=[];
  for(const block of a) {
    const target=other.get(block.label);other.delete(block.label);
    if(!target){out.push({label:block.label,status:'missing in B'});continue;}
    const changes=[];
    for(let i=0;i<Math.max(block.payload.length,target.payload.length);i++)if(block.payload[i]!==target.payload[i])changes.push({relativeOffset:i,before:block.payload[i]??null,after:target.payload[i]??null});
    if(changes.length||block.version!==target.version)out.push({label:block.label,status:'changed',offsetA:block.payloadOffset,offsetB:target.payloadOffset,versionA:block.version,versionB:target.version,changes});
  }
  for(const block of other.values())out.push({label:block.label,status:'only in B'});
  return out;
}
