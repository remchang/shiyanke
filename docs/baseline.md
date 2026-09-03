# 实验基线说明（baseline）

## 1. 选定的上游开源项目

- 项目：**Ghost**（可运行的内容与会员博客平台）
- 上游仓库：https://github.com/TryGhost/Ghost
- 固定版本：**6.10.3**（运行目录 package.json 与 lockfile 保持一致）
- 许可证：**MIT**
- 选它而不从零写的原因：实验要求“以成熟开源项目为基线”，博客的认证、编辑器、数据库迁移、会员、评论这些基础能力 Ghost 都已经做好，我可以把时间花在看得见、可验证的二次开发上（自定义主题 + 本地搜索增强），而不是两周内重复造轮子。

## 2. 本机运行环境（实测）

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 10/11（64 位） |
| Node.js | v22.23.2 |
| npm | 10.9.8 |
| Git | 2.54 |
| 数据库 | SQLite3（Ghost 内置，文件位于 content/data/ghost-dev.db） |
| 访问地址 | http://127.0.0.1:2368/（前台） / http://127.0.0.1:2368/ghost/（管理端） |
| 安装方式 | 手动 npm 安装（Ghost CLI 不支持 Windows，详见 README） |

## 3. 上游版本是怎么锁定的

- npm 装依赖时固定 `ghost@6.10.3`，不写“最新版”。
- 运行目录 `package.json` 的 `version` 字段必须和 Ghost 版本一致，否则 Ghost 会把主题按上古版本校验，报一堆 `Missing helper`。
- 主题引擎要求：`engines.ghost >= 5.0.0`，与 6.10.3 兼容。

## 4. 基线能做什么 / 不能做什么（边界）

- 基线自带：文章/页面编辑、标签、会员、评论（评论 UI 需联网加载）、后台管理、Content/Admin API。
- 本实验改动范围：**只动 content/themes 下自己的主题、Content API 取数逻辑和伴随脚本**；不改 node_modules/ghost/core 核心源码、不改数据库迁移文件。
- 判断标准：升级 Ghost 版本时会被覆盖的目录都不应该直接改。

## 5. 上游基线截图与变更清单

- 基线截图：docs/jietu/ 下以“基线/上游”开头的图片（如有）。
- 变更清单：见 Git 提交历史与 PR，可对比上游 Source 主题 1.5.0 与我改后的 shiyanke-theme 1.0.0。
