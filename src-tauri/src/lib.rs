use std::{
    collections::HashMap,
    fs,
    io::{BufWriter, Read, Write},
    path::PathBuf,
};

use base64::prelude::*;

use log::info;
use tauri::{AppHandle, Listener, Manager, State};
use tauri_plugin_updater::UpdaterExt;

mod lyrics;
mod spotify;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            lyrics::get_lyrics,
            upload_logo,
            store_string,
            read_string
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                update(handle.clone()).await.unwrap();
            });

            let path = app.path().app_data_dir().unwrap();
            ensure_app_directories_exist(&path).expect("Failed to ensure app directories exist");
            info!("app_data path: {}", &path.display());
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
            let speaker_name = speaker_name.unwrap();

            let handler_clone = app.handle().clone();
            app.once("start_listen", move |_event| {
                let handler_clone = handler_clone.to_owned();
                let boxed_handle = Box::new(handler_clone);
                info!("Starting Spotify setup as speaker: {}", speaker_name);
                tauri::async_runtime::spawn(async move {
                    spotify::setup(boxed_handle, speaker_name.as_str())
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

    let data_file_path = app_dir.join("data.txt"); // Use a single file for simplicity
    write_config(&data_file_path, "logo".to_string(), filename)?;

    Ok(UploadResult {
        success: true,
        message: "Logo uploaded successfully".into(),
        file_path: Some(file_path.display().to_string()),
    })
}

#[tauri::command]
async fn store_string(
    handle: AppHandle,
    state: State<'_, AppConfigState>,
    key: String,
    value: String,
) -> Result<String, tauri::Error> {
    let app_dir = &state.app_dir;
    let data_file_path = app_dir.join("data.txt"); // Use a single file for simplicity

    write_config(&data_file_path, key, value)?;

    handle.restart();
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
    // Read existing data into a HashMap
    let mut data: HashMap<String, String> = HashMap::new();

    if data_file_path.exists() {
        let mut file = fs::File::open(&data_file_path).map_err(|e| tauri::Error::Io(e))?;
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| tauri::Error::Io(e))?;

        for line in content.lines() {
            if let Some((k, v)) = line.split_once("=") {
                data.insert(k.to_string(), v.to_string());
            }
        }
    }

    // Update the value for the given key
    data.insert(key, value);

    // Write the updated data back to the file
    let mut file = fs::File::create(&data_file_path).map_err(|e| tauri::Error::Io(e))?;
    let mut writer = BufWriter::new(file);

    for (k, v) in data.iter() {
        let line = format!("{}={}\n", k, v);
        writer
            .write_all(line.as_bytes())
            .map_err(|e| tauri::Error::Io(e))?;
    }

    writer.flush().map_err(|e| tauri::Error::Io(e))?;

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

pub fn ensure_app_directories_exist(app_data_dir: &PathBuf) -> Result<(), String> {
    let logos_dir = app_data_dir.join("logos");
    let data_file_path = app_data_dir.join("data.txt");

    // Ensure app directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app directory: {}", e))?;
        println!("Created app directory: {:?}", app_data_dir);
    }

    // Ensure logos directory exists
    if !logos_dir.exists() {
        fs::create_dir_all(&logos_dir)
            .map_err(|e| format!("Failed to create logos directory: {}", e))?;
        println!("Created logos directory: {:?}", logos_dir);
    }

    // Ensure data.json file exists (create an empty one if it doesn't)
    if !data_file_path.exists() {
        fs::File::create(&data_file_path)
            .map_err(|e| format!("Failed to create data.json: {}", e))?;
        println!("Created data.json: {:?}", data_file_path);
    }

    Ok(())
}

async fn update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        let mut downloaded = 0;

        // alternatively we could also call update.download() and update.install() separately
        update
            .download_and_install(
                |chunk_length, content_length| {
                    downloaded += chunk_length;
                    println!("downloaded {downloaded} from {content_length:?}");
                },
                || {
                    println!("download finished");
                },
            )
            .await?;

        println!("update installed");
        app.restart();
    }

    Ok(())
}
