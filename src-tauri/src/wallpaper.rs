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
    collect_images_from_dir(&target_dir, &mut items, 0, 2);
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
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

fn collect_images_from_dir(
    dir: &Path,
    out: &mut Vec<WallpaperItem>,
    depth: usize,
    max_depth: usize,
) {
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
        } else if path.is_dir() && depth < max_depth {
            collect_images_from_dir(&path, out, depth + 1, max_depth);
        }
    }
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
    // High-resolution 1600x900 thumbnail preserves crisp original quality on all displays
    let thumb = img.thumbnail(1600, 900);

    let result_data_url = if img.color().has_alpha() {
        let mut png_bytes: Vec<u8> = Vec::new();
        thumb
            .write_to(
                &mut std::io::Cursor::new(&mut png_bytes),
                image::ImageFormat::Png,
            )
            .ok()?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        format!("data:image/png;base64,{}", b64)
    } else {
        let mut jpeg_bytes: Vec<u8> = Vec::new();
        let rgb = thumb.to_rgb8();
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_bytes, 92);
        encoder.encode_image(&rgb).ok()?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
        format!("data:image/jpeg;base64,{}", b64)
    };

    if let Ok(mut guard) = cache.lock() {
        guard.insert(path, result_data_url.clone());
    }

    Some(result_data_url)
}

#[tauri::command]
pub fn set_wallpaper(path: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("Wallpaper file does not exist: {path}"));
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
