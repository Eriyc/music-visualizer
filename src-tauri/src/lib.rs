use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};

use base64::prelude::*;

use tauri::{Listener, Manager, State};

mod lyrics;
mod spotify;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            lyrics::get_lyrics,
            upload_logo,
            store_string,
            read_string
        ])
        .setup(|app| {
            let path = app.path().app_data_dir().unwrap();
            app.manage(AppConfigState {
                app_dir: path.clone(),
            });

            let mut speaker_name = read_config(&path, "name".to_string()).unwrap();
            if speaker_name.is_none() {
                write_config(
                    &path.join("data.txt"),
                    "name".to_string(),
                    "SPEAKER".to_string(),
                )?;
                speaker_name = Some("SPEAKER".to_string());
            }

            let handler_clone = app.handle().clone();
            app.once("start_listen", move |_event| {
                let handler_clone = handler_clone.to_owned();
                let boxed_handle = Box::new(handler_clone);
                tauri::async_runtime::spawn(async move {
                    spotify::setup(boxed_handle, speaker_name.unwrap().as_str())
                        .await
                        .unwrap();
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(serde::Serialize)]
struct UploadResult {
    success: bool,
    message: String,
    file_path: Option<String>,
}

#[derive(Default)]
struct AppConfigState {
    app_dir: PathBuf, // Store the app's data directory
}
// remember to call `.manage(MyState::default())`
#[tauri::command]
async fn upload_logo(
    state: State<'_, AppConfigState>,
    filename: String,
    file_data: String, // Base64 encoded image data
) -> Result<UploadResult, tauri::Error> {
    let app_dir = &state.app_dir;

    // Create the logo directory if it doesn't exist
    let logo_dir = app_dir.join("logos");
    fs::create_dir_all(&logo_dir).map_err(|e| tauri::Error::Io(e))?;

    // Construct the full file path
    let file_path = logo_dir.join(&filename);

    // Decode the Base64 data
    let decoded_data = BASE64_STANDARD
        .decode(&file_data)
        .map_err(|e| tauri::Error::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, e)))?;

    // Write the file to disk
    let mut file = fs::File::create(&file_path).map_err(|e| tauri::Error::Io(e))?;
    file.write_all(&decoded_data)
        .map_err(|e| tauri::Error::Io(e))?;

    write_config(app_dir, "logo".to_string(), filename)?;

    Ok(UploadResult {
        success: true,
        message: "Logo uploaded successfully".into(),
        file_path: Some(file_path.display().to_string()),
    })
}

#[tauri::command]
async fn store_string(
    state: State<'_, AppConfigState>,
    key: String,
    value: String,
) -> Result<String, tauri::Error> {
    let app_dir = &state.app_dir;
    let data_file_path = app_dir.join("data.txt"); // Use a single file for simplicity

    write_config(&data_file_path, key, value)?;

    Ok("String stored successfully".into())
}

#[tauri::command]
async fn read_string(
    state: State<'_, AppConfigState>,
    key: String,
) -> Result<Option<String>, tauri::Error> {
    let app_dir = &state.app_dir;

    return read_config(app_dir, key);
}

fn write_config(data_file_path: &PathBuf, key: String, value: String) -> Result<(), tauri::Error> {
    let mut existing_data = String::new();
    if data_file_path.exists() {
        let mut file = fs::File::open(&data_file_path).map_err(|e| tauri::Error::Io(e))?;
        file.read_to_string(&mut existing_data)
            .map_err(|e| tauri::Error::Io(e))?;
    }

    // Construct the string to store: key=value\n
    let new_entry = format!("{}={}\n", key, value);

    // Append the new entry to the existing data
    let mut file = fs::File::create(&data_file_path).map_err(|e| tauri::Error::Io(e))?; // Overwrite the file.  Append would be more complex.
    file.write_all(new_entry.as_bytes())
        .map_err(|e| tauri::Error::Io(e))?; // Write new_entry instead of existing_data

    Ok(())
}

fn read_config(app_dir: &PathBuf, key: String) -> Result<Option<String>, tauri::Error> {
    let data_file_path = app_dir.join("data.txt");

    if !data_file_path.exists() {
        return Ok(None); // File doesn't exist, return None
    }

    let mut file = fs::File::open(&data_file_path).map_err(|e| tauri::Error::Io(e))?;
    let mut data = String::new();
    file.read_to_string(&mut data)
        .map_err(|e| tauri::Error::Io(e))?;

    // Search for the key=value pair
    for line in data.lines() {
        if let Some((k, v)) = line.split_once("=") {
            if k == key {
                return Ok(Some(v.to_string()));
            }
        }
    }

    Ok(None) // Key not found
}
