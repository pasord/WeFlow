"use strict";

const _ = require('lodash');
const async = require('async');
const vfs = require('vinyl-fs');
const fs = require('fs');
const del = require('del');
const path = require('path');
const ejs = require('gulp-ejs');
const gulpif = require('gulp-if');
const less = require('gulp-less');
const util = require(path.join(__dirname, './lib/util'));
const uglify = require('gulp-uglify');
const usemin = require('gulp-usemin2');
const lazyImageCSS = require('gulp-lazyimagecss');  // 自动为图片样式添加 宽/高/background-size 属性
const minifyCSS = require('gulp-cssnano');
const imagemin = require('gulp-imagemin');
const pngquant = require('imagemin-pngquant');
const ejshelper = require('tmt-ejs-helper');
const postcss = require('gulp-postcss');  // CSS 预处理
const postcssPxtorem = require('postcss-pxtorem'); // 转换 px 为 rem
const postcssAutoprefixer = require('autoprefixer');
const posthtml = require('gulp-posthtml');
const posthtmlPx2rem = require('posthtml-px2rem');
const RevAll = require('gulp-rev-all');   // reversion
const revDel = require('gulp-rev-delete-original');
const Common = require(path.join(__dirname, '../common'));

let tmtsprite;

if(Common.PLATFORM !== 'win32'){
    tmtsprite = require('gulp-tmtsprite');   // 雪碧图合并
}

let webp = require(path.join(__dirname, './common/webp'));
let changed = require(path.join(__dirname, './common/changed'))();

