# NOTICE — 许可证与署名说明

本仓库是《开源软件与新技术》实验01的二次开发成品，基于开源项目二次开发，
按要求保留上游署名并说明本人改动范围。

## 上游项目

| 名称 | 版本 | 许可证 | 上游地址 |
| --- | --- | --- | --- |
| Ghost | 6.10.3 | MIT | https://github.com/TryGhost/Ghost |
| Ghost 内置 Source 主题 | 1.5.0 | MIT（随 Ghost 发布） | 见 Ghost 仓库 TryGhost/Ghost |

## 本人二次开发范围（本仓库新增/修改）

- `theme/shiyanke-theme/`：在 Ghost 内置 Source 主题基础上改出的自定义主题
  - 复制并改名自 Source 1.5.0，保留上游主题结构与样式文件；
  - 新增：`page-sousuo.hbs`（搜索页模板）、`assets/js/bendi-sousuo.js`（本地搜索增强）、
    `assets/js/comments-ui.min.js`（评论区资源本地化）、`assets/css/zhuti-gaizao.css`（样式覆盖层）。
- `scripts/`：播种脚本、主题部署脚本、安装脚本（全部本人编写）。
- `tests/zidong/ceshi.js`：18 条自动化测试（本人编写）。
- `docs/`：基线、架构、Issue 正文、测试结果等文档（本人编写）。
- 对 Ghost 核心源码（node_modules/ghost/core）**没有任何修改**。

## 使用说明

1. 主题版权归 Ghost 项目所有，本主题按 MIT 许可分发，署名保留 Ghost 与 Source 主题原始出处。
2. 站内搜索功能使用 Content API 只读公开密钥，密钥可以出现在前端（只读、只取公开内容）；
   Admin 密钥只存在于本机 runtime 目录，被 .gitignore 排除，不入仓库。
3. 演示数据（文章、会员、评论）均为本地实验造的数据，不包含任何真实用户隐私。

## 依赖许可证

Ghost 6.10.3 及其依赖的许可证请参见上游 Ghost 仓库的 LICENSE 与每个 npm 包的 LICENSE 文件。
本仓库未新增第三方运行时依赖。
