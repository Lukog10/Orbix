# Wallpaper Carousel Fit, Custom Framing, Slideshow & Folder Management Specification

## 1. Overview
This specification details the next evolution of the Orbix Wallpaper Carousel. It addresses three core user needs:
1. **Fit Modes & Custom Positioning**: Supporting standard Windows placement styles (Fill, Fit, Stretch, Center, Span) and introducing an interactive **Custom Framing Tool** so users with mismatched image resolutions (e.g., mobile wallpapers on widescreen desktop monitors) can visually select and crop the exact region they want.
2. **Background Slideshow & Auto-Cycle**: A lightweight, zero-CPU background service in Rust that automatically rotates wallpapers at user-defined intervals (1m to 24h) with sequential or shuffle ordering, controllable via a single header toggle and configured in Settings.
3. **Folder Management & Presets**: Instant switching between system presets (Windows Default Wallpapers, Pictures, Wallpapers) and recently visited custom folders directly from a header dropdown, eliminating repetitive file picker dialogs.

---

## 2. Architecture & Components

### 2.1 Native Wallpaper Fit Modes (`src-tauri/src/wallpaper.rs`)
Windows manages desktop wallpaper placement through two registry values under `HKCU\Control Panel\Desktop`:
- `WallpaperStyle` (REG_SZ)
- `TileWallpaper` (REG_SZ)

The modes map as follows:
- **Fill**: `WallpaperStyle = "10"`, `TileWallpaper = "0"`
- **Fit**: `WallpaperStyle = "6"`, `TileWallpaper = "0"`
- **Stretch**: `WallpaperStyle = "2"`, `TileWallpaper = "0"`
- **Tile**: `WallpaperStyle = "0"`, `TileWallpaper = "1"`
- **Center**: `WallpaperStyle = "0"`, `TileWallpaper = "0"`
- **Span**: `WallpaperStyle = "22"`, `TileWallpaper = "0"`

#### Implementation:
- Add a helper function `apply_wallpaper_style(style: &str)` in `src-tauri/src/wallpaper.rs` that writes `WallpaperStyle` and `TileWallpaper` to `HKCU\Control Panel\Desktop` using `windows::Win32::System::Registry` APIs before invoking `SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)`.
- Update command `set_wallpaper(path: String, style: Option<String>) -> Result<(), String>`. When `style` is provided (or loaded from default setting `"bloom-wallpaper-fit"`), the registry values are applied atomically.
- Expose command `get_wallpaper_fit() -> Result<String, String>` to read the active style on startup.

---

### 2.2 Interactive Custom Framing Tool (Mobile & Mismatched Resolutions)
When an image aspect ratio differs substantially from the screen aspect ratio (e.g. 9:16 portrait on a 16:9 2560x1440 or 1920x1080 display), standard Windows "Fill" centers the crop blindly, often cutting off key subjects.

#### Frontend Component (`src/components/wallpaper/WallpaperFramingModal.tsx`):
- Accessible via an **"Adjust Framing"** button on the active hero card in `WallpaperView.tsx`.
- Opens a focused framing view within the 860x320 panel:
  - Detects native monitor aspect ratio via `window.screen.width / window.screen.height` (e.g. 16:9 or 21:9).
  - Displays a high-resolution canvas with a fixed aspect-ratio viewport box.
  - Interactive mouse/trackpad drag to pan the image freely in X and Y directions within bounded limits.
  - Zoom slider and mouse wheel zoom to scale between 1.0x (minimum fit) and 3.0x.
  - Preview shows the exact frame that will appear on the desktop.
  - Action buttons: "Reset", "Cancel", and "Apply to Desktop".

#### Backend Crop Engine (`src-tauri/src/wallpaper.rs`):
- Command: `set_custom_crop_wallpaper(path: String, crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32) -> Result<(), String>`
- Takes normalized coordinates `[0.0, 1.0]` of the user's chosen frame.
- Opens the original high-resolution image file via `image::open`.
- Computes pixel bounding box: `(crop_x * width, crop_y * height, crop_w * width, crop_h * height)`.
- Crops the sub-image and resizes/saves it to `%LOCALAPPDATA%\Orbix\custom_wallpapers\custom_<hash>.png` (or `.jpg`).
- Applies the cropped image as desktop background with `style = "Fill"` (since it is already scaled to the screen aspect ratio).

---

### 2.3 Background Slideshow Service (`src-tauri/src/services.rs` & `wallpaper.rs`)
A robust background worker that cycles wallpapers smoothly without consuming active CPU cycles.

#### Settings Keys:
- `bloom-wallpaper-slideshow-enabled`: `"true"` | `"false"` (default: `"false"`)
- `bloom-wallpaper-slideshow-value`: string number (e.g. `"15"`, `"30"`, `"2"`; default `"15"`)
- `bloom-wallpaper-slideshow-unit`: `"seconds"` | `"minutes"` | `"hours"` (default: `"minutes"`)
- `bloom-wallpaper-slideshow-interval`: integer seconds computed dynamically from `value * multiplier` for backend consumption (default `"900"`)
- `bloom-wallpaper-slideshow-order`: `"shuffle"` | `"sequential"` (default: `"shuffle"`)
- `bloom-wallpaper-fit`: `"fill"` | `"fit"` | `"stretch"` | `"center"` | `"span"` (default: `"fill"`)

