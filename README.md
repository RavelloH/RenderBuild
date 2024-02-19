# RBuild

基于NodeJS的模板化站点生成器，使用类MediaWiki模板语法与ejs语法快速构建静态/Serverless/动态站点。

## 特点

-   高性能
-   方便的模板化引用
-   全套ejs语法支持
-   模板间的参数/变量传递
-   多种配置方式，可单独对每一个页面进行配置
-   api式调用，可在serverless环境中使用
-   代码输出格式化
-   自带dev开发模式，增量构建，实时http预览
-   详细日志记录

## 使用

```shell
npm i render-build
```

### 静态页面构建

```javascript
const rbuild = require('render-build');

rbuild.build('./');
```

### serverless & 动态页面

```javascript
const rbuild = require('render-build');

rbuild.init();

const page = `
<html>
<head>
<title>{{{title}}}</title>
</head>
</html>`;

module.exports = (req, res) => {
    rbuild
        .singleBuild(page, {
            title: '',
        })
        .then((data) => {
            // return...
        });
};
```

## 语法

### 模板

```
{{filename | parma}}
```

例如：在一个文档中引入另一个文档的内容

```html
<!-- doc1 -->
<html>
    {{head.html|title=Test}}
</html>
```

```html
<!-- head.html -->
<head>
    <title>{{{title}}}</title>
</head>
```

构建后结果：

```html
<html>
    <head>
        <title>{{{title}}}</title>
    </head>
</html>
```

其中，你可以用管道符`|`来分隔文件名与参数。
`{{head.html|title=Test}}`会在引入head.html的同时，将head.html中的变量`title`赋值为`Test`.
你也可以同时传入多个参数，只需要简单的以`|`分隔即可。如：`{{head.html|title=Test|path=123|type=html}}`

