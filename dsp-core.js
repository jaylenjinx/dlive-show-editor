'use strict';

// Calibrated lookup, not an inferred continuous gain encoding.
// See research/eq-gain-observation.json and REVERSE_ENGINEERING.md.
const OBSERVED_EQ = Object.freeze({
  label:'Parametric EQ, Input Channel 16', length:70, version:4,
  gainRelativeOffset:9,
  baseline:'000047970a80000000000065970a800000000000a72e0a800000000000cb2e0a8000000000',
  values:Object.freeze({'0':0x0000,'-8.1':0xf7ea,'6':0x05fa}),
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
  if(value===undefined)return null;
  return {offset,value,raw,label:'Input 16 · PEQ band 2 gain'};
}
function writeObservedEqGain(bytes,value) {
  const field=observedEqField(bytes);
  if(!field || !Object.hasOwn(OBSERVED_EQ.values,String(value)))throw new Error('This DSP value or record has not been calibrated.');
  const raw=OBSERVED_EQ.values[String(value)];bytes[field.offset]=raw>>8;bytes[field.offset+1]=raw&255;
}
function allowObservedDspChanges(before,after,allowed) {
  const a=observedEqField(before),b=observedEqField(after);
  if(a&&b&&a.offset===b.offset)allowed.fill(1,a.offset,a.offset+2);
}
