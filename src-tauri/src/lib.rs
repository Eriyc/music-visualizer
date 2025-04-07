use tauri::Listener;

mod lyrics;
mod spotify;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![lyrics::get_lyrics])
        .setup(|app| {
            let handler_clone = app.handle().clone();
            #[cfg(dev)]
            let speaker = "SPEAKER-DEV";
            #[cfg(not(dev))]
            let speaker = "SPEAKER";

            app.once("start_listen", move |_event| {
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