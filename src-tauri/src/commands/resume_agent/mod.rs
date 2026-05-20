// 简历 / 项目知识 agent 的 Rust 实现。
//
// 替代前端的 langchain + deepagents 链:
//   - run_resume_agent     —— 内置虚拟 fs + read/write/ls 工具循环 (取代 deepagents)
//   - run_knowledge_agent  —— 两步推理 (规划 → 读文件 → 生成 markdown,取代手工 model.invoke 链)
//
// 前端只通过 IPC 触发,前端 CSP 可以维持严格 (不再需要 'unsafe-eval')。

pub mod types;

mod knowledge_agent;
mod llm;
mod resume_agent;
mod virtual_fs;

pub use knowledge_agent::*;
pub use resume_agent::*;
