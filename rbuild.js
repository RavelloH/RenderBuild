// RenderBuild v0.3.0

const Rlog = require('rlog-js');
const moment = require('moment');
const nodeCache = require('node-cache');
const cache = new nodeCache();
const rlog = new Rlog();
const fs = require('fs-extra');
const path = require('path');
const url = require('url');
const beautify = require('js-beautify/js');
const chokidar = require('chokidar');
const ejs = require('ejs');
const yaml = require('js-yaml');
const server = require('live-server');

rlog.onExit(() => {
    rlog.warning(
        'RBuild stopped due to a program error. \n' +
            'If you are unsure of the issue, please send the log to us: \n' +
            'https://github.com/RavelloH/RBuild/issues/new',
    );
});

const RBuild = {
    config: {
        RLog: {
            logFilePath: `./log/${moment().format('YYYYMMDDHHmmss')}.log`,
        },
        outputDirectory: './public/',
        templateDirectory: './template/',
        originDirectory: './origin/',
        retries: 3,
        jsBeautify: {
            indent_size: 4,
            indent_char: ' ',
            indent_with_tabs: false,
        },
        page: {},
        mainTemplate: 'layout.html',
        metadataFileName: 'metadata.yaml',
        childTemplate: {},
    },
    // 配置设置
    setConfig: function (object) {
        try {
            for (let key in object) {
                if (object.hasOwnProperty(key)) {
                    RBuild.config[key] = object[key];
                }
            }
            rlog.success('Configuration has been changed');
        } catch (err) {
            rlog.exit(error);
        }
    },
    // 配置导入
    importConfig: function (filepath) {
        // 配置文件导入
        if (fs.existsSync(filepath)) {
            rlog.info(`Start parsing custom configuration file in ${filepath}...`);
            try {
                const jsonString = fs.readFileSync(filepath, 'utf8');
                this.setConfig(JSON.parse(jsonString));
            } catch (err) {
                rlog.exit(err);
            }
        }
        // 环境变量导入
        // TODO
    },
    // 配置导出
    exportConfig: function (filepath) {
        try {
            const jsonString = JSON.stringify(this.config, null, 2);
            fs.writeFileSync(filepath, jsonString, 'utf8');
            rlog.success(`Successfully exported to ${filepath}`);
        } catch (err) {
            rlog.error(`Export failed: ${err}`);
        }
    },
    // 初始化
    init: async function () {
        rlog.config.setConfig(RBuild.config.RLog);
        rlog.info(`RenderBuild - v${RBuild.version}`);
        RBuild.importConfig('./config.json');
        if (!this.checkDirectory(this.config.outputDirectory)) {
            try {
                fs.mkdirSync(this.config.outputDirectory);
                rlog.warning('No output folder found, but successfully created');
            } catch (err) {
                rlog.exit(err);
            }
        }
        if (!this.checkDirectory(this.config.templateDirectory)) {
            rlog.exit('Unable to find folder:' + this.config.templateDirectory);
            return false;
        }
        if (!this.checkDirectory(this.config.originDirectory)) {
            rlog.exit('Unable to find folder:' + this.config.originDirectory);
            return false;
        }
        return true;
    },
    // 启动构建
    build: async function (rootPath) {
        // 预检查
        if (!(await this.init())) {
            return;
        }
        rlog.log('Start building...');
        let preTemplate = '';
        let mainTemplatePath = this.processPath(
            this.processPath(rootPath, this.config.templateDirectory),
            this.config.mainTemplate,
        );
        // 模板文件预构建
        // 主模板
        if (!fs.existsSync(mainTemplatePath)) {
            preTemplate = '<%- doc %>';
            rlog.warning(`Main template not found. Skip pre build.`);
        } else {
            try {
                mainTemplateContent = fs.readFileSync(mainTemplatePath).toString();
                rlog.info(`Start to build main templates in ${mainTemplatePath}...`);
                preTemplate = await this.singleBuild(
                    mainTemplateContent,
                    this.processPath(rootPath, this.config.templateDirectory),
                );
                rlog.log('Main template successfully built.');
            } catch (e) {
                rlog.exit(e);
                return;
            }
        }

        // 子模板
        let childTemplate = this.config.childTemplate;
        if (Object.keys(childTemplate).length == 0) {
            rlog.log('No child templates found, skipping child template construction');
        } else {
            rlog.info(`Starting to build ${Object.keys(childTemplate).length} child templates...`);
            try {
                for (let [key, value] of Object.entries(childTemplate)) {
                    // 构建
                    let childTemplateContent = fs
                        .readFileSync(
                            this.processPath(
                                rootPath,
                                this.processPath(this.config.templateDirectory, value.path),
                            ),
                        )
                        .toString();
                    childTemplate[key]['context'] = await this.singleBuild(
                        childTemplateContent,
                        this.processPath(rootPath, this.config.templateDirectory),
                    );
                }
                rlog.log('Child template successfully built.');
            } catch (e) {
                rlog.exit(e);
                return;
            }
        }

        // 资源内容导入
        rlog.log('Start copying resource files...');
        let fileList;
        try {
            fs.emptyDirSync(this.config.outputDirectory);
            fileList = this.traversePath(this.processPath(rootPath, this.config.originDirectory));
            fileList = this.categorizeFiles(fileList);
            fileList.otherFiles.forEach((filePath) => {
                this.copyFiles(
                    filePath,
                    this.moveFilePath(
                        filePath,
                        this.config.originDirectory,
                        this.config.outputDirectory,
                    ),
                );
            });
            rlog.success('File copying completed, start building...');
        } catch (e) {
            rlog.exit(e);
            return;
        }

        // 遍历构建
        try {
            for (let i = 0; i < fileList.htmlFiles.length; i++) {
                rlog.log(`Building ${fileList.htmlFiles[i]}...`);
                let doc = fs.readFileSync(fileList.htmlFiles[i], 'utf-8');
                doc = await this.singleBuild(doc, fileList.htmlFiles[i]);
                // 寻找元数据
                let metaData = {};
                if (fs.existsSync(this.convertFilePath(fileList.htmlFiles[i]))) {
                    metaData = this.yamlToObject(
                        fs.readFileSync(this.convertFilePath(fileList.htmlFiles[i]), 'utf-8'),
                    );
                }
                // 配置合并
                let config = this.config.page;
                config = this.mergeObjects(config, metaData);
                config.doc = doc;
                config.title = metaData.title || this.getFilename(fileList.htmlFiles[i]);
                config.keywords = metaData.keywords || '';
                config.description = metaData.description || '';
                config.pagetype = metaData.pagetype || '';
                config.url = (
                    config.siteUrl +
                    this.getPathAfter(fileList.htmlFiles[i], this.config.originDirectory)
                ).replace('index.html', '');
                config.pageJs = metaData.pageJsPath
                    ? `<script>${fs.readFileSync(
                          this.convertFilePath(fileList.htmlFiles[i], metaData.pageJsPath),
                      )}</script>`
                    : this.config.page.defaultScript;
                config.prefetch = metaData.prefetch || [];

                doc = ejs.render(preTemplate, config);

                // 保存文件
                this.writeFile(
                    this.processPath(
                        this.config.outputDirectory,
                        this.getPathAfter(fileList.htmlFiles[i], this.config.originDirectory),
                    ),
                    doc,
                );
            }
            rlog.success('Build completed.');
        } catch (e) {
            rlog.exit(e);
            return;
        }

        // 缓存导出
        cache.set('preTemplate', preTemplate);
    },
    // 单文件构建
    singleBuild: async function (text, path) {
        let page = text;
        let processingPath = this.getDirectoryPath(path);
        // 初次导入变量
        page = this.processVariables(page, this.config.page);
        while (this.getTemplate(page)) {
            // 解析模板引用
            let templateName = this.getTemplate(page);
            let templateInfo = this.parseTemplate(templateName);
            // 获取新模板
            let templatePath = this.processPath(processingPath, templateInfo.name);
            let templateContent = await this.readFile(templatePath);
            // 替换新模板中变量
            if (this.parseTemplate(templateContent)) {
                // 变量导入
                templateContent = this.processVariables(templateContent, templateInfo.param);
                // 模板路径拼接
                let newContent = this.getAllTemplate(templateContent);
                newContent.forEach((item) => {
                    // 处理引用路径
                    templateContent = templateContent.replace(
                        item,
                        item.replace(
                            this.parseTemplate(item).name,
                            this.processPath(
                                this.getDirectoryPath(templateInfo.name),
                                this.parseTemplate(item).name,
                            ),
                        ),
                    );
                });
            }
            page = page.replace(this.getTemplate(page), templateContent);
        }
        // 美化输出
        return beautify.html(page, this.config.jsBeautify);
    },
    dev: async function (rootPath) {
        rlog.info('Dev mode starting...');
        await this.build(rootPath);
        this.config.rootPath = rootPath;
        rlog.info('Start live build mode');
        server.start({
            root: this.config.outputDirectory,
            logLevel: 0,
        });
        rlog.success('Site is running on http://127.0.0.1:8080');
        chokidar.watch(this.config.templateDirectory).on('change', (event, path) => {
            this.build(RBuild.config.rootPath);
        });
        chokidar.watch(this.config.originDirectory).on('change', (path) => {
            // 缓存导入
            rlog.info(path);
            rlog.info(`Rebuilding ${path}...`);
            let doc = fs.readFileSync(path, 'utf-8');
            this.singleBuild(doc, path).then((doc) => {
                let preTemplate = cache.get('preTemplate');
                let metaData = {};
                if (fs.existsSync(this.convertFilePath(path))) {
                    metaData = this.yamlToObject(
                        fs.readFileSync(this.convertFilePath(path), 'utf-8'),
                    );
                }
                // 配置合并
                let config = this.config.page;
                config = this.mergeObjects(config, metaData);
                config.doc = doc;
                config.title = metaData.title || this.getFilename(fileList.htmlFiles[i]);
                config.keywords = metaData.keywords || '';
                config.description = metaData.description || '';
                config.pagetype = metaData.pagetype || '';
                config.url = config.siteUrl + this.getPathAfter(path, this.config.originDirectory);
                config.pageJs = metaData.pageJsPath
                    ? `<script>${fs.readFileSync(
                          this.convertFilePath(path, metaData.pageJsPath),
                      )}</script>`
                    : this.config.page.defaultScript;
                config.prefetch = metaData.prefetch || [];

                doc = ejs.render(preTemplate, config);

                // 保存文件
                this.writeFile(
                    this.processPath(
                        this.config.outputDirectory,
                        this.getPathAfter(path, this.config.originDirectory),
                    ),
                    doc,
                );
                rlog.info('Build finished');
            });
        });
    },
    // 找模板
    getTemplate: function (str) {
        const regex = /{{([^{}]+)}}/;
        const match = str.match(regex);

        if (match) {
            return match[0];
        }

        return null;
    },
    // 找很多模板
    getAllTemplate: function (str) {
        const regex = /{{([^{}]+)}}/g;
        const matches = str.match(regex) || [];

        return matches;
    },
    // 解析模板
    parseTemplate: function (template) {
        const regex = /\{\{\s*([^|}\s]+)(?:\|([^}]+))?\s*\}\}/;
        const match = template.match(regex);

        if (match) {
            const templateName = match[1];
            const params = match[2]
                ? match[2].split('|').reduce((result, param) => {
                      const [key, value] = param.split('=');
                      result[key.trim()] = value.trim();
                      return result;
                  }, {})
                : {};

            return {
                name: templateName,
                param: params,
            };
        }

        return null;
    },
    // 路径拼接
    processPath: function (startPath, nextPath, basePath = '') {
        let resultPath = '';

        // 判断是否为网络链接
        if (url.parse(startPath).protocol !== null) {
            resultPath = url.resolve(startPath, nextPath);
        } else if (url.parse(nextPath).protocol !== null) {
            resultPath = nextPath;
        } else {
            // 判断是否为文件链接
            if (nextPath.startsWith('/')) {
                resultPath = basePath + nextPath;
            } else {
                resultPath = path.join(startPath, nextPath);
            }
        }
        return resultPath;
    },
    // 文件读取
    readFile: async function (urls, retries = RBuild.config.retries || 3) {
        rlog.info('Fetching ' + urls);
        try {
            if (urls.startsWith('http://') || urls.startsWith('https://')) {
                const response = await fetch(urls);
                if (response.ok) {
                    return await response.text();
                } else {
                    rlog.exit(`Error fetching file from urls: ${urls}`);
                }
            } else {
                return fs.readFileSync(urls, 'utf-8');
            }
        } catch (error) {
            if (retries > 0) {
                rlog.warning(`Error reading file: ${error.message}. Retrying...`);
                return this.readFile(urls, retries - 1);
            } else {
                rlog.exit(error);
            }
        }
    },
    // 模板变量导入
    processVariables: function (str, param, pageParam = RBuild.config.page) {
        let variableRegex = /\{\{\{(\w+)(?:=(.*?))?\}\}\}/g;
        let result = str.replace(variableRegex, function (match, key, pageValue) {
            if (param.hasOwnProperty(key)) {
                return param[key];
            }
            if (pageParam.hasOwnProperty(key)) {
                return pageParam[key];
            }
            if (pageValue !== undefined) {
                return pageValue;
            }

            return '<%- ' + key + ' %>';
        });

        return result;
    },
    // 找文件路径
    getDirectoryPath: function (filePath) {
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            return filePath.replace(/(.*\/).*$/, '$1');
        } else {
            let directoryPath = filePath.replace(/\\/g, '/').replace(/\/[^\/]*$/, '');
            return directoryPath;
        }
    },
    // 找文件名
    getFilename: function (str) {
        return str.split('\\').pop().split('/').pop();
    },
    // 找元数据文件
    convertFilePath: function (currentPath, newFileName = this.config.metadataFileName) {
        var currentDirectory = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
        var newFilePath = currentDirectory + newFileName;

        return newFilePath;
    },
    // 检查目录
    checkDirectory: function (directory) {
        try {
            fs.accessSync(directory, fs.constants.F_OK);
            return true;
        } catch (err) {
            return false;
        }
    },
    // 文件遍历
    traversePath: function (directory) {
        let fileList = [];

        function traverse(directory) {
            const files = fs.readdirSync(directory);

            files.forEach((file) => {
                const filePath = path.join(directory, file);
                const stats = fs.statSync(filePath);

                if (stats.isFile()) {
                    fileList.push(filePath);
                } else if (stats.isDirectory()) {
                    traverse(filePath);
                }
            });
        }

        traverse(directory);

        return fileList;
    },
    // 文件分类
    categorizeFiles: function (fileList) {
        let categorizedFiles = {
            htmlFiles: [],
            otherFiles: [],
            markdownFiles: [],
        };

        fileList.forEach((file) => {
            const extension = file.split('.').pop();

            if (extension === 'html' || extension === 'htm') {
                categorizedFiles.htmlFiles.push(file);
            } else if (extension == 'md') {
                categorizedFiles.markdownFiles.push(file);
            } else {
                categorizedFiles.otherFiles.push(file);
            }
        });

        return categorizedFiles;
    },
    // 路径截取
    getPathAfter: function (filePath, after) {
        let fileName = path.basename(filePath);

        let relativePath = path.relative(after, filePath);

        if (relativePath === '.') {
            return fileName;
        }
        return relativePath;
    },
    createDirectories: function (dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, {
                recursive: true,
            });
        }
    },
    createFolder: function (dirpath, dirname) {
        if (typeof dirname === 'undefined') {
            if (fs.existsSync(dirpath)) {
            } else {
                createFolder(dirpath, path.dirname(dirpath));
            }
        } else {
            if (dirname !== path.dirname(dirpath)) {
                createFolder(dirpath);
                return;
            }
            if (fs.existsSync(dirname)) {
                fs.mkdirSync(dirpath);
            } else {
                createFolder(dirname, path.dirname(dirname));
                fs.mkdirSync(dirpath);
            }
        }
    },
    // yaml转Object
    yamlToObject: function (yamlString) {
        try {
            const obj = yaml.load(yamlString);
            return obj;
        } catch (e) {
            console.log(e);
            return null;
        }
    },
    // object合并
    mergeObjects: function (obj1, obj2) {
        // 创建一个新的对象，用于存储融合后的结果
        var mergedObj = {};

        // 遍历第一个对象的属性
        for (var prop in obj1) {
            mergedObj[prop] = obj1[prop];
        }

        // 遍历第二个对象的属性
        for (var prop in obj2) {
            mergedObj[prop] = obj2[prop];
        }

        return mergedObj;
    },
    // 复制文件
    copyFiles: function (sourcePath, targetPath) {
        // 读取源文件内容
        fs.readFile(sourcePath, (err, data) => {
            if (err) throw err;

            // 确保目标文件夹存在
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, {
                    recursive: true,
                });
            }

            // 将源文件内容写入目标文件
            fs.writeFileSync(targetPath, data, (err) => {
                if (err) rlog.exit(err);
            });
        });
    },
    // 文件写入
    writeFile: function (paths, data) {
        // 确保目标文件夹存在
        const targetDir = path.dirname(paths);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, {
                recursive: true,
            });
        }

        // 将源文件内容写入目标文件
        fs.writeFile(paths, data, (err) => {
            if (err) rlog.exit(err);
        });
    },
    // 转路径
    moveFilePath: function (originalPath, fromFolder, toFolder) {
        const relativePath = path.relative(fromFolder, originalPath);
        const newPath = path.join(toFolder, relativePath);
        return newPath;
    },
    version: '0.3.0',
};

module.exports = RBuild;
