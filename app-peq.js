// Input PEQ decoder/editor — derived from controlled dLive 2.12 scene diffs.
// Record: uint16_be length, NUL-terminated label, byte bandCount (4),
// then 4 × 9-byte band payloads, plus one trailing byte.
// Band bytes: [gain_i16_be, frequency_u16_be, width_u16_be, type_u8, state_u8, state_u8].

const PEQ_WIDTH_TABLE = [
  '1.5','1.4','1.3','1.2','1.1','1','0.95','0.9','0.85','0.8','3/4','0.7','2/3',
  '0.6','0.55','0.5','0.45','0.4','1/3','0.3','1/4','0.2','1/6','0.13','1/9'
];

// Controlled CH16 edge-band type scenes prove byte +6 of each 9-byte band.
// Restrict writes to the combinations actually exposed and independently tested.
const PEQ_BAND_TYPE_OPTIONS = {
  1:[
    {raw:0x04,label:'HPF'},
    {raw:0x00,label:'PEQ / Bell'},
    {raw:0x01,label:'Low Shelf'},
  ],
  4:[
    {raw:0x03,label:'LPF'},
    {raw:0x00,label:'PEQ / Bell'},
    {raw:0x02,label:'High Shelf'},
  ],
};

function readU16BE(bytes,o){ return (bytes[o]<<8)|bytes[o+1]; }
function readI16BE(bytes,o){ const v=readU16BE(bytes,o); return v&0x8000?v-0x10000:v; }
function writeU16BE(bytes,o,v){ v=Math.max(0,Math.min(0xffff,Math.round(v)));bytes[o]=(v>>8)&0xff;bytes[o+1]=v&0xff; }
function writeI16BE(bytes,o,v){ v=Math.max(-32768,Math.min(32767,Math.round(v))); if(v<0)v+=0x10000;writeU16BE(bytes,o,v); }

function peqFrequencyFromRaw(raw){ return 4*Math.pow(2,raw/4608); }
function peqFrequencyToRaw(hz){
  const f=Math.max(20,Math.min(20000,Number(hz)||20));
  return Math.max(0,Math.min(0xffff,Math.floor(4608*Math.log2(f/4))));
}
function peqGainFromRaw(raw){ return raw/256; }
function peqGainToRaw(db){ return Math.round(Math.max(-15,Math.min(15,Number(db)||0))*256); }
function peqWidthIndex(raw){ return Math.max(0,Math.min(24,raw>>8)); }
function peqWidthLabel(raw){ return PEQ_WIDTH_TABLE[peqWidthIndex(raw)]||`raw ${raw}`; }
function peqWidthToRaw(index){ return Math.max(0,Math.min(24,Number(index)||0))<<8; }
function peqTypeOptions(band){ return PEQ_BAND_TYPE_OPTIONS[Number(band)]||[]; }
function peqTypeLabel(band,raw){
  return peqTypeOptions(band).find(x=>x.raw===raw)?.label || (raw===0?'PEQ / Bell':`Unknown 0x${hexByte(raw)}`);
}

function parseInputPeqs(dat){
  const out=[];
  for(let channel=1;channel<=128;channel++){
    const label=`Parametric EQ, Input Channel ${String(channel).padStart(2,'0')}`;
    const sig=asciiBytes(label),pos=indexOfBytes(dat,sig);
    if(pos<2)continue;
    const payloadLength=readU16BE(dat,pos-2);
    const nul=pos+sig.length;
    if(dat[nul]!==0||pos+payloadLength>dat.length)continue;
    const count=dat[nul+1];
    if(count!==4)continue;
    const bandStart=nul+2;
    if(bandStart+(count*9)>pos+payloadLength)continue;
    const bands=[];
    for(let i=0;i<count;i++){
      const o=bandStart+i*9;
      const gainRaw=readI16BE(dat,o),frequencyRaw=readU16BE(dat,o+2),widthRaw=readU16BE(dat,o+4);
      const typeRaw=dat[o+6],stateBytes=dat.slice(o+6,o+9),remainingStateBytes=dat.slice(o+7,o+9);
      bands.push({
        band:i+1,offset:o,
        gainRaw,gainDb:peqGainFromRaw(gainRaw),
        frequencyRaw,frequencyHz:peqFrequencyFromRaw(frequencyRaw),
        widthRaw,widthIndex:peqWidthIndex(widthRaw),widthLabel:peqWidthLabel(widthRaw),widthFraction:widthRaw&0xff,
        typeRaw,typeLabel:peqTypeLabel(i+1,typeRaw),stateBytes,remainingStateBytes,
      });
    }
    const tailStart=bandStart+count*9;
    out.push({channel,label,frameStart:pos-2,pos,payloadLength,totalLength:payloadLength+2,count,bands,tail:dat.slice(tailStart,pos+payloadLength)});
  }
  return out;
}

