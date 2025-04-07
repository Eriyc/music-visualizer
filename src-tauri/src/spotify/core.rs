use std::{
    future::Future,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use librespot::{
    connect::Spirc,
    core::{cache::Cache, Session},
    discovery::Credentials,
    playback::{audio_backend::Sink, config::AudioFormat, mixer, player::Player},
};
use log::error;
use tauri::AppHandle;
use tokio::task::JoinHandle;

use super::{
    config::SpotifyConfig,
    event_handler,
    setup::{init_capture_channel, mk_capture_rodio_for_fn_ptr},
};

const RECONNECT_RATE_LIMIT_WINDOW: Duration = Duration::from_secs(600);
const RECONNECT_RATE_LIMIT: usize = 5;

const CACHE: &str = ".cache";
const CACHE_FILES: &str = ".cache/files";

pub struct SpotifyCore {
    pub session: Session,
    pub player: Arc<Player>,
    pub discovery: Option<librespot::discovery::Discovery>,

    pub spirc: Option<Spirc>,
    pub spirc_task: Option<Pin<Box<dyn Future<Output = ()> + Send>>>,

    mixer: Arc<dyn mixer::Mixer>,
    pub cache: Cache,

    pub config: SpotifyConfig, // See point 2
    pub connecting: bool,      // e.g., Disconnected, Connecting, Connected
    pub last_credentials: Option<Credentials>,
    pub auto_connect_times: Vec<Instant>,
    player_event_handle: Option<JoinHandle<()>>, // Store handle for cleanup
}

impl SpotifyCore {
    pub async fn new(config: SpotifyConfig, handle: Box<AppHandle>) -> Self {
        let cache = Cache::new(Some(CACHE), Some(CACHE), Some(CACHE_FILES), None)
            .expect("could not create cache");

        if let Err(e) = init_capture_channel(handle.clone()) {
            // Handle error - perhaps log and don't proceed with librespot init
            error!("Failed to initialize capture channel: {}", e);
            panic!("Failed to initialize capture channel: {}", e); // Or handle more gracefully
        }

        let backend_builder: fn(Option<String>, AudioFormat) -> Box<dyn Sink> =
            mk_capture_rodio_for_fn_ptr;

        let mixer_builder = mixer::find(None).unwrap(); // Get the builder
        let mixer_instance = mixer_builder(config.mixer.clone()); // Create Arc'd instance ONCE

        let zeroconf_backend = librespot::discovery::find(None).unwrap();
        let discovery = match librespot::discovery::Discovery::builder(
            config.session.device_id.clone(),
            config.session.client_id.clone(),
        )
        .name(config.device_name.clone())
        .device_type(librespot::core::config::DeviceType::Speaker)
        .port(0)
        .zeroconf_ip(vec![])
        .zeroconf_backend(zeroconf_backend)
        .launch()
        {
            Ok(discovery) => Some(discovery),
            Err(_) => None,
        };

        let session = Session::new(config.session.clone(), Some(cache.clone()));

        let sink_app_handle = handle.clone();
        let sink_callback = event_handler::create_sink_event_callback(sink_app_handle);

        let player = Player::new(
            config.player.clone(),
            session.clone(),
            mixer_instance.get_soft_volume(),
            move || (backend_builder)(None, config.audio_format.clone()),
        );

        player.set_sink_event_callback(Some(sink_callback));
        let player_events = player.get_player_event_channel();
        let event_listener_handle =
            event_handler::spawn_player_event_listener(player_events, handle.clone()); // Clone Box<AppHandle> again

        Self {
            session,
            player,
            discovery,
            mixer: mixer_instance,
            spirc: None,
            spirc_task: None,
            config,
            cache,
            connecting: false,
            last_credentials: None,
            auto_connect_times: vec![],
            player_event_handle: Some(event_listener_handle), // Store the handle
        }
    }

    // Method to attempt connection
    pub async fn handle_discovery_event(&mut self, credentials: Credentials) {
        self.last_credentials = Some(credentials.clone());
        self.auto_connect_times.clear();

        if let Some(spirc) = self.spirc.take() {
            if let Err(e) = spirc.shutdown() {
                println!("[ERROR] error sending spirc shutdown message: {}", e);
            }
        }
        if let Some(spirc_task) = self.spirc_task.take() {
            // Continue shutdown in its own task
            tokio::spawn(spirc_task);
        }
        if !self.session.is_invalid() {
            self.session.shutdown();
        }

        self.connecting = true;
    }

    pub async fn attempt_connection(&mut self /* ... */) -> Result<String, ()> {
        /* ... */
        if self.session.is_invalid() {
            self.session = Session::new(self.config.session.clone(), Some(self.cache.clone()));
            self.player.set_session(self.session.clone());
        }

        let connect_config = self.config.connect.clone();

        let spirc_result = Spirc::new(
            connect_config,
            self.session.clone(),
            self.last_credentials.clone().unwrap_or_default(),
            self.player.clone(),
            self.mixer.clone(),
        )
        .await;

        let (spirc_, spirc_task_) = match spirc_result {
            // Use the result
            Ok((spirc_, spirc_task_)) => (spirc_, spirc_task_),
            Err(e) => {
                println!("[ERROR] could not initialize spirc: {}", e);
                // Consider not exiting immediately during debugging, maybe just log and wait
                // exit(1);
                // Optionally try to reset state and wait for next discovery?
                self.connecting = false;
                self.last_credentials = None; // Clear credentials
                return Err(());
            }
        };

        self.spirc = Some(spirc_);
        self.spirc_task = Some(Box::pin(spirc_task_));
        println!("[INFO] connected to spotify");

        let token = self
            .session
            .token_provider()
            .get_token("user-read-email,user-read-private")
            .await
            .unwrap()
            .access_token;

        self.connecting = false;
        Ok(token)
    }

    // Method to handle spirc task completion
    pub async fn handle_spirc_completion(&mut self) {
        self.spirc_task = None;

        let mut reconnect_exceeds_rate_limit = || {
            self.auto_connect_times
                .retain(|&t| t.elapsed() < RECONNECT_RATE_LIMIT_WINDOW);
            self.auto_connect_times.len() > RECONNECT_RATE_LIMIT
        };

        if self.last_credentials.is_some() && !reconnect_exceeds_rate_limit() {
            self.auto_connect_times.push(Instant::now());
            if !self.session.is_invalid() {
                self.session.shutdown();
            }

            self.connecting = true;
        }
        println!("[INFO] disconnecting from spotify");
    }

    pub async fn shutdown(&mut self) {
        log::info!("Shutting down SpotifyCore...");
        // Abort the event listener task
        if let Some(handle) = self.player_event_handle.take() {
            log::debug!("Aborting player event listener task...");
            handle.abort();
            // Optionally await the handle, but aborting is usually sufficient
            // let _ = handle.await;
        }
        log::info!("SpotifyCore shutdown complete.");
    }

    // ... other methods corresponding to select! branches
}
