//! Entry point. Everything lives in the library crate so the same code backs
//! the `staticlib`/`cdylib` targets Tauri's tooling expects.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lumen_desktop_lib::run();
}
