# Music Visualizer

An cross-platform desktop app that connects creates a Spotify Connect instance and displays lyrics and an audio visualizer.

![The app in question](/assets/visualizer.png)

## Features

- Spotify Connect, no authentication required (only a Premium account)
- Lyrics for the currently playing track, provided by [lrclib.net](https://lrclib.net/)
- Audio visualizer powered by [Butterchurn](https://butterchurnviz.com/)
- Customizable speaker name

## Installation

Download the latest release from the [releases page](https://github.com/Eriyc/music-visualizer/releases/latest).

> [!IMPORTANT]
> The app needs to have access to your AppData folder.

```sh
sudo dpkg -i "file_name.deb"
```

Alternatively, build it for yourself by running the following commands:

```bash
git clone https://github.com/Eriyc/music-visualizer.git
cd music-visualizer
pnpm install
pnpm tauri build
```

## Usage

1. Open the app. Configure the speaker name and optionally an image to display.
2. Connect to the instance in Spotify.
3. Play music!
