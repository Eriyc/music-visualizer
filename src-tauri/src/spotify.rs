use std::{
    pin::Pin,
    process::exit,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use librespot::{
    connect::{ConnectConfig, LoadRequestOptions, Spirc},
    core::{cache::Cache, config::SessionConfig, session::Session},
    playback::{
        audio_backend,
        config::{AudioFormat, PlayerConfig},
        mixer::{self, MixerConfig},
        player::Player,
    },
};

use data_encoding::HEXLOWER;
use futures_util::StreamExt;
use sha1::{Digest, Sha1};
use tauri::{AppHandle, Emitter};
use tokio::time::Instant;

const CACHE: &str = ".cache";
const CACHE_FILES: &str = ".cache/files";

static SETUP_HAS_RUN: AtomicBool = AtomicBool::new(false);

fn device_id(name: &str) -> String {
    HEXLOWER.encode(&Sha1::digest(name.as_bytes()))
}

const RECONNECT_RATE_LIMIT_WINDOW: Duration = Duration::from_secs(600);
// const DISCOVERY_RETRY_TIMEOUT: Duration = Duration::from_secs(10);
const RECONNECT_RATE_LIMIT: usize = 5;

pub async fn setup(
    handle: Box<AppHandle>,
    device_name: &str,
) -> Result<(), Box<(dyn std::error::Error + Send + Sync)>> {
    if SETUP_HAS_RUN
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        println!(
            "[WARNING] setup function called again, but core logic already running/ran. Skipping."
        );
        return Ok(()); // Or handle as appropriate, maybe return an error
    }
    println!(
        "[ENTRY] Starting setup function with device_name: '{}'",
        device_name
    ); // <-- Add this

    let app_handle = handle.clone();

    let device_id = device_id(device_name);
    let device_name = device_name.to_string();

    let mut last_credentials = None;
    let mut spirc: Option<Spirc> = None;
    let mut spirc_task: Option<Pin<_>> = None;
    let mut auto_connect_times: Vec<Instant> = vec![];
    let mut connecting = false;
    // let mut _event_handler: Option<EventHandler> = None;

    let player_config = PlayerConfig::default();
    let audio_format = AudioFormat::default();
    let session_config = SessionConfig {
        device_id: device_id.clone(),
        ..SessionConfig::default()
    };
    let connect_config = ConnectConfig {
        name: device_name.to_string(),
        ..ConnectConfig::default()
    };
    let mixer_config = MixerConfig::default();

    let backend = audio_backend::find(None).unwrap();
    let mixer_builder = mixer::find(None).unwrap();

    let cache = Cache::new(Some(CACHE), Some(CACHE), Some(CACHE_FILES), None)?;
    let mixer = mixer_builder(mixer_config.clone());

    let client_id = session_config.client_id.clone();

    let zeroconf_port: u16 = 0;
    let zeroconf_backend = librespot::discovery::find(Some("dns-sd")).unwrap();

    let local_ip_addr_str = "192.168.0.100"; // <-- REPLACE with your actual IP

    // Parse the IP address
    let local_ip: std::net::IpAddr = local_ip_addr_str
        .parse()
        .expect("Invalid IP address format");

    let mut discovery = match librespot::discovery::Discovery::builder(device_id, client_id)
        .name(device_name.clone())
        .device_type(librespot::core::config::DeviceType::Speaker)
        .port(zeroconf_port)
        .zeroconf_ip(vec![local_ip])
        .zeroconf_backend(zeroconf_backend)
        .launch()
    {
        Ok(discovery) => Some(discovery),
        Err(e) => {
            app_handle.emit("info", e.to_string())?;
            None
        }
    };

    let mut session = Session::new(session_config.clone(), Some(cache.clone()));

    let soft_volume = mixer.get_soft_volume();
    let player = Player::new(player_config, session.clone(), soft_volume, move || {
        (backend)(None, audio_format)
    });

    let _ = app_handle.emit("info", "spotify is started");

    loop {
        tokio::select! {
            credentials = async {
                match discovery.as_mut() {
                    Some(d) => d.next().await,
                    _ => None
                }
            }, if discovery.is_some() => {
                match credentials {
                    Some(credentials) => {
                        last_credentials = Some(credentials.clone());
                        auto_connect_times.clear();

                        if let Some(spirc) = spirc.take() {
                            if let Err(e) = spirc.shutdown() {
                                println!("[ERROR] error sending spirc shutdown message: {}", e);
                            }
                        }
                        if let Some(spirc_task) = spirc_task.take() {
                            // Continue shutdown in its own task
                            tokio::spawn(spirc_task);
                        }
                        if !session.is_invalid() {
                            session.shutdown();
                        }

                        connecting = true;
                    },
                    None => {
                        println!("[ERROR] Discovery stopped unexpectedly");
                        exit(1);
                    }
                }
            },
            _ = async {}, if connecting && last_credentials.is_some() => {
                if session.is_invalid() {
                    session = Session::new(session_config.clone(), None);
                    player.set_session(session.clone());
                }

                let connect_config = connect_config.clone();

                let spirc_result = Spirc::new(connect_config,
                    session.clone(),
                    last_credentials.clone().unwrap_or_default(),
                    player.clone(),
                    mixer.clone()).await;

                println!("[DEBUG] Spirc::new result: {:?}", spirc_result.is_ok()); // Log after call

                let (spirc_, spirc_task_) = match spirc_result { // Use the result
                    Ok((spirc_, spirc_task_)) => (spirc_, spirc_task_),
                    Err(e) => {
                        println!("[ERROR] could not initialize spirc: {}", e);
                        // Consider not exiting immediately during debugging, maybe just log and wait
                        // exit(1);
                        // Optionally try to reset state and wait for next discovery?
                        connecting = false; // Reset connecting flag
                        last_credentials = None; // Clear credentials
                        continue; // Skip rest of this branch and loop back in select!
                    }
                };
                spirc = Some(spirc_);
                spirc_task = Some(Box::pin(spirc_task_));
                println!("[DEBUG] Spirc initialized and task stored."); // Log success

                handle.emit("spotify_new_connection", session.clone().token_provider().get_token("user-read-email,user-read-private").await.unwrap().access_token)?;

                connecting = false;
            },
            _ = async {
                println!("[DEBUG] Awaiting spirc_task..."); // Log before await

                if let Some(task) = spirc_task.as_mut() {
                    task.await;
                    println!("[DEBUG] spirc_task completed normally.");
                } else {
                    println!("[DEBUG] Awaiting spirc_task branch entered, but task was None."); // Should not happen if guard is correct
                }
            }, if spirc_task.is_some() && !connecting => {
                spirc_task = None;

                println!("[WARNING] Spirc shut down unexpectedly");

                let mut reconnect_exceeds_rate_limit = || {
                    auto_connect_times.retain(|&t| t.elapsed() < RECONNECT_RATE_LIMIT_WINDOW);
                    auto_connect_times.len() > RECONNECT_RATE_LIMIT
                };

                if last_credentials.is_some() && !reconnect_exceeds_rate_limit() {
                    auto_connect_times.push(Instant::now());
                    if !session.is_invalid() {
                        session.shutdown();
                    }
                    connecting = true;
                } else {
                    println!("[ERROR] Spirc shut down too often. Not reconnecting automatically.");
                    exit(1);
                }
            },
            _ = async {}, if player.is_invalid() => {
                println!("[ERROR] Player shut down unexpectedly");
                exit(1);
            },
            _ = tokio::signal::ctrl_c() => {
                break;
            },
            else => break,
        }
    }

    let mut shutdown_tasks = tokio::task::JoinSet::new();

    if let Some(spirc) = spirc {
        if let Err(e) = spirc.shutdown() {
            println!("[ERROR] error sending spirc shutdown message: {}", e);
        }

        if let Some(spirc_task) = spirc_task {
            shutdown_tasks.spawn(spirc_task);
        }
    }

    if let Some(discovery) = discovery {
        shutdown_tasks.spawn(discovery.shutdown());
    }

    tokio::select! {
        _ = tokio::signal::ctrl_c() => (),
        _ = shutdown_tasks.join_all() => (),
    }

    Ok(())
}
