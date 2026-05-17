// 统一错误类型。
//
// 命令逐步把 `Result<T, String>` 迁到 `AppResult<T>`。
// `From<X> for AppError` 让 `?` 把常见底层错误自动转过来。
// `Serialize` 让 Tauri 把错误传到前端时仍然是字符串（保留旧前端拿 string error 的契约）。

use serde::{Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("数据库错误: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("HTTP 请求失败: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Tauri 错误: {0}")]
    Tauri(#[from] tauri::Error),

    /// 内部不变量被打破（HashMap 缺键、向量越界等）。开发期 bug，不该到用户面前。
    #[error("内部错误: {0}")]
    Internal(String),

    /// 调用方传了不合法的参数（路径不存在、格式错等）。可对用户友好展示。
    #[error("参数错误: {0}")]
    Invalid(String),

    /// 平台限制、外部命令缺失等无法继续执行的情况。
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn invalid(msg: impl Into<String>) -> Self {
        Self::Invalid(msg.into())
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    pub fn other(msg: impl Into<String>) -> Self {
        Self::Other(msg.into())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Other(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Other(s.to_string())
    }
}

// 让尚未迁移的、仍返回 `Result<_, String>` 的旧函数能用 `?` 吃下 `AppResult`。
// 迁移完成后可以删掉。
impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}

// Tauri 用 serde 序列化命令返回值（包括 Err 分支）。前端旧契约只期望字符串错误，
// 所以这里把整个 enum 序列化成 Display 文本，保持兼容。
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

// specta 默认会按 enum 结构生成 Type，但实际序列化是字符串，对不上。
// 手写成 String 让 tauri-specta 给前端导出 `Promise<T, string>`，和实际 wire 格式一致。
impl specta::Type for AppError {
    fn inline(
        types: &mut specta::TypeMap,
        generics: specta::Generics,
    ) -> specta::datatype::DataType {
        <String as specta::Type>::inline(types, generics)
    }
}
