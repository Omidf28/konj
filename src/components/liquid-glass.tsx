"use client";
import { useEffect } from "react";
/** A shared, event-driven light reflection. No idle animation loop or React rerender per pointer move. */
export function LiquidGlass() {
    useEffect(() => {
        const fine = matchMedia("(hover: hover) and (pointer: fine)");
        const reduce = matchMedia("(prefers-reduced-motion: reduce)");
        const opaque = matchMedia("(prefers-reduced-transparency: reduce)");
        let current: HTMLElement | null = null, frame = 0, x = 0, y = 0;
        const reset = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            current?.style.removeProperty("--glass-x");
            current?.style.removeProperty("--glass-y");
            current = null;
        };
        const move = (event: PointerEvent) => {
            if (!fine.matches || reduce.matches || opaque.matches || document.hidden) {
                reset();
                return;
            }
            const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-liquid]") : null;
            if (current !== target) {
                reset();
                current = target;
            }
            if (!current)
                return;
            x = event.clientX;
            y = event.clientY;
            if (!frame)
                frame = requestAnimationFrame(() => {
                    frame = 0;
                    if (!current?.isConnected) {
                        reset();
                        return;
                    }
                    const box = current.getBoundingClientRect();
                    current.style.setProperty("--glass-x", ((x - box.left) / Math.max(1, box.width) * 100).toFixed(2) + "%");
                    current.style.setProperty("--glass-y", ((y - box.top) / Math.max(1, box.height) * 100).toFixed(2) + "%");
                });
        };
        document.addEventListener("pointermove", move, { passive: true });
        document.addEventListener("pointerleave", reset);
        document.addEventListener("visibilitychange", reset);
        window.addEventListener("blur", reset);
        for (const query of [fine, reduce, opaque])
            query.addEventListener("change", reset);
        return () => {
            reset();
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerleave", reset);
            document.removeEventListener("visibilitychange", reset);
            window.removeEventListener("blur", reset);
            for (const query of [fine, reduce, opaque])
                query.removeEventListener("change", reset);
        };
    }, []);
    return null;
}
