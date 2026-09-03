/*
 * zhongzhi-shuju.js —— 实验01 演示数据播种脚本（可重复执行，已存在的数据会跳过）
 * 作者：王锐兵 软件2304
 *
 * 做的事情：
 *   1、用站长账号登录管理端拿到会话 Cookie；
 *   2、打开会员评论、中文界面、强调色等站点设置；
 *   3、创建一个自定义集成，拿到 Content API 只读密钥（给主题搜索用）；
 *   4、建 3 个标签、8 篇演示文章（覆盖长标题/无封面/代码块/中文搜索词/零评论等边界）；
 *   5、建 2 个普通会员账号，并直接往本地 SQLite 写几条会员评论；
 *   6、建「关于本站」和「站内搜索」两个页面，设置中文导航。
 *
 * 运行方式（在仓库根目录）：node scripts/zhongzhi-shuju.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---------- 基本配置 ----------
// 注意：必须和 config.development.json 里的 url 保持一致（127.0.0.1），
// 否则 Ghost 的 origin 校验会因为 host 不一致而拒绝写请求
const ZHANDIAN = 'http://127.0.0.1:2368';
const GUANLI_YOUXIANG = 'admin@shiyanke.local';
const GUANLI_MIMA = 'Shiyanke@2026';
// Ghost 的 session 认证要求请求带 Origin/Referer，且 origin 要和 session 里存的一致
const QIYUAN_TOU = { 'Origin': ZHANDIAN, 'Referer': ZHANDIAN + '/ghost/' };

// 运行时目录（Ghost 的 node_modules 和 SQLite 数据库都在那里）
const YUNXING_MULU = path.join(__dirname, '..', 'runtime', 'yunxing');
const SHUJUKU_LUJING = path.join(YUNXING_MULU, 'content', 'data', 'ghost-dev.db');
const MIYAO_BAOCUN = path.join(YUNXING_MULU, 'jicheng-miyao.json');

let huihuaCookie = '';

// ---------- 小工具 ----------

// 休眠一会儿，Ghost 后台建数据后索引更新需要一点点时间
function xiumiao(haomiao) {
    return new Promise((jiejue) => setTimeout(jiejue, haomiao));
}

// 统一的管理端请求函数
async function guanliQingqiu(lujing, fangfa = 'GET', zhuti = null) {
    const peizhi = {
        method: fangfa,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...QIYUAN_TOU,
        },
        redirect: 'manual',
    };
    if (huihuaCookie) {
        peizhi.headers['Cookie'] = huihuaCookie;
    }
    if (zhuti !== null) {
        peizhi.body = JSON.stringify(zhuti);
    }
    const xiangying = await fetch(ZHANDIAN + lujing, peizhi);
    const wenben = await xiangying.text();
    let jiexi = {};
    try {
        jiexi = wenben ? JSON.parse(wenben) : {};
    } catch (cuowu) {
        jiexi = {yuanshi: wenben};
    }
    if (!xiangying.ok && xiangying.status !== 302 && xiangying.status !== 201) {
        console.log(`  [提醒] ${fangfa} ${lujing} -> ${xiangying.status}：${wenben.slice(0, 220)}`);
    }
    return {zhuangtai: xiangying.status, zhuti: jiexi, tou: xiangying.headers};
}

// 登录管理端，把会话 Cookie 存下来
async function dengluGuanli() {
    const biaodan = new URLSearchParams({username: GUANLI_YOUXIANG, password: GUANLI_MIMA});
    const xiangying = await fetch(ZHANDIAN + '/ghost/api/admin/session/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...QIYUAN_TOU,
        },
        body: biaodan.toString(),
        redirect: 'manual',
    });
    // 注意：undici 的 Headers 要用 getSetCookie() 才能拿到 Set-Cookie，get('set-cookie') 会拿到 null
    const shezhiCookieLieBiao = typeof xiangying.headers.getSetCookie === 'function'
        ? xiangying.headers.getSetCookie()
        : [];
    const cookieDuanLieBiao = [];
    for (const tiao of shezhiCookieLieBiao) {
        const duan = (tiao || '').split(';')[0];
        if (duan) {
            cookieDuanLieBiao.push(duan);
        }
    }
    if (cookieDuanLieBiao.length === 0) {
        throw new Error('登录失败，没拿到会话 Cookie，先确认 Ghost 已启动、站长账号已初始化');
    }
    huihuaCookie = cookieDuanLieBiao.join('; ');
    console.log('1) 站长登录成功');
}

// 批量改设置
async function gaiSheZhi(shezhiLieBiao) {
    await guanliQingqiu('/ghost/api/admin/settings/', 'PUT', {settings: shezhiLieBiao});
    console.log('2) 站点设置已更新（会员评论=all、中文界面、强调色、中文次级导航）');
}

// 取单个设置
async function quSheZhi(jian) {
    const {zhuti} = await guanliQingqiu('/ghost/api/admin/settings/' + jian + '/');
    return zhuti.settings ? zhuti.settings[0].value : null;
}

// 创建自定义集成（已存在就直接取密钥）
async function quebaoJicheng() {
    // 如果之前保存过密钥文件，直接读，避免重复创建/查询
    if (fs.existsSync(MIYAO_BAOCUN)) {
        try {
            const baocun = JSON.parse(fs.readFileSync(MIYAO_BAOCUN, 'utf-8'));
            if (baocun.neirongKey && baocun.guanliKey) {
                console.log('3) 复用已保存的集成密钥');
                return {neirongKey: baocun.neirongKey, guanliKey: baocun.guanliKey};
            }
        } catch (cuowu) {
            /* 文件坏了就继续走创建/查询逻辑 */
        }
    }

    const jichengMing = 'shiyanke-bendi-shiyan';
    let {zhuti} = await guanliQingqiu('/ghost/api/admin/integrations/?limit=all');
    let jicheng = (zhuti.integrations || []).find((x) => x.name === jichengMing);

    if (!jicheng) {
        const jieguo = await guanliQingqiu('/ghost/api/admin/integrations/', 'POST', {
            integrations: [{name: jichengMing, description: '实验01：主题 Content API 取公开文章 + 本地播种脚本'}],
        });
        jicheng = jieguo.zhuti.integrations[0];
        console.log('3) 已创建自定义集成：', jichengMing);
    } else {
        // 复用分支：POST 响应才带 api_keys，这里单独查一次详情
        const xiangqing = await guanliQingqiu('/ghost/api/admin/integrations/' + jicheng.id + '/');
        jicheng = xiangqing.zhuti.integrations[0];
        console.log('3) 自定义集成已存在，直接复用');
    }

    const neirongKey = jicheng.api_keys.find((x) => x.type === 'content').secret;
    const guanliKey = jicheng.api_keys.find((x) => x.type === 'admin').secret;
    fs.writeFileSync(MIYAO_BAOCUN, JSON.stringify({
        jichengId: jicheng.id, neirongKey, guanliKey,
    }, null, 2), 'utf-8');
    console.log('   Content API 只读密钥已保存到 runtime/yunxing/jicheng-miyao.json');
    return {neirongKey, guanliKey};
}

