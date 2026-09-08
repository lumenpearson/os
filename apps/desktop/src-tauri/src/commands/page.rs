//! A real web view for the browser app.
//!
//! Most of the web cannot be shown in an iframe. A site that sends
//! `X-Frame-Options` or a `frame-ancestors` policy is turned away by the
//! engine before the page ever runs, and no amount of work inside the
//! interface changes that answer. On the desktop there is a way round it that
//! is not a trick: the host puts a second, real web view inside the same
//! window, over the rectangle the browser app has reserved for the page. That
//! view is a browser — every site, its own cookies, its own scripts, its own
//! history.
//!
//! The view is a native surface, so it is drawn above the interface rather
//! than inside it. Everything that follows from that — hiding it when a Lumen
//! window covers the area, moving it when the window moves — is decided in
//! the interface, which knows where its windows are, and carried out through
//! `page_place`.
//!
//! What the view is allowed to be is decided in `lumen_kernel::webview`,
//! which has no window to open and so can be tested.

use lumen_kernel::{checked_label, checked_url, sane_zoom, KernelError, ViewRect};
use serde::Serialize;
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, Wry,
};

/// The label of the window every page view is a child of, and of the web view
/// the interface itself runs in — the one told about what the page does.
const MAIN: &str = "main";

/// What a page view reports back to the interface.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageEvent {
    /// The tab's id, as the interface knows it.
    id: String,
    /// `started`, `loaded`, `title` or `popup`.
    kind: &'static str,
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
}

/// The channel the interface listens on. One event name for every kind of
/// report, because a listener that has to be registered per kind is a
/// listener that will be missing one.
const CHANNEL: &str = "lumen://page";

fn tell(app: &AppHandle, event: PageEvent) {
    if let Err(err) = app.emit_to(MAIN, CHANNEL, event) {
        eprintln!("lumen: cannot report a page view: {err}");
    }
}

/// The id a label was made from, for reporting back.
fn id_of(label: &str) -> String {
    label
        .strip_prefix(lumen_kernel::VIEW_PREFIX)
        .unwrap_or(label)
        .to_string()
}

fn view(app: &AppHandle, id: &str) -> Result<Webview<Wry>, KernelError> {
    let label = checked_label(id)?;
    app.get_webview(&label)
        .ok_or_else(|| KernelError::host(format!("no page view {label}")))
}

/// Open a page view, or point an open one at a new address.
///
/// Opening is idempotent: the browser app asks for the view it wants on
/// screen and does not track whether the host still has it, because a view
/// can be closed from under it — by a crash inside the view, or by the window
/// going away — and asking again is the cure for both.
#[tauri::command]
pub async fn page_open(
    app: AppHandle,
    id: String,
    url: String,
    rect: ViewRect,
    visible: bool,
) -> Result<(), KernelError> {
    if view(&app, &id).is_ok() {
        return place(&app, &id, rect, visible).and_then(|()| navigate(&app, &id, &url));
    }
    let label = checked_label(&id)?;
    let address = checked_url(&url)?.to_string();
    let rect = rect.sane();

    let window = app
        .get_window(MAIN)
        .ok_or_else(|| KernelError::host("the desktop window is not open"))?;

    let parsed = address
        .parse()
        .map_err(|err| KernelError::invalid(&address, format!("cannot read the address: {err}")))?;

    let reporter = app.clone();
    let popups = app.clone();
    let titles = app.clone();
    let builder = WebviewBuilder::<Wry>::new(&label, WebviewUrl::External(parsed))
        // The page decides what it draws; Lumen never reads inside it.
        .on_page_load(move |webview, payload| {
            let kind = match payload.event() {
                PageLoadEvent::Started => "started",
                PageLoadEvent::Finished => "loaded",
            };
            tell(
                &reporter,
                PageEvent {
                    id: id_of(webview.label()),
                    kind,
                    url: payload.url().to_string(),
                    title: None,
                },
            );
        })
        .on_document_title_changed(move |webview, title| {
            let url = webview
                .url()
                .map(|u| u.to_string())
                .unwrap_or_else(|_| String::new());
            tell(
                &titles,
                PageEvent {
                    id: id_of(webview.label()),
                    kind: "title",
                    url,
                    title: Some(title),
                },
            );
        })
        // A link that asks for a new window gets one — a Lumen tab. The host
        // opening a bare window of its own would put a page outside the
        // browser that is supposed to be showing it.
        .on_new_window(move |url, _features| {
            tell(
                &popups,
                PageEvent {
                    id: String::new(),
                    kind: "popup",
                    url: url.to_string(),
                    title: None,
                },
            );
            NewWindowResponse::Deny
        })
        .zoom_hotkeys_enabled(true)
        .focused(false);

    let view = window
        .add_child(
            builder,
            LogicalPosition::new(rect.x, rect.y),
            LogicalSize::new(rect.width, rect.height),
        )
        .map_err(|err| KernelError::host(format!("cannot open a page view: {err}")))?;

    if !visible {
        let _ = view.hide();
    }
    Ok(())
}

