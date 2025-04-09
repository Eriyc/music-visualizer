use log::info;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use urlencoding::encode;

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
    let artist_encoded = encode(artist.as_str());
    let track_encoded = encode(track.as_str());
    let album_encoded = encode(album.as_str());

    let query = format!(
        "artist_name={}&track_name={}&album_name={}&duration={}",
        artist_encoded, track_encoded, album_encoded, duration
    );

    let url = format!("https://lrclib.net/api/get?{}", query);

    let client = reqwest::Client::new();
    let request = client
        .request(Method::GET, url.replace(" ", "+").to_string())
        .header(
            "User-Agent",
            "Music-visualizer 0.1.1 (https://github.com/Eriyc/music-visualizer)",
        );
    let response = request.send().await.expect("Could not send request");

    let text = response.text().await.expect("Could not get text");
    info!("Received response: {}", text);

    if let Ok(success) = serde_json::from_str::<LyricsSuccessResponse>(&text) {
        return Ok(success);
    }

    if let Ok(error) = serde_json::from_str::<LyricsErrorResponse>(&text) {
        return Err(error);
    }

    Err(LyricsErrorResponse {
        status_code: 500,
        message: "Failed to deserialize response".to_string(),
        name: "DeserializationError".to_string(),
    })
}
