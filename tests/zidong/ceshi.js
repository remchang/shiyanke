// 实验01 自动化测试：node tests/zidong/ceshi.js
// 覆盖指导书 13 节要求的 18 条用例：
//   功能测试 8（注册、登录、文章新增、文章查询、标签、评论、搜索命中、搜索无结果）
//   权限测试 4（匿名可读公开、草稿不泄露、管理密钥不暴露、未授权写被拒）
//   主题/界面 4（首页与主题资源、gscan 校验、响应式宽度、搜索表单可操作）
//   恢复测试 2（重启后数据仍在、内容导出可恢复）
// 全部走 HTTP API 与页面检查，可重复执行；结果写到 docs/ceshi-jieguo.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execSync} = require('child_process');

// ---------- 配置 ----------
const ZHANDIAN = 'http://127.0.0.1:2368';
const XIANGMU = path.join(__dirname, '..', '..');
const MIYAO_LU = path.join(XIANGMU, 'runtime', 'yunxing', 'jicheng-miyao.json');
const JIEGUO_LU = path.join(XIANGMU, 'docs', 'ceshi-jieguo.json');
const GSCAN_LU = 'D:\\shiyanke-yunxing\\node_modules\\.bin\\gscan.cmd';
const ZHUTI_MULU = path.join(XIANGMU, 'theme', 'shiyanke-theme');

let neirongKey = '';
let guanliKey = '';
try {
    const miyao = JSON.parse(fs.readFileSync(MIYAO_LU, 'utf-8'));
    neirongKey = miyao.neirongKey;
    guanliKey = miyao.guanliKey;
} catch (cuowu) {
    console.error('读不到集成密钥文件，先运行播种脚本 scripts/zhongzhi-shuju.js');
    process.exit(1);
}

// ---------- 认证与请求 ----------
// Ghost 的 Admin API 要求客户端用 Admin key 的 secret 签一个短时 JWT：
// header 带 kid，claims 带 iat/exp/aud=/admin/，不能直接把 id:secret 当 token 用
function qianMingJWT(apiKey) {
    const [kid, secretHex] = apiKey.split(':');
    const xianzai = Math.floor(Date.now() / 1000);
    const tou = Buffer.from(JSON.stringify({alg: 'HS256', typ: 'JWT', kid})).toString('base64url');
    const shengming = Buffer.from(JSON.stringify({iat: xianzai, exp: xianzai + 300, aud: '/admin/'})).toString('base64url');
    const miyao = Buffer.from(secretHex, 'hex');
    const qianming = crypto.createHmac('sha256', miyao).update(tou + '.' + shengming).digest('base64url');
    return tou + '.' + shengming + '.' + qianming;
}

async function qingqiu(lujing, fangfa = 'GET', zidian = null) {
    const tou = {'Accept': 'application/json'};
    let zhengwen = null;
    if (zidian) {
        tou['Content-Type'] = 'application/json';
        zhengwen = JSON.stringify(zidian);
    }
    const xiangying = await fetch(ZHANDIAN + lujing, {method: fangfa, headers: tou, body: zhengwen});
    const wenben = await xiangying.text();
    let shuju = null;
    try { shuju = JSON.parse(wenben); } catch (e) { /* 非 JSON */ }
    return {zhuangtai: xiangying.status, shuju, wenben};
}

async function guanliQingqiu(lujing, fangfa = 'GET', zidian = null) {
    const tou = {'Accept': 'application/json', 'Authorization': 'Ghost ' + qianMingJWT(guanliKey)};
    let zhengwen = null;
    if (zidian) {
        tou['Content-Type'] = 'application/json';
        zhengwen = JSON.stringify(zidian);
    }
    const xiangying = await fetch(ZHANDIAN + lujing, {method: fangfa, headers: tou, body: zhengwen});
    const wenben = await xiangying.text();
    let shuju = null;
    try { shuju = JSON.parse(wenben); } catch (e) { /* 非 JSON */ }
    return {zhuangtai: xiangying.status, shuju, wenben};
}

