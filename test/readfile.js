const RBuild = require('../rbuild');

async function test() {
    let result = await RBuild.readFile('https://ravelloh.top/');
    console.log(result);
}

test();
