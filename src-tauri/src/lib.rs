use tauri::Listener;

mod spotify;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            let handler_clone = app.handle().clone();
            #[cfg(dev)]
            let speaker = "SPEAKER-DEV";
            #[cfg(not(dev))]
            let speaker = "SPEAKER";

            app.once("start_listen", move |event| {
                let handler_clone = handler_clone.to_owned();
                let boxed_handle = Box::new(handler_clone);
                tauri::async_runtime::spawn(async move {
                    spotify::setup(boxed_handle, speaker).await.unwrap();
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
