# shiyanke — 基于 Ghost 的开源个人博客二次开发

《开源软件与新技术》实验01 成品：基于开源博客平台 **Ghost 6.10.3** 二次开发，
自定义主题 **shiyanke-theme**，并实现自主功能 **本地搜索增强**
（关键词高亮 + 最近搜索 + 无结果标签推荐，Content API 实现）。

- 站点名：我的开源学习博客
- 作者：王锐兵（软件2304，学号 23110506126）
- 本地访问：http://127.0.0.1:2368/ （前台） / http://127.0.0.1:2368/ghost/ （管理端）

> 本仓库是二次开发成品，**不是** Ghost 的再分发；上游版权归 Ghost 项目所有，
> 许可证与署名见 [NOTICE.md](NOTICE.md)。个人改动范围见下方「本人实现范围」。

---

## 一、用到的上游项目

| 项 | 值 |
| --- | --- |
| 上游项目 | Ghost（TryGhost/Ghost） |
| 上游地址 | https://github.com/TryGhost/Ghost |
| 固定版本 | **6.10.3**（本次实验实测；不写“最新版”） |
| 上游许可证 | MIT |
| 内置主题来源 | Ghost 6.10.3 自带的 Source 主题 1.5.0（MIT） |

选 Ghost 的理由：实验要求以成熟开源项目为基线。Ghost 已经把认证、编辑器、标签、
会员、评论、数据库迁移都做好了，我不用重复造轮子，可以把精力放在自定义主题、
Content API 和本地搜索增强这些「可辨识的二次开发」上。

## 二、本人实现范围（对比上游）

### 1. 自定义主题 shiyanke-theme（主题 / 界面）
- 从 Ghost 内置 Source 主题 1.5.0 复制改名，**不重写**，保留上游结构与样式；
- `default.hbs`：`lang=zh-CN`、引入自定义 css/js、导航中文化（登录/注册会员/搜索入口）；
- 文章卡片：中文日期 + 阅读时长；详情页：中文日期 + 标签胶囊 + 相关文章中文标题；
- `assets/css/zhuti-gaizao.css`：样式覆盖层，改坏可回滚，方便对比基线；
- 评论区资源本地化：`assets/js/comments-ui.min.js`，离线也能渲染评论。

### 2. 自主功能：本地搜索增强（对应 Issue #3）
- 新增搜索页模板 `page-sousuo.hbs` + `assets/js/bendi-sousuo.js`；
- Content API 只读公开密钥拉取全站文章，浏览器本地匹配；
- 关键词高亮（`<mark>`，先转义正则特殊字符）；
- 最近搜索存 `localStorage`（最近 8 条，去重、可清空）；
- 无结果时用主题 `#get tags` 服务端渲染的标签墙兜底；
- 全程只读公开数据，**管理密钥绝不出现在前端**。

### 3. 伴随脚本与测试
- `scripts/zhongzhi-shuju.js`：播种脚本（8 篇文章 / 3 标签 / 2 会员 / 5 评论，可重复执行）；
- `scripts/bushu-zhuti.py`：主题打包 + 上传 + 激活 + API key 注入；
- `scripts/anzhuang.ps1`：Windows 手动安装脚本；
- `tests/zidong/ceshi.js`：18 条自动化测试（`node tests/zidong/ceshi.js`）。

## 三、目录结构

```
shiyanke/
├── README.md
├── NOTICE.md                    # 许可证与署名说明
├── docs/
│   ├── baseline.md              # 基线说明（版本锁定/环境/边界）
│   ├── architecture.md          # 总体架构
│   ├── issue/                   # Issue 正文源文件（#1-#4）
│   ├── ceshi-jieguo.json        # 18 条自动化测试结果
│   └── jietu/                   # 运行截图
├── theme/
│   └── shiyanke-theme/          # 自定义主题源码（含 zip 打包说明）
├── scripts/                     # 安装/播种/部署脚本
├── tests/
│   └── zidong/ceshi.js          # 自动化测试
└── runtime/
    └── yunxing/                 # Ghost 运行目录（junction，见下）
```

## 四、冷启动复现（从零跑起来）

> 前置：Windows + Node.js 18+（本机实测 Node v22.23.2）+ Git。

### 方式 A：按脚本装（推荐）
```powershell
cd shiyanke
.\scripts\anzhuang.ps1            # 会装依赖、解包 Ghost、配 sqlite3、启动
```