其中，文件地址可以是相对路径(相对于所在的文件)、绝对路径、网络路径。
（是的，你可以直接用{{https://xxx.com/xxx.html}}来直接引入一个网络资源。）

### 变量

你可以以{{{变量名}}}的形式定义一个变量。
此外，也可以以{{{变量名=默认值}}}的形式，为该变量提供一个默认值。

例如:

```mediawiki
{{{data=hello}}}
```

对于变量，RenderBuild在构建时会依次以以下顺序读取：

1.模板间引用时的参数传递2.配置文件中的page对象3.变量中定义的默认值

如果都没有定义，将会抛出异常并提示错误位置。

另外，page对象会在每一次构建一个文件时重新更新。它由config.page与该文件下的metadata合并而成，优先为metadata中的值。

### ejs语法

支持全部ejs语法。例如，你可以这样用javascript在文档中对传入的变量进行处理。

```ejs
<div class="listlines">
    <% if (articles) { %>
    <% for(let i = 0; i < articles.length; i++){ %>
    <div class="loading listprogram">
        <article>
            <span class="article-name">
                <h4><a href="<%= articles[i]['path'] %>"><%= articles[i]['name'] %></a></h4>
            </span>
            <p class="articles-info">
                <time><%= articles[i]['time'] %></time> • <span class="i_small ri:archive-line"></span>
                <span class="class">
                    <% for(var cla = 0; cla < articles[i].cla.length; cla++){ %>
                    <a><%= articles[i]['cla'][cla] %></a>/
                    <% } %>
                </span>
            </p>
            <p class="articles-tags">
                <% for(var tag = 0; tag < articles[i].tag.length; tag++){ %>
                <a><%= articles[i]['tag'][cla] %></a>/
                <% } %>
            </p>
        </article>
        <hr>
    </div>
    <% } %>
    <% } else { %>
    <p>暂无文章</p>
    <% } %>
</div>
```

这里，构建时会读取传入的articles变量，并遍历输出为一个完整的文档树。

## 配置

### 配置文件

运行init()或者importConfig(filepath)时，会自动引入配置文件。默认情况下，init()时会自动引入当前目录下的config.json
配置文件需要是json，默认值已定义在rbuild.config中。也可以用rbuild.exportConfig(filepath)来导出当前配置。
其中的部分默认值及其意义如下：

-   Rlog: RLog相关配置。参照https://github.com/RavelloH/RLog修改。
-   outputDirectory: 输出文件夹，默认是`./public/``
-   templateDirectory: 模板文件夹，默认是`./template/`
-   originDirectory: 源内容文件夹，默认是`./origin/`
-   retries: 读取文件时的最大重试次数。默认是3
-   jsBeautify: 用于美化输出。
-   page: 部分用于构建的变量默认值。可以根据你使用的主题来自行设置。
-   mainTemplate: 主模板地址，是相对于templateDirectory下的文件路径。默认是`layout.html`
-   metadataFileName: 元数据文件名。默认是`metadata.yaml`
-   childTemplate: 用于定义子模板。例如：`{articles: {name: 'articles-index',path: 'child/articles.html'}`

### metadata

metadata是renderbuild在对origin中文件进行构建时的自定义配置。

具体来讲，当构建origin中的html/markdown文件时，会自动的检查该文件同级目录下是否有metadata配置文件(默认文件名是`metadata.yaml`)，可在配置中自行更改。

若发现metadata，renderbuild会将其整合进该文件构建过程中的config.page对象中，并参与构建，这样你就可以在构建过程中使用metadata中的自定义参数

## API

你可以仿照build()的默认行为，使用renderbuild提供的API进行自定义构建。提供的API及其输入/输出如下

1. setConfig(object): 设置配置信息。
   参数：

-   object: 包含配置信息的对象。
    返回值：无。

2. importConfig(filepath): 导入配置信息。
   参数：

-   filepath: 配置文件的路径。
    返回值：无。

3. exportConfig(filepath): 导出配置信息。
   参数：

-   filepath: 导出配置文件的路径。
    返回值：无。

4. init(): 初始化构建过程。如果使用build()，则不用手动初始化
   参数：无。
   返回值：无。

5. build(rootPath): 构建整个网站。
   参数：

-   rootPath: 网站根目录的路径。
    返回值：无。

6. singleBuild(text, path): 构建单个模板。
   参数：

-   text: 待构建的文本内容。
-   path: 模板的路径。
    返回值：构建后的文本内容。

7. dev(): 进入开发模式。
   参数：无。
   返回值：无。

8. getTemplate(str): 获取模板字符串。
   参数：

-   str: 包含模板的字符串。
    返回值：模板字符串。

9. getAllTemplate(str): 获取所有模板字符串。
   参数：

-   str: 包含模板的字符串。
    返回值：包含所有模板字符串的数组。

10. parseTemplate(template): 解析模板字符串。
    参数：

-   template: 模板字符串。
    返回值：解析后的模板对象。

11. processPath(startPath, nextPath, basePath): 处理文件路径。
    参数：

-   startPath: 起始路径。
-   nextPath: 下一个路径。
-   basePath: 基本路径（可选）。
    返回值：处理后的路径。

12. readFile(urls, retries): 读取文件内容。
    参数：

-   urls: 文件的URL或路径。
-   retries: 重试次数（可选）。
    返回值：文件的内容。

13. processVariables(str, param, pageParam): 处理变量。
    参数：

-   str: 包含变量的字符串。
-   param: 变量对象。
-   pageParam: 页面变量对象（可选）。
    返回值：处理后的字符串。

14. getDirectoryPath(filePath): 获取目录路径。
    参数：

-   filePath: 文件路径。
    返回值：目录路径。

15. getFilename(str): 获取文件名。
    参数：

-   str: 包含文件路径的字符串。
    返回值：文件名。

16. convertFilePath(currentPath, newFileName): 转换文件路径。
    参数：

-   currentPath: 当前文件路径。
-   newFileName: 新文件名（可选）。
    返回值：转换后的文件路径。

17. checkDirectory(directory): 检查目录是否存在。
    参数：

-   directory: 目录路径。
    返回值：目录是否存在的布尔值。

18. traversePath(directory): 遍历目录中的文件。
    参数：

-   directory: 目录路径。
    返回值：文件列表。

19. categorizeFiles(fileList): 将文件按类型分类。
    参数：

-   fileList: 文件列表。
    返回值：按类型分类的文件对象。

20. getPathAfter(filePath, after): 获取文件路径相对于给定路径的相对路径。
    参数：

-   filePath: 文件路径。
-   after: 给定路径。
    返回值：相对路径。

21. createDirectories(dirPath): 创建目录。
    参数：

-   dirPath: 目录路径。
    返回值：无。

22. createFolder(dirpath, dirname): 创建文件夹。
    参数：

-   dirpath: 目录路径。
-   dirname: 文件夹名称。
    返回值：无。

23. yamlToObject(yamlString): 将YAML字符串转换为对象。
    参数：

-   yamlString: YAML字符串。
    返回值：转换后的对象。

24. mergeObjects(obj1, obj2): 合并两个对象。
    参数：

-   obj1: 第一个对象。
-   obj2: 第二个对象。
    返回值：合并后的对象。

25. copyFiles(sourcePath, targetPath): 复制文件。
    参数：

-   sourcePath: 源文件路径。
-   targetPath: 目标文件路径。
    返回值：无。

26. writeFile(paths, data): 写入文件。
    参数:

-   paths: 文件路径
-   data: 文件的内容

27. moveFilePath(originalPath, fromFolder, toFolder): 将一个文件的路径从一个文件夹修改到另一个文件夹，并返回新的路径
    参数:

-   originalPath: 完整路径
-   fromFolder: 来自的文件夹
-   toFolder: 要转到的文件夹
