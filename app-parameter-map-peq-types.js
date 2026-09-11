'use strict';

const peqStateEntry=PARAMETER_MAP.find(x=>x.id==='peq-state');
if(peqStateEntry)Object.assign(peqStateEntry,{
  field:'Filter type + remaining state',
  offset:'band + 6..8',
  datatype:'type uint8 + 2 raw state bytes',
  transform:'band +6 type enum: 00 PEQ/Bell, 01 Low Shelf, 02 High Shelf, 03 LPF, 04 HPF; +7..8 remain unknown',
  confidence:'partial',write:true,
  evidence:'Controlled CH16 edge-band clones: Band1 HPF=04, PEQ=00, Low Shelf=01; Band4 LPF=03, PEQ=00, High Shelf=02. Each adjacent type scene changes only byte +6 outside the scene label.',
  notes:'Writer is deliberately context-restricted: Band 1 offers HPF / PEQ / Low Shelf; Band 4 offers LPF / PEQ / High Shelf. Bands 2–3 type remains untouched. Bytes +7..8 are always preserved.'
});

PARAMETER_MAP.push(
  {
    id:'peq-band1-type',area:'Input PEQ',record:'Parametric EQ, Input Channel NN',payload:'Band 1 of 4 × 9-byte band records',
    field:'Band 1 filter type',offset:'band 1 + 6',datatype:'uint8 enum',
    transform:'0x04 HPF; 0x00 PEQ/Bell; 0x01 Low Shelf',confidence:'verified',write:true,
    evidence:'Controlled CH16 scenes 71–73; only this byte changes outside scene-label bytes',
    notes:'Only the three proven Band 1 choices are offered.'
  },
  {
    id:'peq-band4-type',area:'Input PEQ',record:'Parametric EQ, Input Channel NN',payload:'Band 4 of 4 × 9-byte band records',
    field:'Band 4 filter type',offset:'band 4 + 6',datatype:'uint8 enum',
    transform:'0x03 LPF; 0x00 PEQ/Bell; 0x02 High Shelf',confidence:'verified',write:true,
    evidence:'Controlled CH16 scenes 75–77; only this byte changes outside scene-label bytes',
    notes:'Only the three proven Band 4 choices are offered.'
  },
  {
    id:'peq-bypass',area:'Input PEQ',record:'Parametric EQ, Input Channel NN',payload:'4 × 9-byte bands + one trailing byte',
    field:'PEQ In/Out',offset:'single trailing byte after Band 4',datatype:'uint8',
    transform:'0x00 In / active; 0x01 Out / bypassed',confidence:'verified',write:true,
    evidence:'Controlled CH16 scenes 79–82. Both In/Out pairs toggle only this one post-header byte in the complete 412047-byte StageBox scene; duplicate pair reproduces 00↔01 exactly.',
    notes:'Writer requires a one-byte tail already containing 00 or 01 and modifies only that byte.'
  },
  {
    id:'peq-state-remaining',area:'Input PEQ',record:'Parametric EQ, Input Channel NN',payload:'Each 9-byte band',
    field:'Remaining band state bytes',offset:'band + 7..8',datatype:'2 raw bytes',transform:'unknown',
    confidence:'unknown',write:false,evidence:'Stable across gain, frequency, width, edge-band type and PEQ In/Out experiments',
    notes:'Preserved exactly by every PEQ writer.'
  }
);
