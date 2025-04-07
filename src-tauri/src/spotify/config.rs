use data_encoding::HEXLOWER;
use librespot::{
    connect::ConnectConfig,
    core::SessionConfig,
    playback::{
        config::{AudioFormat, PlayerConfig},
        mixer::MixerConfig,
    },
};
use sha1::{Digest, Sha1};

pub struct SpotifyConfig {
    pub device_name: String,

    pub player: PlayerConfig,
    pub audio_format: AudioFormat,
    pub session: SessionConfig,
    pub connect: ConnectConfig,
    pub mixer: MixerConfig,
}

fn device_id(name: &str) -> String {
    HEXLOWER.encode(&Sha1::digest(name.as_bytes()))
}

impl SpotifyConfig {
    pub fn new(display_name: &str) -> Self {
        let device_id = device_id(display_name);

        Self {
            device_name: display_name.to_string(),
            player: PlayerConfig::default(),
            audio_format: AudioFormat::S16,
            session: SessionConfig {
                ap_port: None,
                device_id,
                autoplay: Some(true),
                proxy: None,
                client_id: SessionConfig::default().client_id,
                tmp_dir: SessionConfig::default().tmp_dir,
            },
            connect: ConnectConfig {
                name: display_name.to_string(),
                device_type: librespot::core::config::DeviceType::Speaker,
                disable_volume: false,
                is_group: false,
                ..ConnectConfig::default()
            },
            mixer: MixerConfig::default(),
        }
    }
}
