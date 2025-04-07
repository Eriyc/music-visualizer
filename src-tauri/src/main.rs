// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rustls::crypto::ring;

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // fix rustls CryptoProvider not being set at runtime
    ring::default_provider()
        .install_default()
        .expect("Could not set default provider");

    tauri::async_runtime::set(tokio::runtime::Handle::current());
    desktop_app_lib::run()
}
