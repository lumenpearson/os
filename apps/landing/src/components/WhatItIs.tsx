import { Section } from './Section';

const parts = [
  {
    title: 'The shell',
    body: 'A menubar along the top, a taskbar with a Start menu along the bottom, and windows in between: drag them, resize them, snap them to a side, minimise, maximise, go full-screen. The cursor is drawn by the shell itself and changes shape with what is under it. A lock screen guards the session with a password; a recovery key shown once at setup gets you back in if you forget it.',
  },
  {
    title: 'The apps',
    body: 'Files, Terminal, a Text Editor, Writer, Sheets and Slides, a Browser, Task Manager, Settings, viewers for images, PDFs and media, and small utilities. Apps register with the kernel, declare file associations, and open in their own windows. Pseudo-programs are .app JSON manifests in /Applications that alias a built-in app or embed an HTML document in a sandboxed iframe.',
  },
  {
    title: 'Where data lives',
    body: 'In the browser, the file system is the origin-private file system (IndexedDB where OPFS is missing), so nothing leaves the device. On Windows, it is a folder you choose, and every read and write goes through the Rust kernel, which refuses any path that escapes that folder.',
  },
];

export function WhatItIs() {
  return (
    <Section id="overview" title="What it is">
      <div className="grid gap-10 md:gap-12">
        {parts.map((part) => (
          <div key={part.title} className="max-w-[64ch]">
            <h3 className="text-lg font-medium">{part.title}</h3>
            <p className="mt-2 text-ink-2">{part.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