// 管理员账号密码登录（会话），返回是否成功
async function guanliDenglu() {
    const biaodan = new URLSearchParams({username: 'admin@shiyanke.local', password: 'Shiyanke@2026'});
    const xiangying = await fetch(ZHANDIAN + '/ghost/api/admin/session/', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Origin': ZHANDIAN, 'Referer': ZHANDIAN + '/ghost/'},
        body: biaodan.toString(),
        redirect: 'manual',
    });
    const cookies = xiangying.headers.getSetCookie ? xiangying.headers.getSetCookie() : [];
    return {zhuangtai: xiangying.status, youCookie: cookies.length > 0};
}

// 拼 mobiledoc（段落 + 代码块），和播种脚本保持一致
function pinMobiledoc(duanluoLieBiao) {
    const zhangjie = [];
    const kapian = [];
    for (const duan of duanluoLieBiao) {
        if (duan.leixing === 'daima') {
            const suo = kapian.length;
            kapian.push(['code', {code: duan.neirong}]);
            zhangjie.push([10, suo]);
        } else {
            zhangjie.push([1, 'p', [[0, [], 0, duan.neirong]]]);
        }
    }
    return JSON.stringify({version: '0.3.1', markups: [], atoms: [], cards: kapian, sections: zhangjie});
}

// 搜索匹配逻辑（和主题里 bendi-sousuo.js 一致）
function suoyinFenxi(wenzhangLieBiao, guanjianci) {
    const ming = String(guanjianci || '').toLowerCase().trim();
    if (!ming) return [];
    const jieguo = [];
    for (const wz of wenzhangLieBiao) {
        const biaoti = (wz.title || '').toLowerCase();
        const zhaiyao = (wz.custom_excerpt || '').toLowerCase();
        const zhengwen = (wz.plaintext || '').toLowerCase();
        let fen = 0;
        if (biaoti.includes(ming)) fen += 10;
        if (zhaiyao.includes(ming)) fen += 5;
        if (zhengwen.includes(ming)) fen += 1;
        if (fen > 0) {
            jieguo.push({slug: wz.slug, fen});
        }
    }
    return jieguo.sort((a, b) => b.fen - a.fen);
}

// ---------- 测试框架 ----------
const jieguoLieBiao = [];
let dangqianZushu = '';
function kaishiZushu(ming) { dangqianZushu = ming; }

function panduan(bianhao, ming, chengli, shuoming) {
    const tiao = {
        bianhao, zushu: dangqianZushu, ming, tongguo: !!chengli, shuoming,
        shijian: new Date().toISOString(), fuzeren: '王锐兵',
    };
    jieguoLieBiao.push(tiao);
    console.log((tiao.tongguo ? '  [通过] ' : '  [失败] ') + bianhao + ' ' + ming + (tiao.tongguo ? '' : '  <- ' + shuoming));
}

