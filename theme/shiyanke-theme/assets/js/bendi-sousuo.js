/*
 * bendi-sousuo.js —— 实验01 自主功能：本地搜索增强
 * 作者：王锐兵  软件2304  学号23110506126
 *
 * 设计说明（对应 Issue #3 的验收条件）：
 *  1、用 Ghost Content API 把【已公开发布】的文章拉到前端做匹配，
 *     Content Key 是只读公开密钥，不涉及任何管理权限；
 *  2、关键词同时匹配标题、摘要和正文纯文本，中文直接用「包含」判断，
 *     不硬做分词，先保证召回率；
 *  3、命中的关键词用 <mark> 高亮，正则特殊字符先转义，避免搜 *、( 时报错；
 *  4、最近搜索用 localStorage 存最近 8 条，刷新还在，可以一键重搜或清空；
 *  5、搜不到时显示无结果提示，标签兜底列表由 page-sousuo.hbs 服务端渲染。
 *
 * 说明：变量名按老师要求全部用拼音，方便自己以后回看。
 */
(function () {
    'use strict';

    // 只在搜索页才执行，别的页面没有这些 DOM，直接返回
    var peizhiEl = document.getElementById('sousuoPeizhi');
    var biaodan = document.getElementById('sousuoBiaodan');
    if (!peizhiEl || !biaodan) {
        return;
    }

    // ---------- 1. 读页面上的配置（站点地址 + Content API 只读密钥）----------
    var zhanzhi = peizhiEl.getAttribute('data-zhanzhi') || '/';
    if (zhanzhi.charAt(zhanzhi.length - 1) !== '/') {
        zhanzhi = zhanzhi + '/';
    }
    var neirongMiyao = peizhiEl.getAttribute('data-neirong-key') || '';

    // ---------- 2. 拿几个后面要反复操作的 DOM ----------
    var shuruKuang = document.getElementById('sousuoShuru');
    var zhuangtaiWenben = document.getElementById('sousuoTishi');
    var jieguoQu = document.getElementById('jieguoQu');
    var jieguoBiaoti = document.getElementById('jieguoBiaoti');
    var jieguoLiebiao = document.getElementById('jieguoLiebiao');
    var wujieguoQu = document.getElementById('wuJieGuoQu');
    var zuijinQu = document.getElementById('zuijinSousuoQu');
    var zuijinLiebiao = document.getElementById('zuijinSousuoLiebiao');
    var qingkongAnniu = document.getElementById('qingkongZuijin');

    // localStorage 的键名，单独提出来，改名只改一处
    var BENCUN_JIANMING = 'shiyanke_zuijin_sousuo';
    var ZUIJIN_ZUIDA_SHU = 8;

    // 文章列表第一次请求后缓存在内存里，翻来覆去搜不用重复请求接口
    var wenzhangHuancun = null;
    var zhengzaiJiazai = false;

    /*
     * 转义正则特殊字符。
     * 一开始没写这个函数，直接 new RegExp(guanjianci)，
     * 测试用例里搜「*」页面直接崩了（测试用例 CS-05），后来补上的。
     */
    function zhuanyiZhengze(zifuchuan) {
        return String(zifuchuan).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // HTML 转义，防止文章标题里的 < > 等字符把页面结构搞坏
    function zhuanyiHTML(zifuchuan) {
        var linshi = document.createElement('span');
        linshi.textContent = zifuchuan == null ? '' : String(zifuchuan);
        return linshi.innerHTML;
    }

    /*
     * 把一段文本里命中关键词的部分包上 <mark>。
     * 先转义 HTML，再在纯文本层面做替换，避免把用户输入当 HTML 执行。
     */
    function gaoliangWenben(yuanshiWenben, guanjianci) {
        var anquanWenben = zhuanyiHTML(yuanshiWenben || '');
        if (!guanjianci) {
            return anquanWenben;
        }
        var zhengze = new RegExp('(' + zhuanyiZhengze(guanjianci) + ')', 'gi');
        return anquanWenben.replace(zhengze, '<mark>$1</mark>');
    }

    // ---------- 3. 调 Content API 拉全部已发布文章，只拉搜索用得到的字段 ----------
    function huoquWenzhangLiebiao() {
        if (wenzhangHuancun) {
            return Promise.resolve(wenzhangHuancun);
        }
        if (zhengzaiJiazai) {
            return Promise.resolve([]);
        }
        zhengzaiJiazai = true;
        zhuangtaiWenben.textContent = '正在从 Content API 读取文章列表……';

        var canshu = new URLSearchParams({
            key: neirongMiyao,
            limit: 'all',
            fields: 'title,url,excerpt,published_at,reading_time',
            // plaintext 是正文纯文本，用来参与正文匹配（不渲染原文，避免 XSS）
            formats: 'plaintext'
        });
        var qingqiuDizhi = zhanzhi + 'ghost/api/content/posts/?' + canshu.toString();

        return fetch(qingqiuDizhi, {headers: {'Accept': 'application/json'}})
            .then(function (xiangying) {
                if (!xiangying.ok) {
                    throw new Error('Content API 返回状态码 ' + xiangying.status);
                }
                return xiangying.json();
            })
            .then(function (shuju) {
                wenzhangHuancun = (shuju && shuju.posts) ? shuju.posts : [];
                zhengzaiJiazai = false;
                return wenzhangHuancun;
            })
            .catch(function (cuowu) {
                zhengzaiJiazai = false;
                zhuangtaiWenben.textContent = '文章列表加载失败：' + cuowu.message + '（请确认 Ghost 已启动、Content Key 正确）';
                return [];
            });
    }

    /*
     * 本地匹配：标题、摘要、正文纯文本任意一处包含关键词就算命中，
     * 命中次数多的排前面，标题命中权重再高一点。
     */
    function pipeiWenzhang(wenzhangLieBiao, guanjianci) {
        var guanjianciXiaoxie = guanjianci.toLowerCase();
        var jieguo = [];

        wenzhangLieBiao.forEach(function (wenzhang) {
            var biaotiXiaoxie = (wenzhang.title || '').toLowerCase();
            var zhaiyaoXiaoxie = (wenzhang.excerpt || '').toLowerCase();
            var zhengwenXiaoxie = (wenzhang.plaintext || '').toLowerCase();

            var biaotiMingzhong = biaotiXiaoxie.includes(guanjianciXiaoxie) ? 1 : 0;
            var zhaiyaoMingzhong = zhaiyaoXiaoxie.includes(guanjianciXiaoxie) ? 1 : 0;
            var zhengwenMingzhong = zhengwenXiaoxie.includes(guanjianciXiaoxie) ? 1 : 0;

            if (biaotiMingzhong || zhaiyaoMingzhong || zhengwenMingzhong) {
                // 粗略统计正文命中次数用于排序
                var cishu = 0;
                if (zhengwenXiaoxie) {
                    var weizhi = 0;
                    while ((weizhi = zhengwenXiaoxie.indexOf(guanjianciXiaoxie, weizhi)) !== -1) {
                        cishu = cishu + 1;
                        weizhi = weizhi + guanjianciXiaoxie.length;
                    }
                }
                // 标题命中权重 10，摘要 3，正文每次命中 1
                var quanzhong = biaotiMingzhong * 10 + zhaiyaoMingzhong * 3 + cishu;
                jieguo.push({wenzhang: wenzhang, quanzhong: quanzhong});
            }
        });

        jieguo.sort(function (a, b) {
            return b.quanzhong - a.quanzhong;
        });
        return jieguo.map(function (xiang) {
            return xiang.wenzhang;
        });
    }

    // 日期格式化成「YYYY年MM月DD日」，接口给的是 ISO 字符串
    function goshiRiqi(isoZifuchuan) {
        if (!isoZifuchuan) {
            return '';
        }
        var riqi = new Date(isoZifuchuan);
        if (isNaN(riqi.getTime())) {
            return '';
        }
        var nian = riqi.getFullYear();
        var yue = String(riqi.getMonth() + 1).padStart(2, '0');
        var ri = String(riqi.getDate()).padStart(2, '0');
        return nian + '年' + yue + '月' + ri + '日';
    }

    // ---------- 4. 渲染搜索结果 ----------
    function xuanranJieguo(mingzhongLieBiao, guanjianci) {
        jieguoLiebiao.innerHTML = '';

        if (mingzhongLieBiao.length === 0) {
            // 无结果：隐藏结果区，显示无结果区（里面有标签推荐）
            jieguoQu.hidden = true;
            wujieguoQu.hidden = false;
            zhuangtaiWenben.textContent = '没有找到包含「' + guanjianci + '」的文章。';
            return;
        }

        wujieguoQu.hidden = true;
        jieguoQu.hidden = false;
        jieguoBiaoti.textContent = '搜索结果（共 ' + mingzhongLieBiao.length + ' 篇）';

        mingzhongLieBiao.forEach(function (wenzhang) {
            var li = document.createElement('li');
            li.className = 'zhuti-jieguo-xiang';

            var lianjie = document.createElement('a');
            lianjie.className = 'zhuti-jieguo-lianjie';
            lianjie.href = wenzhang.url;
            // 标题高亮（高亮片段是自己拼的安全标签，其余内容已转义）
            var biaotiDiv = document.createElement('h3');
            biaotiDiv.className = 'is-title zhuti-jieguo-biaoti';
            biaotiDiv.innerHTML = gaoliangWenben(wenzhang.title, guanjianci);
            lianjie.appendChild(biaotiDiv);

            // 摘要：优先取正文命中位置前后一小段，取不到就用 excerpt
            var zhaiyaoNeirong = wenzhang.excerpt || '';
            var zhengwen = wenzhang.plaintext || '';
            var suoyin = zhengwen.toLowerCase().indexOf(guanjianci.toLowerCase());
            if (suoyin !== -1) {
                var kaishi = Math.max(0, suoyin - 20);
                zhaiyaoNeirong = (kaishi > 0 ? '……' : '') +
                    zhengwen.substring(kaishi, suoyin + 60) + '……';
            }
            var zhaiyaoP = document.createElement('p');
            zhaiyaoP.className = 'is-body zhuti-jieguo-zhaiyao';
            zhaiyaoP.innerHTML = gaoliangWenben(zhaiyaoNeirong, guanjianci);
            lianjie.appendChild(zhaiyaoP);

            var xinxiP = document.createElement('p');
            xinxiP.className = 'zhuti-jieguo-xinxi';
            xinxiP.textContent = goshiRiqi(wenzhang.published_at) +
                (wenzhang.reading_time ? ' · 阅读约需 ' + wenzhang.reading_time : '');
            lianjie.appendChild(xinxiP);

            li.appendChild(lianjie);
            jieguoLiebiao.appendChild(li);
        });

        zhuangtaiWenben.textContent = '找到 ' + mingzhongLieBiao.length + ' 篇包含「' + guanjianci + '」的文章。';
    }

    // ---------- 5. 最近搜索（localStorage）----------
    function duquZuijin() {
        try {
            var yuan = localStorage.getItem(BENCUN_JIANMING);
            var liebiao = yuan ? JSON.parse(yuan) : [];
            return Array.isArray(liebiao) ? liebiao : [];
        } catch (cuowu) {
            // 本地存储被禁用或者数据坏了都不影响搜索主流程
            return [];
        }
    }

    function baocunZuijin(guanjianci) {
        var jiulu = duquZuijin().filter(function (jiu) {
            return jiu.toLowerCase() !== guanjianci.toLowerCase();
        });
        jiulu.unshift(guanjianci);
        jiulu = jiulu.slice(0, ZUIJIN_ZUIDA_SHU);
        try {
            localStorage.setItem(BENCUN_JIANMING, JSON.stringify(jiulu));
        } catch (cuowu) {
            /* 存不下就忽略，不报错 */
        }
        xuanranZuijin();
    }

    function xuanranZuijin() {
        var jiulu = duquZuijin();
        zuijinLiebiao.innerHTML = '';
        if (jiulu.length === 0) {
            zuijinQu.hidden = true;
            return;
        }
        zuijinQu.hidden = false;
        jiulu.forEach(function (ci) {
            var li = document.createElement('li');
            var anniu = document.createElement('button');
            anniu.type = 'button';
            anniu.className = 'zhuti-zuijin-ci';
            anniu.textContent = ci;
            anniu.addEventListener('click', function () {
                shuruKuang.value = ci;
                zhixingSousuo(ci);
            });
            li.appendChild(anniu);
            zuijinLiebiao.appendChild(li);
        });
    }

    // ---------- 6. 一次完整搜索的主流程 ----------
    function zhixingSousuo(shuruZhi) {
        var guanjianci = (shuruZhi !== undefined ? String(shuruZhi) : shuruKuang.value).trim();

        // 空输入：清空结果区并给出提示，不发请求
        if (!guanjianci) {
            jieguoQu.hidden = true;
            wujieguoQu.hidden = true;
            zhuangtaiWenben.textContent = '请输入要搜索的关键词。';
            return;
        }

        shuruKuang.value = guanjianci;
        // 地址栏带上 ?q=，方便把搜索结果链接发给别人，也方便自动化测试
        var dangqianUrl = new URL(window.location.href);
        dangqianUrl.searchParams.set('q', guanjianci);
        window.history.replaceState(null, '', dangqianUrl.toString());

        baocunZuijin(guanjianci);
        huoquWenzhangLiebiao().then(function (wenzhangLieBiao) {
            var mingzhong = pipeiWenzhang(wenzhangLieBiao, guanjianci);
            xuanranJieguo(mingzhong, guanjianci);
        });
    }

    // ---------- 7. 绑定事件 ----------
    biaodan.addEventListener('submit', function (shijian) {
        shijian.preventDefault();
        zhixingSousuo();
    });

    qingkongAnniu.addEventListener('click', function () {
        localStorage.removeItem(BENCUN_JIANMING);
        xuanranZuijin();
    });

    // 页面打开时：先渲染最近搜索；如果地址栏带 q 就自动搜一次
    xuanranZuijin();
    var canshuUrl = new URL(window.location.href);
    var daiSousuo = canshuUrl.searchParams.get('q');
    if (daiSousuo) {
        shuruKuang.value = daiSousuo;
        zhixingSousuo(daiSousuo);
    }

    // 暴露给自动化测试用（node 环境下没有 window，不挂载）
    if (typeof window !== 'undefined') {
        window.shiyankeSousuo = {
            zhuanyiZhengze: zhuanyiZhengze,
            pipeiWenzhang: pipeiWenzhang,
            gaoliangWenben: gaoliangWenben
        };
    }
})();