function ensureInputPeqs(){
  const stage=state.current?.stage;if(stage&&!stage.peqs)stage.peqs=parseInputPeqs(stage.datBytes);return stage?.peqs||[];
}
function getInputPeq(channel){ return ensureInputPeqs().find(p=>p.channel===Number(channel))||null; }
function setPeqGain(channel,band,db){
  const p=getInputPeq(channel),b=p?.bands?.[Number(band)-1];if(!b)return false;
  const raw=peqGainToRaw(db);writeI16BE(state.current.stage.datBytes,b.offset,raw);
  b.gainRaw=raw;b.gainDb=peqGainFromRaw(raw);markStageDirty();return true;
}
function setPeqFrequency(channel,band,hz){
  const p=getInputPeq(channel),b=p?.bands?.[Number(band)-1];if(!b)return false;
  const raw=peqFrequencyToRaw(hz);writeU16BE(state.current.stage.datBytes,b.offset+2,raw);
  b.frequencyRaw=raw;b.frequencyHz=peqFrequencyFromRaw(raw);markStageDirty();return true;
}
function setPeqWidth(channel,band,index){
  const p=getInputPeq(channel),b=p?.bands?.[Number(band)-1];if(!b)return false;
  const raw=peqWidthToRaw(index);writeU16BE(state.current.stage.datBytes,b.offset+4,raw);
  b.widthRaw=raw;b.widthIndex=peqWidthIndex(raw);b.widthLabel=peqWidthLabel(raw);b.widthFraction=0;markStageDirty();return true;
}
function setPeqType(channel,band,rawValue){
  const bandNum=Number(band),raw=Number(rawValue),allowed=peqTypeOptions(bandNum);
  if(!allowed.some(x=>x.raw===raw))return false;
  const p=getInputPeq(channel),b=p?.bands?.[bandNum-1];if(!b)return false;
  state.current.stage.datBytes[b.offset+6]=raw;
  b.typeRaw=raw;b.typeLabel=peqTypeLabel(bandNum,raw);
  b.stateBytes[0]=raw;
  markStageDirty();return true;
}

function formatHz(hz){
  if(hz>=10000)return `${(hz/1000).toFixed(hz%1000<10?0:1)} kHz`;
  if(hz>=1000)return `${(hz/1000).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')} kHz`;
  return `${Math.round(hz)} Hz`;
}

