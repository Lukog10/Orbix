import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Crop, ZoomIn, RotateCcw, X, Check } from "lucide-react";

export interface WallpaperFramingModalProps {
	wallpaperPath: string;
	wallpaperName: string;
	onClose: () => void;
	onApplied: (newPath: string) => void;
}

export function WallpaperFramingModal({
	wallpaperPath,
	wallpaperName,
	onClose,
	onApplied,
}: WallpaperFramingModalProps) {
	const [zoom, setZoom] = useState<number>(1.0);
	const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const [isApplying, setIsApplying] = useState<boolean>(false);
	const [imageLoaded, setImageLoaded] = useState<boolean>(false);
	const isDraggingRef = useRef<boolean>(false);
	const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
		x: 0,
		y: 0,
		panX: 0,
		panY: 0,
	});
	const viewportRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement>(null);

	// Detect monitor aspect ratio (defaults to 16:9)
	const screenRatio = window.screen.width && window.screen.height
		? window.screen.width / window.screen.height
		: 16 / 9;

	// Dimensions of viewport box inside the modal
	const VIEWPORT_WIDTH = 460;
	const VIEWPORT_HEIGHT = Math.round(VIEWPORT_WIDTH / screenRatio);

	const handleImageLoad = () => {
		setImageLoaded(true);
	};

	// Reset pan and zoom to center
	const handleReset = () => {
		setZoom(1.0);
		setPan({ x: 0, y: 0 });
	};

	// Dragging handlers
	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		isDraggingRef.current = true;
		dragStartRef.current = {
			x: e.clientX,
			y: e.clientY,
			panX: pan.x,
			panY: pan.y,
		};
	};

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (!isDraggingRef.current) return;
		const deltaX = e.clientX - dragStartRef.current.x;
		const deltaY = e.clientY - dragStartRef.current.y;
		setPan({
			x: dragStartRef.current.panX + deltaX,
			y: dragStartRef.current.panY + deltaY,
		});
	}, []);

	const handleMouseUp = useCallback(() => {
		isDraggingRef.current = false;
	}, []);

	useEffect(() => {
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [handleMouseMove, handleMouseUp]);

	// Mouse wheel zoom
	const handleWheel = (e: React.WheelEvent) => {
		e.stopPropagation();
		const delta = -Math.sign(e.deltaY) * 0.1;
		setZoom((prev) => Math.min(3.0, Math.max(1.0, parseFloat((prev + delta).toFixed(2)))));
	};

	// Calculate normalized crop coordinates and call backend
	const handleApply = async () => {
		if (!imgRef.current || !viewportRef.current) return;
		setIsApplying(true);

		try {
			const vRect = viewportRef.current.getBoundingClientRect();
			const iRect = imgRef.current.getBoundingClientRect();

			// Calculate what portion of the displayed image is inside the viewport rect
			const cropLeftPx = Math.max(0, vRect.left - iRect.left);
			const cropTopPx = Math.max(0, vRect.top - iRect.top);
			const cropWidthPx = Math.min(iRect.width - cropLeftPx, vRect.width);
			const cropHeightPx = Math.min(iRect.height - cropTopPx, vRect.height);

			// Normalize to [0.0, 1.0] relative to displayed image dimensions
			const crop_x = Math.max(0.0, Math.min(1.0, cropLeftPx / iRect.width));
			const crop_y = Math.max(0.0, Math.min(1.0, cropTopPx / iRect.height));
			const crop_w = Math.max(0.01, Math.min(1.0, cropWidthPx / iRect.width));
			const crop_h = Math.max(0.01, Math.min(1.0, cropHeightPx / iRect.height));

			const newPath = await invoke<string>("set_custom_crop_wallpaper", {
				path: wallpaperPath,
				cropX: crop_x,
				cropY: crop_y,
				cropW: crop_w,
				cropH: crop_h,
			});

			onApplied(newPath || wallpaperPath);
			onClose();
		} catch (err) {
			console.error("Failed to apply custom cropped wallpaper:", err);
		} finally {
			setIsApplying(false);
		}
	};

	return (
		<div className="wallpaper-framing-overlay" onClick={(e) => e.stopPropagation()}>
			{/* Header */}
			<div className="wallpaper-framing-header">
				<div className="wallpaper-framing-title-group">
					<div className="wallpaper-framing-badge">
						<Crop size={12} strokeWidth={2.5} />
						<span>Custom Framing</span>
					</div>
					<span className="wallpaper-framing-filename" title={wallpaperName}>
						{wallpaperName}
					</span>
					<span className="wallpaper-framing-screen-ratio">
						Screen: {Math.round(screenRatio * 9)}:9 ({window.screen.width}x{window.screen.height})
					</span>
				</div>

				<div className="wallpaper-framing-actions">
					<button
						type="button"
						className="wallpaper-framing-tool-btn"
						onClick={handleReset}
						title="Reset position and zoom"
					>
						<RotateCcw size={12} />
						<span>Reset</span>
					</button>

					<button
						type="button"
						className="wallpaper-framing-close-btn"
						onClick={onClose}
						title="Cancel and close"
					>
						<X size={13} strokeWidth={2.4} />
					</button>
				</div>
			</div>

			{/* Interactive Viewport Canvas */}
			<div
				className="wallpaper-framing-canvas-area"
				onWheel={handleWheel}
				onMouseDown={handleMouseDown}
			>
				<div
					ref={viewportRef}
					className="wallpaper-framing-viewport"
					style={{
						width: VIEWPORT_WIDTH,
						height: VIEWPORT_HEIGHT,
					}}
				>
					<img
						ref={imgRef}
						src={wallpaperPath.startsWith("data:") ? wallpaperPath : `https://asset.localhost/${wallpaperPath}`}
						alt={wallpaperName}
						draggable={false}
						onLoad={handleImageLoad}
						style={{
							transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
							transformOrigin: "center center",
							opacity: imageLoaded ? 1 : 0.4,
						}}
						className="wallpaper-framing-image"
						onError={(e) => {
							// Fallback directly to file if asset protocol fails
							const target = e.currentTarget;
							if (!target.src.startsWith("data:")) {
								invoke<string | null>("wallpaper_thumbnail", { path: wallpaperPath })
									.then((thumb) => {
										if (thumb) target.src = thumb;
									})
									.catch(() => {});
							}
						}}
					/>

					{/* 3x3 Composition Guidelines */}
					<div className="wallpaper-framing-grid" aria-hidden="true">
						<div className="grid-cell border-r border-b" />
						<div className="grid-cell border-r border-b" />
						<div className="grid-cell border-b" />
						<div className="grid-cell border-r border-b" />
						<div className="grid-cell border-r border-b" />
						<div className="grid-cell border-b" />
						<div className="grid-cell border-r" />
						<div className="grid-cell border-r" />
						<div className="grid-cell" />
					</div>

					<div className="wallpaper-framing-drag-hint">
						Drag to pan position • Scroll wheel to zoom
					</div>
				</div>
			</div>

			{/* Bottom Controls Bar */}
			<div className="wallpaper-framing-footer">
				<div className="wallpaper-framing-zoom-controls">
					<ZoomIn size={12} className="wallpaper-zoom-icon" />
					<span className="wallpaper-zoom-label">Zoom:</span>
					<input
						type="range"
						min="1.0"
						max="3.0"
						step="0.05"
						value={zoom}
						onChange={(e) => setZoom(parseFloat(e.target.value))}
						className="wallpaper-zoom-slider"
					/>
					<span className="wallpaper-zoom-value">{zoom.toFixed(1)}x</span>
				</div>

				<div className="wallpaper-framing-footer-actions">
					<button
						type="button"
						className="wallpaper-btn-cancel"
						onClick={onClose}
					>
						Cancel
					</button>

					<button
						type="button"
						className="wallpaper-btn-apply"
						onClick={handleApply}
						disabled={isApplying}
					>
						<Check size={13} strokeWidth={2.8} />
						<span>{isApplying ? "Applying..." : "Apply to Desktop"}</span>
					</button>
				</div>
			</div>
		</div>
	);
}
