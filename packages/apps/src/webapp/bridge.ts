/**
 * The message protocol between an HTML pseudo-program and the OS.
 *
 * From the frame (window.parent.postMessage(msg, '*')):
 *   { type: 'lumen:title', title }                     — set the window title
 *   { type: 'lumen:notify', title, body? }             — post a notification
 *   { type: 'lumen:storage:get', key, id }             — read a value; reply below
 *   { type: 'lumen:storage:set', key, value }          — persist a JSON value
 *   { type: 'lumen:close' }                            — close the window
 * To the frame:
 *   { type: 'lumen:storage:value', id, key, value }
 *   { type: 'lumen:theme', theme: 'light' | 'dark', accent: string }
 *
 * Storage is per app id at /Users/<user>/.appdata/<id>.json.
 */

export type FrameMessage =
  | { type: 'lumen:title'; title: string }
  | { type: 'lumen:notify'; title: string; body?: string }
  | { type: 'lumen:storage:get'; key: string; id: number }
  | { type: 'lumen:storage:set'; key: string; value: unknown }
  | { type: 'lumen:close' };

export function isFrameMessage(data: unknown): data is FrameMessage {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { type?: unknown }).type;
  return typeof t === 'string' && t.startsWith('lumen:');
}

/** Snippet injected before the manifest HTML so apps get a tiny `lumen` API. */
export const FRAME_PRELUDE = `<script>
(function(){
  var pending = {};
  var seq = 0;
  window.lumen = {
    setTitle: function(t){ parent.postMessage({ type: 'lumen:title', title: String(t) }, '*'); },
    notify: function(title, body){ parent.postMessage({ type: 'lumen:notify', title: String(title), body: body == null ? undefined : String(body) }, '*'); },
    close: function(){ parent.postMessage({ type: 'lumen:close' }, '*'); },
    storage: {
      get: function(key){ return new Promise(function(res){ var id = ++seq; pending[id] = res; parent.postMessage({ type: 'lumen:storage:get', key: String(key), id: id }, '*'); }); },
      set: function(key, value){ parent.postMessage({ type: 'lumen:storage:set', key: String(key), value: value }, '*'); }
    },
    theme: { name: 'light', accent: '#3478f6' }
  };
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (d.type === 'lumen:storage:value' && pending[d.id]) { pending[d.id](d.value); delete pending[d.id]; }
    if (d.type === 'lumen:theme') { window.lumen.theme = { name: d.theme, accent: d.accent }; document.documentElement.dataset.theme = d.theme; window.dispatchEvent(new CustomEvent('lumen:theme', { detail: window.lumen.theme })); }
  });
})();
</script>`;
