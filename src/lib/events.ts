export interface BasePayload {
  type: string;
}

export interface PlayRequestIdChangedPayload extends BasePayload {
  type: "play_request_id_changed";
  play_request_id: number;
}

export interface SerializableUniqueFieldsTrack {
  item_type: "track";
  artists: string[];
  album: string;
  album_artists: string[];
  popularity: number;
  number: number;
  disc_number: number;
}

export interface SerializableUniqueFieldsEpisode {
  item_type: "episode";
  description: string;
  publish_time_unix: number;
  show_name: string;
}

export type SerializableUniqueFields =
  | SerializableUniqueFieldsTrack
  | SerializableUniqueFieldsEpisode;

export interface SerializableAudioItem {
  track_id: string;
  uri: string;
  name: string;
  duration_ms: number;
  is_explicit: boolean;
  covers: string[];
  language: string[];

  item_type: "track" | "episode";
  artists?: string[];
  album?: string;
  album_artists?: string[];
  popularity?: number;
  number?: number;
  disc_number?: number;
  description?: string;
  publish_time_unix?: number;
  show_name?: string;
}

export interface TrackChangedPayload extends BasePayload {
  type: "track_changed";
  track_id: string;
  uri: string;
  name: string;
  duration_ms: number;
  is_explicit: boolean;
  covers: string[];
  language: string[];
  item_type: "track" | "episode";
  artists?: string[];
  album?: string;
  album_artists?: string[];
  popularity?: number;
  number?: number;
  disc_number?: number;
  description?: string;
  publish_time_unix?: number;
  show_name?: string;
}

export interface StoppedPayload extends BasePayload {
  type: "stopped";
  track_id: string;
}

export interface PlayingPayload extends BasePayload {
  type: "playing";
  track_id: string;
  position_ms: number;
}

export interface PausedPayload extends BasePayload {
  type: "paused";
  track_id: string;
  position_ms: number;
}

export interface LoadingPayload extends BasePayload {
  type: "loading";
  track_id: string;
}

export interface PreloadingPayload extends BasePayload {
  type: "preloading";
  track_id: string;
}

export interface EndOfTrackPayload extends BasePayload {
  type: "end_of_track";
  track_id: string;
}

export interface SeekedPayload extends BasePayload {
  type: "seeked";
  track_id: string;
  position_ms: number;
}

export interface UnavailablePayload extends BasePayload {
  type: "unavailable";
  track_id: string;
}

export interface VolumeChangedPayload extends BasePayload {
  type: "volume_changed";
  volume: number;
}

export interface ShuffleChangedPayload extends BasePayload {
  type: "shuffle_changed";
  shuffle: boolean;
}

export interface RepeatChangedPayload extends BasePayload {
  type: "repeat_changed";
  repeat: "context" | "track" | "off";
}

export interface AutoPlayChangedPayload extends BasePayload {
  type: "auto_play_changed";
  auto_play: boolean;
}

export interface FilterExplicitContentChangedPayload extends BasePayload {
  type: "filter_explicit_content_changed";
  filter: boolean;
}

export interface SessionDisconnectedPayload extends BasePayload {
  type: "session_disconnected";
}

export type SpotifyPlayerEventPayload =
  | PlayRequestIdChangedPayload
  | TrackChangedPayload
  | PlayingPayload
  | PausedPayload
  | VolumeChangedPayload
  | ShuffleChangedPayload
  | RepeatChangedPayload
  | AutoPlayChangedPayload
  | FilterExplicitContentChangedPayload
  | PlayRequestIdChangedPayload
  | TrackChangedPayload
  | StoppedPayload
  | PlayingPayload
  | PausedPayload
  | LoadingPayload
  | PreloadingPayload
  | EndOfTrackPayload
  | SeekedPayload
  | SessionDisconnectedPayload
  | UnavailablePayload;

export interface PlayerState {
  playRequestId?: number;
  currentItem?: SerializableAudioItem;
  playbackState:
    | "stopped"
    | "playing"
    | "paused"
    | "loading"
    | "preloading"
    | "unavailable"
    | "ended";
  positionMs: number;
  volume: number;
  shuffle: boolean;
  repeat: "context" | "track" | "off";
  autoPlay: boolean;
  filterExplicitContent: boolean;
  currentTrackId?: string;
}

export type PlayerAction = SpotifyPlayerEventPayload;