#### Rust Slideshow Daemon:
- In `src-tauri/src/wallpaper.rs`, maintain `SLIDESHOW_STATE` with an atomic control flag and a shared thread handle.
- When enabled, a lightweight thread sleeps using `std::thread::park_timeout(interval)`.
- On timeout:
  1. Reads the current wallpaper directory from settings cache.
  2. Collects available image paths.
  3. Chooses the next image:
     - **Sequential**: sorts alphabetically and picks `(current_index + 1) % len`.
     - **Shuffle**: maintains a randomized permutation or picks non-repeating random index.
  4. Calls `set_wallpaper` with the configured fit mode.
  5. Emits `app.emit("wallpaper-changed", current_path)` to keep the frontend checkmark badge synchronized.
- Changing interval or pausing slideshow immediately unparks/resets the worker thread.

#### Frontend UI & Visual Theme:
- **Theme & Brand Colors**: All accent elements use **Orbix Brand Violet** (`#6B5290` / `var(--bloom-accent, #6B5290)`, with `#7E62A8` hover and `#9D7ECF` highlights), matching the exact brand theme color configured in Orbix Settings:
  - Header folder pill: rich brand violet gradient (`#6B5290` to `#5A437C`) with smooth specular glow.
  - Active wallpaper badge: brand violet circle (`#6B5290`) with white checkmark.
  - Custom framing viewport border: dashed brand violet boundary guide (`#8B6DB8`).
  - Framing "Apply to Desktop" button: high-contrast brand violet action pill (`#6B5290`).
- **Carousel Header**: A clean Play / Pause button (`<Play size={13} />` / `<Pause size={13} />`) with dynamic duration badge (e.g. `[ ▶ Slideshow (15m) ]`).
- **Settings Tab (`src/settings/NotchTab.tsx`)**:
  - Toggle switch: "Wallpaper Slideshow"
  - **Dynamic Split Cycle Interval**:
    - **Number Bar**: An editable integer input field (e.g. `[ 15 ]`, min: 1, max: 999).
    - **Unit Dropdown**: Select between `Seconds`, `Minutes`, and `Hours`.
  - Radio/Toggle: "Playback Order" (Shuffle / Sequential)
  - Dropdown: "Default Fit Mode" (Fill, Fit, Stretch, Center, Span)

---

### 2.4 Quick Folder Management & Presets (`src/components/wallpaper/WallpaperFolderMenu.tsx`)
Currently, switching directories requires launching the native Windows folder picker every time.

#### Folder Management Dropdown:
- Replaces the static folder name pill in the header with a clickable folder selector pill and dropdown:
  - **System Presets**:
    - 🖼️ **Windows Wallpapers**: `C:\Windows\Web\Wallpaper`
    - 📁 **Pictures**: `%USERPROFILE%\Pictures`
    - 🏞️ **Wallpapers**: `%USERPROFILE%\Pictures\Wallpapers` (if exists)
  - **Recent Folders**: Up to 5 most recently selected custom paths stored in `localStorage` / settings (`bloom-wallpaper-recent-folders`).
  - **Browse...**: Invokes Tauri dialog `open({ directory: true })` to select any custom folder and appends it to recent folders.
  - Each item shows the folder name, path tooltip, and an active checkmark if currently loaded.

---

## 3. Data Flow & IPC Commands

| Command | Arguments | Returns | Description |
|---|---|---|---|
| `get_wallpaper_fit` | none | `Result<String, String>` | Reads active Windows wallpaper style from registry |
| `set_wallpaper` | `path: String, style: Option<String>` | `Result<(), String>` | Sets desktop wallpaper and updates registry style flags |
| `set_custom_crop_wallpaper` | `path: String, crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32` | `Result<(), String>` | Crops source image to user frame and sets desktop wallpaper |
| `toggle_slideshow` | `enabled: bool` | `Result<(), String>` | Starts or stops the background slideshow worker |
| `get_slideshow_status` | none | `Result<SlideshowStatus, String>` | Returns enabled state, interval, order, and time until next switch |

---

## 4. Edge Cases & Error Handling
- **Mismatched Image Orientations**: The framing tool prevents negative crops and clamps bounding box to `[0.0, 1.0]`. If an image cannot be read by `image::open`, returns descriptive error and leaves current wallpaper intact.
- **Empty or Deleted Recent Folders**: If a folder in recent list was moved or deleted, it gracefully shows 0 pictures with an option to remove from recents.
- **Slideshow with Empty Folder**: The background worker detects empty image list, waits for next interval or directory change without crashing or looping rapidly.
- **Registry Permissions**: Uses `HKEY_CURRENT_USER\Control Panel\Desktop`, which requires standard user permissions (no admin prompt required).

---

## 5. Verification Plan
1. **Automated Checks**:
   - `cargo check --locked` and `cargo clippy --locked --all-targets` in `src-tauri`.
   - `bun run build` for frontend typechecking and linting.
2. **Manual & Visual Validation**:
   - Apply wallpapers in all 5 styles (Fill, Fit, Stretch, Center, Span) and verify desktop reflects the style immediately.
   - Open a mobile portrait wallpaper (e.g. 1080x1920), open Custom Framing, pan to top or bottom subject, apply, and verify desktop displays the exact cropped region.
   - Enable Slideshow at 1 min interval, verify automatic rotation in sequential and shuffle modes.
   - Switch folders using the new presets dropdown and test adding/removing custom directories.

