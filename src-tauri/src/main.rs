// MAC — Multi-Agent Collegium
// Tauri backend: handles JSON file storage and window management

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Get the app data directory for persistent storage
fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    fs::create_dir_all(&dir).ok();
    dir
}

/// Read a JSON file from storage
#[tauri::command]
fn storage_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let path = data_dir(&app).join(format!("{}.json", sanitize_key(&key)));
    if path.exists() {
        fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

/// Write a JSON file to storage
#[tauri::command]
fn storage_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let path = data_dir(&app).join(format!("{}.json", sanitize_key(&key)));
    fs::write(&path, &value).map_err(|e| e.to_string())
}

/// Delete a JSON file from storage
#[tauri::command]
fn storage_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = data_dir(&app).join(format!("{}.json", sanitize_key(&key)));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

/// List all keys in storage
#[tauri::command]
fn storage_list(app: tauri::AppHandle, prefix: Option<String>) -> Result<Vec<String>, String> {
    let dir = data_dir(&app);
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut keys = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.path().file_stem() {
            let key = name.to_string_lossy().to_string();
            if let Some(ref p) = prefix {
                if key.starts_with(p) {
                    keys.push(key);
                }
            } else {
                keys.push(key);
            }
        }
    }
    Ok(keys)
}

/// Sanitize storage keys to prevent path traversal
fn sanitize_key(key: &str) -> String {
    key.replace(['/', '\\', '..', '\0'], "_")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ':')
        .collect()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            storage_get,
            storage_set,
            storage_delete,
            storage_list,
        ])
        .setup(|app| {
            // Set minimum window size and enable resizing
            if let Some(window) = app.get_webview_window("main") {
                window.set_min_size(Some(tauri::LogicalSize::new(800.0, 600.0))).ok();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MAC");
}