### 方式 B：手动步骤（脚本背后做的事）
1. 固定版本：`npm install ghost@6.10.3 --legacy-peer-deps --ignore-scripts`
   （Windows 下 Ghost CLI 不可用，直接跑 npm 包里的 Ghost）。
2. **先装依赖、最后解包**：把 `ghost-6.10.3.tgz` 解到 `node_modules\ghost`，
   把 `@tryghost/i18n` 解到 `node_modules\@tryghost\i18n`（npm 会当冗余删掉，所以顺序不能反）。
3. 修依赖：`lodash.template@4.5.0`（4.18.0 的 `assignWith` 未定义）、`i18next@23.16.8`。
4. sqlite3：本机没有 VS 工具链，源码编译必挂，改用 npmmirror 的预编译二进制
   `sqlite3-v5.1.7-napi-v6-win32-x64.tar.gz` 解到 `node_modules\sqlite3`。
5. 运行目录 `package.json` 的 `version` 必须写 `6.10.3`（否则主题按 v1 校验报 Missing helper）。
6. 放主题到 `content/themes/shiyanke-theme`，配好 `config.development.json`
   （`url: http://127.0.0.1:2368/`，`staffDeviceVerification: false` 免验证码）。
7. 启动：`$env:NODE_ENV="development"; node node_modules\ghost\ghost.js`
8. 首次访问 `/ghost/` 初始化管理员（本实验：王锐兵 / admin@shiyanke.local）。

### 播种演示数据
```powershell
node scripts\zhongzhi-shuju.js     # 幂等，可重复执行
python scripts\bushu-zhuti.py      # 打包并激活自定义主题
node tests\zidong\ceshi.js         # 跑 18 条自动化测试
```

## 五、测试

- 自动化：`node tests\zidong\ceshi.js`（18 条，功能 8 + 权限 4 + 主题/界面 4 + 恢复 2）。
- 主题校验：`gscan <theme目录>`（安装包内的 gscan，输出与 Ghost 6.x 兼容，无 error/warning）。
- 测试结果存档：`docs/ceshi-jieguo.json`。
- 一次失败用例与修复：见 PR 描述与 Git 提交历史（例如搜索高亮对正则特殊字符未转义导致搜索“*”报错，
  后补 `zhuanYiZhengZe` 修复并加入 T07 断言）。

## 六、备份与恢复

- **内容（文章/页面/标签/设置）**：管理端导出 JSON（`/ghost/` → 设置 → 导出内容），
  实测可导出 8 篇文章 + 2 页面 + 3 标签 + 94 项设置（存档：`docs/daochu/beifen-20260903.json`）。
- **会员与评论**：实测 **Ghost 的 JSON 导出不包含 members/comments 表**（涉及隐私/付费数据，属 Ghost 设计），
  因此会员与评论靠**数据库冷备份**恢复：把 `runtime/yunxing/content/data/ghost-dev.db`
  复制走/复制回（备份示例：`runtime/yunxing/beifen/`）。
- 恢复验证：重启 Ghost 后公开文章仍为 8 篇（T17）、导出 JSON 含数据（T18），
  均被 `tests/zidong/ceshi.js` 自动断言。

> 实测结论：单一 JSON 导出并不能完整还原博客（缺会员/评论），**完整备份 = 导出 JSON + 数据库冷备份**，
> 这也是实验任务7"备份恢复"里值得记录的一个发现。

## 七、工作记录与 Git 过程

- 全程使用个人 Git 仓库（本仓库），GitHub 远端：https://github.com/remchang/shiyanke
- 4 个 Issue 记录任务拆解（#1 基线选型、#2 主题改造、#3 搜索增强、#4 备份恢复）。
- 使用 feature/blog-enhancement 分支，PR 关联 Issue，合并前完成一次自我 Code Review
  （记录见 PR 描述）。
- Commit 数 ≥5，覆盖基线、核心功能、自主功能、测试、文档。

## 八、已知限制 / 风险

- 评论的「发验证邮件→点链接」流程依赖邮件服务，本机离线环境无法走通，
  演示评论用脚本直接写本地实验库（仅本地库，不碰线上）。
- 教师访问本机 localhost 需要同局域网/内网穿透，未配置公网。
- GitHub Token 为实验临时使用，建议使用后撤销。
