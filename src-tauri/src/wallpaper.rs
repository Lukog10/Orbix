use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use base64::Engine;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WallpaperItem {
    pub path: String,
    pub name: String,
}

#[tauri::command]
pub fn get_current_wallpaper() -> Result<String, String> {
    unsafe {
        use windows::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
            REG_SZ,
        };
        let subkey: Vec<u16> = "Control Panel\\Desktop"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let value_name: Vec<u16> = "Wallpaper"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(subkey.as_ptr()),
            Some(0),
            KEY_READ,
            &mut hkey,
        )
        .is_ok()
        {
            let mut buf = [0u8; 1024];
            let mut buf_size = buf.len() as u32;
            let mut val_type = REG_SZ;
            let res = RegQueryValueExW(
                hkey,
                windows::core::PCWSTR(value_name.as_ptr()),
                None,
                Some(&mut val_type),
                Some(buf.as_mut_ptr()),
                Some(&mut buf_size),
            );
            let _ = RegCloseKey(hkey);
            if res.is_ok() && buf_size > 1 {
                let u16_slice = std::slice::from_raw_parts(
                    buf.as_ptr() as *const u16,
                    (buf_size as usize) / 2,
                );
                let len = u16_slice.iter().position(|&c| c == 0).unwrap_or(u16_slice.len());
                let path_str = String::from_utf16_lossy(&u16_slice[..len]);
                if !path_str.trim().is_empty() {
                    return Ok(path_str);
                }
            }
        }

        // Fallback via SystemParametersInfoW
        use windows::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        };
        let mut buffer = [0u16; 512];
        let success = SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buffer.len() as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
        if success.is_ok() {
            let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
            return Ok(String::from_utf16_lossy(&buffer[..len]));
        }
    }
    Ok(String::new())
}

#[tauri::command]
pub fn get_wallpapers(folder: Option<String>) -> Result<Vec<WallpaperItem>, String> {
    let target_dir: PathBuf = if let Some(ref f) = folder {
        let p = PathBuf::from(f);
        if p.exists() && p.is_dir() {
            p
        } else {
            get_default_wallpaper_dir()
        }
    } else {
        get_default_wallpaper_dir()
    };

    if !target_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    collect_images_from_dir(&target_dir, &mut items);
    items.sort_by_key(|a| a.name.to_lowercase());
    Ok(items)
}

fn get_default_wallpaper_dir() -> PathBuf {
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let pic_wallpapers = PathBuf::from(&user_profile).join("Pictures").join("Wallpapers");
        if pic_wallpapers.exists() && pic_wallpapers.is_dir() {
            return pic_wallpapers;
        }
    }

    let win_wallpapers = PathBuf::from("C:\\Windows\\Web\\Wallpaper");
    if win_wallpapers.exists() && win_wallpapers.is_dir() {
        return win_wallpapers;
    }

    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let pics = PathBuf::from(&user_profile).join("Pictures");
        if pics.exists() && pics.is_dir() {
            return pics;
        }
    }

    PathBuf::from("C:\\Windows\\Web\\Wallpaper")
}

/// Collect images directly in the specified folder (non-recursive).
/// Sub-folders are strictly excluded so the user only sees images in the current folder.
fn collect_images_from_dir(dir: &Path, out: &mut Vec<WallpaperItem>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_ascii_lowercase();
                if matches!(ext_lower.as_str(), "jpg" | "jpeg" | "png" | "webp" | "bmp") {
                    let name = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Wallpaper")
                        .to_string();
                    out.push(WallpaperItem {
                        path: path.to_string_lossy().to_string(),
                        name,
                    });
                }
            }
        }
    }
}

fn get_wallpaper_cache_dir() -> PathBuf {
    let base = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local_app_data).join("Orbix").join("wallpaper_cache")
    } else {
        std::env::temp_dir().join("Orbix_wallpaper_cache")
    };
    let _ = std::fs::create_dir_all(&base);
    base
}

fn get_cache_key(path: &str, size: u64, mtime: u64) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    size.hash(&mut hasher);
    mtime.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

static WALLPAPER_CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, String>>> =
    std::sync::OnceLock::new();

