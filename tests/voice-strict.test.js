const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../shoot/voice.js');

// Teammates talk during a drill. Only a short call that is clearly a result may register a shot.
test('ordinary talk near the court never registers a shot', () => {
    for (const talk of ['我們進去吧', '進來', '進來吧', '你有沒有看到', '你有看到嗎', '誰進了', '進去', '一起進場', '換我進', '中場休息', '中午吃什麼', '沒關係', '沒有人', '不用進', '要不要進去', '教練在叫你', '好球場', '再來一球', '加油']) {
        assert.equal(V.parse(talk), null, talk);
    }
});

test('"進不去" and "沒進去" are misses, not makes', () => {
    for (const t of ['進不去', '沒進去', '沒有進去', '差一點沒進']) assert.equal(V.parse(t), false, t);
});

test('clear calls, with the usual extras, still register', () => {
    for (const t of ['進', '進了', '進啦', '進球', '進球了', '這球進了', '我投進了', '投進了', '那顆進', '中', '中了', '有中', '好球', '空心', '漂亮', '近', '近了', 'made', 'make', 'in', 'yes', 'good', 'nice', '進！', '進。', '進了啦', '哇進了', '空心球', 'nice shot', 'good shot', '進了耶', '耶進了']) assert.equal(V.parse(t), true, t);
    for (const t of ['沒進', '沒有進', '沒進啦', '沒中', '不進', '不中', '打鐵', '麵包', '這球沒進', '那顆沒中', '我沒進', '歪了', '沒', 'miss', 'missed', 'no', '可惜沒進', '唉沒進', '太可惜了沒進', 'missed it']) assert.equal(V.parse(t), false, t);
});

test('questions and suggestions are not calls', () => {
    for (const t of ['進了嗎', '我投進了嗎', '有沒有進', '會進嗎', '進吧', '快進', '進不進']) assert.notEqual(V.parse(t), true, t);
});

test('a confident wrong transcript does not hide a usable second guess', () => {
    assert.deepEqual(V.fromAlternatives(['我們進去吧', '進']), {made: true, heard: '進'});
    assert.deepEqual(V.fromAlternatives(['進來', '你好']), {made: null, heard: '進來'});
});
