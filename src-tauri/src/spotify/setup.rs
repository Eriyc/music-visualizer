// Example in your Tauri main.rs or setup function

use crossbeam_channel::{bounded, Receiver, Sender};
use librespot::playback::{audio_backend::Sink, config::AudioFormat};
use log::{debug, error, info};
use once_cell::sync::OnceCell;
use std::{sync::Mutex, thread};
use tauri::{AppHandle, Emitter};

use crate::spotify::captured_rodio_sink::CaptureRodioSink;

// Assuming your sink creation logic is accessible, e.g.:
// use your_librespot_fork::playback::audio_backend::rodio::mk_capture_rodio;
// use your_librespot_fork::config::AudioFormat;
// use your_librespot_fork::playback::Sink; // The trait

// --- Choose the same format here as in CaptureRodioSink ---
type CapturedAudioSample = f32;

static CAPTURE_SENDER: OnceCell<Mutex<Sender<Vec<CapturedAudioSample>>>> = OnceCell::new();

pub fn init_capture_channel(app_handle: Box<AppHandle>) -> Result<(), String> {
    let (capture_tx, capture_rx): (
        Sender<Vec<CapturedAudioSample>>,
        Receiver<Vec<CapturedAudioSample>>,
    ) = bounded(100);

    // Spawn the emitter thread (consumes capture_rx)
    let emitter_handle = app_handle.clone();
    thread::spawn(move || {
        println!("Capture emitter thread started.");
        while let Ok(audio_chunk) = capture_rx.recv() {
            if let Err(e) = emitter_handle.emit("audio_chunk", audio_chunk) {
                eprintln!("Failed to emit audio_chunk: {}", e);
                // break; // Optional: stop if emit fails
            }
        }
        println!("Capture emitter thread finished.");
    });

    // Try to set the value in the OnceCell
    CAPTURE_SENDER
        .set(Mutex::new(capture_tx))
        .map_err(|_| "Capture channel sender already initialized".to_string())?; // Error if called twice

    println!("Capture channel initialized and sender stored globally.");
    Ok(())
}

pub fn mk_capture_rodio_for_fn_ptr(device: Option<String>, format: AudioFormat) -> Box<dyn Sink> {
    info!(
        "mk_capture_rodio_for_fn_ptr called with format {:?} for device {:?}",
        format, device
    );

    // --- Get the sender from the global static ---
    let sender_mutex = CAPTURE_SENDER
        .get()
        .expect("FATAL: Capture channel sender was not initialized before creating sink.");
    // Clone the sender for this specific sink instance
    let capture_sender = sender_mutex
        .lock()
        .expect("FATAL: Failed to lock capture sender mutex.")
        .clone();
    // ---

    // --- Perform sink creation logic (similar to previous mk_capture_rodio) ---
    let host = cpal::default_host(); // Or get host based on features like before

    // Check format support
    if format != AudioFormat::S16 && format != AudioFormat::F32 {
        // Panic because the function signature doesn't allow returning Result
        panic!(
            "CaptureRodioSink (via fn ptr) currently only supports F32 and S16 formats, got {:?}",
            format
        );
    }

    // Create the underlying rodio sink and stream
    // Use unwrap or expect because we can't return Result here
    let (rodio_sink, stream) = super::captured_rodio_sink::create_sink(&host, device)
        .map_err(|e| {
            // Log the error before panicking
            error!(
                "Failed to create underlying sink in mk_capture_rodio_for_fn_ptr: {}",
                e
            );
            e // Keep the error type for the panic message
        })
        .expect("FATAL: Failed to create underlying rodio sink/stream.");

    debug!("CaptureRodioSink (via fn ptr) underlying components created");

    // Create the wrapper sink instance
    let capture_sink = CaptureRodioSink {
        rodio_sink,
        format,
        capture_sender, // Use the cloned sender
        _stream: stream,
    };

    Box::new(capture_sink) // Return the boxed sink
}
