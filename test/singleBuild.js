const RBuild = require('../rbuild');

RBuild.init();
RBuild.readFile('./template/layout.html').then((result) => {
    RBuild.singleBuild(result, './template/').then((data) => console.log(data));
});
