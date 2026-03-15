/// Windows 低级键盘钩子模块
/// 使用 SetWindowsHookEx(WH_KEYBOARD_LL) 替代 RegisterHotKey，
/// 多个钩子链式共存不会冲突。
///
/// 非 Windows 平台提供 no-op 命令存根。

use serde::Deserialize;

#[derive(Deserialize)]
pub struct ShortcutInput {
    pub id: String,
    pub keys: String,
}

// ============== Windows 实现 ==============

#[cfg(target_os = "windows")]
mod win {
    use std::sync::mpsc::{self, SyncSender, Receiver};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::thread::JoinHandle;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    // --- 修饰键位掩码 ---
    pub const MOD_CTRL: u8 = 1;
    pub const MOD_ALT: u8 = 2;
    pub const MOD_SHIFT: u8 = 4;

    // --- 虚拟键码常量 ---
    const VK_CONTROL: u32 = 0x11;
    const VK_MENU: u32 = 0x12; // Alt
    const VK_SHIFT: u32 = 0x10;
    const VK_LCONTROL: u32 = 0xA2;
    const VK_RCONTROL: u32 = 0xA3;
    const VK_LMENU: u32 = 0xA4;
    const VK_RMENU: u32 = 0xA5;
    const VK_LSHIFT: u32 = 0xA0;
    const VK_RSHIFT: u32 = 0xA1;
    const VK_LWIN: u32 = 0x5B;
    const VK_RWIN: u32 = 0x5C;

    // --- 数据结构 ---

    #[derive(Clone)]
    pub struct HookBinding {
        pub id: String,
        pub modifiers: u8,
        pub vk_code: u32,
    }

    struct HookShared {
        bindings: Arc<Mutex<Vec<HookBinding>>>,
        sender: SyncSender<String>,
    }

    pub static HOOK_SHARED_BINDINGS: OnceLock<Arc<Mutex<Vec<HookBinding>>>> = OnceLock::new();
    static HOOK_SHARED: OnceLock<HookShared> = OnceLock::new();

    pub struct HookState {
        pub thread_handle: JoinHandle<()>,
        pub thread_id: u32,
    }

    pub struct KeyboardHookManager(pub std::sync::Mutex<Option<HookState>>);

    /// 判断虚拟键码是否为修饰键（在 hook_proc 中跳过）
    fn is_modifier_vk(vk: u32) -> bool {
        matches!(
            vk,
            VK_CONTROL | VK_MENU | VK_SHIFT
                | VK_LCONTROL | VK_RCONTROL
                | VK_LMENU | VK_RMENU
                | VK_LSHIFT | VK_RSHIFT
                | VK_LWIN | VK_RWIN
        )
    }

    // --- 钩子回调 ---

    unsafe extern "system" fn hook_proc(
        n_code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if n_code >= 0 {
            let msg = w_param.0 as u32;
            if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                let kb = &*(l_param.0 as *const KBDLLHOOKSTRUCT);
                let vk = kb.vkCode;

                if !is_modifier_vk(vk) {
                    // 读取当前修饰键状态
                    let mut mods: u8 = 0;
                    if (GetAsyncKeyState(VK_CONTROL as i32) as u16) & 0x8000 != 0 {
                        mods |= MOD_CTRL;
                    }
                    if (GetAsyncKeyState(VK_MENU as i32) as u16) & 0x8000 != 0 {
                        mods |= MOD_ALT;
                    }
                    if (GetAsyncKeyState(VK_SHIFT as i32) as u16) & 0x8000 != 0 {
                        mods |= MOD_SHIFT;
                    }

                    // 匹配绑定
                    if let Some(shared) = HOOK_SHARED.get() {
                        if let Ok(bindings) = shared.bindings.try_lock() {
                            for b in bindings.iter() {
                                if b.vk_code == vk && b.modifiers == mods {
                                    let _ = shared.sender.try_send(b.id.clone());
                                    break;
                                }
                            }
                        }
                        // try_lock 失败 = 正在更新绑定，跳过本次检测（不阻塞钩子）
                    }
                }
            }
        }

