use log::info;
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSuccessResponse {
    pub id: u32,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration: f32,
    pub instrumental: bool,
    pub plain_lyrics: String,
    pub synced_lyrics: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsErrorResponse {
    pub status_code: u16,
    pub message: String,
    pub name: String,
}

#[tauri::command]
pub async fn get_lyrics(
    artist: String,
    track: String,
    album: String,
    duration: String,
) -> Result<LyricsSuccessResponse, LyricsErrorResponse> {
    let url = format!(
        "https://lrclib.net/api/get?artist_name={}&track_name={}&album_name={}&duration={}",
        artist, track, album, duration
    );

    let client = reqwest::Client::new();
    let request = client
        .request(Method::GET, url.replace(" ", "+").to_string())
        .header(
            "User-Agent",
            "Music-visualizer 0.1.0 (https://github.com/Eriyc/music-visualizer)",
        );
    let response = request.send().await.expect("Could not send request");

    let text = response.text().await.expect("Could not get text");
    info!("Received response: {}", text);

    // Attempt to deserialize as LyricsSuccessResponse first
    if let Ok(success) = serde_json::from_str::<LyricsSuccessResponse>(&text) {
        return Ok(success);
    }

    // If that fails, attempt to deserialize as LyricsErrorResponse
    if let Ok(error) = serde_json::from_str::<LyricsErrorResponse>(&text) {
        return Err(error);
    }

    // If both fail, return a default error or handle the failure as needed
    Err(LyricsErrorResponse {
        status_code: 500,
        message: "Failed to deserialize response".to_string(),
        name: "DeserializationError".to_string(),
    })
}