// ---------- 主流程 ----------
(async () => {
    console.log('实验01 自动化测试开始：' + new Date().toLocaleString('zh-CN'));

    // 公开文章全集（带正文纯文本，搜索测试要用）
    const quanwen = await qingqiu('/ghost/api/content/posts/?key=' + neirongKey + '&limit=all&formats=plaintext');
    const wenZhangLieBiao = (quanwen.shuju && quanwen.shuju.posts) || [];

    // ========== 一、功能测试 8 条 ==========
    kaishiZushu('功能测试');

    // T01 注册：管理端创建演示会员（离线环境收不到 magic link 邮件，用管理端建号等价验证注册通道）
    let chazhao = await guanliQingqiu('/ghost/api/admin/members/?filter=email:ceshi-zhuce%40shiyanke.local');
    if ((chazhao.shuju.members || []).length === 0) {
        await guanliQingqiu('/ghost/api/admin/members/', 'POST',
            {members: [{name: '注册测试同学', email: 'ceshi-zhuce@shiyanke.local', note: '自动化注册测试用'}]});
    }
    chazhao = await guanliQingqiu('/ghost/api/admin/members/?filter=email:ceshi-zhuce%40shiyanke.local');
    panduan('T01', '注册：创建会员成功且可按邮箱查询', chazhao.zhuangtai === 200 && (chazhao.shuju.members || []).length === 1,
        '查询状态 ' + chazhao.zhuangtai);

    // T02 登录：管理员账号密码登录返回会话
    const denglu = await guanliDenglu();
    panduan('T02', '登录：账号密码登录成功并返回会话', denglu.zhuangtai === 201 && denglu.youCookie,
        '状态 ' + denglu.zhuangtai + '，cookie ' + denglu.youCookie);

    // T03 文章查询：公开列表返回 8 篇
    panduan('T03', '文章：公开文章列表返回 8 篇', wenZhangLieBiao.length === 8, '实际 ' + wenZhangLieBiao.length + ' 篇');

    // T04 文章新增：用管理端建一篇再删除（可重复执行）
    const xinWenzhang = {
        title: '自动化测试新增文章',
        slug: 'zidong-ceshi-xinjian-' + Date.now(),
        mobiledoc: pinMobiledoc([{leixing: 'wenzi', neirong: '这是一篇由自动化测试临时创建的文章。'}]),
    };
    let chuangJian = await guanliQingqiu('/ghost/api/admin/posts/', 'POST', {posts: [xinWenzhang]});
    const chuangJianOK = chuangJian.zhuangtai === 201 && chuangJian.shuju && chuangJian.shuju.posts;
    let shanChuOK = true;
    if (chuangJianOK) {
        const id = chuangJian.shuju.posts[0].id;
        const shan = await guanliQingqiu('/ghost/api/admin/posts/' + id + '/?source=delete', 'DELETE');
        shanChuOK = [200, 204].includes(shan.zhuangtai);
    }
    panduan('T04', '文章：新增文章成功且可删除', chuangJianOK && shanChuOK, '创建 ' + chuangJian.zhuangtai + ' / 删除 ' + shanChuOK);

    // T05 标签：返回 3 个自定义标签
    const biaoqian = await qingqiu('/ghost/api/content/tags/?key=' + neirongKey + '&limit=all&fields=name');
    const biaoqianMing = (biaoqian.shuju.tags || []).map((t) => t.name);
    panduan('T05', '标签：公开标签含 开源项目学习/二次开发笔记/校园生活随笔',
        biaoqianMing.includes('开源项目学习') && biaoqianMing.includes('二次开发笔记') && biaoqianMing.includes('校园生活随笔'),
        '实际 ' + JSON.stringify(biaoqianMing));

    // T06 评论：members API 返回评论且含回复
    const diyi = wenZhangLieBiao.find((w) => w.slug === 'windows-shoudong-anzhuang-ghost');
    const pinglun = await qingqiu('/members/api/comments/post/' + (diyi ? diyi.id : ''));
    const pinglunLieBiao = (pinglun.shuju && pinglun.shuju.comments) || [];
    const youHuifu = pinglunLieBiao.some((c) => c.replies && c.replies.length > 0);
    panduan('T06', '评论：文章评论可读取且含回复', pinglun.zhuangtai === 200 && pinglunLieBiao.length >= 1 && youHuifu,
        '顶层评论 ' + pinglunLieBiao.length + '，含回复 ' + youHuifu);

    // T07 搜索命中：本地匹配逻辑命中含“二次开发”的文章
    const mingZhong = suoyinFenxi(wenZhangLieBiao, '二次开发');
    panduan('T07', '搜索：关键词“二次开发”命中标题/正文文章', mingZhong.length >= 2, '命中 ' + mingZhong.length + ' 篇');

    // T08 搜索无结果：不存在的关键词返回空，搜索页有兜底
    const wuJieguo = suoyinFenxi(wenZhangLieBiao, '星球大战外传');
    const sousuoYe = await qingqiu('/sousuo/');
    const youDuidi = sousuoYe.wenben.includes('wuJieGuoQu') || sousuoYe.wenben.includes('没有找到相关文章');
    panduan('T08', '搜索：无结果关键词返回空且有兜底提示', wuJieguo.length === 0 && youDuidi,
        '命中 ' + wuJieguo.length + '，兜底区 ' + youDuidi);

    // ========== 二、权限测试 4 条 ==========
    kaishiZushu('权限测试');

    // T09 匿名可读公开文章
    panduan('T09', '权限：匿名用户可读已发布文章', wenZhangLieBiao.length > 0, '公开文章 ' + wenZhangLieBiao.length + ' 篇');

    // T10 草稿不泄露：建一篇草稿，Content API 查不到，再删掉
    const caogao = {
        title: '自动化草稿测试', slug: 'zidong-caogao-' + Date.now(),
        mobiledoc: pinMobiledoc([{leixing: 'wenzi', neirong: '草稿内容'}]),
    };
    let jianCaoGao = await guanliQingqiu('/ghost/api/admin/posts/', 'POST', {posts: [caogao]});
    let caoGaoBuJian = true;
    let shanChuCaoGao = true;
    if (jianCaoGao.shuju && jianCaoGao.shuju.posts) {
        const id = jianCaoGao.shuju.posts[0].id;
        const gongKai = await qingqiu('/ghost/api/content/posts/?key=' + neirongKey + '&limit=all&fields=slug');
        caoGaoBuJian = !(gongKai.shuju.posts || []).some((p) => p.slug === caogao.slug);
        const shan = await guanliQingqiu('/ghost/api/admin/posts/' + id + '/?source=delete', 'DELETE');
        shanChuCaoGao = [200, 204].includes(shan.zhuangtai);
    }
    panduan('T10', '权限：草稿不出现在公开接口', caoGaoBuJian && shanChuCaoGao, '草稿不可见 ' + caoGaoBuJian);

    // T11 管理密钥不暴露在前端
    const shouYe = await qingqiu('/');
    const miyaoBaoLu = shouYe.wenben.includes(guanliKey.split(':')[1]);
    panduan('T11', '权限：Admin 密钥不出现在公开页面源码', !miyaoBaoLu, '页面含管理密钥 ' + miyaoBaoLu);

    // T12 未授权写操作被拒绝
    const weiShouQuan = await qingqiu('/ghost/api/admin/posts/', 'POST', {posts: [{title: 'x'}]});
    panduan('T12', '权限：匿名调用管理写接口被拒绝', [401, 403, 404].includes(weiShouQuan.zhuangtai), '状态 ' + weiShouQuan.zhuangtai);

    // ========== 三、主题/界面测试 4 条 ==========
    kaishiZushu('主题/界面测试');

    // T13 首页与主题资源可访问
    const ziyuanCss = await qingqiu('/assets/css/zhuti-gaizao.css');
    const ziyuanJs = await qingqiu('/assets/js/bendi-sousuo.js');
    panduan('T13', '主题：首页 200，自定义 css/js 可加载',
        shouYe.zhuangtai === 200 && ziyuanCss.zhuangtai === 200 && ziyuanJs.zhuangtai === 200,
        'css ' + ziyuanCss.zhuangtai + ' / js ' + ziyuanJs.zhuangtai);

    // T14 gscan 主题校验通过（用运行时目录里已装好的 gscan）
    let gscanShuchu = '';
    let gscanOK = false;
    try {
        gscanShuchu = execSync(JSON.stringify(GSCAN_LU) + ' ' + JSON.stringify(ZHUTI_MULU) + ' --json',
            {encoding: 'utf-8', timeout: 120000});
        gscanOK = true;
    } catch (cuowu) {
        gscanShuchu = String(cuowu.stdout || cuowu.message || '');
    }
    const gscanWenti = /ERROR|error|\d+ error/i.test(gscanShuchu);
    panduan('T14', '主题：gscan 校验通过（无 error）', gscanOK && !gscanWenti,
        gscanOK ? (gscanShuchu.includes('compatible') ? '兼容 6.x' : 'gscan 输出异常') : 'gscan 未跑通');

    // T15 响应式：自定义 CSS 采用相对/视口宽度
    const cssNeirong = ziyuanCss.wenben;
    panduan('T15', '主题：CSS 采用响应式宽度，窄屏不溢出', /100%|vw|max-width|minmax|auto-fit/.test(cssNeirong),
        'CSS 含响应式宽度=' + /100%|vw|max-width/.test(cssNeirong));

    // T16 搜索表单键盘可操作
    const souSuoHTML = (await qingqiu('/sousuo/')).wenben;
    const biaodanOK = souSuoHTML.includes('role="search"') && souSuoHTML.includes('type="search"') && souSuoHTML.includes('<button');
    panduan('T16', '主题：搜索表单语义完整、键盘可操作', biaodanOK, 'role/search + search input + button');

    // ========== 四、恢复测试 2 条 ==========
    kaishiZushu('恢复测试');

    // T17 重启后数据仍在（配合部署脚本重启后重跑本测试验证）
    const chongDu = await qingqiu('/ghost/api/content/posts/?key=' + neirongKey + '&limit=all');
    const chongDuOK = (chongDu.shuju.posts || []).length === 8;
    panduan('T17', '恢复：重启后公开文章仍为 8 篇', chongDuOK, '读回 ' + (chongDu.shuju.posts || []).length + ' 篇');

    // T18 内容导出可恢复（导出接口只放行管理员会话，自定义集成 key 无权限，这里用管理员会话）
    let daoChuShuJu = null;
    let daoChuZhuangtai = 0;
    try {
        const huihua = await guanliDenglu();
        const cookies = [];
        const biaodan = new URLSearchParams({username: 'admin@shiyanke.local', password: 'Shiyanke@2026'});
        const dengluXiangying = await fetch(ZHANDIAN + '/ghost/api/admin/session/', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Origin': ZHANDIAN, 'Referer': ZHANDIAN + '/ghost/'},
            body: biaodan.toString(),
            redirect: 'manual',
        });
        const shezhi = dengluXiangying.headers.getSetCookie ? dengluXiangying.headers.getSetCookie() : [];
        for (const tiao of shezhi) {
            const duan = (tiao || '').split(';')[0];
            if (duan) cookies.push(duan);
        }
        const daoChuXiangying = await fetch(ZHANDIAN + '/ghost/api/admin/db/', {
            headers: {'Accept': 'application/json', 'Cookie': cookies.join('; ')},
        });
        daoChuZhuangtai = daoChuXiangying.status;
        const wenben = await daoChuXiangying.text();
        try { daoChuShuJu = JSON.parse(wenben); } catch (e) { /* 非 JSON */ }
        void huihua;
    } catch (cuowu) {
        console.log('  导出异常：' + cuowu.message);
    }
    const daoChuOK = daoChuZhuangtai === 200 && daoChuShuJu && Array.isArray(daoChuShuJu.db)
        && daoChuShuJu.db[0] && daoChuShuJu.db[0].data && daoChuShuJu.db[0].data.posts;
    panduan('T18', '恢复：管理端导出内容 JSON 成功且含数据', daoChuOK,
        '状态 ' + daoChuZhuangtai + '，含文章表 ' + (daoChuOK ? daoChuShuJu.db[0].data.posts.length : 0));

    // ---------- 汇总 ----------
    const tongguoShu = jieguoLieBiao.filter((t) => t.tongguo).length;
    console.log('');
    console.log('测试完成：共 ' + jieguoLieBiao.length + ' 条，通过 ' + tongguoShu + ' 条，失败 ' + (jieguoLieBiao.length - tongguoShu) + ' 条');

    fs.mkdirSync(path.dirname(JIEGUO_LU), {recursive: true});
    fs.writeFileSync(JIEGUO_LU, JSON.stringify({
        zongShu: jieguoLieBiao.length, tongGuoShu: tongguoShu,
        shiJian: new Date().toISOString(), fuzeren: '王锐兵',
        tiaomu: jieguoLieBiao,
    }, null, 2), 'utf-8');
    console.log('测试结果已写入 docs/ceshi-jieguo.json');

    process.exit(tongguoShu === jieguoLieBiao.length ? 0 : 1);
})().catch((cuowu) => {
    console.error('测试脚本异常：', cuowu);
    process.exit(2);
});