        // 始终传递给下一个钩子，不吞按键
        CallNextHookEx(None, n_code, w_param, l_param)
    }

    // --- 钩子线程管理 ---

    pub fn start_hook(app_handle: tauri::AppHandle) -> Result<HookState, String> {
        let bindings = Arc::new(Mutex::new(Vec::<HookBinding>::new()));
        let (sender, receiver): (SyncSender<String>, Receiver<String>) =
            mpsc::sync_channel(64);

        // 保存绑定列表引用供 Tauri 命令使用
        HOOK_SHARED_BINDINGS
            .set(bindings.clone())
            .map_err(|_| "键盘钩子已初始化".to_string())?;

        // 初始化全局共享状态
        HOOK_SHARED
            .set(HookShared {
                bindings,
                sender,
            })
            .map_err(|_| "键盘钩子已初始化".to_string())?;

        // 线程 ID 传递通道
        let (tid_tx, tid_rx) = mpsc::sync_channel::<u32>(1);

        let thread_handle = std::thread::spawn(move || {
            unsafe {
                // 发送当前线程 ID
                let tid = windows::Win32::System::Threading::GetCurrentThreadId();
                let _ = tid_tx.send(tid);

                let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0)
                    .expect("SetWindowsHookExW 失败");

                // 消息循环（WH_KEYBOARD_LL 要求线程有消息循环）
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    // WM_QUIT 会使 GetMessageW 返回 FALSE 退出循环
                }

                let _ = UnhookWindowsHookEx(hook);
            }
        });

        let thread_id = tid_rx
            .recv()
            .map_err(|_| "获取钩子线程 ID 失败".to_string())?;

        // 异步分发任务：从 channel 读取 binding id，通过 Tauri 事件发送到前端
        let app = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            while let Ok(id) = receiver.recv() {
                let _ = tauri::Emitter::emit(&app, "global-shortcut-event", &id);
            }
        });

        log::info!("键盘钩子已启动, 线程ID: {}", thread_id);

        Ok(HookState {
            thread_handle,
            thread_id,
        })
    }

    /// 停止钩子线程
    pub fn stop_hook(state: HookState) {
        unsafe {
            // 向钩子线程发送 WM_QUIT
            windows::Win32::UI::WindowsAndMessaging::PostThreadMessageW(
                state.thread_id,
                windows::Win32::UI::WindowsAndMessaging::WM_QUIT,
                WPARAM(0),
                LPARAM(0),
            )
            .ok();
        }
        let _ = state.thread_handle.join();
        log::info!("键盘钩子已停止");
    }

    /// 从 Tauri 管理状态中停止钩子
    pub fn stop_hook_from_manager(app: &tauri::AppHandle) {
        use tauri::Manager;
        if let Some(manager) = app.try_state::<KeyboardHookManager>() {
            if let Ok(mut guard) = manager.0.lock() {
                if let Some(state) = guard.take() {
                    stop_hook(state);
                }
            }
        }
    }

    /// 按键解析：键名 -> Windows 虚拟键码
    pub fn key_name_to_vk(name: &str) -> Result<u32, String> {
        // 单个字母 a-z
        if name.len() == 1 {
            let ch = name.chars().next().unwrap();
            if ch.is_ascii_lowercase() {
                return Ok(ch.to_ascii_uppercase() as u32); // VK_A=0x41 .. VK_Z=0x5A
            }
            if ch.is_ascii_digit() {
                return Ok(ch as u32); // 0x30..0x39
            }
        }

        // F1-F24
        if let Some(rest) = name.strip_prefix('f') {
            if let Ok(n) = rest.parse::<u32>() {
                if (1..=24).contains(&n) {
                    return Ok(0x6F + n); // VK_F1=0x70
                }
            }
        }

        // 特殊键映射
        match name {
            "space" => Ok(0x20),
            "enter" | "return" => Ok(0x0D),
            "escape" | "esc" => Ok(0x1B),
            "tab" => Ok(0x09),
            "backspace" => Ok(0x08),
            "delete" | "del" => Ok(0x2E),
            "insert" => Ok(0x2D),
            "home" => Ok(0x24),
            "end" => Ok(0x23),
            "pageup" => Ok(0x21),
            "pagedown" => Ok(0x22),
            "up" => Ok(0x26),
            "down" => Ok(0x28),
            "left" => Ok(0x25),
            "right" => Ok(0x27),
            "capslock" => Ok(0x14),
            "numlock" => Ok(0x90),
            "scrolllock" => Ok(0x91),
            "printscreen" => Ok(0x2C),
            "pause" => Ok(0x13),
            // 符号键
            ";" | "semicolon" => Ok(0xBA),
            "=" | "equal" => Ok(0xBB),
            "," | "comma" => Ok(0xBC),
            "-" | "minus" => Ok(0xBD),
            "." | "period" => Ok(0xBE),
            "/" | "slash" => Ok(0xBF),
            "`" | "backquote" => Ok(0xC0),
            "[" | "bracketleft" => Ok(0xDB),
            "\\" | "backslash" => Ok(0xDC),
            "]" | "bracketright" => Ok(0xDD),
            "'" | "quote" => Ok(0xDE),
            _ => Err(format!("未知按键: {}", name)),
        }
    }

    /// 解析快捷键字符串，如 "ctrl+alt+c" -> (modifiers, vk_code)
    pub fn parse_keys(keys: &str) -> Result<(u8, u32), String> {
        let mut modifiers: u8 = 0;
        let mut vk_code: Option<u32> = None;

        for part in keys.split('+') {
            let part = part.trim().to_lowercase();
            match part.as_str() {
                "ctrl" | "control" => modifiers |= MOD_CTRL,
                "alt" => modifiers |= MOD_ALT,
                "shift" => modifiers |= MOD_SHIFT,
                _ => {
                    if vk_code.is_some() {
                        return Err(format!("多个非修饰键: {}", keys));
                    }
                    vk_code = Some(key_name_to_vk(&part)?);
                }
            }
        }

        match vk_code {
            Some(vk) => Ok((modifiers, vk)),
            None => Err(format!("缺少主键: {}", keys)),
        }
    }
}

