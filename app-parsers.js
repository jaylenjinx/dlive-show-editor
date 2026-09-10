function parseManagers(dat){
  const result=[];
  for(const spec of MANAGERS){
    const sig=asciiBytes(spec.signature),pos=indexOfBytes(dat,sig);
    if(pos<2)continue;
    const payloadLength=(dat[pos-2]<<8)|dat[pos-1];
    const expectedLength=sig.length+2+(spec.count*10); // signature + NUL + version + 9*N names + N colours
    if(payloadLength!==expectedLength)continue;
    const dataStart=pos+sig.length+2;
    if(dat[pos+sig.length]!==0||dat[pos+sig.length+1]!==1)continue;
    const colourStart=dataStart+spec.count*9;
    if(pos+payloadLength>dat.length||colourStart+spec.count!==pos+payloadLength)continue;
    const items=[];
    for(let i=0;i<spec.count;i++)items.push({
      index:i+1,name:asciiAt(dat,dataStart+i*9,9),colour:dat[colourStart+i],
      nameOffset:dataStart+i*9,colourOffset:colourStart+i,
    });
    result.push({...spec,frameStart:pos-2,pos,payloadLength,totalLength:payloadLength+2,dataStart,colourStart,items});
  }
  return result;
}

function parseBankSwitcher(dat,spec){
  const sig=asciiBytes(spec.signature),pos=indexOfBytes(dat,sig);
  if(pos<2)return null;
  const payloadLength=(dat[pos-2]<<8)|dat[pos-1];
  const start=pos+sig.length+1;
  if(start+2>dat.length)return null;
  const version=dat[start],width=dat[start+1];
  const expectedLength=sig.length+1+2+(width*6*2);
  if(payloadLength!==expectedLength||pos+payloadLength>dat.length)return null;
  const layers=[];let o=start+2;
  for(let l=0;l<6;l++){
    const row=[];
    for(let f=0;f<width;f++){
      row.push({type:dat[o],index:dat[o+1],offset:o});o+=2;
    }
    layers.push(row);
  }
  return {...spec,frameStart:pos-2,pos,payloadLength,totalLength:payloadLength+2,start,version,width,layers,end:pos+payloadLength,valid:version===1};
}
function parseSurfaceBanks(dat){ return BANK_SIGNATURES.map(s=>parseBankSwitcher(dat,s)).filter(Boolean); }

function parseAhfxManagers(dat){
  const out=[];
  for(let slot=1;slot<=8;slot++){
    const sigText=`AHFX Manager ${String(slot).padStart(2,'0')}`;
    const pos=indexOfBytes(dat,asciiBytes(sigText));
    if(pos<2)continue;
    const payloadLength=(dat[pos-2]<<8)|dat[pos-1];
    if(payloadLength<40||pos+payloadLength>dat.length)continue;
    const payload=dat.slice(pos,pos+payloadLength);
    const engineId=`${hexByte(payload[19])}${hexByte(payload[20])}`;
    const preset=cString(payload,21,18);
    out.push({slot,frameStart:pos-2,pos,payloadLength,totalLength:payloadLength+2,payload,engineId,engineName:AHFX_ENGINE_IDS[engineId]||'Unknown engine',preset});
  }
  return out;
}
function changedRuns(a,b){
  if(!a||!b)return [];
  const idx=[];const n=Math.min(a.length,b.length);
  for(let i=0;i<n;i++)if(a[i]!==b[i])idx.push(i);
  if(a.length!==b.length)for(let i=n;i<Math.max(a.length,b.length);i++)idx.push(i);
  if(!idx.length)return [];
  const runs=[];let s=idx[0],p=s;
  for(const x of idx.slice(1)){if(x===p+1){p=x;continue;}runs.push([s,p]);s=p=x;}
  runs.push([s,p]);return runs;
}
function formatRuns(runs){ return runs.map(([a,b])=>a===b?`+0x${a.toString(16)}`:`+0x${a.toString(16)}–0x${b.toString(16)}`).join(', '); }

function scanFramedRecords(dat){
  const patterns=/(Name Colour Manager|AHFX Manager|Parametric EQ|Graphic EQ|Compressor|Gate|Delay|Send Source Select|Mixer|Preamp Model|Stereo Image|Soft Controls|Bank Switcher|Rotaries Control Manager|Levels and Mutes|AutoMicMixer)/i;
  const out=[],seen=new Set();
  for(let i=0;i+5<dat.length;i++){
    const payloadLength=(dat[i]<<8)|dat[i+1];
    if(payloadLength<5||payloadLength>8192||i+2+payloadLength>dat.length)continue;
    const p=i+2;let j=p,label='';
    while(j<i+2+payloadLength&&j<p+160){
      const b=dat[j];if(b===0)break;
      if(b<32||b>126){label='';break;}
      label+=String.fromCharCode(b);j++;
    }
    if(label.length<4||j>=i+2+payloadLength||dat[j]!==0||!patterns.test(label))continue;
    const key=`${i}:${label}`;if(seen.has(key))continue;seen.add(key);
    out.push({frameStart:i,payloadOffset:p,payloadLength,totalLength:payloadLength+2,label,paramOffset:j+1,paramLength:(i+2+payloadLength)-(j+1)});
  }
  return out;
}

function parseMixConfig(entries){
  const e=entries.find(x=>x.name==='Show/MixConfig/MixConfig.dat');
  if(!e)return null;
  const b=e.content;
  const result={raw:b.slice(),valid:b.length===13};
  if(b.length===13){
    result.fields=[
      ['Record version',b[0],'high'],
      ['Mono Groups',b[1],'high'],
      ['Stereo Groups',b[2],'high'],
      ['Mono RackExtra FX sends',b[3],'high'],
      ['Stereo RackExtra FX sends',b[4],'high'],
      ['Mono Auxes',b[5],'high'],
      ['Stereo Auxes',b[6],'high'],
      ['Unknown field 7',b[7],'unknown'],
      ['Unknown field 8',b[8],'unknown'],
      ['Mono Matrices',b[9],'high'],
      ['Stereo Matrices',b[10],'high'],
      ['Unknown field 11',b[11],'unknown'],
      ['Unknown field 12',b[12],'unknown'],
    ];
  }
  return result;
}
function getTextEntry(entries,path){
  const e=entries.find(x=>x.name===path);if(!e)return null;
  try{return dec.decode(e.content);}catch{return null;}
}

function extractPrintableStrings(bytes,min=5){
  const out=[];let s='',start=0;
  for(let i=0;i<bytes.length;i++){
    const b=bytes[i];
    if(b>=32&&b<=126){if(!s)start=i;s+=String.fromCharCode(b);}
    else{if(s.length>=min)out.push({text:s,offset:start});s='';}
  }
  if(s.length>=min)out.push({text:s,offset:start});
  return out;
}
function extractShowName(dat){
  if(dat.length<3)return 'dLive Show';
  let i=2,s='';
  while(i<dat.length&&dat[i]>=32&&dat[i]<=126&&s.length<64)s+=String.fromCharCode(dat[i++]);
  return s||'dLive Show';
}
function findStructureLabels(dat){ return scanFramedRecords(dat); }

async function unpackNested(outerEntry,datRegex){
  if(!outerEntry)return null;
  const nestedEntries=parseTar(await gunzip(outerEntry.content));
  const datEntry=nestedEntries.find(e=>datRegex.test(e.name))||nestedEntries.find(e=>e.name.endsWith('.dat'));
  if(!datEntry)return null;
  return {outer:outerEntry,nestedEntries,datEntry,datBytes:datEntry.content.slice()};
}
