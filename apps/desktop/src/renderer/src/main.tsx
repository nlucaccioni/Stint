// SPDX-License-Identifier: GPL-3.0-or-later
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@stint/ui/tokens.css'
import './global.css'
import { App } from './App'
import { SwitcherApp } from './SwitcherApp'

// One page serves every window; the URL hash picks which screen to show.
const isSwitcher = window.location.hash === '#switcher'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isSwitcher ? <SwitcherApp /> : <App />}</StrictMode>,
)
