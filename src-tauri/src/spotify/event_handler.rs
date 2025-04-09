use log::{error, warn};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

use librespot::{
    metadata::audio::UniqueFields,
    playback::player::{PlayerEvent, PlayerEventChannel, SinkStatus},
};

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SpotifyPlayerEventPayload {
    PlayRequestIdChanged {
        play_request_id: u64,
    },
    TrackChanged {
        #[serde(flatten)]
        item: SerializableAudioItem,
    },
    Stopped {
        track_id: String,
    },
    Playing {
        track_id: String,
        position_ms: u32,
    },
    Paused {
        track_id: String,
        position_ms: u32,
    },
    Loading {
        track_id: String,
    },
    Preloading {
        track_id: String,
    },
    EndOfTrack {
        track_id: String,
    },
    Seeked {
        track_id: String,
        position_ms: u32,
    },
    Unavailable {
        track_id: String,
    },
    VolumeChanged {
        #[serde(with = "serde_volume")]
        volume: u16, // volume 0-65535
    },
    ShuffleChanged {
        shuffle: bool,
    },
    RepeatChanged {
        repeat: String, // Context, Track, Off
    },
    AutoPlayChanged {
        auto_play: bool,
    },
    FilterExplicitContentChanged {
        filter: bool,
    },
    SessionDisconnected,
}

#[derive(Serialize, Clone)]
struct SerializableAudioItem {
    track_id: String,
    uri: String,
    name: String,
    duration_ms: u32,
    is_explicit: bool,
    covers: Vec<String>, // Just URLs
    language: Vec<String>,
    #[serde(flatten)] // Flatten unique fields
    unique_fields: SerializableUniqueFields,
}

#[derive(Serialize, Clone)]
#[serde(tag = "item_type", rename_all = "snake_case")]
enum SerializableUniqueFields {
    Track {
        artists: Vec<String>,
        album: String,
        album_artists: Vec<String>,
        popularity: u8,
        number: u32,
        disc_number: u32,
    },
    Episode {
        description: String,
        publish_time_unix: i64,
        show_name: String,
    },
}

mod serde_volume {
    use serde::{self, Serializer};
    pub fn serialize<S>(volume: &u16, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u16(*volume)
    }
}

const TAURI_PLAYER_EVENT: &str = "spotify_player_event";

pub fn spawn_player_event_listener(
    mut player_events: PlayerEventChannel,
    app_handle: Box<AppHandle>,
) -> JoinHandle<()> {
    tokio::task::spawn_blocking(move || {
        log::info!("Spotify PlayerEvent listener thread started.");
        loop {
            match player_events.blocking_recv() {
                None => {
                    log::info!("PlayerEventChannel closed. Exiting listener thread.");
                    break; // Channel closed
                }
                Some(event) => {
                    log::trace!("Received PlayerEvent: {:?}", event);
                    let potential_payload = map_player_event_to_payload(event);

                    if let Some(payload) = potential_payload {
                        if let Err(e) = app_handle.emit(TAURI_PLAYER_EVENT, payload) {
                            error!("Failed to emit Tauri player event: {}", e);
                        }
                    }
                }
            }
        }
        log::info!("Spotify PlayerEvent listener thread finished.");
    })
}