// 按 slug 查标签，没有就建
async function quebaoBiaoqian(biaoqian) {
    const {zhuti} = await guanliQingqiu(`/ghost/api/admin/tags/?filter=slug:${biaoqian.slug}`);
    if ((zhuti.tags || []).length > 0) {
        return zhuti.tags[0];
    }
    const jieguo = await guanliQingqiu('/ghost/api/admin/tags/', 'POST', {tags: [biaoqian]});
    return jieguo.zhuti.tags[0];
}

// 按 slug 查文章，没有就建（zhuangtai=publish 直接发布）
async function quebaoWenzhang(wenzhang, biaoqianMingZi) {
    const {zhuti} = await guanliQingqiu(`/ghost/api/admin/posts/?filter=slug:${wenzhang.slug}`);
    if ((zhuti.posts || []).length > 0) {
        return zhuti.posts[0];
    }
    const zhutiQingqiu = Object.assign({}, wenzhang, {
        status: 'published',
        tags: biaoqianMingZi.map((ming) => ({name: ming})),
    });
    const jieguo = await guanliQingqiu('/ghost/api/admin/posts/?', 'POST', {posts: [zhutiQingqiu]});
    if (!jieguo.zhuti.posts) {
        // 个别 Ghost 版本不允许 ，退回 mobiledoc 方式由外层保证
        throw new Error('文章创建失败：' + JSON.stringify(jieguo.zhuti).slice(0, 200));
    }
    return jieguo.zhuti.posts[0];
}

