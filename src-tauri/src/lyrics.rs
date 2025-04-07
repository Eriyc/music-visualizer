use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSuccessResponse {
    pub id: u16,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration: u16,
    pub instrumental: bool,
    pub plain_lyrics: String,
    pub synced_lyrics: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsErrorResponse {
    pub code: u16,
    pub message: String,
    pub name: String,
}

#[tauri::command]
pub async fn get_lyrics(
    artist: String,
    track: String,
    album: String,
    duration: u16,
) -> Result<LyricsSuccessResponse, LyricsErrorResponse> {
    let url = format!(
        "https://lrclib.net/api/get?artist_name={}&track_name={}&album_name={}&duration={}",
        artist, track, album, duration
    );
    let encoded_url = urlencoding::encode(&url);
    let client = reqwest::Client::new();
    let request = client
        .request(Method::GET, encoded_url.to_string())
        .header("User-Agent", "Lyrics-rs");
    let response = request.send().await.unwrap();

    let text = response.text().await.unwrap();

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
        code: 500,
        message: "Failed to deserialize response".to_string(),
        name: "DeserializationError".to_string(),
    })
}
