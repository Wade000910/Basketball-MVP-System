const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../專題程式/index.html'),'utf8');
test('nonfinite raw input ends confirmed recording without poisoning filter histories',()=>{
    const start=html.indexOf('if(!Number.isFinite(rawEb)');
    const code=html.slice(start,html.indexOf('localCapture.recordSignal',start));
    for(const confirmed of [true,false]) {
        let reset=false;
        const c={rawEb:NaN,rawKn:90,state:'RECORDING',shotData:[],armRaisedConfirmed:confirmed,now:100,ebFilter:{filter(){assert.fail('invalid value entered filter');}},knFilter:{filter(){assert.fail('invalid frame entered filter');}},resetProvisionalShot(){reset=true;}};
        vm.createContext(c);vm.runInContext('(function(){'+code+'})()',c);
        assert.equal(c.shotData.length,1);assert.equal(c.lastT,100);
        assert.equal(c.state,confirmed?'PROCESSING':'RECORDING');assert.equal(reset,!confirmed);
    }
});
