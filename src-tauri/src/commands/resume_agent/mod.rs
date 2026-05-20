// 简历 / 项目知识 agent 的 Rust 实现。
//
// 替代前端的 langchain + deepagents 链:
//   - run_resume_agent     —— 单次 chat_completion + response_format=json_schema
//                              (取代历史的虚拟 fs + write_file 工具循环)
//   - run_knowledge_agent  —— 两步推理 (规划 → 读文件 → 生成 markdown,取代手工 model.invoke 链)
//
// 前端只通过 IPC 触发,前端 CSP 可以维持严格 (不再需要 'unsafe-eval')。

pub mod types;

mod knowledge_agent;
mod llm;
mod resume_agent;

pub use knowledge_agent::*;
pub use resume_agent::*;