fn map_player_event_to_payload(event: PlayerEvent) -> Option<SpotifyPlayerEventPayload> {
    match event {
        PlayerEvent::TrackChanged { audio_item } => match audio_item.track_id.to_base62() {
            Ok(id) => Some(SpotifyPlayerEventPayload::TrackChanged {
                item: SerializableAudioItem {
                    track_id: id,
                    uri: audio_item.uri,
                    name: audio_item.name,
                    duration_ms: audio_item.duration_ms,
                    is_explicit: audio_item.is_explicit,
                    covers: audio_item.covers.into_iter().map(|c| c.url).collect(),
                    language: audio_item.language,
                    unique_fields: match audio_item.unique_fields {
                        UniqueFields::Track {
                            artists,
                            album,
                            album_artists,
                            popularity,
                            number,
                            disc_number,
                        } => SerializableUniqueFields::Track {
                            artists: artists.0.into_iter().map(|a| a.name).collect(),
                            album,
                            album_artists,
                            popularity,
                            number,
                            disc_number,
                        },
                        UniqueFields::Episode {
                            description,
                            publish_time,
                            show_name,
                        } => SerializableUniqueFields::Episode {
                            description,
                            publish_time_unix: publish_time.unix_timestamp(),
                            show_name,
                        },
                    },
                },
            }),
            Err(e) => {
                warn!("Invalid track ID on TrackChanged: {}", e);
                None
            }
        },
        PlayerEvent::Stopped { track_id, .. } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Stopped { track_id: id }),
        PlayerEvent::Playing {
            track_id,
            position_ms,
            ..
        } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Playing {
                track_id: id,
                position_ms,
            }),
        PlayerEvent::Paused {
            track_id,
            position_ms,
            ..
        } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Paused {
                track_id: id,
                position_ms,
            }),
        PlayerEvent::Loading { track_id, .. } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Loading { track_id: id }),
        PlayerEvent::Preloading { track_id, .. } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Preloading { track_id: id }),
        PlayerEvent::EndOfTrack { track_id, .. } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::EndOfTrack { track_id: id }),
        PlayerEvent::Seeked {
            track_id,
            position_ms,
            ..
        } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Seeked {
                track_id: id,
                position_ms,
            }),
        PlayerEvent::Unavailable { track_id, .. } => track_id
            .to_base62()
            .ok()
            .map(|id| SpotifyPlayerEventPayload::Unavailable { track_id: id }),
        PlayerEvent::VolumeChanged { volume } => {
            Some(SpotifyPlayerEventPayload::VolumeChanged { volume })
        }
        PlayerEvent::ShuffleChanged { shuffle } => {
            Some(SpotifyPlayerEventPayload::ShuffleChanged { shuffle })
        }
        PlayerEvent::RepeatChanged { context, track } => {
            let repeat_state = match (context, track) {
                (true, _) => "context".to_string(),
                (false, true) => "track".to_string(),
                (false, false) => "off".to_string(),
            };
            Some(SpotifyPlayerEventPayload::RepeatChanged {
                repeat: repeat_state,
            })
        }
        PlayerEvent::AutoPlayChanged { auto_play } => {
            Some(SpotifyPlayerEventPayload::AutoPlayChanged { auto_play })
        }
        PlayerEvent::FilterExplicitContentChanged { filter } => {
            Some(SpotifyPlayerEventPayload::FilterExplicitContentChanged { filter })
        }
        PlayerEvent::PlayRequestIdChanged { play_request_id } => {
            Some(SpotifyPlayerEventPayload::PlayRequestIdChanged { play_request_id })
        }

        PlayerEvent::SessionDisconnected { .. } => {
            Some(SpotifyPlayerEventPayload::SessionDisconnected)
        }

        _ => None,
    }
}

const TAURI_SINK_EVENT: &str = "spotify_sink_event";

#[derive(Serialize, Clone)]
struct SinkEventPayload {
    status: String, // "running", "temporarily_closed", "closed"
}

pub fn create_sink_event_callback(
    app_handle: Box<AppHandle>,
) -> Box<dyn Fn(SinkStatus) + Send + Sync> {
    Box::new(move |sink_status| {
        let status_str = match sink_status {
            SinkStatus::Running => "running",
            SinkStatus::TemporarilyClosed => "temporarily_closed",
            SinkStatus::Closed => "closed",
        }
        .to_string();

        let payload = SinkEventPayload { status: status_str };

        if let Err(e) = app_handle.emit(TAURI_SINK_EVENT, payload) {
            error!("Failed to emit Tauri sink event: {}", e);
        }
    })
}
