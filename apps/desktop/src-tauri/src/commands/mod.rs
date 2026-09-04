//! Tauri command wrappers, one module per section of the platform contract
//! in `packages/platform/src/tauri.ts`. Each command parses its arguments,
//! locks the managed state, calls `lumen_kernel` and returns
//! `Result<_, KernelError>`, which Tauri serialises for the front end.
//! Commands are `async` so they run on the runtime's thread pool rather
//! than the UI thread.

pub mod config;
pub mod fs;
pub mod shell;
pub mod system;
