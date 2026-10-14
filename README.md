<div align="center">

<img 
  src="https://github.com/user-attachments/assets/962887ec-636b-4e0f-90eb-0862c0feefca" 
  width="72"
/>

# Zvuk

> **Zvuk** is an open-source Windows desktop utility built with **Rust (Tauri v2)** and **React 19 / TypeScript**. It replaces the native Windows taskbar with a floating dock and adds a dynamic, spring-animated island notch to the top of your screen.
> 
> Forked from **[Bloom](https://github.com/SehajveerSingh2005/bloom)** by **[Sehajveer Singh](https://github.com/SehajveerSingh2005)** under the **GPLv3** license. See [CREDITS.md](CREDITS.md) for full attribution.

<br/>

> [!NOTE]
> ### ⏸️ Project Status: Development on Hold
> Active feature development on Zvuk is currently on hold. The codebase is in a complete, stable, and verified working state with all documented features fully implemented and tested. Bug reports, community contributions, and pull requests remain welcome.

<br/>

<!-- HERO SHOWCASE — full-width cinematic shot or video -->
<img width="1920" height="1080" alt="Zvuk Hero" src="https://github.com/user-attachments/assets/22041f25-a69e-457d-80d9-7dfbfbed2d29" />

<video width="1920" height="1080" src="https://github.com/user-attachments/assets/fa7f949b-d9c3-4a92-b00d-e1132c0f3ff1">

</div>

---

Zvuk makes your Windows desktop feel alive.

Every transition is a physics simulation.  
Every element responds to touch and hover.  
Every pixel is in motion.

Your desktop has been asleep for years.  
This wakes it up.

---

## 🏝️ The Island (Dynamic Notch)

<p align="center">
  <img width="430" height="70" alt="Zvuk Island" src="https://github.com/user-attachments/assets/0d723558-9df4-4214-b20e-4a1f97eb1f22" />
</p>

An adaptive notch at the top of your screen that expands, contracts, and shifts between modes as you work. Scroll on the header or swipe to switch sections.

* **📊 Live Telemetry & Status** — Configurable status widgets for CPU %, RAM %, Disk space, real-time Network upload/download bandwidth, local weather, and battery percentage.
* **🎧 Audio Device Alerts & Indicators** — Live Core Audio integration detecting headphones and microphones. Features persistent status icons and animated notification pills in the notch upon device connection/disconnection.
* **🎛️ Command Center & Quick Controls** — Instant on/off toggle switches for Wi-Fi, Bluetooth, Ethernet (left-click toggle, right-click settings), Airplane / Flight Mode, Mobile Hotspot, Focus / Do Not Disturb, and Energy Saver, plus volume and brightness sliders.
* **🎵 Music & Visualizer** — Real-time WASAPI audio loopback visualizer reacting to 5 frequency bands with spring physics. Displays track title, artist marquee, media controls, and album art with dynamic ambient glow (supports both Classic and Compact layouts).
* **🖼️ Wallpaper Carousel** — Full-screen wallpaper gallery with smooth centered wheel scrolling, thumbnail caching, custom folder selection, and one-click desktop wallpaper application via Win32.
* **⚡ Power Menu** — Circular hold-to-activate controls for Sleep, Restart, Shutdown, Lock Workstation, and Switch User.
* **📅 Calendar & Focus Timer** — Split-view calendar alongside an inline Pomodoro countdown timer with custom audio chime synthesis.
* **🔍 Apps & Launcher Search** — Rapid app launcher and indexed search for files, folders, and applications.
* **📥 The Shelf** — OLE drag-and-drop persistent staging ground for dragging files, documents, and text snippets across workspaces.

---

## 🚀 The Dock

<p align="center">
  <img width="576" height="102" alt="Zvuk Dock" src="https://github.com/user-attachments/assets/96229f0e-1246-4baf-b8ad-3e8f77142a12" />
</p>

A floating taskbar replacement that sits cleanly at the bottom of your screen:

* **Native Windows Taskbar Replacement** — Hides the stock taskbar and registers proper Win32 AppBars so maximized windows respect the dock's footprint.
* **Hover Thumbnail Previews** — Real-time DWM window thumbnail capture on hover.
* **Fluid Drag-and-Drop Reordering** — Smooth physics-based app reordering, custom pinning, and running indicator dots.
* **Dock Extras** — Quick access to drives, custom user directories, and Recycle Bin with state indicators.
* **Robust Context Menus** — Reliable right-click dialog bar for app controls (pin, close, run as administrator) and system tools.
* **Adaptive Display Modes** — Choose between `fixed` (AppBar reserved), `smart` (auto-hides when overlapped by windows), or `peek` (reveals on bottom-edge contact).

---

## 🎚️ HUD Overlays & Customization

* **Edge Overlays** — Custom sleek Volume and Brightness HUD overlays with screen-edge hover triggers, replacing standard Windows flyouts.
* **Complete Settings Suite** — Comprehensive settings tab for Notch behavior, Dock layout, Quick Controls visibility selection, Appearance themes/scaling, and Autostart.
* **Documented Configuration** — Flat JSON settings store documented in [SETTINGS.md](SETTINGS.md) with real-time file watching.

---

## ⚙️ Architecture & Under the Hood

Zvuk operates as a multi-webview Tauri v2 architecture designed for low overhead and maximum smoothness:

* **Rust Backend**:
  * Low-level Win32 hooks (`WH_MOUSE_LL`, `WH_KEYBOARD_LL`) for boundary hit-testing and hotkey intercepts.
  * Windows Core Audio API (`IMMDeviceEnumerator`) for real-time audio device polling and notification broadcasts.
  * WASAPI loopback audio capture feeding frequency bands to the visualizer.
  * Win32 `SHAppBarMessage` managing desktop work areas.
  * Non-blocking background worker threads for hardware metrics, weather polling, and thumbnail generation.
* **Frontend**:
  * Built with React 19, TypeScript, and Vite.
  * Powered by Framer Motion spring physics simulations.
  * Strict bundle isolation across four distinct webview windows: `main` (notch), `dock`, `overlay`, and `settings`.
* **Zero Resource Waste**:
  * Visualizer suspends when audio is paused.
  * Mouse hook relaxes when cursor is away from hot zones.
  * Window thumbnails generate on demand.

---

## 🛡️ Microsoft Defender & Security

Because Zvuk is an open-source tool that hooks into native Windows shell APIs (taskbar management, global hotkeys, audio capture), Windows Defender or SmartScreen may occasionally prompt a notification on initial download.

The application contains **no adware, telemetry, or malware**. You can inspect and build the entire codebase yourself from source.

<details>
<summary>Clearing false-positive Defender cached signatures</summary>

Open **Command Prompt as Administrator** and run:

```cmd
cd "C:\Program Files\Windows Defender"
MpCmdRun.exe -removedefinitions -dynamicsignatures
MpCmdRun.exe -SignatureUpdate
```

</details>

---

## 🛠️ Building From Source

### Prerequisites

* Windows 10 / 11 (64-bit)
* [Rust](https://rustup.rs/) (stable toolchain)
* [Bun](https://bun.sh/) (v1.4+)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Lukog10/Zvuk-Shell.git
cd Zvuk-Shell

# Install frontend dependencies
bun install

# Run development loop (Vite + Tauri dev)
bun run tauri dev
```

### Production Build & Tests

```bash
# Build & typecheck frontend
bun run build

# Check Rust backend
cd src-tauri
cargo check --locked
cargo test --locked
```

---

## 📜 Credits & License

Zvuk is built upon the foundation of **[Bloom](https://github.com/SehajveerSingh2005/bloom)** by **[Sehajveer Singh](https://github.com/SehajveerSingh2005)**.  
See [CREDITS.md](CREDITS.md) for detailed attribution and third-party dependency details.

Licensed under the **[GNU General Public License v3.0 (GPLv3)](LICENSE)**.

---

<div align="center">

**Zvuk — Windows desktop, refined.**

</div>
