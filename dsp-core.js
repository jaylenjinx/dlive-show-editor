'use strict';

// Experimental signed Q8.8 gain, with exact lookup for measured Director values.
// See research/eq-gain-observation.json and REVERSE_ENGINEERING.md.
const OBSERVED_EQ = Object.freeze({
  label:'Parametric EQ, Input Channel 16', length:70, version:4,
  gainRelativeOffset:9,
  baseline:'000047970a80000000000065970a800000000000a72e0a800000000000cb2e0a8000000000',
  values:Object.freeze({'0':0x0000,'-8.1':0xf7ea,'6':0x05fa,'1':0x0103,'3':0x0303,'-3':0xfcfd,'-15':0xf100,'15':0x0f00}),
});
function observedEqField(bytes) {
  const spec=OBSERVED_EQ,sig=asciiBytes(spec.label),pos=indexOfBytes(bytes,sig);
  if(pos<2||indexOfBytes(bytes,sig,pos+1)>=0)return null;
  const end=pos+spec.length,start=pos+sig.length+2;
  if(end>bytes.length||bytes[pos-2]*256+bytes[pos-1]!==spec.length||bytes[pos+sig.length]!==0||bytes[pos+sig.length+1]!==spec.version)return null;
  const expected=Uint8Array.from(spec.baseline.match(/../g),x=>parseInt(x,16));
  if(end-start!==expected.length)return null;
  for(let i=0;i<expected.length;i++) {
    if(i===spec.gainRelativeOffset||i===spec.gainRelativeOffset+1)continue;
    if(bytes[start+i]!==expected[i])return null;
  }
  const offset=start+spec.gainRelativeOffset,raw=bytes[offset]*256+bytes[offset+1];
  const value=Object.keys(spec.values).find(key=>spec.values[key]===raw);
  const signed=raw>=0x8000?raw-65536:raw;
  if(signed < -3840 || signed > 3840)return null;
  return {offset,value:value??String(Number((signed/256).toFixed(1))),raw,label:'Input 16 · PEQ band 2 gain'};
}
function encodeEqGain(value) {
  if(value===null || String(value).trim()==='')throw new Error('Enter a gain from −15 to +15 dB.');
  const gain=Number(value);
  if(!Number.isFinite(gain)||gain < -15||gain > 15||Math.abs(gain*10-Math.round(gain*10))>1e-8)throw new Error('Gain must be −15 to +15 dB in 0.1 dB steps.');
  const key=String(gain);
  return Object.hasOwn(OBSERVED_EQ.values,key)?OBSERVED_EQ.values[key]:(Math.round(gain*256)&65535);
}
function writeObservedEqRaw(bytes,raw) {
  const field=observedEqField(bytes),signed=raw>=32768?raw-65536:raw;
  if(!field||!Number.isInteger(raw)||raw<0||raw>65535||signed < -3840||signed >3840)throw new Error('Unsupported DSP record or gain.');
  bytes[field.offset]=raw>>8;bytes[field.offset+1]=raw&255;
}
function writeObservedEqGain(bytes,value) {writeObservedEqRaw(bytes,encodeEqGain(value));}
function allowObservedDspChanges(before,after,allowed) {
  const a=observedEqField(before),b=observedEqField(after);
  if(a&&b&&a.offset===b.offset)allowed.fill(1,a.offset,a.offset+2);
}
