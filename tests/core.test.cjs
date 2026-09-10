const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=fs.readFileSync(require('node:path').join(__dirname,'../app-core.js'),'utf8');
const ctx=vm.createContext({TextEncoder,TextDecoder,Uint8Array,Blob,Response,CompressionStream,DecompressionStream});
vm.runInContext(core+';globalThis.api={parseTar,writeTar,parseManagers,assertAllowedChanges,findSceneDat,analyseShow,gunzip,gzip};',ctx);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dsp-core.js'),'utf8')+';globalThis.dspApi={observedEqField,writeObservedEqGain};',ctx);
const api=ctx.api;
function entry(name,content=new Uint8Array([1,2,3])){return {name,content,type:'0',mtime:123,mode:0o640};}
function fixture(){let signature=new TextEncoder().encode('DCA Channel Name Colour Manager');let b=new Uint8Array(signature.length+2+240+20);b.set(signature);b[signature.length+1]=1;return b;}
test('TAR roundtrip preserves raw headers, contents and padding',()=>{
 const tar=api.writeTar([entry('Show/Version.dat')]);const entries=api.parseTar(tar);
 assert.deepEqual(api.writeTar(entries),tar);
 entries[0].content=new Uint8Array([4,5,6,7]);const result=api.parseTar(api.writeTar(entries));
 assert.equal(result[0].content.length,4);assert.equal(result[0].mtime,123);
});
test('invalid checksum, truncated payload and duplicate paths are rejected',()=>{
 const tar=api.writeTar([entry('a')]);let corrupt=tar.slice();corrupt[2]^=1;
 assert.throws(()=>api.parseTar(corrupt),/checksum/);
 assert.throws(()=>api.parseTar(tar.slice(0,513)),/Truncated/);
 assert.throws(()=>api.parseTar(api.writeTar([entry('a'),entry('a')])),/duplicate/);
});
test('manager ambiguity and invalid colour fail closed; nonzero name padding is supported',()=>{
 const b=fixture();assert.equal(api.parseManagers(b).length,1);
 const m=api.parseManagers(b)[0];b[m.dataStart+8]=255;assert.equal(api.parseManagers(b).length,1);
 b[m.colourStart]=8;assert.equal(api.parseManagers(b).length,0);
 const original=fixture(),double=new Uint8Array(original.length*2);double.set(original);double.set(original,original.length);assert.equal(api.parseManagers(double).length,0);
});
test('only recognised fields can change',()=>{
 const before=fixture(),after=before.slice();after[api.parseManagers(before)[0].dataStart]=65;api.assertAllowedChanges(before,after);
 after[after.length-1]=1;assert.throws(()=>api.assertAllowedChanges(before,after),/Unexpected write/);
});
test('zero-padded scene names resolve without arbitrary DAT fallback',()=>{
 assert.equal(api.findSceneDat([entry('StageBoxScene010.dat')],10).name,'StageBoxScene010.dat');
 assert.throws(()=>api.findSceneDat([entry('Other.dat')],10),/Expected one/);
});
if(process.env.DLIVE_SAMPLE) test('real show: all scenes parse, preserve metadata, and survive allowed edits',async()=>{
 const bytes=fs.readFileSync(process.env.DLIVE_SAMPLE);const tar=await api.gunzip(bytes),entries=api.parseTar(tar);
 const rebuilt=api.parseTar(api.writeTar(entries));assert.equal(rebuilt.length,entries.length);
 let count=0;
 for(const e of entries){const match=e.name.match(/^Show\/Scenes\/StageBoxScene(\d+)\.tar\.gz$/);if(!match)continue;
  const nested=api.parseTar(await api.gunzip(e.content));const d=api.findSceneDat(nested,Number(match[1]));
  const m=api.parseManagers(d.content);assert.equal(m.length,['001','010','011','012','013','014','015','65535'].includes(match[1])?14:12,`scene ${match[1]} manager count`);
  const edited=d.content.slice();edited[m[0].dataStart]=65;api.assertAllowedChanges(d.content,edited);
  d.content=edited;const reload=api.parseTar(await api.gunzip(await api.gzip(api.writeTar(nested))));
  assert.deepEqual(reload[0].content,edited);count++;
 }
 assert.ok(count>=10);console.log(`Validated ${count} real scenes, ${entries.length} outer entries.`);
});
const research=fs.readFileSync(require('node:path').join(__dirname,'../research.js'),'utf8');
vm.runInContext(research.slice(0,research.indexOf('let comparisonShow'))+research.slice(research.indexOf('function parseDspBlocks'))+';globalThis.researchApi={diffSceneBytes,parseDspBlocks,compareDspBlocks};',ctx);
test('binary comparison labels unknown bytes and handles length changes',()=>{
 const b=fixture(),a=b.slice();a[a.length-1]=3;a[api.parseManagers(b)[0].colourStart]=1;
 const r=ctx.researchApi.diffSceneBytes(b,a);assert.equal(r.changedBytes,2);assert.equal(r.knownBytes,1);assert.equal(r.unknownBytes,1);
 assert.equal(ctx.researchApi.diffSceneBytes(new Uint8Array([1]),new Uint8Array([1,2])).changedBytes,1);
});
test('DSP records compare by label across shifted absolute offsets',()=>{
 const label='Gate, Input Channel 01',size=label.length+2+3;
 const block=new Uint8Array(size+2);block[1]=size;block.set(new TextEncoder().encode(label),2);block[2+label.length+1]=3;block[block.length-1]=4;
 const shifted=new Uint8Array(block.length+3);shifted.set(block,3);shifted[shifted.length-1]=5;
 const changes=ctx.researchApi.compareDspBlocks(block,shifted);assert.equal(changes.length,1);assert.equal(changes[0].changes[0].after,5);assert.equal(changes[0].offsetB-changes[0].offsetA,3);
});

