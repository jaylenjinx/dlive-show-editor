'use strict';

// Show-wide controlled-scene parameter checker. Read-only: it unpacks StageBox
// scenes in memory, compares recognised framed record states, and labels offsets
// against the verified mappings already used by the editor.
const RE_PREFIXES=[
  'AHFX Manager','Parametric EQ','Graphic EQ','Compressor,','SCF Compressor','Compressor side chain source',
  'Gate,','SCF Gate','Gate side chain source','Delay,','Input Mixer','Highpass Filter','Lowpass Filter',
  'Digital Attenuator','Stereo Image','StageBox Analogue Input','Preamp Model','Send Source Select','Levels and Mutes','AutoMicMixer'
];
const reStageCache=new Map();
let reLastReport=null;

function reSceneName(dat){return extractShowName(dat);}
function reReadU16(dat,o){return ((dat[o]<<8)|dat[o+1])>>>0;}
function reHex(bytes){return [...bytes].map(hexByte).join(' ');}
function reOffset(a,b){return a===b?'+'+a:'+'+a+'..'+b;}
function reFindAll(dat,text){
  const sig=asciiBytes(text),out=[];let pos=0;
  while(pos<=dat.length-sig.length){const p=indexOfBytes(dat,sig,pos);if(p<0)break;out.push(p);pos=p+1;}
  return out;
}
function reScanRecordsFast(dat){
  const out=[],seen=new Set();
  for(const prefix of RE_PREFIXES)for(const pos of reFindAll(dat,prefix)){
    if(pos<2||seen.has(pos))continue;
    const payloadLength=reReadU16(dat,pos-2),frameStart=pos-2,frameEnd=frameStart+2+payloadLength;
    if(payloadLength<5||payloadLength>8192||frameEnd>dat.length)continue;
    let j=pos,label='';
    while(j<frameEnd&&j<pos+160){const b=dat[j];if(b===0)break;if(b<32||b>126){label='';break;}label+=String.fromCharCode(b);j++;}
    if(label.length<4||j>=frameEnd||dat[j]!==0)continue;
    seen.add(pos);out.push({frameStart,pos,payloadLength,label,stateStart:j+1,frameEnd,stateLength:frameEnd-(j+1)});
  }
  return out.sort((a,b)=>a.frameStart-b.frameStart);
}
function reChangedRuns(a,b){
  const n=Math.min(a.length,b.length),runs=[];let s=-1,p=-1;
  for(let i=0;i<n;i++)if(a[i]!==b[i]){if(s<0)s=p=i;else if(i===p+1)p=i;else{runs.push([s,p]);s=p=i;}}
  if(s>=0)runs.push([s,p]);
  if(a.length!==b.length)runs.push([n,Math.max(a.length,b.length)-1]);
  return runs;
}
function reEngineId(record,dat){return record.label.startsWith('AHFX Manager')&&record.stateLength>=5?hexByte(dat[record.stateStart+3])+hexByte(dat[record.stateStart+4]):null;}
function reKnownField(record,a,b,dat){
  const label=record.label.trim(),match=(x,y,name)=>x<=a&&b<=y?{name,start:x,end:y}:null;
  if(label.startsWith('Highpass Filter Input Channel'))return match(1,2,'HPF frequency')||match(3,3,'HPF slope/type')||match(4,4,'HPF In/Out');
  if(label.startsWith('Lowpass Filter Input Channel'))return match(3,4,'LPF frequency')||match(10,10,'LPF In/Out');
  if(label.startsWith('Parametric EQ, Input Channel')){
    if(a===37&&b===37)return {name:'PEQ In/Out',start:37,end:37};
    for(let band=1;band<=4;band++){
      const q=1+(band-1)*9;
      const k=match(q,q+1,'PEQ band '+band+' gain')||match(q+2,q+3,'PEQ band '+band+' frequency')||match(q+4,q+5,'PEQ band '+band+' width')||match(q+6,q+6,'PEQ band '+band+' type');
      if(k)return k;
    }
  }
  if(label.startsWith('Compressor, Input Channel')){
    for(const [x,y,name] of [[1,1,'Compressor model'],[2,2,'Compressor On/Off'],[8,9,'Compressor threshold'],[10,11,'Compressor attack'],[12,13,'Compressor release'],[15,15,'Compressor ratio'],[16,17,'Compressor makeup'],[18,18,'Compressor knee'],[51,51,'Bus threshold'],[123,123,'Compressor SC filter'],[124,124,'Compressor SC BPF'],[125,126,'Compressor SC BPF frequency']]){const k=match(x,y,name);if(k)return k;}
  }
  if(label.startsWith('Gate, Input Channel'))for(const [x,y,name] of [[2,3,'Gate threshold'],[8,9,'Gate depth'],[10,11,'Gate hold'],[13,14,'Gate release'],[15,16,'Gate attack'],[18,18,'Gate On/Off']]){const k=match(x,y,name);if(k)return k;}
  if(label.startsWith('SCF Gate, Input Channel'))for(const [x,y,name] of [[3,4,'Gate SC low frequency'],[7,7,'Gate SC low type'],[12,13,'Gate SC high frequency'],[16,16,'Gate SC high type'],[19,19,'Gate SC filter'],[20,20,'Gate SC BPF/notch'],[21,22,'Gate SC BPF/notch frequency']]){const k=match(x,y,name);if(k)return k;}
  if(label.startsWith('Gate side chain source, Input Channel'))return match(1,2,'Gate sidechain source');
  if(label.startsWith('Delay, Input Channel'))return match(1,2,'Input delay')||match(3,3,'Input delay In/Out');
  if(label.startsWith('Digital Attenuator Input Channel'))return match(1,2,'Digital trim')||match(3,3,'Polarity');
  if(label.startsWith('Stereo Image Input Channel'))return match(2,2,'Stereo width')||match(3,3,'Stereo image mode');
  if(label.startsWith('StageBox Analogue Input, Number'))return match(1,2,'StageBox gain')||match(3,3,'StageBox pad')||match(4,4,'StageBox 48V');
  if(label.startsWith('AHFX Manager')){
    const eng=reEngineId(record,dat),fields=eng==='1c03'?
      [[29,29,'Spaces model'],[30,31,'Spaces Pre Delay'],[42,43,'Spaces DS'],[58,59,'Spaces Decay'],[60,61,'Spaces Width'],[62,63,'Spaces Length'],[68,69,'Spaces EL'],[70,71,'Spaces LL'],[76,77,'Spaces Low Cut'],[78,79,'Spaces High Cut'],[94,95,'Spaces SL'],[122,123,'Spaces Spread'],[125,125,'Spaces Echo section'],[127,127,'Spaces Echo 1'],[133,133,'Spaces Echo 2'],[147,147,'Spaces Size Link']]:eng==='1c04'?
      [[46,47,'Spaces damping LF frequency'],[64,65,'Spaces damping HF frequency'],[66,67,'Spaces damping HF shelf gain'],[68,69,'Spaces EL position'],[70,71,'Spaces LL position'],[83,83,'Spaces output HF type'],[86,87,'Spaces output HF shelf gain'],[93,93,'Spaces damping HF type'],[94,95,'Spaces SL position'],[30,31,'Spaces Pre Delay'],[32,33,'Spaces Density'],[34,35,'Spaces Impact'],[36,37,'Spaces Diffusion Early'],[38,39,'Spaces Diffusion Mid'],[40,41,'Spaces Diffusion Late'],[42,43,'Spaces Direct Send'],[50,51,'Spaces Colour HF Tone'],[54,55,'Spaces Colour frequency'],[56,57,'Spaces Colour gain'],[58,59,'Spaces Decay Time'],[60,61,'Spaces Width'],[62,63,'Spaces Length'],[72,73,'Spaces Modulation Rate'],[74,75,'Spaces Modulation Depth'],[76,77,'Spaces Output LF Cut'],[78,79,'Spaces Output HF Cut'],[122,123,'Spaces Stereo Spread'],...[[1,'L1',0],[2,'R1',3],[3,'L2',1],[4,'R2',4],[5,'L3',2],[6,'R3',5]].flatMap(([n,tap,k])=>[[96+4*k,97+4*k,`Spaces Echo ${n} (${tap}) Time`],[98+4*k,99+4*k,`Spaces Echo ${n} (${tap}) Gain`],[127+2*k,127+2*k,`Spaces Echo ${n} (${tap}) On/Off`]])]:eng==='1d00'?
      [[30,31,'Plate Pre Delay'],[36,37,'Plate Diffusion'],[38,39,'Plate Size'],[40,41,'Plate Shape'],[56,57,'Plate Decay'],[66,67,'Plate Modulation Speed'],[68,69,'Plate Modulation Depth'],[70,71,'Plate Output LF Cut'],[72,73,'Plate Output HF Cut'],[85,85,'Plate Type preset'],[112,113,'Plate Width'],[120,121,'Plate Position'],[131,131,'Plate Echoes section'],...[[1,'L1',0],[2,'R1',3],[3,'L2',1],[4,'R2',4],[5,'L3',2],[6,'R3',5]].flatMap(([n,tap,k])=>[[88+4*k,89+4*k,`Plate Echo ${n} (${tap}) Time`],[90+4*k,91+4*k,`Plate Echo ${n} (${tap}) Gain`],[133+2*k,133+2*k,`Plate Echo ${n} (${tap}) On/Off`]])]:eng==='2d00'?
      [[28,29,'Rhythm Delay Tempo'],[30,31,'Rhythm Delay Feedback'],[35,35,'Rhythm Delay Groove'],[38,39,'Rhythm Delay Amplitude'],[144,145,'Rhythm Delay Drive'],[147,147,'Rhythm Delay Global Tap'],[148,149,'Rhythm Delay Auto Pan']]:[];
    for(const [x,y,name] of fields){const k=match(x,y,name);if(k)return Object.assign(k,{engine:eng});}
  }
  return null;
}
async function reLoadStage(scene){
  if(reStageCache.has(scene.number))return reStageCache.get(scene.number);
  const outer=state.outerEntries&&state.outerEntries.find(e=>e.name===scene.stagePath);if(!outer)return null;
  const p=await unpackNested(outer,/StageBoxScene\d+\.dat$/);if(!p)return null;
  const item={number:scene.number,name:reSceneName(p.datBytes),dat:p.datBytes,records:reScanRecordsFast(p.datBytes)};
  reStageCache.set(scene.number,item);return item;
}
function reNumericLabel(name){
  const s=name.trim();let m=s.match(/([+-]?\d+(?:\.\d+)?)\s*(us|µs|ms|khz|hz|db|s|%)?\s*$/i),prefix='';
  if(m)prefix=s.slice(0,m.index).trim();else{m=s.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*(us|µs|ms|khz|hz|db|s|%)?\b\s*(.+)$/i);if(!m)return null;prefix=m[3].trim();}
  let value=Number(m[1]),unit=(m[2]||'').toLowerCase();if(unit==='khz'){value*=1000;unit='hz';}else if(unit==='us'||unit==='µs'){value/=1000;unit='ms';}else if(unit==='s'){value*=1000;unit='ms';}
  return {value,unit,prefix:prefix.toUpperCase().replace(/\s+/g,' ')};
}
function rePairDiff(a,b){
  const byKey=new Map(b.records.map(r=>[r.frameStart+':'+r.label,r])),changes=[];
  for(const ra of a.records){const rb=byKey.get(ra.frameStart+':'+ra.label);if(!rb||ra.stateLength!==rb.stateLength)continue;
    const sa=a.dat.slice(ra.stateStart,ra.frameEnd),sb=b.dat.slice(rb.stateStart,rb.frameEnd);
    for(const [x,y] of reChangedRuns(sa,sb)){
      const known=reKnownField(ra,x,y,a.dat),fs=known?known.start:x,fe=known?known.end:y;
      changes.push({record:ra.label.trim(),offset:reOffset(fs,fe),changedOffset:reOffset(x,y),start:fs,end:fe,before:reHex(sa.slice(fs,fe+1)),after:reHex(sb.slice(fs,fe+1)),known:known?known.name:null,engine:known&&known.engine?known.engine:reEngineId(ra,a.dat)});
    }
  }
  return {sceneA:{number:a.number,name:a.name},sceneB:{number:b.number,name:b.name},changes};
}
function reCandidates(pairs){
  const groups=new Map();
  for(const pair of pairs)for(const ch of pair.changes)for(const side of ['sceneA','sceneB']){
    const meta=reNumericLabel(pair[side].name);if(!meta||ch.end-ch.start+1!==2)continue;
    const raw=parseInt((side==='sceneA'?ch.before:ch.after).replace(/ /g,''),16),key=[ch.record,ch.offset,meta.prefix,meta.unit].join('|');
    if(!groups.has(key))groups.set(key,{record:ch.record,offset:ch.offset,prefix:meta.prefix,unit:meta.unit,points:new Map()});groups.get(key).points.set(meta.value,raw);
  }
  const out=[];
  for(const g of groups.values())if(g.points.size>=3){const pts=[...g.points.entries()].sort((a,b)=>a[0]-b[0]);let candidate='non-linear / table';
    if(pts.every(([x,y])=>Math.abs((0x8000+16*x)-y)<0.51))candidate='raw = 0x8000 + 16 × value';
    else if(g.unit==='hz'&&pts.every(([x,y])=>Math.abs(Math.floor(4608*Math.log2(x/4))-y)<=1))candidate='dLive logarithmic frequency coordinate';
    out.push({record:g.record,offset:g.offset,prefix:g.prefix,unit:g.unit,points:pts.map(([value,raw])=>({value,raw:'0x'+raw.toString(16).toUpperCase().padStart(4,'0')})),candidate});
  }
  return out;
}
async function analyseReverseEngineeringShow(){
  const root=$('#reverseEngineeringResults'),status=$('#reverseEngineeringStatus');if(!root||!state.scenes||!state.scenes.length)return;
  const btn=$('#reAnalyseBtn');btn.disabled=true;root.innerHTML='';status.textContent='Loading StageBox scenes…';reStageCache.clear();
  try{
    const maxGap=Math.max(1,Math.min(20,Number($('#reMaxGap')&&$('#reMaxGap').value||1))),scenes=state.scenes.filter(s=>s.stagePath&&s.number!==65535).sort((a,b)=>a.number-b.number),loaded=[];
    for(let i=0;i<scenes.length;i++){const x=await reLoadStage(scenes[i]);if(x)loaded.push(x);if(i%8===0)status.textContent='Loading StageBox scenes… '+(i+1)+'/'+scenes.length;}
    const pairs=[];for(let i=0;i+1<loaded.length;i++){const a=loaded[i],b=loaded[i+1];if(b.number-a.number>maxGap)continue;const d=rePairDiff(a,b);if(d.changes.length)pairs.push(d);}
    const candidates=reCandidates(pairs),known=pairs.reduce((n,p)=>n+p.changes.filter(c=>c.known).length,0),unknown=pairs.reduce((n,p)=>n+p.changes.filter(c=>!c.known).length,0);
    reLastReport={file:state.fileName,maxGap,sceneCount:loaded.length,pairs,candidates,summary:{knownChanges:known,unknownChanges:unknown}};
    status.textContent=loaded.length+' StageBox scenes · '+pairs.length+' adjacent pairs with processing changes · '+known+' known · '+unknown+' candidate changes';
    const table=document.createElement('section');table.className='panel';table.innerHTML='<h2>Adjacent scene parameter changes</h2><div class="config-table"></div>';const body=table.querySelector('.config-table');
    for(const p of pairs)for(const c of p.changes){const row=document.createElement('div');row.className='config-row';const title=p.sceneA.number+' '+p.sceneA.name+' → '+p.sceneB.number+' '+p.sceneB.name;const tag=c.known?'<span class="confidence verified">KNOWN</span> '+escapeHtml(c.known):'<span class="confidence unknown">CANDIDATE</span>';row.innerHTML='<strong>'+escapeHtml(title)+'</strong><code>'+escapeHtml(c.record)+' · state '+c.offset+'<br>'+c.before+' → '+c.after+'</code><span>'+tag+(c.engine?' · engine '+escapeHtml(c.engine):'')+'</span>';body.appendChild(row);}
    root.appendChild(table);
    if(candidates.length){const sec=document.createElement('section');sec.className='panel';sec.innerHTML='<h2>Candidate transforms</h2><div class="config-table"></div>';const b=sec.querySelector('.config-table');for(const c of candidates){const row=document.createElement('div');row.className='config-row';row.innerHTML='<strong>'+escapeHtml(c.prefix||c.record)+'</strong><code>'+escapeHtml(c.record)+' · '+c.offset+'</code><span>'+escapeHtml(c.candidate)+'</span>';b.appendChild(row);}root.appendChild(sec);}
  }catch(e){console.error(e);status.textContent='Analysis failed.';root.innerHTML='<div class="notice warn">'+escapeHtml(e.message||String(e))+'</div>';}finally{btn.disabled=false;}
}
function downloadReverseEngineeringJson(){
  if(!reLastReport){toast('Run the parameter analysis first.',true);return;}
  const blob=new Blob([JSON.stringify(reLastReport,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.fileName||'dlive').replace(/\.tar\.gz$/i,'')+'-parameter-check.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
$('#reAnalyseBtn')&&$('#reAnalyseBtn').addEventListener('click',()=>analyseReverseEngineeringShow());
$('#reDownloadBtn')&&$('#reDownloadBtn').addEventListener('click',downloadReverseEngineeringJson);
