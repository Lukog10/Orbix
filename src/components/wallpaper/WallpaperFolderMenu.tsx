import { useEffect, useRef } from "react";
import { Folder, Image, Clock, FolderPlus, Check, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

export interface WallpaperFolderMenuProps {
	activeFolder: string;
	isOpen: boolean;
	onClose: () => void;
	onSelectFolder: (folderPath: string) => void;
}

const RECENT_FOLDERS_KEY = "bloom-wallpaper-recent-folders";
const MAX_RECENT_FOLDERS = 5;

export function WallpaperFolderMenu({
	activeFolder,
	isOpen,
	onClose,
	onSelectFolder,
}: WallpaperFolderMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	const getRecentFolders = (): string[] => {
		try {
			const raw = localStorage.getItem(RECENT_FOLDERS_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	};

	const saveRecentFolder = (path: string) => {
		try {
			const current = getRecentFolders().filter((f) => f.toLowerCase() !== path.toLowerCase());
			const updated = [path, ...current].slice(0, MAX_RECENT_FOLDERS);
			localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(updated));
		} catch {
			// Ignore storage write errors
		}
	};

	const removeRecentFolder = (e: React.MouseEvent, pathToRemove: string) => {
		e.stopPropagation();
		try {
			const current = getRecentFolders().filter((f) => f !== pathToRemove);
			localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(current));
			onClose();
		} catch {
			// Ignore
		}
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const recentFolders = getRecentFolders();

	const handleBrowseFolder = async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: "Select Wallpapers Folder",
			});
			if (selected && typeof selected === "string") {
				saveRecentFolder(selected);
				onSelectFolder(selected);
				onClose();
			}
		} catch (err) {
			console.error("Failed to browse folder:", err);
		}
	};

	const presets = [
		{
			id: "win-web",
			label: "Windows Wallpapers",
			path: "C:\\Windows\\Web\\Wallpaper",
			icon: Image,
		},
		{
			id: "user-pictures",
			label: "Pictures",
			path: "",
			icon: Folder,
		},
	];

	return (
		<div
			ref={menuRef}
			className="wallpaper-folder-dropdown"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="wallpaper-menu-section-title">Presets</div>

			{presets.map((preset) => {
				const isSelected =
					activeFolder.toLowerCase() === preset.path.toLowerCase() ||
					(!activeFolder && preset.path === "");
				const Icon = preset.icon;

				return (
					<button
						key={preset.id}
						type="button"
						className={`wallpaper-menu-item ${isSelected ? "is-selected" : ""}`}
						onClick={() => {
							onSelectFolder(preset.path);
							onClose();
						}}
					>
						<span className="wallpaper-menu-item-left">
							<Icon size={13} className="wallpaper-menu-item-icon" />
							<span>{preset.label}</span>
						</span>
						{isSelected && <Check size={12} className="wallpaper-menu-check" />}
					</button>
				);
			})}

			{recentFolders.length > 0 && (
				<>
					<div className="wallpaper-menu-divider" />
					<div className="wallpaper-menu-section-title">Recent Folders</div>

					{recentFolders.map((recentPath) => {
						const isSelected = activeFolder.toLowerCase() === recentPath.toLowerCase();
						const folderName = recentPath.split(/[\\/]/).filter(Boolean).pop() || recentPath;

						return (
							<div
								key={recentPath}
								className={`wallpaper-menu-item wallpaper-menu-recent-item ${
									isSelected ? "is-selected" : ""
								}`}
								onClick={() => {
									onSelectFolder(recentPath);
									onClose();
								}}
								title={recentPath}
							>
								<span className="wallpaper-menu-item-left">
									<Clock size={13} className="wallpaper-menu-item-icon" />
									<span className="wallpaper-menu-item-text">{folderName}</span>
								</span>
								<div className="wallpaper-menu-item-actions">
									{isSelected && <Check size={12} className="wallpaper-menu-check" />}
									<button
										type="button"
										className="wallpaper-menu-remove-btn"
										onClick={(e) => removeRecentFolder(e, recentPath)}
										title="Remove from recents"
									>
										<X size={11} />
									</button>
								</div>
							</div>
						);
					})}
				</>
			)}

			<div className="wallpaper-menu-divider" />

			<button
				type="button"
				className="wallpaper-menu-item wallpaper-menu-browse-btn"
				onClick={handleBrowseFolder}
			>
				<span className="wallpaper-menu-item-left">
					<FolderPlus size={13} className="wallpaper-menu-item-icon" />
					<span>Browse Folder...</span>
				</span>
			</button>
		</div>
	);
}
