'use strict';
function renderDsp() {
  const field=state.current&&observedEqField(state.current.datBytes),select=$('#eqGain');
  select.disabled=!field;
  $('#eqGainStatus').textContent=field
    ? `Current: ${field.value} dB · observed two-byte field at 0x${field.offset.toString(16)}`
    : 'Unavailable: this record differs from the calibrated sample. No DSP writes are enabled.';
  select.value=field?.value??'';
}
function setObservedDsp(value) {
  const c=state.current,field=c&&observedEqField(c.datBytes);
  if(!field)throw new Error('No calibrated EQ record found.');
  if(field.value===value)return;
  writeObservedEqGain(c.datBytes,value);
  c.undo.push({dsp:true,before:field.value,after:value});c.redo=[];
  markDirty();renderDsp();
}
$('#eqGain').onchange=event=>{
  try{setObservedDsp(event.target.value);}catch(error){toast(error.message,true);renderDsp();}
};
