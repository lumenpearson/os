//! The rules a page view has to obey before the host will open one.
//!
//! A page view is a second, real web view placed inside the desktop window at
//! the rectangle the browser app reserves for the page. It shows the open web,
//! so everything that crosses the boundary from the interface into it is
//! checked here rather than at the call site: the address it may be pointed
//! at, the name it is given, and the rectangle it is put in.
//!
//! None of this needs a window to run, so all of it is tested.

use crate::error::{KernelError, Result};

/// The prefix every page view's label carries. It keeps the views apart from
/// the interface's own web view, whose label is `main`, and makes a stray one
/// obvious in a crash report.
pub const VIEW_PREFIX: &str = "page-";

/// The schemes a page view may be pointed at.
///
/// `http` and `https` are the web. `about:blank` is the empty page a view is
/// parked on while a tab has no address yet. Everything else — `file:` reading
/// the disk, `javascript:` running in whatever page is open, `lumen:` and
/// `tauri:` reaching the interface's own protocol — is refused, because a page
/// view is driven by whatever the open web hands it.
const ALLOWED: [&str; 2] = ["http://", "https://"];

/// The blank page a view is parked on.
pub const BLANK: &str = "about:blank";

/// Check an address before a view is pointed at it.
pub fn checked_url(url: &str) -> Result<&str> {
    let url = url.trim();
    if url.eq_ignore_ascii_case(BLANK) {
        return Ok(BLANK);
    }
    let lower = url.to_ascii_lowercase();
    if !ALLOWED.iter().any(|scheme| lower.starts_with(scheme)) {
        return Err(KernelError::invalid(
            url,
            "a page view opens http and https addresses only",
        ));
    }
    if url.chars().any(char::is_control) {
        return Err(KernelError::invalid(
            url,
            "address contains control characters",
        ));
    }
    Ok(url)
}

/// Turn a tab's identifier into a web view label.
///
/// Tauri labels are matched against capability patterns, so a label that could
/// carry a `/` or a `:` could name a view a capability was written for. The id
/// is kept to letters, digits, dashes and underscores; anything else is a
/// mistake in the caller rather than something to paper over.
pub fn checked_label(id: &str) -> Result<String> {
    if id.is_empty() || id.len() > 64 {
        return Err(KernelError::invalid(
            id,
            "a page view id is between 1 and 64 characters",
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(KernelError::invalid(
            id,
            "a page view id is letters, digits, dashes and underscores",
        ));
    }
    Ok(format!("{VIEW_PREFIX}{id}"))
}

/// Where a page view sits inside the window, in the interface's own pixels.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct ViewRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl ViewRect {
    /// A rectangle the window manager will accept.
    ///
    /// The interface measures with `getBoundingClientRect`, which returns
    /// fractions, and returns zero for an element that is not laid out yet.
    /// A view is never given a negative or empty size — on Windows that is a
    /// resize the compositor refuses, and the view keeps whatever it had —
    /// so an unlaid-out rectangle becomes a single pixel out of sight instead.
    #[must_use]
    pub fn sane(self) -> ViewRect {
        let finite = |v: f64| if v.is_finite() { v } else { 0.0 };
        let width = finite(self.width).max(1.0);
        let height = finite(self.height).max(1.0);
        ViewRect {
            x: finite(self.x).max(0.0),
            y: finite(self.y).max(0.0),
            width,
            height,
        }
    }
}

/// A zoom factor the view will accept. Matches the range the browser app's
/// own zoom offers, so a value from somewhere else cannot shrink a page to
/// nothing or blow it up until the window cannot be used.
#[must_use]
pub fn sane_zoom(factor: f64) -> f64 {
    if !factor.is_finite() {
        return 1.0;
    }
    factor.clamp(0.25, 5.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[test]
    fn takes_web_addresses_and_the_blank_page() {
        for url in [
            "https://example.com/a?b=c#d",
            "http://localhost:5173/",
            "HTTPS://EXAMPLE.COM",
            "  https://example.com  ",
        ] {
            assert_eq!(checked_url(url).unwrap(), url.trim(), "{url}");
        }
        assert_eq!(checked_url("about:blank").unwrap(), BLANK);
        assert_eq!(checked_url("ABOUT:BLANK").unwrap(), BLANK);
    }

    #[test]
    fn refuses_every_other_scheme() {
        for url in [
            "file:///C:/Windows/System32",
            "javascript:alert(1)",
            "data:text/html,<script>",
            "lumen://localhost/index.html",
            "tauri://localhost",
            "//example.com",
            "example.com",
            "",
        ] {
            assert_eq!(
                checked_url(url).unwrap_err().code,
                ErrorCode::Einval,
                "{url}"
            );
        }
    }

    #[test]
    fn refuses_control_characters_in_an_address() {
        assert_eq!(
            checked_url("https://example.com/\nfoo").unwrap_err().code,
            ErrorCode::Einval
        );
    }

    #[test]
    fn labels_are_prefixed_and_plain() {
        assert_eq!(checked_label("t1").unwrap(), "page-t1");
        assert_eq!(checked_label("a_B-9").unwrap(), "page-a_B-9");
    }

    #[test]
    fn refuses_a_label_that_could_name_something_else() {
        for id in ["", "main", "a/b", "a:b", "a b", "a*", "тab"] {
            if id == "main" {
                // A plain id is fine; the prefix is what keeps it apart.
                assert_eq!(checked_label(id).unwrap(), "page-main");
                continue;
            }
            assert_eq!(
                checked_label(id).unwrap_err().code,
                ErrorCode::Einval,
                "{id}"
            );
        }
        assert_eq!(
            checked_label(&"x".repeat(65)).unwrap_err().code,
            ErrorCode::Einval
        );
    }

    #[test]
    fn a_rectangle_is_never_empty_or_off_the_top_left() {
        let r = ViewRect {
            x: -10.0,
            y: -1.0,
            width: 0.0,
            height: -5.0,
        }
        .sane();
        assert_eq!(
            r,
            ViewRect {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0
            }
        );
    }

    #[test]
    fn a_rectangle_that_is_not_a_number_is_not_passed_on() {
        let r = ViewRect {
            x: f64::NAN,
            y: 12.5,
            width: f64::INFINITY,
            height: 300.0,
        }
        .sane();
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, 12.5);
        assert_eq!(r.width, 1.0);
        assert_eq!(r.height, 300.0);
    }

    #[test]
    fn zoom_stays_within_reach() {
        assert!((sane_zoom(1.0) - 1.0).abs() < f64::EPSILON);
        assert!((sane_zoom(0.0) - 0.25).abs() < f64::EPSILON);
        assert!((sane_zoom(99.0) - 5.0).abs() < f64::EPSILON);
        assert!((sane_zoom(f64::NAN) - 1.0).abs() < f64::EPSILON);
    }
}
