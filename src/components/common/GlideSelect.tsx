import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import "./GlideSelect.css";

const SIZES = {
	sm: { chip: 26, row: 24, font: 11 },
	md: { chip: 30, row: 28, font: 12 },
	lg: { chip: 38, row: 34, font: 13 }
};
const PAD = 4;
const GAP = 1;
const MENU_GAP = 6;
const DEFAULT_OPTIONS = ["One", "Two", "Three"];

export interface GlideOption {
	value: string;
	label: string;
	tag?: string;
}

export type GlideOptionInput = string | GlideOption;

const norm = (o: GlideOptionInput): GlideOption =>
	typeof o === "string" ? { value: o, label: o } : o;

const textOf = (it: GlideOption) => (typeof it.label === "string" ? it.label : it.value);

const typeaheadIndex = (items: GlideOption[], from: number, ch: string) => {
	const c = ch.toLowerCase();
	const n = items.length;
	for (let k = 1; k <= n; k++) {
		const i = (from + k) % n;
		if (textOf(items[i]).toLowerCase().startsWith(c)) return i;
	}
	return from;
};

export interface GlideSelectProps {
	options?: GlideOptionInput[];
	value?: string;
	defaultValue?: string;
	onChange?: (value: string, option: GlideOption) => void;
	placeholder?: string;
	showTags?: boolean;
	accentColor?: string;
	surfaceColor?: string;
	highlightColor?: string;
	textColor?: string;
	size?: "sm" | "md" | "lg";
	radius?: number;
	menuWidth?: number;
	placement?: "bottom" | "top";
	align?: "left" | "right";
	popDuration?: number;
	glideDuration?: number;
	rememberPosition?: boolean;
	disabled?: boolean;
	ariaLabel?: string;
	className?: string;
	prefix?: string;
	icon?: React.ReactNode;
	onOpenChange?: (open: boolean) => void;
}

