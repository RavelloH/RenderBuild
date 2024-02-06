const RBuild = require('../rbuild');

console.log(
    RBuild.processPath(
        RBuild.getDirectoryPath('/data/data/com.termux/files/home/RBuild/origin/layout.html'),
        'test/test2.html',
    ),
);
