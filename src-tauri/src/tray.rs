use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use crate::agent::AgentState;

pub fn show_or_create_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    } else {
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("ARIS Guard")
            .inner_size(1000.0, 680.0)
            .min_inner_size(860.0, 560.0)
            .resizable(true)
            .build()?;
    }
    Ok(())
}

pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItem::with_id(app, "open", "Open ARIS Guard", true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", "Pause Protection", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit ARIS Guard", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_item, &pause_item, &separator, &quit_item])?;

    let tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("ARIS Guard")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                if let Err(e) = show_or_create_window(app) {
                    tracing::error!("Failed to open main window: {e}");
                }
            }
            "pause" => {
                if let Some(agent) = app.try_state::<AgentState>() {
                    let is_now_paused = agent.toggle_paused();
                    let new_label = if is_now_paused {
                        "Resume Protection"
                    } else {
                        "Pause Protection"
                    };
                    let _ = pause_item.set_text(new_label);
                }
            }
            "quit" => {
                tracing::info!("Quit requested via system tray");
                if let Some(agent) = app.try_state::<AgentState>() {
                    agent.set_quitting(true);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Err(e) = show_or_create_window(app) {
                    tracing::error!("Failed to open main window on tray click: {e}");
                }
            }
        });

    let icon = tauri::include_image!("icons/32x32.png");
    tray_builder.icon(icon).build(app)?;

    Ok(())
}