// 按邮箱查会员，没有就建
async function quebaoHuiyuan(huiyuan) {
    const {zhuti} = await guanliQingqiu(`/ghost/api/admin/members/?filter=email:${encodeURIComponent(huiyuan.email)}`);
    if ((zhuti.members || []).length > 0) {
        return zhuti.members[0];
    }
    const jieguo = await guanliQingqiu('/ghost/api/admin/members/', 'POST', {members: [huiyuan]});
    return jieguo.zhuti.members[0];
}

// 建页面（关于页、搜索页）
async function quebaoYemian(yemian) {
    const {zhuti} = await guanliQingqiu(`/ghost/api/admin/pages/?filter=slug:${yemian.slug}`);
    if ((zhuti.pages || []).length > 0) {
        return zhuti.pages[0];
    }
    const jieguo = await guanliQingqiu('/ghost/api/admin/pages/?', 'POST', {pages: [yemian]});
    return jieguo.zhuti.pages[0];
}

// 生成 Ghost 用的 24 位十六进制主键（ObjectId 样子）
function shengchengId() {
    return crypto.randomBytes(12).toString('hex');
}

/*
 * 直接往本地 SQLite 写会员评论。
 * 走数据库是因为会员评论正常要走「发验证邮件->点链接」的流程，离线演示收不到邮件，
 * 这里只写本地实验库，不碰任何线上数据；status 一律 published。
 */
function xiePinglun(pinglunLieBiao) {
    const sqlite3 = require(path.join(YUNXING_MULU, 'node_modules', 'sqlite3'));
    const shuJuKu = new sqlite3.Database(SHUJUKU_LUJING);
    const xianyou = new Promise((jiejue, jujue) => {
        shuJuKu.all('select id from comments', [], (cuowu, hang) => {
            if (cuowu) {
                jujue(cuowu);
            } else {
                jiejue(new Set(hang.map((x) => x.id)));
            }
        });
    });

    return xianyou.then((yiYouId) => {
        let daichuli = pinglunLieBiao.filter((p) => !yiYouId.has(p.zhandingId));
        return new Promise((jiejue, jujue) => {
            shuJuKu.serialize(() => {
                shuJuKu.run('BEGIN TRANSACTION');
                const yuju = `insert into comments
                    (id, post_id, member_id, parent_id, in_reply_to_id, status, html, edited_at, created_at, updated_at)
                    values (?,?,?,?,?, 'published', ?, NULL, ?, ?)`;
                daichuli.forEach((p) => {
                    const shijian = p.shijian;
                    shuJuKu.run(yuju, [p.zhandingId, p.wenzhangId, p.huiyuanId, p.fuId || null, p.fuId || null,
                        `<p>${p.neirong}</p>`, shijian, shijian]);
                });
                shuJuKu.run('COMMIT', (cuowu) => {
                    if (cuowu) {
                        jujue(cuowu);
                    } else {
                        shuJuKu.close();
                        console.log(`7) 评论写入完成，本次新增 ${daichuli.length} 条`);
                        jiejue();
                    }
                });
            });
        });
    });
}