function dist(projectPath, log, callback) {

    let projectConfigPath = path.join(projectPath, 'weflow.config.json');
    let config = null;

    if(Common.fileExist(projectConfigPath)){
        config = Common.requireUncached(projectConfigPath);
    }else{
        config = Common.requireUncached(path.join(__dirname, '../../weflow.config.json'));
    }

    let lazyDir = config.lazyDir || ['../slice'];

    let postcssOption = [];

    if (config.supportREM) {
        postcssOption = [
            postcssAutoprefixer({browsers: ['last 5 versions']}),
            postcssPxtorem({
                root_value: '20', // 基准值 html{ font-zise: 20px; }
                prop_white_list: [], // 对所有 px 值生效
                minPixelValue: 2 // 忽略 1px 值
            })
        ]
    } else {
        postcssOption = [
            postcssAutoprefixer({browsers: ['last 5 versions']})
        ]
    }

    let paths = {
        src: {
            dir: path.join(projectPath, './src'),
            img: path.join(projectPath, './src/img/**/*.{JPG,jpg,png,gif}'),
            slice: path.join(projectPath, './src/slice/**/*.png'),
            js: path.join(projectPath, './src/js/**/*.js'),
            media: path.join(projectPath, './src/media/**/*'),
            less: path.join(projectPath, './src/css/style-*.less'),
            lessAll: path.join(projectPath, './src/css/**/*.less'),
            html: [path.join(projectPath, './src/html/**/*.html'), path.join(projectPath, '!./src/html/_*/**.html')],
            htmlAll: path.join(projectPath, './src/html/**/*')
        },
        tmp: {
            dir: path.join(projectPath, './tmp'),
            dirAll: path.join(projectPath, './tmp/**/*'),
            css: path.join(projectPath, './tmp/css'),
            cssAll: path.join(projectPath, './tmp/style-*.css'),
            img: path.join(projectPath, './tmp/img'),
            html: path.join(projectPath, './tmp/html'),
            sprite: path.join(projectPath, './tmp/sprite'),
            spriteAll: path.join(projectPath, './tmp/sprite/**/*')
        },
        dist: {
            dir: path.join(projectPath, './dist'),
            css: path.join(projectPath, './dist/css'),
            img: path.join(projectPath, './dist/img'),
            html: path.join(projectPath, './dist/html'),
            sprite: path.join(projectPath, './dist/sprite')
        }
    };

    // 清除 dist 目录
    function delDist(cb) {
        del(paths.dist.dir, {force: true}).then(function () {
            cb();
        })
    }

    function condition(file){
        return path.extname(file.path) === '.png';
    }

    //编译 less
    function compileLess(cb) {
        vfs.src(paths.src.less)
            .pipe(less())
            .pipe(lazyImageCSS({imagePath: lazyDir}))
            .pipe(tmtsprite({margin: 4}))
            .pipe(gulpif(condition, vfs.dest(paths.tmp.sprite), vfs.dest(paths.tmp.css)))
            .on('data', function(){})
            .on('end', function () {
                console.log('compileLess success.');
                log('compileLess success.');
                cb && cb();
            })
    }

    //win 编译LESS
    function compileLessForWin(cb) {
        vfs.src(paths.src.less)
            .pipe(less())
            .pipe(lazyImageCSS({imagePath: lazyDir}))
            .on('data', function(){})
            .on('end', function () {
                console.log('compileLess success.');
                log('compileLess success.');
                cb && cb();
            })
    }

    //自动补全
    function compileAutoprefixer(cb) {
        vfs.src(paths.tmp.cssAll)
            .pipe(postcss(postcssOption))
            .pipe(vfs.dest(paths.tmp.css))
            .on('end', function () {
                console.log('compileAutoprefixer success.');
                log('compileAutoprefixer success.');
                cb && cb();
            });
    }

    //CSS 压缩
    function miniCSS(cb) {
        vfs.src(paths.tmp.cssAll)
            .pipe(minifyCSS({
                safe: true,
                reduceTransforms: false,
                advanced: false,
                compatibility: 'ie7',
                keepSpecialComments: 0
            }))
            .pipe(vfs.dest(paths.tmp.css))
            .on('end', function () {
                console.log('miniCSS success.');
                log('miniCSS success.');
                cb && cb();
            });
    }

    //图片压缩
    function imageminImg(cb) {
        vfs.src(paths.src.img)
            .pipe(imagemin({
                use: [pngquant()]
            }))
            .pipe(vfs.dest(paths.tmp.img))
            .on('end', function () {
                console.log('imageminImg success.');
                log('imageminImg success.');
                cb && cb();
            });
    }

    //雪碧图压缩
    function imageminSprite(cb) {
        vfs.src(paths.tmp.spriteAll)
            .pipe(imagemin({
                use: [pngquant()]
            }))
            .pipe(vfs.dest(paths.tmp.sprite))
            .on('end', function () {
                console.log('imageminSprite success.');
                log('imageminSprite success.');
                cb && cb();
            });
    }

    //复制媒体文件
    function copyMedia(cb) {
        vfs.src(paths.src.media, {base: paths.src.dir})
            .pipe(vfs.dest(paths.dist.dir))
            .on('end', function () {
                console.log('copyMedia success.');
                log('copyMedia success.');
                cb && cb();
            });
    }

    //复制slice
    function copySlice(cb) {
        vfs.src(paths.src.slice, {base: paths.src.dir})
            .pipe(vfs.dest(paths.dist.dir))
            .on('end', function () {
                console.log('copySlice success.');
                log('copySlice success.');
                cb && cb();
            });
    }

    //JS 压缩
    function uglifyJs(cb) {
        vfs.src(paths.src.js, {base: paths.src.dir})
            .pipe(uglify())
            .pipe(vfs.dest(paths.tmp.dir))
            .on('end', function () {
                console.log('uglifyJs success.');
                log('uglifyJs success.');
                cb && cb();
            });
    }

    //html 编译
    function compileHtml(cb) {
        vfs.src(paths.src.html)
            .pipe(ejs(ejshelper()))
            .pipe(gulpif(
                config.supportREM,
                posthtml(
                    posthtmlPx2rem({
                        rootValue: 20,
                        minPixelValue: 2
                    })
                ))
            )
            .pipe(usemin({  //JS 合并压缩
                jsmin: uglify()
            }))
            .pipe(vfs.dest(paths.tmp.html))
            .on('end', function () {
                console.log('compileHtml success.');
                log('compileHtml success.');
                cb && cb();
            });
    }

    //新文件名(md5)
    function reversion(cb) {
        var revAll = new RevAll({
            fileNameManifest: 'manifest.json',
            dontRenameFile: ['.html', '.php']
        });

        if (config['reversion']) {
            vfs.src(paths.tmp.dirAll)
                .pipe(revAll.revision())
                .pipe(vfs.dest(paths.tmp.dir))
                .pipe(revDel({
                    exclude: /(.html|.htm)$/
                }))
                .pipe(revAll.manifestFile())
                .pipe(vfs.dest(paths.tmp.dir))
                .on('end', function () {
                    console.log('reversion success.');
                    log('reversion success.');
                    cb && cb();
                })
        } else {
            cb && cb();
        }
    }

    //webp 编译
    function supportWebp(cb) {
        if (config['supportWebp']) {
            webp(projectPath, cb);
        } else {
            cb();
        }
    }

    // 清除 tmp 目录
    function delTmp(cb) {
        del(paths.tmp.dir, {force: true}).then(function (delpath) {
            cb();
        })
    }

    function findChanged(cb) {

        if (!config['supportChanged']) {
            vfs.src(paths.tmp.dirAll, {base: paths.tmp.dir})
                .pipe(vfs.dest(paths.dist.dir))
                .on('end', function () {
                    delTmp(cb);
                })
        } else {
            var diff = changed(paths.tmp.dir);
            var tmpSrc = [];

            if (!_.isEmpty(diff)) {

                //如果有reversion
                if (config['reversion'] && config['reversion']['available']) {
                    var keys = _.keys(diff);

                    //先取得 reversion 生成的manifest.json
                    var reversionManifest = require(path.join(paths.tmp.dir, './manifest.json'));

                    if (reversionManifest) {
                        reversionManifest = _.invert(reversionManifest);

                        reversionManifest = _.pick(reversionManifest, keys);

                        reversionManifest = _.invert(reversionManifest);

                        _.forEach(reversionManifest, function (item, index) {
                            tmpSrc.push(path.join(paths.tmp.dir, item));
                            console.log('[changed:] ' + util.colors.blue(index));
                        });

                        //将新的 manifest.json 保存
                        fs.writeFileSync(path.join(paths.tmp.dir, './manifest.json'), JSON.stringify(reversionManifest));

                        tmpSrc.push(path.join(paths.tmp.dir, './manifest.json'));
                    }
                } else {
                    _.forEach(diff, function (item, index) {
                        tmpSrc.push(path.join(paths.tmp.dir, index));
                        console.log('[changed:] ' + util.colors.blue(index));
                    });
                }

                vfs.src(tmpSrc, {base: paths.tmp.dir})
                    .pipe(vfs.dest(paths.dist.dir))
                    .on('end', function () {
                        delTmp(cb);
                    })

            } else {
                console.log('Nothing changed!');
                delTmp(cb);
            }
        }

    }

    async.series([
        /**
         * 先删除目标目录,保证最新
         * @param next
         */
        function (next) {
            delDist(next);
        },
        function (next) {
            if(Common.PLATFORM === 'win32'){
                compileLessForWin(next);
            }else{
                compileLess(next);
            }
        },
        function (next) {
            compileAutoprefixer(next);
        },
        function (next) {
            miniCSS(next);
        },
        function (next) {
            async.parallel([
                function (cb) {
                    imageminImg(cb);
                },
                function (cb) {
                    imageminSprite(cb);
                },
                function (cb) {
                    copyMedia(cb);
                },
                function(cb){
                    if(Common.PLATFORM === 'win32'){
                        copySlice(cb);
                    }else{
                        cb();
                    }
                },
                function (cb) {
                    uglifyJs(cb);
                }
            ], function (error) {
                if (error) {
                    throw new Error(error);
                }

                next();
            })
        },
        function (next) {
            compileHtml(next);
        },
        function (next) {
            reversion(next);
        },
        function(next){
            supportWebp(next);
        },
        function (next) {
            findChanged(next);
        }
    ], function (error) {
        if (error) {
            throw new Error(error);
        }

        callback && callback();
    });

}

module.exports = dist;
