# 安全策略

## 支持的版本

只有 [最新发布版本](https://github.com/ouyangjiahong26/bibtex-clean/releases) 接受安全修复。报告前请先确认问题在最新版本上仍可复现。

## 报告漏洞

使用 GitHub 的私有漏洞报告，不要在公开 issue 中披露：

<https://github.com/ouyangjiahong26/bibtex-clean/security/advisories/new>

报告请包含：受影响的版本、复现步骤、影响范围。

## 范围

插件在 Zotero 进程内运行，可以读写本机 Zotero 数据库与文件系统。属于范围的问题：

- 由条目字段、附件路径等内容触发的代码执行、路径穿越或越权写入
- 把本机数据发往外部网络

通常不属于范围：

- 依赖项自身的已知漏洞（请报告给上游，同时告知本仓库是欢迎的）
- 需要用户在 Zotero 之外手工改文件才能触发的问题

## 响应

维护者会尽快确认收到报告，修复随新版本发布，之后再公开细节。修复发布前请勿公开漏洞内容。