function renderPeq(){
  const root=$('#peqEditor'); if(!root)return;
  root.innerHTML='';
  const stage=state.current?.stage;if(stage&&!stage.peqs)stage.peqs=parseInputPeqs(stage.datBytes);
  if(!stage?.peqs?.length){root.innerHTML='<div class="notice warn">No recognised input PEQ records were found.</div>';return;}

  const controls=document.createElement('section');controls.className='panel peq-toolbar';
  controls.innerHTML='<div class="manager-head inline"><h2>Input channel</h2><span class="confidence verified">CONTROLLED-DIFF VERIFIED</span></div>';
  const select=document.createElement('select');select.id='peqChannelSelect';select.className='peq-channel-select';
  for(const p of stage.peqs){
    const name=stage.managers.find(x=>x.key==='inputs')?.items[p.channel-1]?.name||'';
    const o=document.createElement('option');o.value=p.channel;o.textContent=`CH ${p.channel}${name?` · ${name}`:''}`;select.appendChild(o);
  }
  const remembered=Number(root.dataset.channel||16);select.value=stage.peqs.some(p=>p.channel===remembered)?String(remembered):String(stage.peqs[0].channel);
  controls.appendChild(select);root.appendChild(controls);
  const cards=document.createElement('div');cards.className='peq-band-grid';root.appendChild(cards);

  const draw=()=>{
    root.dataset.channel=select.value;cards.innerHTML='';
    const p=getInputPeq(select.value);if(!p)return;
    for(const b of p.bands){
      const card=document.createElement('article');card.className='panel peq-band-card';
      const typeOptions=peqTypeOptions(b.band);
      card.innerHTML=`
        <div class="manager-head inline"><h2>Band ${b.band}</h2><code>+0x${(b.offset-p.frameStart).toString(16)}</code></div>
        ${typeOptions.length?'<label class="peq-field"><span>Filter type <small>verified edge-band enum</small></span><select data-k="type"></select><code>'+hexByte(b.typeRaw)+'</code></label>':''}
        <label class="peq-field"><span>Gain <small>signed 8.8 fixed point</small></span><div><input data-k="gain" type="number" min="-15" max="15" step="0.1" value="${b.gainDb.toFixed(3)}"><b>dB</b></div><code>${hexByte((b.gainRaw<0?b.gainRaw+65536:b.gainRaw)>>8)} ${hexByte((b.gainRaw<0?b.gainRaw+65536:b.gainRaw)&255)}</code></label>
        <label class="peq-field"><span>Frequency <small>exact log mapping</small></span><div><input data-k="freq" type="number" min="20" max="20000" step="1" value="${Math.round(b.frequencyHz)}"><b>Hz</b></div><code>${hexByte(b.frequencyRaw>>8)} ${hexByte(b.frequencyRaw&255)}</code></label>
        <label class="peq-field"><span>Bell width <small>A&amp;H octave-width scale</small></span><select data-k="width"></select><code>${hexByte(b.widthRaw>>8)} ${hexByte(b.widthRaw&255)}${b.widthFraction?` · frac ${b.widthFraction}/256`:''}</code></label>
        <div class="peq-field readonly"><span>${typeOptions.length?'Remaining state bytes':'State/type bytes'}</span><code>${typeOptions.length?hexRange(b.remainingStateBytes):hexRange(b.stateBytes)}</code><span class="confidence unknown">READ ONLY</span></div>`;
      const w=card.querySelector('[data-k="width"]');
      PEQ_WIDTH_TABLE.forEach((name,i)=>{const o=document.createElement('option');o.value=i;o.textContent=name;o.selected=i===b.widthIndex;w.appendChild(o);});
      const typeSelect=card.querySelector('[data-k="type"]');
      if(typeSelect){
        if(!typeOptions.some(x=>x.raw===b.typeRaw)){
          const unknown=document.createElement('option');unknown.value=b.typeRaw;unknown.textContent=`Unknown 0x${hexByte(b.typeRaw)} (preserve)`;unknown.selected=true;unknown.disabled=true;typeSelect.appendChild(unknown);
        }
        for(const spec of typeOptions){const o=document.createElement('option');o.value=spec.raw;o.textContent=spec.label;o.selected=spec.raw===b.typeRaw;typeSelect.appendChild(o);}
        typeSelect.onchange=()=>{if(setPeqType(p.channel,b.band,typeSelect.value))renderPeq();else toast('PEQ filter type write blocked.',true);};
      }
      const g=card.querySelector('[data-k="gain"]'),f=card.querySelector('[data-k="freq"]');
      g.onchange=()=>{ if(setPeqGain(p.channel,b.band,g.value)){g.value=b.gainDb.toFixed(3);renderPeq();} };
      f.onchange=()=>{ if(setPeqFrequency(p.channel,b.band,f.value)){f.value=String(Math.round(b.frequencyHz));renderPeq();} };
      w.onchange=()=>{ if(setPeqWidth(p.channel,b.band,w.value))renderPeq(); };
      cards.appendChild(card);
    }
    const meta=document.createElement('div');meta.className='notice peq-meta';
    meta.innerHTML=`CH ${p.channel} PEQ frame <code>0x${p.frameStart.toString(16)}</code> · payload ${p.payloadLength} bytes. Band 1/4 type byte +6 is verified writable; untouched width precision and remaining state bytes are preserved.`;
    cards.appendChild(meta);
  };
  select.onchange=draw;draw();
}
