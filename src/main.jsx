import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import './style.css';
import './interaction.css';
import './talk-screen.css';
import { startFit } from './fit.js';

createRoot(document.getElementById('root')).render(<App/>);
startFit(); // wide equations and tables zoom to fit, never scroll (fit.js)
