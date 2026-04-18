# Second Brain AI (NovaBlock)

现代化、本地优先的 AI 第二大脑与块级编辑器 (Block-based Editor)。

## 项目简介
Second Brain AI 旨在打造一个极致丝滑、极简主义且功能强大的个人知识管理系统。它结合了 Notion 式的块级编辑体验与 AI 驱动的深度洞察，支持本地存储与多种 AI 模型配置。

## 核心特性
- **块级编辑器基础框架**：基于 Tiptap 构建，提供类似 Notion 的块级操作体验，支持多种内容块流式插入 (Tiptap based, 类似 Notion 体验)。
- **万物皆可拖拽 (Drag & Drop)**：支持块级别的自由拖拽重排，以及从系统资源管理器直接拖入文件进行上传。
- **折叠标题功能 (Collapsible Headings)**：支持 H1-H3 标题的折叠与展开，帮助管理长文档结构，配合智能生成的唯一 ID 确保 TOC 锚点跳转。
- **全局媒体与文件处理**：支持图片、视频、音频及通用文件的全局拖拽上传。集成系统默认程序打开功能，实现本地文件联动。
- **拍立得 (Polaroid) 风格媒体卡片**：上线现代化、高颜值的多媒体卡片 UI。具备优雅的悬浮微交互 (Hover Micro-interactions)、精致阴影与圆角设计，提升整体视觉体验。
- **环境自适应动态路由 (`getApiBase`)**：自动识别本地 `0.0.0.0` 环境与云端 `strato-https-proxy` 环境，动态切换 API 基础路径，确保在不同部署环境下皆能正常通信。

## 技术栈
- **前端**：React + TypeScript + Tiptap + TailwindCSS + Framer Motion
- **后端**：FastAPI + SQLAlchemy + SQLite
- **AI**：支持多种兼容接口（OpenAI/Claude 等）

## 更新日志
### v0.01 (2026-04-06)
- **Initial Release**: 项目初始脚手架搭建完成，发布 v0.01。
- **Editor**: 实现基于 Tiptap 的块级编辑器核心逻辑与基础框架。
- **UI/UX**: 彻底重构并上线“拍立得”风格多媒体卡片 UI。
- **Fix**: 修复云端代理环境下的图片上传 500 错误.
- **Feature**: 实现跨环境自适应 API 路由逻辑 (`getApiBase`)。

---

For a full list of open-source assets used in this project, please see [CREDITS.md](./CREDITS.md).