/// Point an open view at another address.
#[tauri::command]
pub async fn page_navigate(app: AppHandle, id: String, url: String) -> Result<(), KernelError> {
    navigate(&app, &id, &url)
}

fn navigate(app: &AppHandle, id: &str, url: &str) -> Result<(), KernelError> {
    let address = checked_url(url)?;
    let parsed = address
        .parse()
        .map_err(|err| KernelError::invalid(address, format!("cannot read the address: {err}")))?;
    view(app, id)?
        .navigate(parsed)
        .map_err(|err| KernelError::host(format!("cannot open {address}: {err}")))
}

/// Move a view, resize it, and show or hide it — one call, because all three
/// are answers to the same question and the interface asks it on every frame
/// a window is dragged.
#[tauri::command]
pub async fn page_place(
    app: AppHandle,
    id: String,
    rect: ViewRect,
    visible: bool,
) -> Result<(), KernelError> {
    place(&app, &id, rect, visible)
}

fn place(app: &AppHandle, id: &str, rect: ViewRect, visible: bool) -> Result<(), KernelError> {
    let view = view(app, id)?;
    let rect = rect.sane();
    let report = |what: &str, err: tauri::Error| KernelError::host(format!("cannot {what}: {err}"));
    if visible {
        view.set_position(LogicalPosition::new(rect.x, rect.y))
            .map_err(|err| report("move the page", err))?;
        view.set_size(LogicalSize::new(rect.width, rect.height))
            .map_err(|err| report("resize the page", err))?;
        view.show().map_err(|err| report("show the page", err))
    } else {
        view.hide().map_err(|err| report("hide the page", err))
    }
}

/// The browser app's zoom, applied to the view rather than to a wrapper the
/// view does not live in.
#[tauri::command]
pub async fn page_zoom(app: AppHandle, id: String, factor: f64) -> Result<(), KernelError> {
    view(&app, &id)?
        .set_zoom(sane_zoom(factor))
        .map_err(|err| KernelError::host(format!("cannot zoom the page: {err}")))
}

/// Ask the page for itself again.
#[tauri::command]
pub async fn page_reload(app: AppHandle, id: String) -> Result<(), KernelError> {
    view(&app, &id)?
        .eval("location.reload()")
        .map_err(|err| KernelError::host(format!("cannot reload the page: {err}")))
}

/// Close one view. A tab that is gone leaves nothing behind on screen.
#[tauri::command]
pub async fn page_close(app: AppHandle, id: String) -> Result<(), KernelError> {
    let Ok(view) = view(&app, &id) else {
        return Ok(());
    };
    view.close()
        .map_err(|err| KernelError::host(format!("cannot close the page view: {err}")))
}

/// Close every view. The browser app calls this when its window closes, so a
/// view can never outlive the window it was drawn over.
#[tauri::command]
pub async fn page_close_all(app: AppHandle) -> Result<(), KernelError> {
    let Some(window) = app.get_window(MAIN) else {
        return Ok(());
    };
    for view in window.webviews() {
        if view.label().starts_with(lumen_kernel::VIEW_PREFIX) {
            let _ = view.close();
        }
    }
    Ok(())
}

/// Whether the host can open a page view at all. The interface asks once and
/// falls back to a framed page when the answer is no.
#[tauri::command]
pub async fn page_supported() -> bool {
    true
}