export default function GlideSelect({
	options = DEFAULT_OPTIONS,
	value,
	defaultValue,
	onChange,
	placeholder = "Select…",
	showTags = true,
	accentColor = "var(--bloom-accent, #6B5290)",
	surfaceColor = "rgba(22, 18, 32, 0.96)",
	highlightColor = "rgba(107, 82, 144, 0.3)",
	textColor = "var(--bloom-text, #f5f5f5)",
	size = "sm",
	radius = 8,
	menuWidth = 160,
	placement = "bottom",
	align = "right",
	popDuration = 180,
	glideDuration = 220,
	rememberPosition = true,
	disabled = false,
	ariaLabel = "Select",
	className = "",
	prefix,
	icon,
	onOpenChange
}: GlideSelectProps) {
	const items = options.map(norm);
	const [inner, setInner] = useState(defaultValue ?? "");
	const current = value !== undefined ? value : inner;
	const selected = items.findIndex((it) => it.value === current);
	const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
	const [active, setActive] = useState<number | null>(null);
	const [side, setSide] = useState(placement);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const pillRef = useRef<HTMLSpanElement>(null);
	const instant = useRef(false);
	const closeTimer = useRef<any>(undefined);
	const scrub = useRef<{ id: number; top: number } | null>(null);
	const id = useId();
	const S = SIZES[size] ?? SIZES.sm;
	const step = S.row + GAP;
	const popOut = Math.round((popDuration * 2) / 3);

	useLayoutEffect(() => {
		if (phase !== "open") return;
		const el = menuRef.current;
		const root = rootRef.current;
		if (!el || !root) return;
		const r = root.getBoundingClientRect();
		const need = el.offsetHeight + MENU_GAP;
		setSide(
			placement === "bottom" && r.bottom + need > window.innerHeight
				? "top"
				: placement === "top" && r.top - need < 0
					? "bottom"
					: placement
		);
		el.style.transitionDuration = instant.current ? "0ms" : "";
		el.dataset.state = "closed";
		void el.offsetHeight;
		el.dataset.state = "open";
		const p = pillRef.current;
		if (p) {
			p.style.transition = "none";
			p.style.transform = `translateY(${Math.max(0, selected) * step}px)`;
			p.style.opacity = "0";
			void p.offsetHeight;
			p.style.transition = "";
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase]);

	useLayoutEffect(() => {
		const p = pillRef.current;
		if (!p || phase !== "open") return;
		if (active === null) {
			p.style.opacity = "0";
			return;
		}
		const jump = instant.current || p.style.opacity !== "1";
		p.style.transitionDuration = jump ? "0ms, 150ms" : "";
		p.style.transform = `translateY(${active * step}px)`;
		p.style.opacity = "1";
		instant.current = false;
	}, [active, phase, step]);

	const open = (viaKey: boolean) => {
		if (disabled) return;
		clearTimeout(closeTimer.current);
		instant.current = true;
		setActive(selected >= 0 ? selected : viaKey ? 0 : null);
		setPhase("open");
	};

	const close = (mode: "instant" | "pop") => {
		setActive(null);
		clearTimeout(closeTimer.current);
		const el = menuRef.current;
		if (mode === "instant" || !el) {
			setPhase("closed");
			return;
		}
		el.style.transitionDuration = "";
		el.dataset.state = "closed";
		setPhase("closing");
		closeTimer.current = setTimeout(() => setPhase("closed"), popOut + 20);
	};

	const pick = (i: number, viaKey: boolean) => {
		const it = items[i];
		if (!it) {
			close("instant");
			return;
		}
		if (it.value !== current) {
			if (value === undefined) setInner(it.value);
			onChange?.(it.value, it);
			if (!viaKey && rootRef.current) rootRef.current.dataset.swap = "";
		}
		close("instant");
		triggerRef.current?.focus({ preventScroll: true });
	};

	const onTriggerKey = (e: React.KeyboardEvent) => {
		const k = e.key;
		const n = items.length;
		const cur = active ?? Math.max(0, selected);
		if (phase !== "open") {
			if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") {
				e.preventDefault();
				open(true);
			}
			return;
		}
		const go = (i: number) => {
			e.preventDefault();
			instant.current = true;
			setActive(Math.min(n - 1, Math.max(0, i)));
		};
		if (k === "ArrowDown" || k === "ArrowUp")
			go(active === null ? cur : cur + (k === "ArrowDown" ? 1 : -1));
		else if (k === "Home" || k === "End") go(k === "Home" ? 0 : n - 1);
		else if (k === "Enter" || k === " ") {
			e.preventDefault();
			pick(cur, true);
		} else if (k === "Escape" || k === "Tab") {
			if (k === "Escape") e.preventDefault();
			close("instant");
		} else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey)
			go(typeaheadIndex(items, cur, k));
	};

	useEffect(() => {
		if (phase === "closed") return undefined;
		const onDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) close("pop");
		};
		document.addEventListener("pointerdown", onDown, true);
		return () => document.removeEventListener("pointerdown", onDown, true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase]);

	useEffect(() => {
		onOpenChange?.(phase === "open");
	}, [phase, onOpenChange]);

	useEffect(() => {
		if (disabled && phase !== "closed") close("instant");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [disabled]);

	useEffect(() => () => clearTimeout(closeTimer.current), []);

	const rowAt = (y: number) => {
		const s = scrub.current;
		if (!s) return null;
		const i = Math.floor((y - s.top - PAD) / step);
		return i >= 0 && i < items.length ? i : null;
	};

	const onListDown = (e: React.PointerEvent) => {
		if (scrub.current) return;
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {}
		scrub.current = { id: e.pointerId, top: e.currentTarget.getBoundingClientRect().top };
		instant.current = true;
		setActive(rowAt(e.clientY));
	};

	const onListMove = (e: React.PointerEvent) => {
		if (!scrub.current || scrub.current.id !== e.pointerId) return;
		const i = rowAt(e.clientY);
		if (i !== active) setActive(i);
	};

	const onListUp = (e: React.PointerEvent) => {
		if (!scrub.current || scrub.current.id !== e.pointerId) return;
		const i = e.type === "pointerup" ? rowAt(e.clientY) : null;
		scrub.current = null;
		if (i !== null) pick(i, false);
		else if (!rememberPosition) setActive(null);
	};

	const onListOver = (e: React.PointerEvent) => {
		if (e.pointerType === "touch" || scrub.current) return;
		const target = e.target as HTMLElement;
		const row = target.closest("[data-index]") as HTMLElement | null;
		if (!row) return;
		const i = Number(row.dataset.index);
		if (i !== active) setActive(i);
	};

	const origin = `${side === "bottom" ? "top" : "bottom"} ${align}`;
	return (
		<div
			ref={rootRef}
			className={`glide-select${className ? ` ${className}` : ""}`}
			data-size={size}
			data-disabled={disabled ? "" : undefined}
			data-open={phase === "open" ? "" : undefined}
			style={
				{
					"--gs-accent": accentColor,
					"--gs-surface": surfaceColor,
					"--gs-highlight": highlightColor,
					"--gs-text": textColor,
					"--gs-radius": `${radius}px`,
					"--gs-inner-radius": `${Math.max(3, radius - 3)}px`,
					"--gs-chip": `${S.chip}px`,
					"--gs-row": `${S.row}px`,
					"--gs-font": `${S.font}px`,
					"--gs-menu-w": `${menuWidth}px`,
					"--gs-pop": `${popDuration}ms`,
					"--gs-pop-out": `${popOut}ms`,
					"--gs-glide": `${glideDuration}ms`,
					"--gs-origin": origin
				} as React.CSSProperties
			}
			onAnimationEnd={(e) => {
				if (e.animationName === "gs-swap" && rootRef.current) delete rootRef.current.dataset.swap;
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				role="combobox"
				aria-haspopup="listbox"
				aria-expanded={phase === "open"}
				aria-controls={`${id}-list`}
				aria-activedescendant={active !== null ? `${id}-${active}` : undefined}
				aria-label={ariaLabel}
				disabled={disabled}
				className="glide-select__trigger"
				onPointerDown={(e) => {
					if (e.button !== 0 || disabled) return;
					e.currentTarget.focus({ preventScroll: true });
					if (phase === "open") close("pop");
					else open(false);
				}}
				onKeyDown={onTriggerKey}
			>
				{icon && <span className="glide-select__icon">{icon}</span>}
				<span
					className="glide-select__label"
					key={current}
					data-empty={selected < 0 ? "" : undefined}
				>
					{selected >= 0
						? prefix
							? `${prefix}${items[selected].label}`
							: items[selected].label
						: placeholder}
				</span>
				<span className="glide-select__chevron" aria-hidden="true">
					<ChevronDown size={11} strokeWidth={2.5} />
				</span>
			</button>
			{phase !== "closed" ? (
				<div
					ref={menuRef}
					className="glide-select__menu"
					data-state="open"
					data-side={side}
					data-align={align}
				>
					<div
						id={`${id}-list`}
						role="listbox"
						aria-label={ariaLabel}
						className="glide-select__list"
						data-live={active !== null ? "" : undefined}
						onPointerOver={onListOver}
						onPointerLeave={() => {
							if (!scrub.current && !rememberPosition) setActive(null);
						}}
						onPointerDown={onListDown}
						onPointerMove={onListMove}
						onPointerUp={onListUp}
						onPointerCancel={onListUp}
						onLostPointerCapture={onListUp}
					>
						<span ref={pillRef} className="glide-select__pill" aria-hidden="true" />
						{items.map((it, i) => (
							<div
								key={it.value}
								id={`${id}-${i}`}
								role="option"
								aria-selected={i === selected}
								data-index={i}
								className="glide-select__option"
							>
								<span className="glide-select__name">{it.label}</span>
								{showTags && it.tag ? <span className="glide-select__tag">{it.tag}</span> : null}
								<span
									className="glide-select__check"
									data-on={i === selected ? "" : undefined}
									aria-hidden="true"
								>
									<Check size={12} strokeWidth={2.5} />
								</span>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
