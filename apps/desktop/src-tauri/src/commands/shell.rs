//! Host shell integration: external links, the file manager, and quitting.

use std::sync::Mutex;

use lumen_kernel::{KernelError, Sandbox};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::lock;

const ALLOWED_SCHEMES: [&str; 3] = ["http://", "https://", "mailto:"];

/// Open a link in the default browser or mail client. Only `http`, `https`
/// and `mailto` are accepted; anything else could start a program.
#[tauri::command]
pub async fn shell_open_external(url: String, app: AppHandle) -> Result<(), KernelError> {
    let url = checked_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| KernelError::host(format!("cannot open link: {err}")))
}

/// The guard for `shell_open_external`: trim, allow only the three safe
/// schemes, and refuse control characters, which some handlers treat as
/// argument separators.
fn checked_url(url: &str) -> Result<&str, KernelError> {
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    if !ALLOWED_SCHEMES
        .iter()
        .any(|scheme| lower.starts_with(scheme))
    {
        return Err(KernelError::invalid(
            url,
            "only http, https and mailto links can be opened",
        ));
    }
    if url.chars().any(char::is_control) {
        return Err(KernelError::invalid(
            url,
            "link contains control characters",
        ));
    }
    Ok(url)
}

/// Show the home directory in the host file manager.
#[tauri::command]
pub async fn shell_reveal_home(
    app: AppHandle,
    sandbox: State<'_, Mutex<Sandbox>>,
) -> Result<(), KernelError> {
    let root = lock(&sandbox)?.root().to_path_buf();
    let opener = app.opener();
    opener
        .open_path(root.to_string_lossy(), None::<&str>)
        .or_else(|_| opener.reveal_item_in_dir(&root))
        .map_err(|err| KernelError::host(format!("cannot open the home directory: {err}")))
}

#[tauri::command]
pub async fn app_quit(app: AppHandle) -> Result<(), KernelError> {
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lumen_kernel::ErrorCode;

    #[test]
    fn accepts_web_and_mail_links() {
        for url in [
            "https://example.com/a?b=c#d",
            "http://localhost:5174/",
            "mailto:someone@example.com?subject=Hi",
            "HTTPS://EXAMPLE.COM",
            "  https://example.com  ",
        ] {
            assert_eq!(checked_url(url).unwrap(), url.trim(), "{url}");
        }
    }

    #[test]
    fn rejects_other_schemes_and_control_characters() {
        for url in [
            "file:///C:/Windows/System32",
            "javascript:alert(1)",
            "data:text/html,<script>",
            "ms-settings:privacy",
            "//example.com",
            "example.com",
            "",
        ] {
            let err = checked_url(url).unwrap_err();
            assert_eq!(err.code, ErrorCode::Einval, "{url}");
        }
        assert_eq!(
            checked_url("https://example.com/\nfoo").unwrap_err().code,
            ErrorCode::Einval
        );
    }
}
