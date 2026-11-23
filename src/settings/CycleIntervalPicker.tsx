import React from "react";
import { Minus, Plus } from "lucide-react";
import GlideSelect from "../components/common/GlideSelect";

interface CycleIntervalPickerProps {
	value: string;
	unit: string;
	onValueChange: (val: string) => void;
	onUnitChange: (unit: string) => void;
}

export function CycleIntervalPicker({
	value,
	unit,
	onValueChange,
	onUnitChange
}: CycleIntervalPickerProps) {
	const num = parseInt(value, 10) || 1;

	const handleStep = (delta: number) => {
		const next = Math.max(1, Math.min(999, num + delta));
		onValueChange(String(next));
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value.replace(/\D/g, "");
		if (raw === "") {
			onValueChange("1");
		} else {
			const n = Math.min(999, Math.max(1, parseInt(raw, 10)));
			onValueChange(String(n));
		}
	};

	return (
		<div className="settings-duration-picker">
			<button
				type="button"
				className="duration-step-btn"
				onClick={() => handleStep(-1)}
				disabled={num <= 1}
				title="Decrease interval"
			>
				<Minus size={11} strokeWidth={2.5} />
			</button>
			<input
				type="text"
				inputMode="numeric"
				pattern="[0-9]*"
				className="duration-num-input"
				value={value}
				onChange={handleInputChange}
				title="Interval duration number"
			/>
			<button
				type="button"
				className="duration-step-btn"
				onClick={() => handleStep(1)}
				disabled={num >= 999}
				title="Increase interval"
			>
				<Plus size={11} strokeWidth={2.5} />
			</button>
			<div className="duration-divider" />
			<GlideSelect
				value={unit || "minutes"}
				options={[
					{ value: "seconds", label: "Seconds", tag: "Fast" },
					{ value: "minutes", label: "Minutes", tag: "Normal" },
					{ value: "hours", label: "Hours", tag: "Slow" }
				]}
				onChange={(val) => onUnitChange(val)}
				size="sm"
				radius={6}
				menuWidth={136}
				align="right"
				className="duration-glide-select"
			/>
		</div>
	);
}
