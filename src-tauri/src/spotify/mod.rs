use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

mod config;
mod core;
mod event_handler;
mod captured_rodio_sink;
mod setup;

pub async fn setup(
    handle: Box<AppHandle>,
    display_name: &str,
) -> Result<(), Box<(dyn std::error::Error + Send + Sync)>> {
    let config = config::SpotifyConfig::new(display_name);
    let mut spotify = core::SpotifyCore::new(config, handle.clone()).await;

    loop {
        tokio::select! {
            credentials = async {
                match spotify.discovery.as_mut() {
                    Some(d) => d.next().await,
                    _ => None
                }
            }, if spotify.discovery.is_some() => {
                match credentials {
                    Some(credentials) => {
                        spotify.handle_discovery_event(credentials).await;
                    },
                    None => {
                        println!("[ERROR] Discovery stopped unexpectedly");
                    }
                }
            },
            _ = async {}, if spotify.connecting && spotify.last_credentials.is_some() => {
                match spotify.attempt_connection().await {
                    Ok(auth_token) => {
                        handle.emit("spotify_new_connection", auth_token)?;
                    },
                    Err(_) => {
                        println!("[ERROR] Spotify connection attempt failed");
                        continue; // Skip rest of this branch and loop back in select!
                    }
                }
            },
            _ = async {
                if let Some(task) = spotify.spirc_task.as_mut() {
                    println!("awaiting spirc_task");
                    task.await;
                }
            }, if spotify.spirc_task.is_some() && !spotify.connecting => {
                spotify.handle_spirc_completion().await;
            },
            _ = async {}, if spotify.player.is_invalid() => {
                println!("[ERROR] Player shut down unexpectedly");
            },
            _ = tokio::signal::ctrl_c() => {
                break;
            },
            else => break,
        };
    }

    spotify.shutdown().await;

    let mut shutdown_tasks = tokio::task::JoinSet::new();

    if let Some(spirc) = spotify.spirc {
        if let Err(e) = spirc.shutdown() {
            println!("[ERROR] error sending spirc shutdown message: {}", e);
        }

        if let Some(spirc_task) = spotify.spirc_task {
            shutdown_tasks.spawn(spirc_task);
        }
    }

    if let Some(discovery) = spotify.discovery {
        shutdown_tasks.spawn(discovery.shutdown());
    }

    tokio::select! {
        _ = tokio::signal::ctrl_c() => (),
        _ = shutdown_tasks.join_all() => (),
    }

    Ok(())
}
