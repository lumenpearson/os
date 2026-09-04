import { Apps } from './components/Apps';
import { Download } from './components/Download';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { Nav } from './components/Nav';
import { TryIt } from './components/TryIt';
import { WhatItIs } from './components/WhatItIs';
import { useTheme } from './lib/useTheme';

export function App() {
  const [theme, toggleTheme] = useTheme();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Nav theme={theme} onToggleTheme={toggleTheme} />
      <main id="main">
        <Hero theme={theme} />
        <WhatItIs />
        <HowItWorks />
        <Apps />
        <TryIt />
        <Download />
      </main>
      <Footer />
    </>
  );
}