// ============== 公共 API ==============

#[cfg(target_os = "windows")]
pub use win::KeyboardHookManager;

#[cfg(not(target_os = "windows"))]
pub struct KeyboardHookManager(pub std::sync::Mutex<Option<()>>);

// --- start_hook ---

#[cfg(target_os = "windows")]
pub fn start_hook(app_handle: tauri::AppHandle) -> Result<win::HookState, String> {
    win::start_hook(app_handle)
}

#[cfg(not(target_os = "windows"))]
pub fn start_hook(_app_handle: tauri::AppHandle) -> Result<(), String> {
    log::warn!("键盘钩子仅支持 Windows 平台");
    Ok(())
}

// --- stop_hook_from_manager ---

#[cfg(target_os = "windows")]
pub fn stop_hook_from_manager(app: &tauri::AppHandle) {
    win::stop_hook_from_manager(app);
}

#[cfg(not(target_os = "windows"))]
pub fn stop_hook_from_manager(_app: &tauri::AppHandle) {}

// --- Tauri 命令 ---

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn register_global_shortcuts(
    shortcuts: Vec<ShortcutInput>,
) -> Result<(), String> {
    let bindings_lock = win::HOOK_SHARED_BINDINGS
        .get()
        .ok_or_else(|| "键盘钩子未初始化".to_string())?;

    let mut new_bindings = Vec::with_capacity(shortcuts.len());
    for s in &shortcuts {
        let (modifiers, vk_code) = win::parse_keys(&s.keys)?;
        new_bindings.push(win::HookBinding {
            id: s.id.clone(),
            modifiers,
            vk_code,
        });
    }

    // 整体替换绑定列表
    let mut bindings = bindings_lock
        .lock()
        .map_err(|e| format!("锁获取失败: {}", e))?;
    *bindings = new_bindings;

    log::info!("已注册 {} 个全局快捷键", shortcuts.len());
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn register_global_shortcuts(
    _shortcuts: Vec<ShortcutInput>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn unregister_all_global_shortcuts() -> Result<(), String> {
    if let Some(bindings_lock) = win::HOOK_SHARED_BINDINGS.get() {
        let mut bindings = bindings_lock
            .lock()
            .map_err(|e| format!("锁获取失败: {}", e))?;
        bindings.clear();
        log::info!("已注销所有全局快捷键");
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn unregister_all_global_shortcuts() -> Result<(), String> {
    Ok(())
}