#[tauri::command]
pub async fn wallpaper_thumbnail(path: String) -> Option<String> {
    let cache = WALLPAPER_CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard.get(&path) {
            return Some(cached.clone());
        }
    }

    let p = Path::new(&path);
    let ext = p.extension()?.to_str()?.to_ascii_lowercase();
    if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "bmp") {
        return None;
    }

    let meta = std::fs::metadata(p).ok()?;
    if !meta.is_file() || meta.len() > 64 * 1024 * 1024 {
        return None;
    }

    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let cache_dir = get_wallpaper_cache_dir();
    let cache_key = get_cache_key(&path, meta.len(), mtime);
    let cache_file_jpg = cache_dir.join(format!("{}.jpg", cache_key));
    let cache_file_png = cache_dir.join(format!("{}.png", cache_key));

    // Fast-path: Check persistent disk cache before any heavy image decode
    if cache_file_jpg.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file_jpg) {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_url = format!("data:image/jpeg;base64,{}", b64);
            if let Ok(mut guard) = cache.lock() {
                guard.insert(path, data_url.clone());
            }
            return Some(data_url);
        }
    } else if cache_file_png.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file_png) {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_url = format!("data:image/png;base64,{}", b64);
            if let Ok(mut guard) = cache.lock() {
                guard.insert(path, data_url.clone());
            }
            return Some(data_url);
        }
    }

    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(256 * 1024 * 1024);

    let mut reader = image::ImageReader::open(p)
        .ok()?
        .with_guessed_format()
        .ok()?;
    reader.limits(limits);
    let img = reader.decode().ok()?;

    // 800x450 Retina thumbnail preserves crisp quality without excessive memory usage
    let thumb = img.thumbnail(800, 450);

    let result_data_url = if img.color().has_alpha() {
        let mut png_bytes: Vec<u8> = Vec::new();
        thumb
            .write_to(
                &mut std::io::Cursor::new(&mut png_bytes),
                image::ImageFormat::Png,
            )
            .ok()?;
        let _ = std::fs::write(&cache_file_png, &png_bytes);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        format!("data:image/png;base64,{}", b64)
    } else {
        let mut jpeg_bytes: Vec<u8> = Vec::new();
        let rgb = thumb.to_rgb8();
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 85);
        encoder.encode_image(&rgb).ok()?;
        let _ = std::fs::write(&cache_file_jpg, &jpeg_bytes);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
        format!("data:image/jpeg;base64,{}", b64)
    };

    if let Ok(mut guard) = cache.lock() {
        guard.insert(path, result_data_url.clone());
    }

    Some(result_data_url)
}

pub fn apply_wallpaper_style(style: &str) -> Result<(), String> {
    unsafe {
        use windows::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_SZ,
        };
        let subkey: Vec<u16> = "Control Panel\\Desktop"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(subkey.as_ptr()),
            Some(0),
            KEY_WRITE,
            &mut hkey,
        )
        .is_err()
        {
            return Err("Failed to open Control Panel\\Desktop registry key".to_string());
        }

        let (style_val, tile_val) = match style.to_lowercase().as_str() {
            "fit" => ("6", "0"),
            "stretch" => ("2", "0"),
            "tile" => ("0", "1"),
            "center" => ("0", "0"),
            "span" => ("22", "0"),
            _ => ("10", "0"), // "fill" is default
        };

        let val_name_style: Vec<u16> = "WallpaperStyle"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let val_data_style: Vec<u16> = style_val
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let bytes_style = std::slice::from_raw_parts(
            val_data_style.as_ptr() as *const u8,
            val_data_style.len() * 2,
        );
        let _ = RegSetValueExW(
            hkey,
            windows::core::PCWSTR(val_name_style.as_ptr()),
            None,
            REG_SZ,
            Some(bytes_style),
        );

        let val_name_tile: Vec<u16> = "TileWallpaper"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let val_data_tile: Vec<u16> = tile_val
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let bytes_tile = std::slice::from_raw_parts(
            val_data_tile.as_ptr() as *const u8,
            val_data_tile.len() * 2,
        );
        let _ = RegSetValueExW(
            hkey,
            windows::core::PCWSTR(val_name_tile.as_ptr()),
            None,
            REG_SZ,
            Some(bytes_tile),
        );

        let _ = RegCloseKey(hkey);
        Ok(())
    }
}