function eqFixture() {
 const label='Parametric EQ, Input Channel 16',payload=Buffer.from('000047970a80000000000065970a800000000000a72e0a800000000000cb2e0a8000000000','hex');
 const b=new Uint8Array(72);b[1]=70;b.set(new TextEncoder().encode(label),2);b[34]=4;b.set(payload,35);return b;
}
test('calibrated EQ gain reproduces observed bytes and is reversible',()=>{
 const before=eqFixture(),after=before.slice();ctx.dspApi.writeObservedEqGain(after,'-8.1');
 assert.equal(ctx.dspApi.observedEqField(after).value,'-8.1');
 assert.equal(after[44],0xf7);assert.equal(after[45],0xea);
 api.assertAllowedChanges(before,after);
 ctx.dspApi.writeObservedEqGain(after,'0');assert.deepEqual(after,before);
});
test('uncalibrated DSP values and altered or ambiguous records fail closed',()=>{
 const b=eqFixture();assert.throws(()=>ctx.dspApi.writeObservedEqGain(b,'-15.1'),/Gain must/);
 const other=b.slice();other[40]^=1;assert.equal(ctx.dspApi.observedEqField(other),null);assert.throws(()=>api.assertAllowedChanges(b,other),/Unexpected write/);
 const raw=b.slice();raw[44]=0x80;assert.throws(()=>api.assertAllowedChanges(b,raw),/Unexpected write/);
 const duplicate=new Uint8Array(144);duplicate.set(b);duplicate.set(b,72);assert.equal(ctx.dspApi.observedEqField(duplicate),null);
 assert.equal(ctx.dspApi.observedEqField(b.slice(0,-1)),null);
});
if(process.env.DLIVE_BASELINE_DAT&&process.env.DLIVE_CHANGED_DAT) test('private controlled pair: exact DSP reproduction and gzip roundtrip',async()=>{
 const before=new Uint8Array(fs.readFileSync(process.env.DLIVE_BASELINE_DAT)),expected=new Uint8Array(fs.readFileSync(process.env.DLIVE_CHANGED_DAT)),edited=before.slice();
 ctx.dspApi.writeObservedEqGain(edited,'-8.1');assert.deepEqual(edited,expected);api.assertAllowedChanges(before,edited);
 const nested=api.parseTar(await api.gunzip(await api.gzip(api.writeTar([entry('StageBoxScene010.dat',edited)]))));
 assert.deepEqual(nested[0].content,expected);
 ctx.dspApi.writeObservedEqGain(edited,'0');assert.deepEqual(edited,before);
});

