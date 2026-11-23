import { useEffect, useRef, useState } from "react";
import { Folder, Image, Clock, FolderPlus, Check, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export interface WallpaperFolderMenuProps {
	activeFolder: string;
	isOpen: boolean;
	onClose: () => void;
	onSelectFolder: (folderPath: string) => void;
	onBrowseFolder: () => void;
}

export const RECENT_FOLDERS_KEY = "bloom-wallpaper-recent-folders";
const MAX_RECENT_FOLDERS = 6;

export const getRecentFolders = (): string[] => {
	try {
		const raw = localStorage.getItem(RECENT_FOLDERS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

export const saveRecentFolder = (path: string) => {
	if (!path || path.toLowerCase() === "c:\\windows\\web\\wallpaper") return;
	try {
		const current = getRecentFolders().filter((f) => f.toLowerCase() !== path.toLowerCase());
		const updated = [path, ...current].slice(0, MAX_RECENT_FOLDERS);
		localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(updated));
	} catch {
		// Ignore storage write errors
	}
};

export function WallpaperFolderMenu({
	activeFolder,
	isOpen,
	onClose,
	onSelectFolder,
	onBrowseFolder
}: WallpaperFolderMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [recentFolders, setRecentFolders] = useState<string[]>([]);

	useEffect(() => {
		if (isOpen) {
			invoke("set_menu_open", { open: true, rect: null }).catch(() => {});
			setRecentFolders(getRecentFolders());
		} else {
			invoke("set_menu_open", { open: false, rect: null }).catch(() => {});
		}
		return () => {
			if (isOpen) {
				invoke("set_menu_open", { open: false, rect: null }).catch(() => {});
			}
		};
	}, [isOpen]);

	const removeRecentFolder = (e: React.MouseEvent, pathToRemove: string) => {
		e.stopPropagation();
		try {
			const current = getRecentFolders().filter(
				(f) => f.toLowerCase() !== pathToRemove.toLowerCase()
			);
			localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(current));
			setRecentFolders(current);
		} catch {
			// Ignore
		}
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				target &&
				(target.closest(".wallpaper-folder-arrow-btn") ||
					target.closest(".wallpaper-folder-btn") ||
					target.closest(".wallpaper-folder-split-pill") ||
					target.closest(".wallpaper-folder-dropdown"))
			) {
				return;
			}
			if (menuRef.current && !menuRef.current.contains(target)) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const presets = [
		{
			id: "user-pictures",
			label: "Pictures",
			path: "",
			icon: Folder
		},
		{
			id: "win-web",
			label: "Windows Wallpapers",
			path: "C:\\Windows\\Web\\Wallpaper",
			icon: Image
		}
	];

	const isCustomFolderActive =
		Boolean(activeFolder) && activeFolder.toLowerCase() !== "c:\\windows\\web\\wallpaper";

	const displayRecents = recentFolders.filter(
		(f) => !activeFolder || f.toLowerCase() !== activeFolder.toLowerCase()
	);

	return (
		<div
			ref={menuRef}
			className="wallpaper-folder-dropdown"
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
		>
			{/* Current Active Custom Folder */}
			{isCustomFolderActive && (
				<>
					<div className="wallpaper-menu-section-title">Current Folder</div>
					<button
						type="button"
						className="wallpaper-menu-item is-selected"
						onClick={() => {
							onSelectFolder(activeFolder);
							onClose();
						}}
						title={activeFolder}
					>
						<span className="wallpaper-menu-item-left">
							<Folder size={13} className="wallpaper-menu-item-icon" />
							<span className="wallpaper-menu-item-text">
								{activeFolder.split(/[\\/]/).filter(Boolean).pop() || activeFolder}
							</span>
						</span>
						<Check size={12} className="wallpaper-menu-check" />
					</button>
					<div className="wallpaper-menu-divider" />
				</>
			)}

			{/* Presets */}
			<div className="wallpaper-menu-section-title">Presets</div>
			{presets.map((preset) => {
				const isSelected =
					preset.path === ""
						? !activeFolder
						: activeFolder.toLowerCase() === preset.path.toLowerCase();
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

			{/* Recent Folders */}
			{displayRecents.length > 0 && (
				<>
					<div className="wallpaper-menu-divider" />
					<div className="wallpaper-menu-section-title">Recent Folders</div>

					{displayRecents.map((recentPath) => {
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

			{/* Browse New Folder */}
			<button
				type="button"
				className="wallpaper-menu-item wallpaper-menu-browse-btn"
				onClick={() => {
					onBrowseFolder();
					onClose();
				}}
			>
				<span className="wallpaper-menu-item-left">
					<FolderPlus size={13} className="wallpaper-menu-item-icon" />
					<span>Browse New Folder...</span>
				</span>
			</button>
		</div>
	);
}