// 把几段正文拼成 Ghost 需要的 mobiledoc（纯段落 + 代码块卡片）。
// 段落里每个 marker 的正确格式是 [markup索引, 打开标记, 关闭数量, 文本]，
// 一开始我写成了两元素 [0, 文本]，被 422 拒了；另外尝试过 ? 让 Ghost 自己转，
// 但那需要 html-to-mobiledoc 依赖，手动安装环境里没带上，最后还是老老实实手拼。
function pinMobiledoc(duanluoLieBiao) {
    const zhangjie = [];
    const kapian = [];
    duanluoLieBiao.forEach((duan) => {
        if (duan.leixing === 'daima') {
            const kapianSuoyin = kapian.length;
            kapian.push(['code', {code: duan.neirong}]);
            zhangjie.push([10, kapianSuoyin]);
        } else {
            zhangjie.push([1, 'p', [[0, [], 0, duan.neirong]]]);
        }
    });
    return JSON.stringify({
        version: '0.3.1',
        markups: [],
        atoms: [],
        cards: kapian,
        sections: zhangjie,
    });
}

// ---------- 主流程 ----------
async function zhuliucheng() {
    await dengluGuanli();

    await gaiSheZhi([
        {key: 'description', value: '记录我用开源项目 Ghost 做个人博客二次开发的全过程与学习笔记'},
        {key: 'comments_enabled', value: 'all'},
        {key: 'locale', value: 'zh_CN'},
        {key: 'accent_color', value: '#127a7a'},
        {key: 'secondary_navigation', value: JSON.stringify([
            {label: '会员登录', url: '#/portal/signin'},
        ])},
    ]);

    const {neirongKey} = await quebaoJicheng();

    // 3 个标签
    console.log('4) 准备 3 个标签');
    const biaoqianLieBiao = [
        {name: '开源项目学习', slug: 'kaiyuan-xiangmu', description: '学习成熟开源项目的笔记与思考'},
        {name: '二次开发笔记', slug: 'erci-kaifa', description: '基于 Ghost 的主题与功能二次开发记录'},
        {name: '校园生活随笔', slug: 'xiaoyuan-shenghuo', description: '写代码之外的校园日常'},
    ];
    const biaoqianCidian = {};
    for (const bq of biaoqianLieBiao) {
        biaoqianCidian[bq.slug] = await quebaoBiaoqian(bq);
        await xiumiao(120);
    }

    // 8 篇演示文章（刻意覆盖指导书要求的边界情况）
    console.log('5) 准备 8 篇演示文章，需要一点时间……');
    const wenzhangQingdan = [
        {
            biaoti: '实验01开题记录：这一次我为什么选择基于 Ghost 二次开发，而不是从零手写一个博客系统（长标题边界用例）',
            wenjian: 'kaiti-weishenme-xuanze-ghost',
            zhaiyao: '对比从零开发和站在成熟开源项目肩膀上的差别，记录我选 Ghost 路线的理由。',
            biaoqian: ['开源项目学习', '二次开发笔记'],
            duanluo: [
                {leixing: 'wenzi', neirong: '这次《开源软件与新技术》实验01要求做一个可注册、可写作、可评论、可搜索的个人博客。一开始我是想自己用 Express 从零写的，觉得那样显得技术含量高，但仔细读完指导书后改了主意。'},
                {leixing: 'wenzi', neirong: '成熟开源项目 Ghost 已经把认证、编辑器、标签、会员、评论、数据库迁移这些基础能力做完了，我再写一遍只是重复造轮子，而且两周内根本写不到产品级。开源使用的重点不是“装起来”，而是看懂它、划定修改边界并做出可辨识的二次开发。'},
                {leixing: 'wenzi', neirong: '所以我的路线是：Ghost 6.10.3 负责基础能力，我把精力放在自定义主题、Content API 和本地搜索增强上。这篇文章作为开题记录，后面每篇开发笔记都会和它互相呼应。'},
                {leixing: 'wenzi', neirong: '关键词备查：开源、Ghost、二次开发、RealWorld、技术选型。'},
            ],
        },
        {
            biaoti: 'Ghost 6.10.3 在 Windows 上免 Docker 手动安装的完整记录（含命令和踩坑）',
            wenjian: 'windows-shoudong-anzhuang-ghost',
            zhaiyao: 'Ghost CLI 不支持 Windows，本机又没有 WSL，记录我用 npm 包直接启动 Ghost 的手动方案。',
            biaoqian: ['二次开发笔记'],
            duanluo: [
                {leixing: 'wenzi', neirong: '指导书推荐用 ghost install local，但 Ghost 官方 CLI 在 Windows 上直接拒绝本地安装，我这台机器也没有装 WSL 和 Docker。卡住半小时后，我翻 Ghost 的 npm 包发现它本身就是一个 Node 程序，可以直接 require 启动。'},
                {leixing: 'wenzi', neirong: '核心思路是：固定 Ghost 6.10.3 版本，把它的依赖用 npm 以 --legacy-peer-deps 装上，sqlite3 用预编译二进制，最后 node node_modules/ghost/ghost.js 启动。下面是关键命令：'},
                {leixing: 'daima', neirong: '# 安装依赖后，从 Ghost 包内解出内置的 i18n 组件\n$env:NODE_ENV="development"\nnode node_modules/ghost/ghost.js\n# 看到 “Ghost booted” 后访问 http://localhost:2368/'},
                {leixing: 'wenzi', neirong: '踩过的坑有三个：一是 npm 会把手动放进去的 ghost 包当冗余包删掉，所以顺序必须是先装依赖、最后解包；二是 sqlite3 默认要现场编译，本机没有 Visual Studio 构建工具，必须下预编译的 .node 文件；三是运行目录 package.json 的版本号必须和 Ghost 一致，否则主题会被按上古版本校验，报一堆 Missing helper。'},
                {leixing: 'wenzi', neirong: '这些步骤我都固化到了 scripts/anzhuang.ps1 里，换一台 Windows 机器也能复现。'},
            ],
        },
        {
            biaoti: '读懂 Ghost 的目录结构：哪些地方可以改，哪些地方一行都别碰',
            wenjian: 'du-dong-mulu-jiegou',
            zhaiyao: '修改边界是这次实验反复强调的事，我把 Ghost 的关键目录整理成了一张表。',
            biaoqian: ['二次开发笔记'],
            duanluo: [
                {leixing: 'wenzi', neirong: '二次开发最忌讳的就是在生成文件和核心源码里乱改，升级一次全部白干。我花了一晚上把 Ghost 的目录按“能改/别碰”分了类。'},
                {leixing: 'wenzi', neirong: '可以改的是 content/themes 下我自己的主题、Content API 取数逻辑和伴随脚本；不能碰的是 node_modules/ghost/core 核心、数据库迁移文件和生成的静态资源。'},
                {leixing: 'wenzi', neirong: '判断标准很简单：升级 Ghost 版本时会被覆盖的目录都不应该直接改，要改行为就通过主题、助手和 API 在边界外实现。这个思路在 docs/architecture.md 里画了图。'},
                {leixing: 'wenzi', neirong: '理解目录结构之后，再看请求链路就清楚了：浏览器请求先到主题模板，模板用 #get 助手或 Content API 找内容服务，内容服务再读 SQLite，最后拼成 HTML 返回。'},
            ],
        },
        {
            biaoti: 'Handlebars 主题入门：从官方 Source 主题改出我的 shiyanke-theme',
            wenjian: 'handlebars-zhuti-rumen',
            zhaiyao: '记录主题模板的基本组成，以及我在导航、文章卡片、详情页上做的具体改动。',
            biaoqian: ['开源项目学习'],
            duanluo: [
                {leixing: 'wenzi', neirong: 'Ghost 主题用的是 Handlebars 模板，default.hbs 是外壳，index.hbs 是文章列表，post.hbs 是文章详情，partials 目录放可复用的小块。我从 Ghost 6.10.3 内置的 Source 主题 1.5.0 复制出一份，改名 shiyanke-theme，再逐块改造。'},
                {leixing: 'wenzi', neirong: '导航部分把 Sign in、Subscribe 这些英文换成了登录、注册会员，搜索图标改成跳我自己写的 /sousuo/ 搜索页；文章卡片补上了中文日期和阅读时长；详情页正文末尾加了一排标签胶囊，相关文章的标题也改成了中文。'},
                {leixing: 'wenzi', neirong: '样式上我没有直接改官方 screen.css，而是新加了一层 zhuti-gaizao.css 做覆盖。这样万一改坏了，删掉这一行引用就能回滚，也方便老师对比上游基线和我的版本到底差在哪。'},
                {leixing: 'wenzi', neirong: '主题每次改完我都会跑一遍 gscan 校验，保证没有 error 级别的兼容性问题，这也是指导书明确要求的。'},
            ],
        },
        {
            biaoti: 'Content API 初体验：为什么只读密钥可以放心写在前端代码里',
            wenjian: 'content-api-chutiyan',
            zhaiyao: '区分 Content API Key 和 Admin API Key，是这次搜索功能敢放在主题层的前提。',
            biaoqian: ['开源项目学习'],
            duanluo: [
                {leixing: 'wenzi', neirong: '做本地搜索增强时我纠结过：前端代码里写密钥会不会泄密？读完文档才明白 Ghost 把 API 分成了两类。'},
                {leixing: 'wenzi', neirong: 'Content API Key 是只读的公开密钥，只能取“已公开发布”的内容，设计上就是给浏览器和静态站点用的；Admin API Key 才能写数据、看会员，它必须留在服务端脚本里，绝对不能进主题。'},
                {leixing: 'wenzi', neirong: '我的搜索页只用 Content API 拉文章标题、摘要和正文纯文本，拉回来之后在浏览器本地做匹配和高亮。这样即使有人把只读密钥拿走，也只能看到本来就公开的文章，不会泄露草稿和会员信息。'},
                {leixing: 'wenzi', neirong: '播种脚本用的 Admin API Key 只存在本机 runtime 目录，并且被 .gitignore 排除，仓库里留的是 .env.example 占位。'},
            ],
        },
        {
            biaoti: '本地搜索增强是怎么做出来的：关键词高亮、最近搜索和无结果推荐',
            wenjian: 'bendi-sousuo-zengqiang-zuofa',
            zhaiyao: '自主功能开发笔记，记录匹配排序、正则转义、localStorage 和无结果兜底的实现思路。',
            biaoqian: ['二次开发笔记'],
            duanluo: [
                {leixing: 'wenzi', neirong: '这是我选的自主功能，对应 Issue #3。目标是让搜索不只是“能搜到”，而是搜得好用：结果里关键词要高亮，刷新后最近搜过的词还在，搜不到时不能给用户一个空白页。'},
                {leixing: 'wenzi', neirong: '实现上，bendi-sousuo.js 第一次搜索时通过 Content API 把全部公开文章拉到内存缓存，之后本地匹配。标题命中权重最高，其次摘要，正文按命中次数排序。高亮时先转义正则特殊字符再包 mark 标签——这一点是被测试用例逼出来的：一开始搜星号页面直接报错。'},
                {leixing: 'wenzi', neirong: '最近搜索用 localStorage 存最近 8 条，去重、新的在前，可以一键重搜也可以清空。无结果时页面会列出全部标签，标签是主题用 #get 助手在服务端渲染的，不额外发请求。'},
                {leixing: 'wenzi', neirong: '整个功能没有改 Ghost 核心一行代码，全部在主题层完成，将来升级 Ghost 只需要重新上传主题，这正是把功能放在主题而不是核心里的原因。'},
            ],
        },
        {
            biaoti: '课堂随笔：第一次硬着头皮读上万行开源代码，心态是怎么变化的',
            wenjian: 'kaitang-suibi-du-daima-xintai',
            zhaiyao: '这篇文章刻意不留评论，作为“零评论”边界用例，顺便记录学习心态。',
            biaoqian: ['校园生活随笔'],
            duanluo: [
                {leixing: 'wenzi', neirong: '第一次打开 Ghost 的 core 目录时人是懵的，文件夹一层套一层，文件名全认识、连起来看不懂。后来老师说定向阅读就行，不用每行都看，才慢慢不慌。'},
                {leixing: 'wenzi', neirong: '我的办法是带着问题读：搜索框的请求走到哪、主题助手在哪里注册、评论权限谁来管。每个问题只追一条链路，读完画一张图，比从头到尾硬啃有效得多。'},
                {leixing: 'wenzi', neirong: '另外一个体会是读开源代码要善用报错信息。这次 Windows 安装踩的几个坑，全是靠认真读 error stack 定位到的，比搜来的二手答案靠谱。'},
                {leixing: 'wenzi', neirong: '留个纪念：这篇文章下面故意没有评论，用来测试“空评论”时主题布局会不会塌。'},
            ],
        },
        {
            biaoti: '周末图书馆打卡：写代码之外也要好好生活',
            wenjian: 'zhounmo-tushuguan-daka',
            zhaiyao: '第三类标签的填充文章，证明标签聚合页不是空的。',
            biaoqian: ['校园生活随笔'],
            duanluo: [
                {leixing: 'wenzi', neirong: '周六泡了一天图书馆，上午改主题，下午看了半本《人月神话》，晚上绕着操场走了五圈。开源代码要读，身体也得练。'},
                {leixing: 'wenzi', neirong: '最近想明白一件事：工程能力不是靠熬大夜堆出来的，而是靠把问题拆小、一个一个验证慢慢攒出来的，就像这次装 Ghost，看着吓人，拆成十小步之后每一步都能验证。'},
                {leixing: 'wenzi', neirong: '下周计划：把搜索的自动化测试补齐，再准备课堂 5 分钟展示的讲稿，加油。'},
            ],
        },
    ];

    const wenzhangCidian = {};
    for (const wz of wenzhangQingdan) {
        const jianli = {
            title: wz.biaoti,
            slug: wz.wenjian,
            custom_excerpt: wz.zhaiyao,
            mobiledoc: pinMobiledoc(wz.duanluo),
        };
        wenzhangCidian[wz.wenjian] = await quebaoWenzhang(jianli, wz.biaoqian);
        console.log('   文章：' + wz.biaoti.slice(0, 28) + '……');
        await xiumiao(150);
    }

    // 2 个普通会员
    console.log('6) 准备 2 个普通会员账号');
    const huiyuanQingdan = [
        {name: '小李同学', email: 'huiyuan-xiaoli@shiyanke.local', note: '演示用普通会员一号'},
        {name: '小王同学', email: 'huiyuan-xiaowang@shiyanke.local', note: '演示用普通会员二号'},
    ];
    const huiyuanCidian = {};
    for (const hy of huiyuanQingdan) {
        huiyuanCidian[hy.email] = await quebaoHuiyuan(hy);
        await xiumiao(120);
    }

    // 两个页面：关于本站 + 站内搜索（搜索页指定自定义模板）
    console.log('补建关于页和搜索页');
    const guanyuMobiledoc = pinMobiledoc([
        {leixing: 'wenzi', neirong: '这里是王锐兵的《开源软件与新技术》实验01个人博客，基于开源项目 Ghost 6.10.3 二次开发，自定义主题 shiyanke-theme 与本地搜索增强均为本人独立完成。'},
        {leixing: 'wenzi', neirong: '本站为本地实验环境，演示数据包括 8 篇文章、3 个标签和 2 个会员账号，仓库地址：https://github.com/remchang/shiyanke'},
    ]);
    await quebaoYemian({
        title: '关于本站', slug: 'about', status: 'published', mobiledoc: guanyuMobiledoc,
    });
    const sousuoMobiledoc = pinMobiledoc([
        {leixing: 'wenzi', neirong: '在上方输入关键词，回车即可搜索全站公开文章。'},
    ]);
    await quebaoYemian({
        title: '站内搜索', slug: 'sousuo', status: 'published',
        custom_template: 'page-sousuo.hbs', mobiledoc: sousuoMobiledoc,
    });

    // 中文主导航（标签 slug 已固定）
    await guanliQingqiu('/ghost/api/admin/settings/', 'PUT', {settings: [{
        key: 'navigation',
        value: JSON.stringify([
            {label: '首页', url: '/'},
            {label: '开源项目学习', url: '/tag/kaiyuan-xiangmu/'},
            {label: '二次开发笔记', url: '/tag/erci-kaifa/'},
            {label: '校园生活随笔', url: '/tag/xiaoyuan-shenghuo/'},
            {label: '站内搜索', url: '/sousuo/'},
            {label: '关于', url: '/about/'},
        ]),
    }]});

    // 评论数据（第 7 篇文章刻意零评论）
    console.log('7) 写入会员评论');
    const li = huiyuanCidian['huiyuan-xiaoli@shiyanke.local'];
    const wang = huiyuanCidian['huiyuan-xiaowang@shiyanke.local'];
    const pinglun = [
        {
            zhandingId: 'a10000000000000000000001',
            wenzhangId: wenzhangCidian['kaiti-weishenme-xuanze-ghost'].id,
            huiyuanId: li.id,
            neirong: '同样一开始想从零写，看完表示认同，先学会读开源项目更重要。',
            shijian: '2026-09-01 10:20:00',
        },
        {
            zhandingId: 'a10000000000000000000002',
            wenzhangId: wenzhangCidian['windows-shoudong-anzhuang-ghost'].id,
            huiyuanId: li.id,
            neirong: 'sqlite3 预编译二进制这个坑我也踩了，npm 一直偷偷去编译，卡了好久。',
            shijian: '2026-09-01 11:05:00',
        },
        {
            zhandingId: 'a10000000000000000000003',
            wenzhangId: wenzhangCidian['windows-shoudong-anzhuang-ghost'].id,
            huiyuanId: wang.id,
            fuId: 'a10000000000000000000002',
            neirong: '回复小李：对，而且运行目录 package.json 版本号那个坑太隐蔽了，主题突然按 v1 校验谁能想到。',
            shijian: '2026-09-01 11:12:00',
        },
        {
            zhandingId: 'a10000000000000000000004',
            wenzhangId: wenzhangCidian['handlebars-zhuti-rumen'].id,
            huiyuanId: wang.id,
            neirong: '加一层 css 覆盖而不是改官方文件，这个回滚思路学到了。',
            shijian: '2026-09-02 09:40:00',
        },
        {
            zhandingId: 'a10000000000000000000005',
            wenzhangId: wenzhangCidian['bendi-sousuo-zengqiang-zuofa'].id,
            huiyuanId: li.id,
            neirong: '搜星号会崩这个细节很真实，正则特殊字符确实必须转义。',
            shijian: '2026-09-02 16:30:00',
        },
    ];
    await xiePinglun(pinglun);

    // 输出一份演示数据清单（不含密码），方便写报告
    const qingdan = {
        biaoqian: biaoqianLieBiao.map((b) => ({ming: b.name, wangzhi: '/tag/' + b.slug + '/'})),
        wenzhangShu: wenzhangQingdan.length,
        huiyuan: huiyuanQingdan.map((h) => ({ming: h.name, youxiang: h.email})),
        pinglunShu: pinglun.length,
        neirongKey,
    };
    const baocunLu = path.join(__dirname, '..', 'docs', 'yanshi-shuju-qingdan.json');
    fs.writeFileSync(baocunLu, JSON.stringify(qingdan, null, 2), 'utf-8');
    console.log('8) 全部完成，演示数据清单已写到 docs/yanshi-shuju-qingdan.json');
}

zhuliucheng().catch((cuowu) => {
    console.error('播种失败：', cuowu);
    process.exit(1);
});


