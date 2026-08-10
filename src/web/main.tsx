import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../player/chalk-player.css';
import './bench.css';

createRoot(document.getElementById('root')!).render(<App />);
