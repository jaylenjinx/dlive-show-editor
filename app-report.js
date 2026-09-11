function exportResearchReport(){
  if(!state.current)return;
  const c=state.current;
  const mixerState=c.stage?parseInputMixerChannelState(c.stage.datBytes):null;
  const compressorStates=c.stage?parseInputCompressorStates(c.stage.datBytes):[];
  const report={
    format:'dlive-show-editor-research-v2.2',
    generatedAt:new Date().toISOString(),
    sourceFile:state.fileName,
    showVersion:getTextEntry(state.outerEntries,'Show/Version.dat')?.trim()||null,
    scene:c.scene.number,
    sceneName:c.stage?extractShowName(c.stage.datBytes):null,
    mixConfig:state.mixConfig?{
      raw:hexRange(state.mixConfig.raw),
      fields:state.mixConfig.fields?.map(([name,value,confidence])=>({name,value,confidence}))||[]
    }:null,
    nameManagers:c.stage?.managers.map(m=>({
      key:m.key,label:m.label,frameStart:m.frameStart,payloadLength:m.payloadLength,count:m.count,
      items:m.items.map(x=>({index:x.index,name:x.name,colour:x.colour}))
    }))||[],
    surfaceBanks:c.surface?.banks.map(b=>({
      bank:b.key,frameStart:b.frameStart,payloadLength:b.payloadLength,version:b.version,width:b.width,
      layers:b.layers.map(row=>row.map(x=>({type:x.type,index:x.index})))
    }))||[],
    inputPeq:c.stage?.peqs.map(p=>({channel:p.channel,frameStart:p.frameStart,payloadLength:p.payloadLength,bands:p.bands.map(b=>({band:b.band,gainRaw:b.gainRaw,gainDb:b.gainDb,frequencyRaw:b.frequencyRaw,frequencyHz:b.frequencyHz,widthRaw:b.widthRaw,widthIndex:b.widthIndex,widthLabel:b.widthLabel,widthFraction:b.widthFraction,stateHex:hexRange(b.stateBytes)}))}))||[],
    inputHpf:c.stage?parseInputHpfs(c.stage.datBytes).map(h=>({
      channel:h.channel,frameStart:h.frameStart,payloadLength:h.payloadLength,stateLength:h.stateLength,
      discriminator:h.discriminator,frequencyRaw:h.frequencyRaw,frequencyHz:h.frequencyHz,
      slopeRaw:h.slopeRaw,slopeLabel:h.slope?.label||null,
      bypassRaw:h.bypassRaw,active:h.active,bypassKnown:h.bypassKnown,
      rawHex:hexRange(h.raw)
    })):[],
    inputMixer:mixerState?{
      frameStart:mixerState.frameStart,payloadLength:mixerState.payloadLength,stateLength:mixerState.stateLength,
      headerHex:hexRange(mixerState.header),blockSize:mixerState.blockSize,
      channels:mixerState.channels.map(ch=>({
        channel:ch.channel,blockStart:ch.blockStart,blockSize:ch.blockSize,
        faderOffset:ch.faderOffset,faderRaw:ch.faderRaw,faderDb:ch.faderDb,faderInfinite:ch.faderInfinite,
        panOffset:ch.panOffset,panRaw:ch.panRaw,panPercent:ch.panPct,panLabel:ch.panLabel
      }))
    }:null,
    inputCompressorState:compressorStates.map(x=>({
      channel:x.channel,frameStart:x.frameStart,payloadLength:x.payloadLength,stateLength:x.stateLength,
      typeRaw:x.typeRaw,modelRaw:x.modelRaw,enableRaw:x.enableRaw,active:x.active,enableKnown:x.enableKnown
    })),
    ahfx:c.stage?.ahfx.map(f=>({
      slot:f.slot,frameStart:f.frameStart,payloadLength:f.payloadLength,engineId:f.engineId,
      engineName:f.engineName,preset:f.preset,payloadHex:hexRange(f.payload)
    }))||[],
    framedRecords:{
      stage:c.stage?.structure.map(r=>({frameStart:r.frameStart,payloadLength:r.payloadLength,label:r.label,paramLength:r.paramLength}))||[],
      surface:c.surface?.structure.map(r=>({frameStart:r.frameStart,payloadLength:r.payloadLength,label:r.label,paramLength:r.paramLength}))||[]
    }
  };
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`dlive-scene-${c.scene.number}-research-v2.2.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  toast('Exported reverse-engineering JSON report.');
}