#[tauri::command]
pub fn get_wallpaper_fit() -> Result<String, String> {
    unsafe {
        use windows::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
            REG_SZ,
        };
        let subkey: Vec<u16> = "Control Panel\\Desktop"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(subkey.as_ptr()),
            Some(0),
            KEY_READ,
            &mut hkey,
        )
        .is_err()
        {
            return Ok("fill".to_string());
        }

        let read_val = |name: &str| -> String {
            let val_name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            let mut buf = [0u8; 128];
            let mut buf_size = buf.len() as u32;
            let mut val_type = REG_SZ;
            let res = RegQueryValueExW(
                hkey,
                windows::core::PCWSTR(val_name.as_ptr()),
                None,
                Some(&mut val_type),
                Some(buf.as_mut_ptr()),
                Some(&mut buf_size),
            );
            if res.is_ok() && buf_size > 1 {
                let u16_slice = std::slice::from_raw_parts(
                    buf.as_ptr() as *const u16,
                    (buf_size as usize) / 2,
                );
                let len = u16_slice.iter().position(|&c| c == 0).unwrap_or(u16_slice.len());
                return String::from_utf16_lossy(&u16_slice[..len]).trim().to_string();
            }
            String::new()
        };

        let tile = read_val("TileWallpaper");
        let style = read_val("WallpaperStyle");
        let _ = RegCloseKey(hkey);

        if tile == "1" {
            return Ok("tile".to_string());
        }

        match style.as_str() {
            "6" => Ok("fit".to_string()),
            "2" => Ok("stretch".to_string()),
            "0" => Ok("center".to_string()),
            "22" => Ok("span".to_string()),
            _ => Ok("fill".to_string()),
        }
    }
}

#[tauri::command]
pub fn set_wallpaper(path: String, style: Option<String>) -> Result<(), String> {
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("Wallpaper file does not exist: {path}"));
    }

    if let Some(ref s) = style {
        let _ = apply_wallpaper_style(s);
    }

    let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE,
        };

        let success = SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            Some(path_wide.as_ptr() as *mut _),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        );

        if success.is_ok() {
            Ok(())
        } else {
            Err("Failed to set desktop wallpaper via SystemParametersInfo".to_string())
        }
    }
}

fn get_custom_wallpapers_dir() -> PathBuf {
    let base = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local_app_data).join("Orbix").join("custom_wallpapers")
    } else {
        std::env::temp_dir().join("Orbix_custom_wallpapers")
    };
    let _ = std::fs::create_dir_all(&base);
    base
}

#[tauri::command]
pub async fn set_custom_crop_wallpaper(
    path: String,
    crop_x: f32,
    crop_y: f32,
    crop_w: f32,
    crop_h: f32,
) -> Result<String, String> {
    use image::GenericImageView;
    let path_obj = PathBuf::from(&path);
    if !path_obj.exists() {
        return Err(format!("Wallpaper file does not exist: {path}"));
    }

    let mut reader = image::ImageReader::open(&path_obj)
        .map_err(|e| format!("Failed to open image file: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("Failed to detect image format: {e}"))?;

    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);

    let img = reader
        .decode()
        .map_err(|e| format!("Failed to decode image: {e}"))?;

    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return Err("Invalid image dimensions (0x0)".to_string());
    }

    let x = (crop_x.clamp(0.0, 1.0) * width as f32).round() as u32;
    let y = (crop_y.clamp(0.0, 1.0) * height as f32).round() as u32;
    let w = (crop_w.clamp(0.01, 1.0) * width as f32).round() as u32;
    let h = (crop_h.clamp(0.01, 1.0) * height as f32).round() as u32;

    let final_x = x.min(width.saturating_sub(1));
    let final_y = y.min(height.saturating_sub(1));
    let final_w = w.min(width.saturating_sub(final_x)).max(1);
    let final_h = h.min(height.saturating_sub(final_y)).max(1);

    let cropped = img.crop_imm(final_x, final_y, final_w, final_h);

    let custom_dir = get_custom_wallpapers_dir();
    let file_stem = path_obj
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("custom");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let out_file = custom_dir.join(format!("{}_{}.png", file_stem, timestamp));

    cropped
        .save_with_format(&out_file, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to save cropped image: {e}"))?;

    let out_path_str = out_file.to_string_lossy().to_string();
    set_wallpaper(out_path_str.clone(), Some("fill".to_string()))?;

    Ok(out_path_str)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SlideshowStatus {
    pub enabled: bool,
    pub interval_secs: u64,
    pub order: String,
    pub current_path: String,
}

static SLIDESHOW_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static SLIDESHOW_PAIR: std::sync::OnceLock<(
    std::sync::Arc<std::sync::Mutex<bool>>,
    std::sync::Arc<std::sync::Condvar>,
)> = std::sync::OnceLock::new();
static SLIDESHOW_LAST_INDEX: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn get_slideshow_pair() -> &'static (
    std::sync::Arc<std::sync::Mutex<bool>>,
    std::sync::Arc<std::sync::Condvar>,
) {
    SLIDESHOW_PAIR.get_or_init(|| {
        (
            std::sync::Arc::new(std::sync::Mutex::new(false)),
            std::sync::Arc::new(std::sync::Condvar::new()),
        )
    })
}

#[tauri::command]
pub fn toggle_slideshow(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    SLIDESHOW_RUNNING.store(enabled, std::sync::atomic::Ordering::SeqCst);
    let (lock, cvar) = get_slideshow_pair();
    if let Ok(mut running) = lock.lock() {
        *running = enabled;
        cvar.notify_all();
    }

    if enabled {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            run_slideshow_loop(app_handle);
        });
    }

    Ok(())
}

