import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { motion } from "framer-motion";
import { Image, FolderOpen, RotateCw, Check } from "lucide-react";
import "./WallpaperView.css";

interface WallpaperItem {
	path: string;
	name: string;
}

export function WallpaperView() {
	const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
	const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
	const [currentWallpaper, setCurrentWallpaper] = useState<string>("");
	const [activeFolder, setActiveFolder] = useState<string>(() => {
		return localStorage.getItem("bloom-wallpaper-folder") || "";
	});
	const [isApplying, setIsApplying] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const loadWallpapers = useCallback(async (folderPath?: string) => {
		setIsLoading(true);
		try {
			const current = await invoke<string>("get_current_wallpaper");
			setCurrentWallpaper(current || "");

			const list = await invoke<WallpaperItem[]>("get_wallpapers", {
				folder: folderPath || undefined
			});
			setWallpapers(list);

			// Load thumbnails progressively
			list.forEach(async (item) => {
				try {
					const thumb = await invoke<string | null>("wallpaper_thumbnail", {
						path: item.path
					});
					setThumbnails((prev) => ({ ...prev, [item.path]: thumb }));
				} catch {
					setThumbnails((prev) => ({ ...prev, [item.path]: null }));
				}
			});
		} catch (err) {
			console.error("Failed to load wallpapers:", err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadWallpapers(activeFolder);
	}, [activeFolder, loadWallpapers]);

	const handlePickFolder = async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: "Select Wallpapers Folder"
			});
			if (selected && typeof selected === "string") {
				setActiveFolder(selected);
				localStorage.setItem("bloom-wallpaper-folder", selected);
				invoke("save_setting", { key: "bloom-wallpaper-folder", value: selected }).catch(
					() => {}
				);
				loadWallpapers(selected);
			}
		} catch (err) {
			console.error("Failed to open folder picker:", err);
		}
	};

	const handleSetWallpaper = async (item: WallpaperItem) => {
		setIsApplying(item.path);
		try {
			await invoke("set_wallpaper", { path: item.path });
			setCurrentWallpaper(item.path);
		} catch (err) {
			console.error("Failed to set wallpaper:", err);
		} finally {
			setTimeout(() => setIsApplying(null), 600);
		}
	};

	const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		if (scrollRef.current) {
			e.stopPropagation();
			scrollRef.current.scrollLeft += e.deltaY;
		}
	};

	const folderDisplayName = activeFolder
		? activeFolder.split(/[\\/]/).filter(Boolean).pop() || "Folder"
		: "Default";

	return (
		<motion.div
			className="wallpaper-panel-content"
			onClick={(e) => e.stopPropagation()}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
		>
			<div className="wallpaper-header">
				<div className="wallpaper-title-group">
					<span className="wallpaper-title">Wallpapers</span>
					<span className="wallpaper-count-badge">
						{wallpapers.length} {wallpapers.length === 1 ? "image" : "images"}
					</span>
				</div>

				<div className="wallpaper-actions-group">
					<button
						className="wallpaper-folder-btn"
						onClick={handlePickFolder}
						title={`Current folder: ${activeFolder || "Default Windows Wallpapers"}`}
					>
						<FolderOpen size={11} strokeWidth={2} />
						<span>{folderDisplayName}</span>
					</button>

					<button
						className="wallpaper-icon-btn"
						onClick={() => loadWallpapers(activeFolder)}
						title="Refresh wallpapers"
					>
						<RotateCw size={11} strokeWidth={2} className={isLoading ? "animate-spin" : ""} />
					</button>
				</div>
			</div>

			{wallpapers.length === 0 ? (
				<div className="wallpaper-empty-state">
					<Image size={22} strokeWidth={1.5} />
					<span>No image files found in folder</span>
				</div>
			) : (
				<div className="wallpaper-carousel" ref={scrollRef} onWheel={handleWheel}>
					{wallpapers.map((item) => {
						const isCurrent =
							currentWallpaper &&
							(currentWallpaper.toLowerCase() === item.path.toLowerCase() ||
								currentWallpaper.toLowerCase().endsWith(item.name.toLowerCase()));
						const isItemApplying = isApplying === item.path;
						const thumb = thumbnails[item.path];

						return (
							<div
								key={item.path}
								className={`wallpaper-card ${isCurrent ? "active" : ""} ${
									isItemApplying ? "applying" : ""
								}`}
								onClick={() => handleSetWallpaper(item)}
								title={`Click to set as desktop wallpaper:\n${item.name}`}
							>
								<div className="wallpaper-card-thumb">
									{thumb ? (
										<img src={thumb} alt={item.name} draggable={false} />
									) : (
										<div className="wallpaper-card-placeholder">
											<Image size={20} strokeWidth={1.5} />
										</div>
									)}

									{isCurrent && (
										<div className="wallpaper-active-badge">
											<Check size={10} strokeWidth={3} />
										</div>
									)}
								</div>

								<span className="wallpaper-card-label">{item.name}</span>
							</div>
						);
					})}
				</div>
			)}
		</motion.div>
	);
}
