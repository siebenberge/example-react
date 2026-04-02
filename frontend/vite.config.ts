import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => {
	return {
		plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
	};
});