#[tauri::command]
pub fn get_slideshow_status(app: tauri::AppHandle) -> Result<SlideshowStatus, String> {
    let enabled = SLIDESHOW_RUNNING.load(std::sync::atomic::Ordering::SeqCst);
    let interval_secs = crate::utils::get_setting_str(&app, "bloom-wallpaper-slideshow-interval")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(900);
    let order = crate::utils::get_setting_str(&app, "bloom-wallpaper-slideshow-order")
        .unwrap_or_else(|| "shuffle".to_string());
    let current_path = get_current_wallpaper().unwrap_or_default();

    Ok(SlideshowStatus {
        enabled,
        interval_secs,
        order,
        current_path,
    })
}

fn run_slideshow_loop(app: tauri::AppHandle) {
    let (lock, cvar) = get_slideshow_pair();

    while SLIDESHOW_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
        let interval_secs = crate::utils::get_setting_str(&app, "bloom-wallpaper-slideshow-interval")
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(900)
            .max(3);

        if let Ok(guard) = lock.lock() {
            let res = cvar.wait_timeout(guard, std::time::Duration::from_secs(interval_secs));
            if let Ok((running, timeout_result)) = res {
                if !*running || !SLIDESHOW_RUNNING.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                if timeout_result.timed_out() {
                    advance_slideshow_wallpaper(&app);
                }
            }
        }
    }
}

fn advance_slideshow_wallpaper(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let folder = crate::utils::get_setting_str(app, "bloom-wallpaper-folder");
    let wallpapers = match get_wallpapers(folder) {
        Ok(list) if !list.is_empty() => list,
        _ => return,
    };

    let order = crate::utils::get_setting_str(app, "bloom-wallpaper-slideshow-order")
        .unwrap_or_else(|| "shuffle".to_string());
    let fit_mode = crate::utils::get_setting_str(app, "bloom-wallpaper-fit")
        .unwrap_or_else(|| "fill".to_string());

    let next_idx = if order == "sequential" {
        let prev = SLIDESHOW_LAST_INDEX.load(std::sync::atomic::Ordering::SeqCst);
        let next = (prev + 1) % wallpapers.len();
        SLIDESHOW_LAST_INDEX.store(next, std::sync::atomic::Ordering::SeqCst);
        next
    } else {
        use std::time::SystemTime;
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.subsec_nanos() as usize)
            .unwrap_or(0);
        let prev = SLIDESHOW_LAST_INDEX.load(std::sync::atomic::Ordering::SeqCst);
        let mut idx = nanos % wallpapers.len();
        if wallpapers.len() > 1 && idx == prev {
            idx = (idx + 1) % wallpapers.len();
        }
        SLIDESHOW_LAST_INDEX.store(idx, std::sync::atomic::Ordering::SeqCst);
        idx
    };

    if let Some(target) = wallpapers.get(next_idx) {
        if set_wallpaper(target.path.clone(), Some(fit_mode)).is_ok() {
            let _ = app.emit("wallpaper-changed", target.path.clone());
        }
    }
}
