mod commands;
mod keyboard_hook;
mod storage;

use commands::{git, project, stats, system, toolbox, settings};
use tauri::{
    Emitter, Manager, RunEvent,
    tray::TrayIconBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    image::Image,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例插件：防止重复打开应用
        // 开发模式和正式版使用不同的标识符，可以并行运行
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 当尝试启动第二个实例时，聚焦到已有窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // macOS: 隐藏 Dock 图标，仅保留菜单栏托盘图标
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // 初始化存储系统
            if let Err(e) = storage::init_storage() {
                eprintln!("存储系统初始化警告: {}", e);
                // 不阻止应用启动，只是警告
            }

            // 获取日志目录路径
            let log_dir = if let Ok(config) = storage::get_storage_config() {
                config.logs_dir.clone()
            } else {
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.join("logs")))
                    .unwrap_or_else(|| std::path::PathBuf::from("logs"))
            };

            // 确保日志目录存在
            let _ = std::fs::create_dir_all(&log_dir);

            // 始终启用日志插件（开发和生产环境都启用）
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Folder {
                            path: log_dir,
                            file_name: Some("app".into()),
                        }
                    ))
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                    .max_file_size(10 * 1024 * 1024) // 10MB
                    .build(),
            )?;

            // 创建托盘右键菜单
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;

            // 工具箱子菜单
            let tool_monitor = MenuItem::with_id(app, "tool_monitor", "系统监控", true, None::<&str>)?;
            let tool_downloader = MenuItem::with_id(app, "tool_downloader", "文件下载", true, None::<&str>)?;
            let tool_server = MenuItem::with_id(app, "tool_server", "本地服务", true, None::<&str>)?;
            let tool_claude = MenuItem::with_id(app, "tool_claude", "Claude Code", true, None::<&str>)?;
            let tool_netcat = MenuItem::with_id(app, "tool_netcat", "Netcat", true, None::<&str>)?;
            let tool_shortcuts = MenuItem::with_id(app, "tool_shortcuts", "快捷键备忘", true, None::<&str>)?;
            let toolbox_submenu = Submenu::with_items(
                app,
                "工具箱",
                true,
                &[&tool_monitor, &tool_downloader, &tool_server, &tool_claude, &tool_netcat, &tool_shortcuts],
            )?;

            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show, &sep1, &toolbox_submenu, &sep2, &quit])?;

            // 加载托盘图标（不透明版本）
            let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))
                .expect("Failed to load tray icon");

            // 创建系统托盘
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("CodeShelf - 代码书架")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ if id.starts_with("tool_") => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                            let tool_type = &id[5..]; // strip "tool_" prefix
                            let _ = app.emit("navigate-to-tool", tool_type);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();

                    match event {
                        tauri::tray::TrayIconEvent::Click { button, button_state, .. } => {
                            if button == tauri::tray::MouseButton::Left
                                && button_state == tauri::tray::MouseButtonState::Up {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        tauri::tray::TrayIconEvent::DoubleClick { button, .. } => {
                            if button == tauri::tray::MouseButton::Left {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // 初始化 Netcat 状态
            app.manage(toolbox::netcat::NetcatState::new());

            // 初始化 macOS/Linux 全局快捷键插件
            #[cfg(not(target_os = "windows"))]
            {
                app.manage(keyboard_hook::GlobalShortcutState::new());

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, shortcut, event| {
                            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                                if let Some(state) = app.try_state::<keyboard_hook::GlobalShortcutState>() {
                                    if let Ok(map) = state.0.lock() {
                                        if let Some(action_id) = map.get(&shortcut.id()) {
                                            let _ = app.emit("global-shortcut-event", action_id);
                                        }
                                    }
                                }
                            }
                        })
                        .build()
                )?;
            }

            // 启动 Windows 键盘钩子（全局快捷键）
            #[cfg(target_os = "windows")]
            {
                match keyboard_hook::start_hook(app.handle().clone()) {
                    Ok(state) => {
                        app.manage(keyboard_hook::KeyboardHookManager(
                            std::sync::Mutex::new(Some(state)),
                        ));
                    }
                    Err(e) => {
                        log::error!("键盘钩子启动失败: {}", e);
                    }
                }
            }

            println!("Tauri app setup completed with tray icon");

            Ok(())
        })
        // 拦截窗口关闭事件：隐藏到托盘而不是退出
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Git commands
            git::scan_directory,
            git::get_git_status,
            git::get_commit_history,
            git::get_commit_detail,
            git::get_commit_files,
            git::search_commits,
            git::get_branches,
            git::get_remotes,
            git::add_remote,
            git::verify_remote_url,
            git::remove_remote,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            git::git_clone,
            git::cancel_git_clone,
            git::sync_to_remote,
            git::checkout_branch,
            git::create_branch,
            git::git_add,
            git::git_unstage,
            git::git_commit,
            git::git_add_and_commit,
            git::is_git_repo,
            git::git_init,
            // Project commands
            project::get_projects,
            project::create_project,
            project::update_project,
            project::delete_project,
            project::delete_project_directory,
            project::toggle_favorite,
            project::update_last_opened,
            project::batch_update_projects,
            project::batch_delete_projects,
            project::import_projects,
            project::reload_projects,
            // Stats commands
            stats::get_dashboard_stats,
            stats::refresh_dashboard_stats,
            stats::refresh_dirty_stats,
            stats::init_stats_cache,
            stats::mark_project_dirty,
            stats::mark_all_projects_dirty,
            stats::has_dirty_stats,
            stats::cleanup_stats_cache,
            // System commands
            system::open_in_explorer,
            system::open_in_editor,
            system::open_in_terminal,
            system::open_url,
            system::read_readme,
            system::test_terminal,
            system::check_git_version,
            system::check_node_version,
            system::get_app_paths,
            system::clear_logs,
            // Toolbox - Scanner commands
            toolbox::scanner::scan_ports,
            toolbox::scanner::stop_scan,
            toolbox::scanner::get_common_ports,
            toolbox::scanner::check_port,
            toolbox::scanner::scan_local_dev_ports,
            // Toolbox - Downloader commands
            toolbox::downloader::start_download,
            toolbox::downloader::pause_download,
            toolbox::downloader::resume_download,
            toolbox::downloader::cancel_download,
            toolbox::downloader::get_download_tasks,
            toolbox::downloader::get_download_task,
            toolbox::downloader::clear_completed_downloads,
            toolbox::downloader::open_download_folder,
            toolbox::downloader::remove_download_task,
            // Toolbox - Process commands
            toolbox::process::get_processes,
            toolbox::process::get_port_processes,
            toolbox::process::kill_process,
            toolbox::process::get_system_stats,
            toolbox::process::get_local_port_occupation,
            // Toolbox - Forwarder commands
            toolbox::forwarder::add_forward_rule,
            toolbox::forwarder::remove_forward_rule,
            toolbox::forwarder::start_forwarding,
            toolbox::forwarder::stop_forwarding,
            toolbox::forwarder::get_forward_rules,
            toolbox::forwarder::get_forward_rule,
            toolbox::forwarder::get_forward_stats,
            toolbox::forwarder::update_forward_rule,
            // Toolbox - Server commands
            toolbox::server::create_server,
            toolbox::server::start_server,
            toolbox::server::stop_server,
            toolbox::server::remove_server,
            toolbox::server::get_servers,
            toolbox::server::get_server,
            toolbox::server::update_server,
            // Toolbox - Claude Code commands
            toolbox::claude_code::check_all_claude_installations,
            toolbox::claude_code::check_claude_by_path,
            toolbox::claude_code::read_claude_config_file,
            toolbox::claude_code::write_claude_config_file,
            toolbox::claude_code::open_claude_config_dir,
            toolbox::claude_code::get_quick_config_options,
            toolbox::claude_code::apply_quick_config,
            toolbox::claude_code::get_config_profiles,
            toolbox::claude_code::save_config_profile,
            toolbox::claude_code::delete_config_profile,
            toolbox::claude_code::apply_config_profile,
            toolbox::claude_code::create_profile_from_current,
            toolbox::claude_code::scan_claude_config_dir,
            toolbox::claude_code::get_wsl_config_dir,
            // Claude Code - Quick configs & cache commands
            toolbox::claude_code::get_saved_quick_configs,
            toolbox::claude_code::save_quick_configs,
            toolbox::claude_code::get_claude_installations_cache,
            toolbox::claude_code::save_claude_installations_cache,
            toolbox::claude_code::clear_claude_installations_cache,
            // Claude Code - Launch commands
            toolbox::claude_code::launch_claude_in_terminal,
            toolbox::claude_code::get_claude_launch_dirs,
            toolbox::claude_code::save_claude_launch_dirs,
            // Toolbox - Netcat commands
            toolbox::netcat::netcat_init,
            toolbox::netcat::netcat_create_session,
            toolbox::netcat::netcat_start_session,
            toolbox::netcat::netcat_stop_session,
            toolbox::netcat::netcat_remove_session,
            toolbox::netcat::netcat_send_message,
            toolbox::netcat::netcat_get_sessions,
            toolbox::netcat::netcat_get_session,
            toolbox::netcat::netcat_get_messages,
            toolbox::netcat::netcat_get_clients,
            toolbox::netcat::netcat_clear_messages,
            toolbox::netcat::netcat_disconnect_client,
            toolbox::netcat::netcat_update_auto_send,
            toolbox::netcat::netcat_fetch_http,
            // Toolbox - Shortcuts commands
            toolbox::shortcuts::get_shortcuts,
            toolbox::shortcuts::save_shortcuts,
            toolbox::shortcuts::add_shortcut,
            toolbox::shortcuts::update_shortcut,
            toolbox::shortcuts::delete_shortcut,
            toolbox::shortcuts::reset_shortcuts,
            toolbox::shortcuts::get_current_platform,
            // Settings commands
            settings::get_labels,
            settings::save_labels,
            settings::add_label,
            settings::remove_label,
            settings::get_categories,
            settings::save_categories,
            settings::add_category,
            settings::remove_category,
            settings::get_editors,
            settings::add_editor,
            settings::update_editor,
            settings::remove_editor,
            settings::set_default_editor,
            settings::get_terminal_config,
            settings::save_terminal_config,
            settings::get_app_settings,
            settings::save_app_settings,
            // Settings - UI State commands
            settings::get_ui_state,
            settings::save_ui_state,
            // Settings - Notification commands
            settings::get_notifications,
            settings::save_notifications,
            settings::add_notification,
            settings::remove_notification,
            settings::clear_notifications,
            // Settings - App Shortcuts commands
            settings::get_app_shortcuts,
            settings::save_app_shortcuts,
            // Keyboard hook commands
            keyboard_hook::register_global_shortcuts,
            keyboard_hook::unregister_all_global_shortcuts,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                keyboard_hook::stop_hook_from_manager(app);
            }
        });
}
