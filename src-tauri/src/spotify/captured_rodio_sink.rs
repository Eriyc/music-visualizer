// In the same file as RodioSink, or a related module

use cpal::traits::HostTrait;
use crossbeam_channel::Sender;
use librespot::playback::{
    audio_backend::{Sink, SinkError, SinkResult},
    config::AudioFormat,
    convert::Converter,
    decoder::AudioPacket,
    NUM_CHANNELS, SAMPLE_RATE,
};
use log::{debug, info};
use rodio::DeviceTrait;
use std::{thread, time::Duration};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RodioError {
    #[error("<RodioSink> No Device Available")]
    NoDeviceAvailable,
    #[error("<RodioSink> device \"{0}\" is Not Available")]
    DeviceNotAvailable(String),
    #[error("<RodioSink> Play Error: {0}")]
    PlayError(#[from] rodio::PlayError),
    #[error("<RodioSink> Stream Error: {0}")]
    StreamError(#[from] rodio::StreamError),
    #[error("<RodioSink> Cannot Get Audio Devices: {0}")]
    DevicesError(#[from] cpal::DevicesError),
}

type CapturedAudioSample = f32;

pub struct CaptureRodioSink {
    pub rodio_sink: rodio::Sink,
    pub format: AudioFormat,
    pub capture_sender: Sender<Vec<CapturedAudioSample>>,
    pub _stream: rodio::OutputStream,
}

impl Sink for CaptureRodioSink {
    fn start(&mut self) -> SinkResult<()> {
        debug!("CaptureRodioSink: Start called");
        self.rodio_sink.play();
        Ok(())
    }

    fn stop(&mut self) -> SinkResult<()> {
        debug!("CaptureRodioSink: Stop called");
        self.rodio_sink.pause();
        Ok(())
    }

    fn write(&mut self, packet: AudioPacket, converter: &mut Converter) -> SinkResult<()> {
        // Get original samples (likely f64)
        let samples = packet
            .samples()
            .map_err(|e| SinkError::OnWrite(format!("CaptureRodioSink Samples Error: {}", e)))?;

        // This logic is copied & adapted from RodioSink::write
        match self.format {
            AudioFormat::F32 => {
                let samples_f32: &[f32] = &converter.f64_to_f32(samples);

                // --- Capture Step (f32) ---
                // Send if the capture format is f32
                if std::any::TypeId::of::<CapturedAudioSample>() == std::any::TypeId::of::<f32>() {
                    // SAFETY: We checked the type ID above.
                    let capture_data = unsafe {
                        std::mem::transmute::<&[f32], &[CapturedAudioSample]>(samples_f32)
                    };
                    match self.capture_sender.try_send(capture_data.to_vec()) {
                        Ok(_) => {} // Sent for capture
                        Err(crossbeam_channel::TrySendError::Full(_)) => {}
                        Err(crossbeam_channel::TrySendError::Disconnected(_)) => {
                            eprintln!("Capture channel disconnected (f32)");
                        }
                    }
                }
                // --- Playback Step (f32) ---
                let source = rodio::buffer::SamplesBuffer::new(
                    NUM_CHANNELS as u16,
                    SAMPLE_RATE,
                    samples_f32,
                );
                self.rodio_sink.append(source);
            }
            AudioFormat::S16 => {
                let samples_s16: &[i16] = &converter.f64_to_s16(samples);

                // --- capture Step i16 ---
                // Send if the capture format is i16
                if std::any::TypeId::of::<CapturedAudioSample>() == std::any::TypeId::of::<i16>() {
                    // SAFETY: ID type checked above.
                    let capture_data = unsafe {
                        std::mem::transmute::<&[i16], &[CapturedAudioSample]>(samples_s16)
                    };
                    match self.capture_sender.try_send(capture_data.to_vec()) {
                        Ok(_) => {} // Sent for capture
                        Err(crossbeam_channel::TrySendError::Full(_)) => {}
                        Err(crossbeam_channel::TrySendError::Disconnected(_)) => {
                            eprintln!("Capture channel disconnected (i16)");
                        }
                    }
                // --- capture step for f32
                } else if std::any::TypeId::of::<CapturedAudioSample>()
                    == std::any::TypeId::of::<f32>()
                {
                    let samples_f32_capture: Vec<f32> = samples_s16
                        .iter()
                        .map(|&s| s as f32 / i16::MAX as f32)
                        .collect();

                    // SAFETY: ID type checked above.
                    let capture_data = unsafe {
                        std::mem::transmute::<Vec<f32>, Vec<CapturedAudioSample>>(
                            samples_f32_capture,
                        )
                    };
                    match self.capture_sender.try_send(capture_data) {
                        Ok(_) => {} // Sent for capture
                        Err(crossbeam_channel::TrySendError::Full(_)) => {}
                        Err(crossbeam_channel::TrySendError::Disconnected(_)) => {
                            eprintln!("Capture channel disconnected (s16->f32)");
                        }
                    }
                }

                // --- Playback Step (s16) ---
                let source = rodio::buffer::SamplesBuffer::new(
                    NUM_CHANNELS as u16,
                    SAMPLE_RATE,
                    samples_s16, // Use the original slice
                );
                self.rodio_sink.append(source);
            }
            _ => {
                return Err(SinkError::InvalidParams(
                    "Unsupported format for CaptureRodioSink".into(),
                ));
            }
        };

        // --- Buffer Management (copied from RodioSink) ---
        while self.rodio_sink.len() > 26 {
            thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    }
}

pub fn create_sink(
    host: &cpal::Host,
    device: Option<String>,
) -> Result<(rodio::Sink, rodio::OutputStream), RodioError> {
    let rodio_device = match device.as_deref() {
        Some(device_name) => {
            host.output_devices()?
                .find(|d| d.name().ok().is_some_and(|name| name == device_name)) // Ignore devices for which getting name fails
                .ok_or_else(|| RodioError::DeviceNotAvailable(device_name.to_string()))?
        }
        None => host
            .default_output_device()
            .ok_or(RodioError::NoDeviceAvailable)?,
    };

    let name = rodio_device.name().ok();
    info!(
        "Using audio device: {}",
        name.as_deref().unwrap_or("[unknown name]")
    );

    let (stream, handle) = rodio::OutputStream::try_from_device(&rodio_device)?;
    let sink = rodio::Sink::try_new(&handle)?;
    Ok((sink, stream))
}
