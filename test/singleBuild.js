const RBuild = require('../rbuild');

//console.log(RBuild. processPath('https://raw.githubusercontent.com/RavelloH/ravelloh.github.io/master/template/layout.html','static/metaData.html'))

RBuild.init();
RBuild.readFile('./template/layout.html').then((result) => {
    RBuild.singleBuild(result, '/template/').then((data) => console.log(data));
});