test('positive gain lookup encodes 05fa and supports all measured transitions',()=>{
 const b=eqFixture();
 for(const value of ['6','-8.1','0','6']) {
  const before=b.slice();ctx.dspApi.writeObservedEqGain(b,value);api.assertAllowedChanges(before,b);
  assert.equal(ctx.dspApi.observedEqField(b).value,value);
 }
 assert.equal(b[44],5);assert.equal(b[45],250);
});
if(process.env.DLIVE_BASELINE_DAT&&process.env.DLIVE_POSITIVE_DAT) test('positive private sample is reproduced byte-for-byte',async()=>{
 const before=new Uint8Array(fs.readFileSync(process.env.DLIVE_BASELINE_DAT)),expected=new Uint8Array(fs.readFileSync(process.env.DLIVE_POSITIVE_DAT)),edited=before.slice();
 ctx.dspApi.writeObservedEqGain(edited,'6');assert.deepEqual(edited,expected);api.assertAllowedChanges(before,edited);
 const reload=api.parseTar(await api.gunzip(await api.gzip(api.writeTar([entry('StageBoxScene010.dat',edited)]))));assert.deepEqual(reload[0].content,expected);
});

test('new measured gains use signed big-endian lookup values',()=>{
 for(const [value,raw] of [['1',0x0103],['3',0x0303],['-3',0xfcfd]]) {
  const before=eqFixture(),after=before.slice();ctx.dspApi.writeObservedEqGain(after,value);
  assert.equal(after[44]*256+after[45],raw);assert.equal(ctx.dspApi.observedEqField(after).value,value);api.assertAllowedChanges(before,after);
 }
});
if(process.env.DLIVE_CALIBRATION_DIR) test('private scenes 11–13 reproduce target EQ records and preserve unrelated bytes',async()=>{
 const dir=process.env.DLIVE_CALIBRATION_DIR,baseline=new Uint8Array(fs.readFileSync(require('node:path').join(dir,'StageBoxScene010.dat')));
 for(const [scene,value] of [[11,'1'],[12,'3'],[13,'-3']]) {
  const expected=new Uint8Array(fs.readFileSync(require('node:path').join(dir,`StageBoxScene${String(scene).padStart(3,'0')}-calibration.dat`)));
  const offset=ctx.dspApi.observedEqField(expected).offset;
  // Reproduce this scene from its own zero-gain form, retaining its scene header.
  const before=expected.slice();ctx.dspApi.writeObservedEqGain(before,'0');const edited=before.slice();ctx.dspApi.writeObservedEqGain(edited,value);
  assert.deepEqual(edited,expected);api.assertAllowedChanges(before,edited);
  const baseField=ctx.dspApi.observedEqField(baseline),baseEdit=baseline.slice();ctx.dspApi.writeObservedEqGain(baseEdit,value);
  assert.deepEqual(baseEdit.slice(baseField.offset-9,baseField.offset+28),expected.slice(offset-9,offset+28));
  const reload=api.parseTar(await api.gunzip(await api.gzip(api.writeTar([entry(`StageBoxScene${scene}.dat`,edited)]))));assert.deepEqual(reload[0].content,expected);
 }
});

test('experimental continuous gain is bounded and rounds to the requested display',()=>{
 for(let tenths=-150;tenths<=150;tenths++) {
  const before=eqFixture(),after=before.slice(),gain=String(tenths/10);
  ctx.dspApi.writeObservedEqGain(after,gain);api.assertAllowedChanges(before,after);
  assert.equal(Number(ctx.dspApi.observedEqField(after).value),Number(gain));
 }
 for(const bad of ['',null,'NaN','Infinity','15.1','-15.1','1.23'])assert.throws(()=>ctx.dspApi.writeObservedEqGain(eqFixture(),bad));
});
if(process.env.DLIVE_CALIBRATION_DIR) test('endpoint records reproduce Director saves exactly',()=>{
 const dir=process.env.DLIVE_CALIBRATION_DIR;
 for(const [scene,value] of [[14,'-15'],[15,'15']]) {
  const expected=new Uint8Array(fs.readFileSync(require('node:path').join(dir,`StageBoxScene${String(scene).padStart(3,'0')}-calibration.dat`)));
  const edited=expected.slice();ctx.dspApi.writeObservedEqGain(edited,'0');ctx.dspApi.writeObservedEqGain(edited,value);assert.deepEqual(edited,expected);
 }
});
