use tauri::{
    Emitter,
    menu::{Menu, MenuEvent, MenuItem, Submenu},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use std::process::Command;

const KEYCHAIN_SERVICE: &str = "com.ichibot.app";

#[derive(serde::Serialize)]
struct ApiKeys {
    claude_api_key: Option<String>,
    openai_api_key: Option<String>,
}

fn keychain_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|error| error.to_string())
}

fn read_key(account: &str) -> Result<Option<String>, String> {
    match keychain_entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn delete_key(account: &str) -> Result<(), String> {
    match keychain_entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn get_api_keys() -> Result<ApiKeys, String> {
    Ok(ApiKeys {
        claude_api_key: read_key("anthropic-api-key")?,
        openai_api_key: read_key("openai-api-key")?,
    })
}

#[tauri::command]
fn save_api_keys(claude_api_key: Option<String>, openai_api_key: Option<String>) -> Result<(), String> {
    if let Some(value) = claude_api_key.filter(|value| !value.trim().is_empty()) {
        keychain_entry("anthropic-api-key")?
            .set_password(&value)
            .map_err(|error| error.to_string())?;
    }
    if let Some(value) = openai_api_key.filter(|value| !value.trim().is_empty()) {
        keychain_entry("openai-api-key")?
            .set_password(&value)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_api_keys() -> Result<(), String> {
    delete_key("anthropic-api-key")?;
    delete_key("openai-api-key")?;
    Ok(())
}

#[tauri::command]
fn toggle_chat(window: tauri::Window) {
    if let Some(chat) = window.get_webview_window("chat") {
        if chat.is_visible().unwrap_or(false) {
            let _ = chat.hide();
        } else {
            let _ = chat.show();
            let _ = chat.set_focus();
        }
    }
}

#[tauri::command]
fn show_chat(window: tauri::Window) {
    if let Some(chat) = window.get_webview_window("chat") {
        let _ = chat.show();
        let _ = chat.set_focus();
    }
}

fn toggle_chat_from(handle: &tauri::AppHandle) {
    if let Some(chat) = handle.get_webview_window("chat") {
        if chat.is_visible().unwrap_or(false) {
            let _ = chat.hide();
        } else {
            let _ = chat.show();
            let _ = chat.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![toggle_chat, show_chat, get_api_keys, save_api_keys, delete_api_keys])
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let chat_item = MenuItem::with_id(app, "chatm", "Chat...", true, None::<&str>)?;
            let mochi_item = MenuItem::with_id(app, "appearance-mochi", "Mochi", true, None::<&str>)?;
            let face_item = MenuItem::with_id(app, "appearance-face", "Ichibot face", true, None::<&str>)?;
            let face2_item = MenuItem::with_id(app, "appearance-face2", "Ichibot face 2", true, None::<&str>)?;
            let face3_item = MenuItem::with_id(app, "appearance-face3", "Ichibot face 3", true, None::<&str>)?;
            let face4_item = MenuItem::with_id(app, "appearance-face4", "Ichibot face 4", true, None::<&str>)?;
            let appearances = Submenu::with_items(
                app,
                "Apariencia",
                true,
                &[&mochi_item, &face_item, &face2_item, &face3_item, &face4_item],
            )?;
            let login_item = MenuItem::with_id(app, "claude-login", "Iniciar sesión con Claude", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&chat_item, &appearances, &login_item, &quit])?;

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon(icon)
                .tooltip("Ichibot")
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // La X roja del chat NO destruye la ventana: la oculta para que
            // toggle_chat (tray / click en Mochi) pueda volver a mostrarla.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "chat" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .on_menu_event(|app, event: MenuEvent| match event.id.as_ref() {
            "quit" => app.exit(0),
            "chatm" => toggle_chat_from(app),
            "appearance-mochi" => {
                let _ = app.emit("ichibot:appearance", "mochi");
            }
            "appearance-face" => {
                let _ = app.emit("ichibot:appearance", "face");
            }
            "appearance-face2" => {
                let _ = app.emit("ichibot:appearance", "face2");
            }
            "appearance-face3" => {
                let _ = app.emit("ichibot:appearance", "face3");
            }
            "appearance-face4" => {
                let _ = app.emit("ichibot:appearance", "face4");
            }
            "claude-login" => {
                if let Err(error) = Command::new("claude").args(["auth", "login"]).spawn() {
                    eprintln!("no se pudo iniciar el login de Claude Code: {error}");
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
