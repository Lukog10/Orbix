import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Crop, ZoomIn, RotateCcw, X, Check, Maximize, Minimize } from "lucide-react";

export interface WallpaperFramingModalProps {
	wallpaperPath: string;
	wallpaperName: string;
	initialThumbnail?: string;
	onClose: () => void;
	onApplied: (newPath: string) => void;
}

export function WallpaperFramingModal({
	wallpaperPath,
	wallpaperName,
	initialThumbnail,
	onClose,
	onApplied
}: WallpaperFramingModalProps) {
	const [fitMode, setFitMode] = useState<"fit" | "fill">("fit");
	const [zoom, setZoom] = useState<number>(1.0);
	const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const [isApplying, setIsApplying] = useState<boolean>(false);
	const [imageLoaded, setImageLoaded] = useState<boolean>(false);
	const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

	const isDraggingRef = useRef<boolean>(false);
	const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
		x: 0,
		y: 0,
		panX: 0,
		panY: 0
	});

	// Determine image source: prefer converted file source, fallback to initial thumbnail
	const [imgSrc, setImgSrc] = useState<string>(() => {
		if (wallpaperPath.startsWith("data:")) return wallpaperPath;
		try {
			return convertFileSrc(wallpaperPath);
		} catch {
			return initialThumbnail || "";
		}
	});

	// Monitor aspect ratio (defaults to 16:9 if window.screen is missing)
	const screenRatio = useMemo(() => {
		if (typeof window !== "undefined" && window.screen.width && window.screen.height) {
			return window.screen.width / window.screen.height;
		}
		return 16 / 9;
	}, []);

	// Target framing viewport dimensions inside the 480px-tall modal
	// Height 270px yields 480px width at 16:9 (fits comfortably within 940px wide notch)
	const FRAME_HEIGHT = 270;
	const FRAME_WIDTH = Math.min(680, Math.round(FRAME_HEIGHT * screenRatio));

	// Calculate base dimensions when fitted vs filled
	const { baseWidth, baseHeight } = useMemo(() => {
		if (!naturalSize || naturalSize.width === 0 || naturalSize.height === 0) {
			return { baseWidth: FRAME_WIDTH, baseHeight: FRAME_HEIGHT };
		}
		const imgRatio = naturalSize.width / naturalSize.height;

		if (fitMode === "fit") {
			// Show entire wallpaper inside the frame (100% visible)
			if (imgRatio >= screenRatio) {
				const w = FRAME_WIDTH;
				const h = Math.round(FRAME_WIDTH / imgRatio);
				return { baseWidth: w, baseHeight: h };
			} else {
				const h = FRAME_HEIGHT;
				const w = Math.round(FRAME_HEIGHT * imgRatio);
				return { baseWidth: w, baseHeight: h };
			}
		} else {
			// Cover / fill the entire frame
			if (imgRatio >= screenRatio) {
				const h = FRAME_HEIGHT;
				const w = Math.round(FRAME_HEIGHT * imgRatio);
				return { baseWidth: w, baseHeight: h };
			} else {
				const w = FRAME_WIDTH;
				const h = Math.round(FRAME_WIDTH / imgRatio);
				return { baseWidth: w, baseHeight: h };
			}
		}
	}, [naturalSize, fitMode, screenRatio, FRAME_WIDTH, FRAME_HEIGHT]);

	// Displayed dimensions with zoom applied
	const dispW = Math.round(baseWidth * zoom);
	const dispH = Math.round(baseHeight * zoom);

	// Image coordinates relative to the frame's top-left corner [0, 0]
	const imgLeft = Math.round((FRAME_WIDTH - dispW) / 2 + pan.x);
	const imgTop = Math.round((FRAME_HEIGHT - dispH) / 2 + pan.y);

	const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		const target = e.currentTarget;
		if (target.naturalWidth > 0 && target.naturalHeight > 0) {
			setNaturalSize({
				width: target.naturalWidth,
				height: target.naturalHeight
			});
			setImageLoaded(true);
		}
	};

	// Reset pan and zoom to center
	const handleReset = () => {
		setZoom(1.0);
		setPan({ x: 0, y: 0 });
	};

	// Switch to Fit mode (full image length visible)
	const handleSetFit = () => {
		setFitMode("fit");
		setZoom(1.0);
		setPan({ x: 0, y: 0 });
	};

	// Switch to Fill mode (crop frame covered edge-to-edge)
	const handleSetFill = () => {
		setFitMode("fill");
		setZoom(1.0);
		setPan({ x: 0, y: 0 });
	};

	// Dragging handlers for smooth pan
	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		isDraggingRef.current = true;
		dragStartRef.current = {
			x: e.clientX,
			y: e.clientY,
			panX: pan.x,
			panY: pan.y
		};
	};

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (!isDraggingRef.current) return;
		const deltaX = e.clientX - dragStartRef.current.x;
		const deltaY = e.clientY - dragStartRef.current.y;
		setPan({
			x: dragStartRef.current.panX + deltaX,
			y: dragStartRef.current.panY + deltaY
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

	// Mouse wheel zoom (zoom range: 0.5x to 3.0x)
	const handleWheel = (e: React.WheelEvent) => {
		e.stopPropagation();
		const delta = -Math.sign(e.deltaY) * 0.08;
		setZoom((prev) => Math.min(3.0, Math.max(0.5, parseFloat((prev + delta).toFixed(2)))));
	};

	// Calculate normalized crop coordinates [0.0, 1.0] and call backend
	const handleApply = async () => {
		if (dispW <= 0 || dispH <= 0) return;
		setIsApplying(true);

		try {
			// Find visible intersection of image within the target frame [0, FRAME_WIDTH] x [0, FRAME_HEIGHT]
			const visibleLeft = Math.max(0, -imgLeft);
			const visibleTop = Math.max(0, -imgTop);
			const visibleRight = Math.min(dispW, FRAME_WIDTH - imgLeft);
			const visibleBottom = Math.min(dispH, FRAME_HEIGHT - imgTop);

			let crop_x = 0;
			let crop_y = 0;
			let crop_w = 1.0;
			let crop_h = 1.0;

			if (visibleRight > visibleLeft && visibleBottom > visibleTop) {
				crop_x = visibleLeft / dispW;
				crop_y = visibleTop / dispH;
				crop_w = (visibleRight - visibleLeft) / dispW;
				crop_h = (visibleBottom - visibleTop) / dispH;
			}

			// Clamp to valid [0.0, 1.0] bounds
			const final_crop_x = Math.max(0.0, Math.min(1.0, crop_x));
			const final_crop_y = Math.max(0.0, Math.min(1.0, crop_y));
			const final_crop_w = Math.max(0.01, Math.min(1.0 - final_crop_x, crop_w));
			const final_crop_h = Math.max(0.01, Math.min(1.0 - final_crop_y, crop_h));

			const newPath = await invoke<string>("set_custom_crop_wallpaper", {
				path: wallpaperPath,
				cropX: final_crop_x,
				cropY: final_crop_y,
				cropW: final_crop_w,
				cropH: final_crop_h
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
						<Crop size={12} strokeWidth={2.4} />
						<span>Custom Framing</span>
					</div>
					<span className="wallpaper-framing-filename" title={wallpaperName}>
						{wallpaperName}
					</span>
					<span className="wallpaper-framing-screen-ratio">
						Screen: {Math.round(screenRatio * 9)}:9 ({window.screen.width}x{window.screen.height})
					</span>
					{naturalSize && (
						<span className="wallpaper-framing-dimensions">
							{naturalSize.width}×{naturalSize.height}
						</span>
					)}
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
				{/* Crop Frame (Target Desktop Aspect Ratio) */}
				<div
					className="wallpaper-framing-viewport-container"
					style={{
						width: FRAME_WIDTH,
						height: FRAME_HEIGHT
					}}
				>
					{/* Image positioned relative to frame coordinate system */}
					<img
						src={imgSrc}
						alt={wallpaperName}
						draggable={false}
						onLoad={handleImageLoad}
						style={{
							position: "absolute",
							left: `${imgLeft}px`,
							top: `${imgTop}px`,
							width: `${dispW}px`,
							height: `${dispH}px`,
							maxWidth: "none",
							maxHeight: "none",
							opacity: imageLoaded ? 1 : 0.4,
							transition: isDraggingRef.current ? "none" : "opacity 0.2s ease",
							userSelect: "none",
							pointerEvents: "none"
						}}
						className="wallpaper-framing-image"
						onError={() => {
							if (initialThumbnail && imgSrc !== initialThumbnail) {
								setImgSrc(initialThumbnail);
							} else if (!imgSrc.startsWith("data:")) {
								invoke<string | null>("wallpaper_thumbnail", { path: wallpaperPath })
									.then((thumb) => {
										if (thumb) setImgSrc(thumb);
									})
									.catch(() => {});
							}
						}}
					/>

					{/* Target Desktop Frame Overlay with Dimmed Backdrop Mask */}
					<div className="wallpaper-framing-viewport-mask">
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
					</div>

					<div className="wallpaper-framing-drag-hint">
						Drag to pan position • Scroll wheel to zoom
					</div>
				</div>
			</div>

			{/* Bottom Controls Bar */}
			<div className="wallpaper-framing-footer">
				{/* Mode Toggles & Zoom Controls */}
				<div className="wallpaper-framing-footer-left">
					{/* Fit Mode Toggle Pills */}
					<div className="wallpaper-framing-mode-group">
						<button
							type="button"
							className={`wallpaper-framing-mode-btn ${fitMode === "fit" ? "is-active" : ""}`}
							onClick={handleSetFit}
							title="Fit full image (shows complete length)"
						>
							<Minimize size={12} strokeWidth={2.2} />
							<span>Fit All</span>
						</button>
						<button
							type="button"
							className={`wallpaper-framing-mode-btn ${fitMode === "fill" ? "is-active" : ""}`}
							onClick={handleSetFill}
							title="Fill desktop frame (edge-to-edge crop)"
						>
							<Maximize size={12} strokeWidth={2.2} />
							<span>Fill Frame</span>
						</button>
					</div>

					{/* Zoom Controls */}
					<div className="wallpaper-framing-zoom-controls">
						<ZoomIn size={12} className="wallpaper-zoom-icon" />
						<span className="wallpaper-zoom-label">Zoom:</span>
						<input
							type="range"
							min="0.5"
							max="3.0"
							step="0.05"
							value={zoom}
							onChange={(e) => setZoom(parseFloat(e.target.value))}
							className="wallpaper-zoom-slider"
						/>
						<span className="wallpaper-zoom-value">{zoom.toFixed(2)}x</span>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="wallpaper-framing-footer-actions">
					<button type="button" className="wallpaper-btn-cancel" onClick={onClose}>
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
